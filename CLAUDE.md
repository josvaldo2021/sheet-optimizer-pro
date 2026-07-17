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
2. **Agrupamento desligado** — remove 50+ estratégias do `optimizeV6`, causando queda drástica de qualidade (~9 peças/chapa vs 30+). Nunca use `useGrouping=false`. ATENÇÃO (spec 012): isto acontecia SOZINHO, sem ninguém pedir — o guard `hasLabels` desligava o agrupamento para QUALQUER peça rotulada, ou seja, em 100% dos trabalhos reais. Guard removido; se voltar a aparecer um guard assim, ele está encobrindo bug de expansão, não protegendo de um.
3. **`v6Result.remaining`** — pode conter peças agrupadas (`count>1`, `individualDims`). Não use set-difference com o inventário original; extraia da árvore.
4. **Nós folha da árvore** — sempre representam peças alocadas (desperdício nunca é folha). Tipos folha: Y sem filhos, Z sem filhos, W sem filhos, Q sem filhos, R (sempre folha).

<!-- SPECKIT START -->
Spec mais recente (IMPLEMENTADA, não commitada): `specs/012-qualidade-pecas-identificadas/`
— CORRIGE VIOLAÇÃO dos Princípios III e IV. O guard `hasLabels` (`optimizer.ts`)
reduzia as ~54 variantes de agrupamento para 2 quando QUALQUER peça tinha rótulo —
e todo trabalho real vem rotulado do relatório de OF (uid por peça,
`Index.tsx:506`) ⇒ o motor NUNCA rodava com agrupamento em produção. Sintoma:
sobra fragmentada. O guard encobria DUAS falhas de conservação independentes na
expansão de grupos rotulados, ambas corrigidas (a 2ª estava escondida atrás da 1ª):
(1) ROTEAMENTO `splitAxis` (`placement.ts`): `("h",rotacionado)` caía num `else`
que devolvia `R` — SEMPRE folha — e o grupo virava UMA folha com o rótulo de uma
só peça (fantasma `250×800`); o Rust já estava certo e foi retroportado, junto com
`zNodeToUse && Z → Q` (não `W`). (2) TOLERÂNCIA DE ALTURA em
`groupStripPackingDP` (`grouping.ts`, variante #42 = tol 100): a tolerância junta
peças de alturas DIFERENTES na mesma faixa, mas um grupo de eixo "w" guarda UMA
altura (`h`) e `individualDims` só com as LARGURAS ⇒ as peças mais baixas eram
cortadas com a altura da faixa (fantasma `250×300`, inflação 385→429). Agravado
por `stripHeight = max` do GRUPO enquanto o knapsack seleciona um SUBCONJUNTO.
Corrigido subdividindo por altura EXATA antes do knapsack. Guard REMOVIDO em TS e
Rust; WASM reconstruído (o app usa WASM por padrão:
`localStorage.useWasmEngine !== 'false'`). REGRA GERAL: um grupo (`count>1`) NÃO é
peça — `w`/`h` são do AGREGADO, e a medida TRANSVERSAL é compartilhada por todos os
membros; agrupar medidas transversais diferentes é irrepresentável. Teste
`src/test/grouped-expansion.test.ts` (67) trava produtor (P1-P5, inclui P4: a medida
do grupo bate com CADA membro — foi a ausência disso que escondeu o bug) e
consumidor (C1-C5, as 4 combinações eixo×rotação). Custo aceito: suíte 61s→306s.
Cenário-âncora (4× 2473×1262 + 2× 2634×406 em 5980×3190) verificado no app real
com WASM: 6 peças, 1 chapa, sobra consolidada em 4946×666. TERCEIRA falha, achada
pelo usuário no app (2026-07-17) e SÓ no WASM: `group_pieces_fill_row`
(`grouping.rs`) normalizava cada peça para `(w,h,label)` e DESCARTAVA
`count`/`labels`/`individual_dims` ⇒ um grupo virava UMA peça e as outras `count-1`
sumiam sem cair em `remaining` (WASM alocava 2 de 8). O T025 declarava esse espelho
feito, mas a correção só existia no TS; a remoção do `has_labels` acordou o defeito.
Junto: `remaining.retain` por igualdade de `(w,h,label)` apagava TODAS as duplicatas
iguais, não só a usada (o TS remove por identidade) — corrigido em `fill_row` e
`fill_col` removendo por índice. A rede que faltava agora existe:
`src/test/wasm-parity.test.ts` (mesmo input ⇒ mesma contagem alocada nos dois
motores + conservação; carrega o pkg `--target web` no Node passando os bytes do
`.wasm`). ESTENDA-O ao mexer no motor. `heuristics-benchmark` fixado em TS
(`setUseWasmEngine(false)`): o baseline é de TS e a escolha do motor via
`engine-adapter` era uma CORRIDA ⇒ falhava intermitentemente. QUARTA falha (T035):
o T010 estava PELA METADE nos DOIS motores — a correção de tolerância pegou
`groupStripPackingDP` mas não o gêmeo `groupStripPackingDPTransposed`
(`grouping.ts:780`/`grouping.rs:566`), que tem o bug SIMÉTRICO (tolerância de
LARGURA + `strip_w = max`, `individualDims` só com alturas ⇒ peça estreita cortada
com a largura da faixa). Medido: 60 peças únicas ⇒ 60/60 alocadas mas 20
FANTASMAS, área 9145k→9177k. Corrigido nos dois. LIÇÃO: contar peças NÃO basta —
o motor alocava a quantidade certa e mentia a MEDIDA; foi assim que passou pelo
T012. `wasm-parity.test.ts` agora trava isso ("nenhuma folha afirma medida
inexistente": multiset de medidas + igualdade de área). Ao corrigir um agrupador,
PROCURE O GÊMEO TRANSPOSTO. Hipótese `skipExpensiveGrouping` REFUTADA: o gate
(`optimizer.ts:88`) não existe no Rust (divergência viva do Princípio VI ⇒ nunca
afetou o usuário, que roda WASM) e, medido nos relatórios de OF reais dele
(agrupados por material), nunca dispararia — exige `maxRepetition < 3` e os dados
dão maxRep 22/12/2. PENDENTE: T011 (rede de validação no limite), T013
(`genetic.ts:258-262` mapeia rótulo→medida do AGREGADO), T036 (destino do
`skipExpensiveGrouping` — decisão do usuário), polimento (T027-T031), e RE-MEDIR o
2º relato do usuário (não percebeu melhora de fragmentação) — o relato foi feito
sobre o build que perdia peças no WASM, então precisa ser refeito antes de teorizar.
Spec anterior (PLANEJADA, ainda não implementada; a 012 corrige a MIRA dela — media
a sobra contra `remaining`, e o usuário definiu que sobra vale POR SI, independente
do inventário): `specs/011-lookahead-residual-sobra/`
— critério de LOOKAHEAD RESIDUAL na seleção de layout do `optimizeV6`: entre
candidatos de MESMA área alocada, preferir o cujo MAIOR retângulo livre comporta a
MAIOR peça ainda não alocada (`result.remaining`) → menos fragmentação ⇒ mais
peças/chapa ⇒ mais aproveitamento (NÃO premia sobra: é só desempate, subordinado à
área). MUDA O MOTOR (≠ specs 009/010 que eram no plano): seleção em
`optimizer.ts:192` passa de `area→compactness` para `area→residual-fit→compactness`;
espelho OBRIGATÓRIO em Rust `optimizer.rs:164` + rebuild wasm (Princípio VI). Novo
helper `largestFreeRect` (generaliza `getLastLeftover` coletando o MAIOR gap) em
TS `tree-utils.ts` e Rust. Guarda: `heuristics-benchmark.test.ts` barra qualquer
regressão de aproveitamento/nº de chapas; se MELHORAR, regravar baseline. Cenário-
âncora "Chapa 2" (do ESTUDO DE LAYOUTS.docx do usuário). Contrato/plano em
`specs/011-lookahead-residual-sobra/`; teste `src/test/residual-lookahead.test.ts`.
Spec anterior (IMPLEMENTADA e commitada): `specs/010-medida-exclusiva-prioridade/`
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
