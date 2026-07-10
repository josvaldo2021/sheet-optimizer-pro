# Research — Duas novas heurísticas de otimização

## Contexto do laço de otimização (fatos verificados no código)

- `optimizeV6` (`src/lib/engine/optimizer.ts`) percorre: `transposed ∈ {false,true}`
  × `pieceVariantBuilders` (variantes de agrupamento) × `strategies`
  (`getSortStrategies()`, hoje **12** comparadores). Para cada combinação chama
  `runPlacement` e guarda o melhor por: `result.area > bestArea` **ou**
  (`area` igual **e** `compactness < bestCompactness`).
- Empates estritos preservam o incumbente (`>` e `<` estritos), o que torna a
  seleção **determinística e estável**.
- `getSortStrategies()` é **reusado por `genetic.ts`** (linhas 418–419 e nos
  exports), então qualquer estratégia adicionada entra também na população do
  algoritmo genético — sem edição extra.
- No Rust (`wasm-engine/src/optimizer.rs`), o equivalente é `cmp_by_strategy`
  (match `0..=11`) iterado por `for si in 0..NUM_SORT_STRATEGIES` com
  `NUM_SORT_STRATEGIES = 12`. `genetic.rs` e `post_processing.rs` também
  consomem `NUM_SORT_STRATEGIES` — herdam automaticamente.

## Decisão 1 — Natureza das "heurísticas"

**Decisão**: As duas heurísticas são **novos comparadores de ordenação de peças**
adicionados ao conjunto existente (não um novo algoritmo separado).

**Racional**:
- Alinha com a arquitetura (o motor já é um "torneio" de estratégias que mantém o
  melhor plano).
- **Monotonicidade**: como o resultado final é o melhor entre todas as estratégias,
  acrescentar estratégias **nunca piora** o aproveitamento — satisfaz FR-005/SC-002
  por construção, não só por teste.
- Custo mínimo, paridade trivial, risco mínimo à estabilidade.

**Alternativas consideradas**:
- *Novo algoritmo de posicionamento (ex.: maximal rectangles / bottom-left)*:
  violaria a simplicidade, exigiria garantir guilhotina do zero e ampla reescrita
  em dois motores. Rejeitado.
- *Novas variantes de agrupamento (`grouping.ts`)*: são caras (já sujeitas a
  "gating" por `skipExpensiveGrouping`) e mais arriscadas quanto à validade da
  árvore. Rejeitado para esta feature.

## Decisão 2 — Quais duas ordenações

Mapa das 12 ordenações atuais (chave primária → desempate):

| idx | primária | desempate |
| --- | --- | --- |
| 0 | área ↓ | maior lado ↓ |
| 1 | maior lado ↓ | área ↓ |
| 2 | altura ↓ | largura ↓ |
| 3 | largura ↓ | altura ↓ |
| 4 | perímetro (w+h) ↓ | — |
| 5 | proporção w/h ↓ | — |
| 6 | menor lado ↓ | — |
| 7 | alongamento max/min ↓ | — |
| 8 | área ↓ | largura ↓ |
| 9 | área ↓ | altura ↓ |
| 10 | maior lado ↓ | — |
| 11 | valor w·h/(w+h) ↓ | — |

**Lacuna identificada**: **todas** as 12 ordenações são descendentes ("maior
primeiro"). Não há nenhuma ordenação **ascendente** ("menor primeiro"). Além
disso, a proposta inicial de "(largura|altura) primária + área de desempate" foi
**descartada por redundância**: quando a chave primária é uma dimensão fixa, a
ordem por área coincide com a ordem pela outra dimensão (área = w·h). Logo
`largura↓ || área↓` ≡ `largura↓ || altura↓` (idx 3) e `altura↓ || área↓` ≡ idx 2 —
seriam duplicadas e eliminadas pelo dedup `seenSortedOrders` do `optimizeV6`.

**Validação empírica** (script de descoberta, 400 cenários oversubscritos,
2750×1830, eixo de ordenação isolado — raw + rotacionado, 2 orientações):

| candidato | distinta das 12? | vitórias/400 |
| --- | --- | --- |
| largura↓ \|\| área↓ | **não** (≡ idx 3) | 0 |
| altura↓ \|\| área↓ | **não** (≡ idx 2) | 0 |
| **altura ASC** (`a.h - b.h \|\| a.w - b.w`) | **sim** | **12** |
| **largura ASC** (`a.w - b.w \|\| a.h - b.h`) | **sim** | **11** |
| maior lado↓ \|\| menor lado ASC | sim | 7 |
| área↓ \|\| menor lado↓ | não (≡ idx 0) | 0 |

**Decisão (implementada)**:

- **H1 (idx 12) — Altura ascendente**: `a.h - b.h || a.w - b.w` (menor altura
  primeiro; desempate largura asc).
- **H2 (idx 13) — Largura ascendente**: `a.w - b.w || a.h - b.h` (simétrico).

**Racional**: são as duas ordenações com mais vitórias e **genuinamente distintas**
das 12 (confirmado por teste de `orderKey`). Preenchem a lacuna real do conjunto
(ausência total de ordenações ascendentes): peças de menor dimensão primeiro criam
bandas/colunas rasas que acomodam melhor certas misturas onde "maior primeiro"
fragmenta a sobra. Par simétrico, trivial de portar ao Rust.

**Nota sobre "ascendente raramente vence"**: a intuição de que ordenar do menor
para o maior é ruim vale em cenários que cabem inteiros (aí a ordem não muda o
aproveitamento). Em cenários **oversubscritos** (mais peças do que cabe), a ordem
decide quais peças entram e quanto se preenche — e aí as ascendentes vencem em
~3% dos casos, sempre como ganho (monotonicidade garante 0 regressões).

## Decisão 3 — Não-regressão e determinismo

**Decisão**: Nenhuma mudança no critério de seleção (`>`/`<` estritos) nem no
`calcCompactness`. Testes de regressão asseguram estabilidade.

**Racional**: manter o incumbente em empates garante que cenários cujo ótimo já é
atingido por uma estratégia existente **não mudam** de saída (determinismo e
paridade preservados). Um cenário só muda se uma nova estratégia produzir **maior
área** ou **mesma área com menor compacidade** — ambos são melhora pela métrica
definida, nunca regressão.

**Risco residual**: uma nova estratégia com mesma área e compacidade estritamente
menor que a incumbente **muda** a saída de um cenário de benchmark. Isso é uma
*melhora* (mais compacto), mas exige atualizar o baseline do teste
correspondente conscientemente — documentar no PR como melhora, não como quebra.

## Decisão 4 — Paridade TS↔WASM

**Decisão**: Editar os dois motores no mesmo PR:
- TS: acrescentar 2 comparadores em `getSortStrategies()` (12 → 14).
- Rust: acrescentar arms `12` e `13` em `cmp_by_strategy` e `NUM_SORT_STRATEGIES = 14`.
- Rebuild do WASM (script de build portátil já existente no repo).

**Racional**: Princípio VI — divergência entre motores é bug. Um teste de paridade
(mesmo input → resultado equivalente TS vs WASM) trava a regressão.

**Cuidado de ordem/índice**: a correspondência é **posicional** (índice do array TS
= `idx` do match Rust). As duas novas entram **no fim** (12, 13) em ambos, para não
deslocar as 0–11 existentes e preservar saídas atuais.
