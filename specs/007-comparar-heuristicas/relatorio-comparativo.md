# Relatório Comparativo — Catálogo de Heurísticas × Motor Atual

**Feature**: 007-comparar-heuristicas | **Data**: 2026-07-13
**Catálogo de referência**: [heuristicas.md](./heuristicas.md) (15 técnicas em 4 grupos)
**Método**: cada classificação foi verificada contra o código real do motor
(TS `src/lib/engine/`, Rust `wasm-engine/src/`) e contra o comportamento medido pelo
harness (`src/test/heuristics-benchmark.test.ts`). Nada aqui é baseado só em suposição.

## Sumário

| Veredito | Técnicas |
| --- | --- |
| Coberta | FFDH (#2), NFDH (#3), 2-stage (#6), 3-stage (#7), restrição de giro (#8), AG (#10, com ressalva), strip packing (#14) |
| Parcial | BFDH (#4), Best-Fit global (#5), busca em árvore (#9) |
| Ausente | GRASP (#11), Busca Tabu (#12), Simulated Annealing (#13), geração de colunas (#15) |
| Não aplicável | Bottom-Left/BLF (#1) |

## Grupo 1 — Heurísticas Construtivas (Gulosas)

### #1 Bottom-Left (BL) / Bottom-Left Fill (BLF) — **NÃO APLICÁVEL**

- **Restrição excludente**: BL/BLF pressupõe posicionamento livre — empurrar cada peça
  para baixo e para a esquerda de forma independente gera layouts não guilhotinados
  (escadas, encaixes em L). Viola o Princípio I da constituição (todo corte atravessa a
  chapa de borda a borda).
- **Observação**: o *efeito* de compactar para um canto emerge naturalmente da árvore
  estagiada — colunas X preenchidas da esquerda para a direita, faixas Y de baixo para
  cima (`placement.ts`, `runPlacement`) — mas o mecanismo BL propriamente dito não é
  implementável neste produto.

### #2 First Fit Decreasing Height (FFDH) — **COBERTA (equivalente)**

- **Equivalência**: FFDH = ordenar por altura decrescente + alocar em níveis, abrindo
  nível novo quando não cabe. No motor: a ordenação idx 2 de `getSortStrategies()`
  (`altura ↓, largura ↓` — `optimizer.ts:31`) combinada com o posicionamento em faixas Y
  do `runPlacement` e com os agrupamentos de faixa (`groupPiecesFillRow`,
  `groupPiecesBandFirst/Last` em `grouping.ts`) reproduz o padrão de níveis do FFDH
  dentro da guilhotina. O torneio testa isso junto com outras 13 ordenações e fica com o
  melhor.
- **Justificativa do veredito**: não há função chamada "FFDH", mas todo plano que o FFDH
  produziria é alcançável (e normalmente superado) pelas combinações existentes.

### #3 Next Fit Decreasing Height (NFDH) — **COBERTA (por dominância)**

- **Equivalência**: NFDH é o FFDH com memória de um nível só — estritamente pior ou
  igual em aproveitamento. Como o motor já contém o equivalente do FFDH (#2) no torneio
  e o critério de seleção fica com o melhor resultado (`optimizer.ts`, laço de
  estratégias com `result.area > bestArea`), qualquer resultado NFDH está dominado.
- **Justificativa**: adotar NFDH só faria sentido por velocidade; qualidade é o objetivo
  primário (Princípio III). Nada a fazer.

### #4 Best Fit Decreasing Height (BFDH) — **PARCIAL**

- **Equivalência parcial**: o motor tem agrupamentos que montam faixas
  (`groupPiecesFillRow/Col`, `groupPiecesBandFirst/Last`, `grouping.ts:162–357`), mas o
  preenchimento é *sequencial na ordem da estratégia de ordenação* — não existe o passo
  característico do BFDH de escolher, entre os níveis já abertos, o que deixa **menor
  sobra residual** ao receber a peça.
- **Lacuna concreta**: em mixes heterogêneos, a peça vai para a primeira faixa em que
  cabe (first-fit), não para a mais justa (best-fit). → **Oportunidade C2** na
  [priorização](./priorizacao.md).

### #5 Best-Fit global — **PARCIAL**

- **Equivalência parcial**: `fillVoids` (`void-filling.ts`, chamado por
  `placement.ts:453,796,812`) varre vazios da árvore após o posicionamento principal e
  insere peças remanescentes onde couberem — um best-fit *local, de pós-processamento*.
  Não há score global de desperdício por posição a cada inserção durante a construção.
- **Justificativa**: o torneio de 2 orientações × variantes × 14 ordenações explora o
  espaço por caminhos diferentes do best-fit clássico; a lacuna real é a mesma do #4
  (decisão local gulosa por menor sobra), consolidada na oportunidade C2.

## Grupo 2 — Heurísticas Estruturais e por Estágios

### #6 Corte em 2 Estágios — **COBERTA**

- **Equivalência**: a árvore `ROOT→X→Y` com folhas Y é exatamente um padrão 2-stage
  (cortes verticais geram colunas; horizontais extraem peças). Agrupamentos de dimensão
  comum (`groupByCommonDimension`, `grouping.ts:378`) produzem tiras homogêneas típicas
  de 2-stage quando isso vence no torneio.

### #7 Corte em 3 Estágios — **COBERTA (e além)**

- **Equivalência**: os níveis Z/W/Q/R da árvore (`types.ts:3`, `placement.ts`) vão além
  de 3 estágios — o motor produz padrões multi-estágio guilhotinados com profundidade
  até 6 (X→Y→Z→W→Q→R). O 3-stage clássico é um subconjunto próprio do que a estrutura
  permite.

### #8 Restrição de Giro (Exact/Non-Exact) — **COBERTA**

- **Equivalência**: rotação 90° é explorada em três camadas: `rotatedPieces` no torneio
  (`optimizer.ts:77`), flag `transposed` global por candidato (`optimizer.ts:171`) e
  gene de rotação por peça no GA (`genetic.ts:269`). A marcação `transposed` no nó
  (`types.ts:12`) preserva a orientação escolhida para visualização/corte.

### #9 Busca em Árvore (Tree Search / AND-OR) — **PARCIAL**

- **Equivalência parcial**: a `TreeNode` É a representação AND-OR de padrões
  guilhotinados que a literatura descreve — mas o motor a usa como *estrutura de saída*,
  não como *espaço de busca*: a exploração é um torneio de heurísticas fixas + GA, sem
  busca com lookahead, poda ou backtracking sobre a própria árvore de cortes.
- **Lacuna concreta**: nenhum mecanismo do tipo "tentar corte X aqui vs corte Y aqui e
  expandir o melhor ramo" (beam search / branch-and-bound). → **Oportunidade C4
  (futura)** — alto potencial, alto custo de execução interativa.

## Grupo 3 — Metaheurísticas

### #10 Algoritmos Genéticos (AG) / BRKGA — **COBERTA (com ressalva grave)**

- **Equivalência**: GA completo em produção (`genetic.ts`, `optimizeGeneticAsync` —
  caminho principal do `Index.tsx:504`): genoma = ordem das peças; genes de rotação por
  peça, modo de agrupamento (15 modos, `applyGrouping` em `genetic.ts:288`), transposição
  e modo de faixa; seleção por torneio, crossover OX, mutação adaptativa, população
  semeada pelas 14 heurísticas de ordenação.
- **Ressalva (fere Princípio V)**: toda a aleatoriedade usa `Math.random` **sem
  semente** (`genetic.ts:264–601`) — duas execuções sobre o mesmo input podem produzir
  planos diferentes. → **Oportunidade C1** (PRNG semeado), a correção de maior prioridade.
- **BRKGA**: a variante de chaves aleatórias viciadas não está implementada; registrada
  como variação futura de baixa prioridade (o GA atual já cobre o papel).

### #11 GRASP — **AUSENTE**

- **Justificativa**: não existe construção gulosa-aleatorizada com lista restrita de
  candidatos (RCL) nem busca local determinística fora do GA. A evidência da spec 005
  (em cenários oversubscritos, a *ordem* de entrada decide o que entra na chapa) sugere
  que multi-start perturbando a ordem tem espaço real de ganho. → **Oportunidade C3**
  (condicionada a PRNG semeado, C1).

### #12 Busca Tabu — **AUSENTE**

- **Justificativa**: não há memória de movimentos proibidos nem busca por vizinhança
  sistemática. **Não recomendada**: o papel de explorador global já é do GA; manter dois
  exploradores estocásticos duplicaria custo de CPU no navegador com ganho incremental
  improvável. Registrada como descartada na priorização (com motivo, FR-003).

### #13 Simulated Annealing — **AUSENTE**

- **Justificativa**: mesma análise do #12 — sobreposição de papel com o GA existente.
  Descartada com registro.

### #14 Strip Packing — **COBERTA (adaptada)**

- **Equivalência**: `groupStripPackingDP` e `groupStripPackingDPTransposed`
  (`grouping.ts:595,706`) usam programação dinâmica com seleção knapsack
  (`knapsackSelectItems`, `grouping.ts:557`) para montar faixas de altura comum —
  a essência do strip packing adaptada a chapa finita com margens. No GA, os modos de
  agrupamento e `stripMode` (`genetic.ts`) expõem essas variantes à evolução.

### #15 Geração de Colunas — **AUSENTE (não adotar agora)**

- **Justificativa**: exigiria relaxação linear + solver LP + reformulação do fluxo
  multi-chapa em torno de padrões gerados — esforço desproporcional para uma SPA
  interativa, com ganho incerto nos volumes típicos do produto.
- **Parentesco existente**: a seleção por repetição de padrão da spec 006
  (`src/lib/pattern-repetition.ts`) captura a intuição central de "um bom padrão repetido
  em várias chapas" sem o custo do LP. Registrada como oportunidade futura se o produto
  evoluir para lotes industriais muito grandes.

## Descobertas colaterais da verificação (fatos novos, não previstos na fase de plano)

1. **Ramo de agrupamento do `optimizeV6` estava quebrado (crash adormecido)** — as 50+
   variantes de agrupamento (`pieceVariantBuilders`, ramo sem labels) eram arrays já
   computados declarados como thunks; `buildVariant()` lançava `TypeError` para qualquer
   inventário sem labels com agrupamento ligado. Nenhum teste ou caminho de produção
   exercitava o ramo (produção sempre rotula as peças). **Corrigido nesta feature**
   (embrulho em thunks, `optimizer.ts`) — correção estritamente segura: antes o caminho
   só lançava exceção.
2. **Em produção, o agrupamento vem do GA, não do torneio do `optimizeV6`** — com peças
   rotuladas (sempre, via `runAllSheets`), `optimizeV6` usa só 2 variantes (original +
   rotacionada); os 15 modos de agrupamento chegam pelo `applyGrouping` do GA
   (`genetic.ts:288`). Consequência direta para a Fase B: candidatos de agrupamento (C2)
   precisam entrar **também** nos `GROUPING_MODES` do GA para afetar produção.
3. **`npx tsc --noEmit` na raiz não checa nada** — `tsconfig.json` tem `"files": []` +
   `references`, então o portão de tipos documentado é um no-op sem `-b`
   (`tsc --noEmit` termina verde sem visitar `src/`). É assim que o bug nº 1 sobreviveu.
   Recomendação: trocar o portão para `npx tsc -b --noEmit` (registrado na priorização
   como higiene, fora do escopo de aproveitamento).
4. **`v6Result.remaining` sub-reporta sobras com variantes agrupadas** — verificado
   empiricamente pelo harness (cross-check árvore × inventário divergiu em até 2× a
   área). Confirma e amplia a armadilha nº 3 do CLAUDE.md: para dedução multi-chapa, a
   árvore (via labels) é a única fonte confiável.

## Rastreabilidade

- FR-001: 15/15 técnicas classificadas acima (sumário + seções individuais).
- FR-002: restrição excludente registrada na única técnica não aplicável (#1).
- Oportunidades derivadas (→ [priorizacao.md](./priorizacao.md)): C1 (#10), C2 (#4+#5),
  C3 (#11), C4 (#9); descartes: #12, #13, #15; dominadas/cobertas: #2, #3, #6, #7, #8,
  #14; excluída: #1.
