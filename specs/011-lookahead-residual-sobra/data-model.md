# Data Model: Seleção de layout por lookahead residual

> ⚠️ **PIVÔ (2026-07-18)**: implementado como **CONSOLIDAÇÃO PURA** (maior
> `largestFreeRect` vence, subordinado à área), não residual-fit. `result.remaining`
> é sempre vazio, então a "próxima peça restante" não existe. `largestFreeRect`
> continua sendo a entidade derivada central. Ver `research.md`.

Fase 1. Sem novo dado persistido nem novo tipo de domínio. A feature adiciona um
**critério de seleção** e um **helper geométrico** derivados da árvore.

## Entidade (derivada): Retângulo livre

- **`FreeRect { w, h }`**: um retângulo de espaço livre lido da árvore
  guilhotina. O que importa é o **maior** (por área).
- Origem: `largestFreeRect(tree, usableW, usableH)` — generaliza `getLastLeftover`
  coletando os gaps de cada nível (faixa à direita das colunas X; fundo da última
  coluna; gap à direita da última linha; etc.) e retornando o de maior área.
- Invariantes: derivado 100% da árvore (Princípio IV); puro; não muta.

## Entidade (existente): Peça restante (`Piece` em `result.remaining`)

- `optimizeV6` já retorna `remaining: Piece[]` — as peças não colocadas no
  candidato. A **maior peça restante** (maior área) é a referência do lookahead.
- "Comporta a próxima peça" = `largestFreeRect` acomoda essa peça em `w×h` ou
  `h×w` (rotação permitida), respeitando margens e `minBreak`.

## Critério de seleção (comportamento)

Ordem de preferência entre candidatos, no laço do `optimizeV6`:

| # | Chave | Direção |
|---|-------|---------|
| 1 | `area` alocada | maior vence (inalterado) |
| 2 | `residualFit` = `largestFreeRect` comporta a maior peça restante? | `true` > `false` (NOVO) |
| 3 | `compactness` | menor vence (desempate atual) |
| 4 | desempate estável | determinismo (FR-006) |

- O nível 2 só é avaliado quando o nível 1 empata → **subordinado** ao
  aproveitamento (FR-002).
- Quando nenhuma peça restante cabe em nenhum livre, o nível 2 empata em `false`
  para todos → cai no nível 3 (comportamento atual; FR-004).

## Paridade

O helper e a hierarquia existem em **TS** (`tree-utils.ts` + `optimizer.ts`) e em
**Rust** (`tree_utils.rs`/onde vive o gap-walk + `optimizer.rs`), com o mesmo
resultado para o mesmo input (Princípio VI).
