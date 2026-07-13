# Research — Comparar Heurísticas e Evoluir o Otimizador

## Fatos verificados sobre o motor atual (base para a classificação)

- **Torneio de estratégias** (`src/lib/engine/optimizer.ts`): `optimizeV6` percorre
  `transposed ∈ {false,true}` × variantes de agrupamento × **14 ordenações**
  (`getSortStrategies()`, 12 descendentes + 2 ascendentes da spec 005) e guarda o melhor
  por área posicionada, desempate por compacidade, com empates estritos preservando o
  incumbente → **determinístico e monotônico** (adicionar estratégia nunca piora).
- **Agrupamentos** (`src/lib/engine/grouping.ts`): 16+ construtores — mesma
  largura/altura, preencher linha/coluna (`groupPiecesFillRow/Col`), bandas
  (`BandFirst/Last`), dimensão comum (+ variante DP com knapsack
  `knapsackSelectItems`/`groupCommonDimensionDP`), **strip packing com DP**
  (`groupStripPackingDP` e transposta) e peças idênticas 2D.
- **Posicionamento** (`placement.ts`): árvore guilhotinada estagiada
  ROOT→X→Y→Z→W→Q→R (equivale a corte multi-estágio), modos de faixa horizontal
  pré-semeada, e **preenchimento de vazios** (`void-filling.ts` / `void_filling.rs`).
- **GA de produção** (`genetic.ts`, chamado por `Index.tsx:411,504` via
  `optimizeGeneticAsync`): população semeada por heurísticas + evolução com seleção por
  torneio, crossover OX, mutação adaptativa — **usa `Math.random` sem semente**
  (linhas 264–601): o caminho de produção principal é hoje não-determinístico entre
  execuções quando o GA encontra plano melhor que as heurísticas.
- **Multi-chapa**: `runAllSheets` (Index.tsx) chapa a chapa + seleção por repetibilidade
  de padrão (`src/lib/pattern-repetition.ts`, spec 006).
- **Paridade**: espelho Rust em `wasm-engine/src/` (optimizer/grouping/genetic/
  placement/void_filling); correspondência posicional de estratégias
  (`cmp_by_strategy`/`NUM_SORT_STRATEGIES = 14`).
- **Testes/fixtures existentes** reutilizáveis para benchmark: `optimization.test.ts`,
  `ga-benchmark.test.ts`, `new-heuristics.test.ts`, `pattern-repetition.test.ts`,
  fixtures xlsx em `parts/` e `src/test/fixtures/`.

## Decisão 1 — Forma e local do relatório comparativo e da priorização

**Decisão**: dois markdowns versionados na pasta da spec —
`relatorio-comparativo.md` (tabela: técnica × classificação × justificativa ×
equivalência no código) e `priorizacao.md` (ranking com impacto/compatibilidade/esforço
e motivos de descarte). O catálogo `heuristicas.md` é **movido** da raiz para a pasta da
spec como fonte de verdade versionada (FR-008); atualização futura do catálogo = editar
o arquivo e revisar apenas as linhas afetadas do relatório.

**Racional**: artefatos de conhecimento pertencem à spec (padrão das specs 001–006);
markdown diffável atende "reexecutável/atualizável sem refazer do zero".

**Alternativas consideradas**: gerar relatório por script a partir de anotações no
código (overengineering para 15 técnicas); manter `heuristicas.md` na raiz (viola
FR-008 e polui a raiz).

## Decisão 2 — Harness de benchmark e baseline

**Decisão**: `src/test/heuristics-benchmark.test.ts` (vitest) executa uma suíte de
≥ 5 cenários nomeados sobre o **caminho determinístico** (`optimizeV6` mono-chapa e
laço multi-chapa equivalente ao `runAllSheets`) e compara com
`src/test/fixtures/benchmark-baseline.json` (aproveitamento % e nº de chapas por
cenário, mais metadados de versão). Regras no contrato
([contracts/benchmark-contract.md](./contracts/benchmark-contract.md)): falha se
qualquer cenário piorar; atualização do baseline é ato explícito e documentado.
Métricas extraídas **da árvore** (percurso tipo `extractAll` + área posicionada), nunca
por set-difference.

**Racional**: o GA é não-determinístico hoje — incluí-lo no baseline geraria flakiness;
`optimizeV6` é o núcleo compartilhado (o GA o consome) e é onde os candidatos entram.
O GA entra no benchmark somente depois de semeado (candidato C1). Perfis mínimos da
suíte: peças pequenas em volume, peças grandes, misto realista (fixture de OF), alto
volume oversubscrito, cenário com margens/minBreak agressivos.

**Alternativas consideradas**: benchmark como script npm fora do vitest (perde o gate
automático de regressão no `npm test`); medir o GA com N execuções e média (mascara o
problema de determinismo em vez de corrigi-lo).

## Decisão 3 — Classificação preliminar do catálogo (15 técnicas)

Prévia baseada nos fatos acima; o `relatorio-comparativo.md` da implementação
detalha justificativas e referências de código por técnica.

