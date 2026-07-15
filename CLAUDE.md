# CLAUDE.md — Sheet Optimizer Pro

## Onboarding (leia ANTES de qualquer arquivo de código)

Antes de explorar código-fonte, leia nesta ordem:
1. `docs/AI_CONTEXT.md` — arquitetura, algoritmo, estruturas de dados, armadilhas conhecidas
2. `docs/CONTEXT_MAP.md` — qual arquivo editar para cada tipo de tarefa

Isso evita leitura desnecessária de arquivos grandes e previne alucinações.

## Regras de economia de tokens

- **NÃO leia** `src/components/ui/**` (shadcn padrão, não modifique sem pedido explícito)
- **NÃO leia** `src/lib/export/**` a menos que a tarefa envolva PDF/Excel
- **NÃO leia** `src/pages/Index.tsx` inteiro — é ~1345 linhas. Leia só a seção relevante com `offset`/`limit`
- **NÃO leia** `src/lib/engine/placement.ts` inteiro — é muito grande. Use Grep para localizar funções
- **PREFIRA** `Grep` para localizar funções antes de `Read` em arquivos grandes
- **PREFIRA** editar arquivos existentes a criar novos

## Comandos úteis

```bash
npm test              # roda todos os testes (vitest)
npm run build         # build Vite
npx tsc -p tsconfig.app.json --noEmit   # checagem de tipos REAL (o tsc --noEmit na raiz é no-op: tsconfig com files:[])
npm run build:wasm    # rebuild do motor WASM (wasm-pack)
```

## Arquitetura em 5 linhas

SPA React + TypeScript. Motor de otimização puro TS em `src/lib/engine/`.  
Fluxo: usuário cadastra peças → `optimizeV6` monta árvore de corte guilhotina (`TreeNode`) → visualização em `SheetViewer`.  
Multi-chapa: `runAllSheets` em `Index.tsx` chama `optimizeV6` em loop, deduzindo peças a cada iteração.  
Extração de peças da árvore: use `extractAll` (sem checar `n.label`) para contagem; `extractUsedPiecesWithContext` / `countAllocatedPieces` só funcionam com peças rotuladas.  
Testes em `src/test/` com `vitest`; fixtures xlsx em `parts/` e `src/test/fixtures/`.

## Armadilhas críticas (leia sempre)

1. **`n.label` check** — `countAllocatedPieces` e `extractUsedPiecesWithContext` pulam nós sem label → retornam 0 para peças não rotuladas. Para tracking interno (runAllSheets), use `extractAll` local que ignora label.
2. **`useGrouping=false`** — remove 50+ estratégias do `optimizeV6`, causando queda drástica de qualidade (~9 peças/chapa vs 30+). Nunca use isso.
3. **`v6Result.remaining`** — pode conter peças agrupadas (`count>1`, `individualDims`). Não use set-difference com o inventário original; extraia da árvore.
4. **Nós folha da árvore** — sempre representam peças alocadas (desperdício nunca é folha). Tipos folha: Y sem filhos, Z sem filhos, W sem filhos, Q sem filhos, R (sempre folha).

