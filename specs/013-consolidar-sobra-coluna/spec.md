# Spec 013: Cortar até o final primeiro (consolidar a sobra lateral de colunas)

**Status**: IMPLEMENTADA (2026-07-18) · **Origem**: relato direto do usuário (sem
fluxo speckit formal) · **Motor**: TS + Rust/WASM

## Problema

Numa coluna `Z`, o `runPlacement` abre uma faixa `W` da **altura exata** de cada
peça e deixa um retalho à direita de **cada** faixa. Quando peças de **mesma
largura** se empilham, esses retalhos são fatias do **mesmo bloco** — a sobra sai
fragmentada. Diagnóstico do usuário na árvore real (WASM):

```
Z3560
  W1956 [02508]
  W413 → Q2634 [02525a]   ← sobra 926×413
  W413 → Q2634 [02525b]   ← sobra 926×413
  W407 → Q2634 [02525c]   ← sobra 926×407
```

É um problema de **GERAÇÃO** (a estrutura fragmentada é criada pelo placement), não
de seleção — por isso a **spec 011** (que só escolhe entre layouts prontos) não
resolvia o caso real.

## Solução

Um passo puro `consolidateColumns` (TS `tree-utils.ts` + espelho `consolidate_columns`
em `tree_utils.rs`) aplicado ao tree FINAL. A fragmentação ocorre em **DOIS níveis**
da hierarquia guilhotina, conforme a orientação do corte escolhida:

- **`X → Y-linhas → Z`** (caminho do GA / strip horizontal — o de PRODUÇÃO): cada
  peça numa linha `Y` própria, com um `Z` mais estreito que a coluna.
- **`Z → W-bandas → Q`** (caminho por coluna do `optimizeV6`): cada peça numa banda
  `W`, com um `Q` mais estreito que o `Z`.

São o mesmo fenômeno num nível diferente. O helper é genérico (`applyLevel`) e roda
nos dois: funde a corrida de bandas de mesma largura de sub-coluna numa só banda de
**altura somada**, com a sub-coluna cheia e as peças empilhadas na sub-banda
seguinte. Ex. (nível Y, GA):

```
Z3560
  W1956 [02508]
  W1233 → Q2634 → R413 [02525a]
                  R413 [02525b]
                  R407 [02525c]
  (sobra 926×1233 = UM bloco)
```

**Invariante**: as peças **não se movem** (mesma posição/medida) — só a
representação da sobra muda ⇒ conservação preservada (guardada pela rede da spec
012, `validatePlacementCandidate`).

## Onde é aplicado

- `optimizeV6` (`optimizer.ts` / `optimizer.rs`) — antes do return, após o normalize.
- GA: TS `genetic.ts` (2 returns) e no binding WASM `lib.rs` `wasm_optimize_genetic`
  (1 ponto, cobre os 4 returns do `genetic.rs`). O GA é o caminho de PRODUÇÃO.

## Cenário-âncora

Coluna 3560×3189 com 02508 (3560×1956) + três 02525 (2634×413 / 2634×413 /
2634×407) ⇒ sobra **926×413 → 926×1233**. TS e WASM idênticos.

## Testes

`src/test/column-consolidation.test.ts` (estrutura, conservação, sobra 926×1233,
idempotência, e os 3 casos que NÃO consolidam: larguras diferentes, run<2, peça de
largura cheia) + paridade no `src/test/wasm-parity.test.ts`. Benchmark sem regressão.

## Escopo / limites

Primeira iteração cobre o padrão `W → Q-folha de mesma largura`. Padrões mais
profundos (Q já com filhos R, larguras escalonadas que poderiam compartilhar um
corte maior) ficam para iterações futuras. O número de chapas de um lote é outra
frente (repetição de padrão / chapa dedicada), fora desta spec.