| # | Técnica (grupo) | Classificação preliminar | Síntese |
| --- | --- | --- | --- |
| 1 | Bottom-Left / BLF (construtiva) | **Não aplicável** | Posicionamento livre; viola corte guilhotina (Princípio I). O conceito "empurrar para o canto" já emerge da árvore estagiada. |
| 2 | FFDH (construtiva) | **Coberta (equivalente)** | Ordenação altura↓ (idx 2) + agrupamentos de banda/linha ≈ níveis do FFDH dentro da guilhotina. |
| 3 | NFDH (construtiva) | **Coberta por dominância** | Estritamente pior que FFDH; o torneio já contém o equivalente dominante. Nada a adotar. |
| 4 | BFDH (construtiva) | **Parcial** | Existem bandas e preenchimento de linha, mas a escolha do nível é sequencial, não "menor sobra residual". **Candidato C2.** |
| 5 | Best-Fit global (construtiva) | **Parcial** | `fillVoids` faz best-fit local em vazios; não há score global de desperdício por posição a cada inserção. Coberto indiretamente pelo torneio; avaliar dentro de C2. |
| 6 | 2-stage (estrutural) | **Coberta** | Árvore X→Y com agrupamentos de faixa produz padrões 2-stage. |
| 7 | 3-stage (estrutural) | **Coberta** | Estágios Z/W/Q/R vão além de 3 estágios (multi-stage). |
| 8 | Restrição de giro exact/non-exact (estrutural) | **Coberta** | Rotação 90° com flag `transposed`; restrição por peça respeitada. |
| 9 | Busca em árvore / AND-OR (estrutural) | **Parcial** | A árvore É a representação, mas a exploração é por torneio de heurísticas, sem busca com lookahead/poda. **Candidato C4 (futuro).** |
| 10 | AG / BRKGA (metaheurística) | **Coberta com ressalva** | GA completo em produção, porém sem semente → fere Princípio V. **Candidato C1 (corrigir).** BRKGA (chaves aleatórias) fica registrado como variação futura. |
| 11 | GRASP (metaheurística) | **Ausente** | Não há construção gulosa-aleatorizada + busca local determinística fora do GA. **Candidato C3.** |
| 12 | Busca Tabu (metaheurística) | **Ausente** | Sem memória de movimentos. Sobreposição de papel com GA existente; baixo retorno incremental esperado. |
| 13 | Simulated Annealing (metaheurística) | **Ausente** | Idem: papel já ocupado pelo GA; adotar dois exploradores globais duplica custo. |
| 14 | Strip packing (variante) | **Coberta (adaptada)** | `groupStripPackingDP` (+ transposta) já usa DP de faixas adaptado a chapa finita. |
| 15 | Geração de colunas (variante) | **Ausente — não adotar agora** | Exige solver LP e reformulação multi-chapa; esforço muito alto para app interativo. Parentesco conceitual com repetição de padrão (spec 006). Registrar como futuro. |

## Decisão 4 — Candidatos de evolução (prévia da priorização)

Ranking preliminar; o definitivo (com números do baseline) sai em `priorizacao.md`.
Adoção de cada um é individualmente condicionada ao gate do benchmark (FR-005).

- **C1 — PRNG semeado no GA** (de #10). Substituir `Math.random` por PRNG injetável com
  semente fixa (TS `genetic.ts` + Rust `genetic.rs`). Impacto: determinismo do caminho
  de produção (Princípio V), habilita GA no benchmark; aproveitamento neutro.
  Esforço: baixo. Risco: baixo (mesma distribuição, fonte trocada).
- **C2 — Seleção best-fit de faixa (BFDH-like)** (de #4/#5). Nova variante de
  agrupamento que aloca cada peça à faixa aberta com menor sobra residual, entrando no
  torneio como builder adicional (monotônico). Impacto: médio em mixes heterogêneos.
  Esforço: médio. Risco: baixo (torneio protege).
- **C3 — GRASP determinístico** (de #11). Multi-start com perturbação gulosa-
  aleatorizada semeada sobre a ordem de peças + busca local (swaps), reutilizando
  `runPlacement`. Impacto: médio/alto em cenários oversubscritos (ordem decide o que
  entra — evidência da spec 005). Esforço: médio/alto. Depende de C1 (infra de PRNG).
- **C4 — Busca em árvore com lookahead/beam** (de #9). Alto potencial, alto esforço,
  risco de performance interativa — **registrar como oportunidade futura**, fora da
  Fase B.
- **Descartados com registro**: Tabu (#12) e SA (#13) — papel redundante com GA;
  geração de colunas (#15) — esforço desproporcional. Motivos vão documentados em
  `priorizacao.md` (FR-003).

**Escopo proposto da Fase B**: C1 + C2 obrigatórios; C3 condicional ao resultado de
C1/C2 e ao orçamento de tempo da suíte. Nenhum é "adotado" sem passar o gate de
medição; reprovados ficam registrados (FR-007).

## Decisão 5 — Não-regressão, determinismo e paridade na Fase B

**Decisão**: replicar o contrato da spec 005 — candidatos de estratégia entram **no fim**
do conjunto (índices novos, correspondência posicional TS↔Rust), critério de seleção do
torneio intocado (empates estritos preservam incumbente), teste de paridade TS↔WASM como
gate, e benchmark do baseline como gate de aproveitamento. Para C1, teste específico:
duas execuções do GA semeado com mesmo input → mesmo plano.

**Racional**: monotonicidade + empate-preserva-incumbente garantem por construção que
cenários já ótimos não mudam de saída; só há mudança quando há melhora mensurável —
exatamente o piso exigido pela spec (FR-005/SC-004).

**Alternativas consideradas**: trocar a função de score do torneio (poderia melhorar
globalmente, mas quebra a garantia de não-regressão por construção — rejeitado nesta
feature; se a análise sugerir, vira spec própria).
