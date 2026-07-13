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
Spec mais recente (implementada): `specs/007-comparar-heuristicas/`
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