<!-- SPECKIT START -->
Spec mais recente (PLANEJADA, ainda não implementada): `specs/010-medida-exclusiva-prioridade/`
— REFINA a 009. Duas mudanças na flag `uniquePerSheet`: (1) EXCLUSIVIDADE TOTAL —
medidas marcadas DIFERENTES não podem dividir a mesma chapa ⇒ no máximo 1 peça
marcada por chapa NO TOTAL (substitui a coexistência que a 009 permitia); (2)
PRIORIDADE / primeiras chapas — as marcadas são ofertadas primeiro e ocupam as
primeiras chapas (1 por chapa) até esgotar o estoque. Enforcement no NÍVEL DO
PLANO: a montagem do `inv` por chapa em `runAllSheets` (`Index.tsx`, ~L480-493)
deixa de usar `perSheetQty`/`capForSheet` (per-linha) e passa a ofertar NO MÁXIMO
1 marcada total, colocada no INÍCIO do `inv` (prioridade). Novas funções puras em
`src/lib/unique-per-sheet.ts`: `pickMarkedForSheet`, `buildSheetInvExclusive`,
`exclusiveSheetInvKey` (`capForSheet`/`sheetInvKey`/`perSheetQty` ficam, mas
saem de uso no plano). Cache por `exclusiveSheetInvKey`. GARANTIA DE PRIORIDADE:
`optimizeV6` maximiza ÁREA e pode EXCLUIR uma marcada pequena (ela iria p/ o fim
do plano); por isso, após otimizar, se a marcada (por uid) não está na árvore
(`extractLeafPieces`), refaz a chapa com `runPlacement(inv,...)` (coloca a marcada
PRIMEIRO numa chapa vazia = garantido) e regrava o cache — gated por `markedUid`
(planos sem marcação intocados). Teste: `src/test/exclusive-priority-placement.test.ts`.
Motor/WASM intocados;
contagem por árvore (Princípio IV). O teste US2 da 009 (coexistência) é
ATUALIZADO para exclusividade. Plano/contrato/quickstart em
`specs/010-medida-exclusiva-prioridade/`; testes previstos E1–E6 em
`src/test/unique-per-sheet.test.ts` + regressão no benchmark.
Spec anterior (IMPLEMENTADA e commitada, 1e8d728): `specs/009-peca-unica-por-chapa/`
— o usuário marca uma LINHA do inventário como "não repetir na chapa"
(`PieceItem.uniquePerSheet?: boolean`, campo novo, independente de `priority` que é
FILTRO de UI). Ao gerar o plano multi-chapa, cada linha marcada é limitada a NO
MÁXIMO 1 peça por chapa (alocação garantida enquanto houver estoque); as não
marcadas preenchem o restante. Enforcement no NÍVEL DO PLANO (montagem do `inv` por
chapa em `runAllSheets`/`optimizeAllSheets` de `Index.tsx`, ~L481-491) + módulo puro
`src/lib/unique-per-sheet.ts` (`splitMarked`/`capForSheet`/`sheetInvKey`/
`countMarkedOnSheet`); MOTOR E WASM INTOCADOS (a flag é removida antes da fronteira
WASM). Cache de layout passa a chavear pela fatia CAPADA (`sheetInvKey`). Estoque
marcado > chapas do restante ⇒ gera chapas adicionais (o loop já roda até esgotar).
Preservar a flag em `effectiveInventory`/`selectGroup` (como `manual || saved`).
Interação FR-010 com specs 006/008 via contagem por árvore (Princípio IV). Plano/
contrato/quickstart em `specs/009-peca-unica-por-chapa/`; testes previstos em
`src/test/unique-per-sheet.test.ts` (C1–C7) + regressão no benchmark.
Spec anterior (implementada, com emenda A1): `specs/008-replanejar-apos-salvar/`
— salvar layout ×N NÃO deduz o inventário: cria cópias pendentes (`saved: true`,
checkbox pré-marcado, `deductions` exatas) que RESERVAM inventário até a
confirmação do lote (única dedução real, via `applyDeductions`); descarta chapas
automáticas comuns e replaneja o restante com
`optimizeAllSheets(piecesOverride, {baseChapas})`. Repetições/clamp usam o
inventário efetivo (`effectiveInventory` = peças − reservas pendentes);
`selectGroup`/replanejamento preservam `manual || saved`. Módulo puro
`src/lib/lots/layout-replication.ts`; contrato (com emenda) em
`specs/008-replanejar-apos-salvar/contracts/layout-replication-contract.md`;
testes em `src/test/layout-replication.test.ts` (C1–C7, emenda A1, conservação).
Spec anterior (implementada): `specs/007-comparar-heuristicas/`
(comparação do catálogo de heurísticas da literatura com o motor — ver
`relatorio-comparativo.md` e `priorizacao.md`). Resultados: C1 ADOTADO (GA
determinístico via PRNG semeado — `src/lib/engine/rng.ts` + `genetic.ts`/`genetic.rs`,
teste `ga-determinism.test.ts`); C2 best-fit de faixa REPROVADO no gate de medição e
revertido (números na priorização); C3 GRASP e C4 busca em árvore registrados como
futuros. Harness permanente de benchmark: `src/test/heuristics-benchmark.test.ts` +
baseline `src/test/fixtures/benchmark-baseline.json` (regravar: `RECORD_BASELINE=1`;
contrato em `specs/007-comparar-heuristicas/contracts/benchmark-contract.md`).
Bug adormecido corrigido: ramo de agrupamento sem labels do `optimizeV6` (thunks).
Specs anteriores:
`specs/006-repeticao-padrao/` (repetição de padrão no plano multi-chapa,
`src/lib/pattern-repetition.ts` + `runAllSheets`),
`specs/005-novas-heuristicas/` (duas heurísticas de ordenação ascendentes, TS+Rust),
`specs/004-selecionar-remover-pecas/` (seleção e remoção visível de peças),
`specs/003-selecionar-chapas-lote/` (selecionar chapas em lote),
`specs/002-importar-relatorio-of/` (importar .rpt). Spec retroativo do motor em
`specs/001-otimizacao-plano-corte/` (spec, plan, data-model,
contracts/engine-api) para arquitetura/contrato do otimizador.
<!-- SPECKIT END -->
