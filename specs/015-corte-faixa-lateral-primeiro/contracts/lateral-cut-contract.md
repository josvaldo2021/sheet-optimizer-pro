# Contract: Variante "coluna com faixa lateral isolada" (motor)

Contrato INTERNO do motor de otimização de UMA chapa (`src/lib/engine/`), espelhado em
`wasm-engine/src/`. Não é API pública; é o comportamento observável da geração + os
invariantes que os testes travam.

## Comportamento

Dada uma região (linha/coluna) com peças empilhadas ocupando `stackW` de largura e uma
faixa lateral livre de altura cheia (`lateralW × regionH`), a variante gera um candidato
de layout em que:

1. A região é cortada **verticalmente primeiro**: `Z(stackW)` (peças) e `Z(lateralW)`
   (faixa), ambos de altura cheia.
2. `Z(stackW)` recebe as peças empilhadas (bandas `W`) — mesmas peças, mesmas medidas,
   mesma posição relativa.
3. `Z(lateralW)` é otimizado com o pool restante (via o mesmo motor de UMA sub-região),
   recebendo peças com `menor lado ≤ lateralW` e `altura ≤ regionH` (em alguma
   orientação), respeitando `minBreak`.
4. Esse candidato entra no leque do `optimizeV6` e é escolhido pela fronteira de seleção
   existente (`área → maior retângulo livre → compactação`).

## Pós-condições / Invariantes (o que os testes travam)

- **C1 — Guilhotina**: o corte `Z(lateralW)` é reto e atravessa a altura cheia da
  região (borda a borda). Nenhum corte em L / não-retangular é introduzido.
- **C2 — Faixa rasa e preenchível**: no candidato, a faixa lateral aparece como nó `Z`
  (nível 3) de altura cheia — NÃO como `Q` (nível 5) fragmentado. Verificável na árvore
  do cenário-âncora.
- **C3 — Faixa preenchida quando há peças**: se existe peça restante que caiba na faixa,
  o candidato coloca ≥1 peça nela (a faixa deixa de ser bloco livre grande com peça
  disponível que caiba). SC-001.
- **C4 — Gate (não-regressão por construção)**: sem faixa aproveitável (larga/alta o
  bastante e com peça que caiba), a variante NÃO gera candidato ⇒ o leque e a seleção
  ficam idênticos ao atual (layout bit-a-bit). FR-008.
- **C5 — Conservação (spec 012)**: `folhas(árvore) + remaining = inventário`; nenhuma
  folha afirma medida inexistente; rótulo único. `validatePlacementCandidate` = true.
- **C6 — Determinismo**: mesmo input ⇒ mesma árvore (ordenações estáveis; sem `Set`/
  `Map`/`HashMap` iterados fora de ordem de inserção — no Rust rastrear inserção).
- **C7 — Paridade TS↔WASM**: para o mesmo input, TS e WASM produzem a MESMA contagem
  alocada, o MESMO multiset de medidas e a MESMA estrutura no ponto do corte lateral
  (faixa = `Z` nos dois). `wasm-parity.test.ts`.
- **C8 — Não-regressão global**: em todos os cenários do `heuristics-benchmark`, nº de
  chapas ≤ atual e aproveitamento ≥ atual.

## Casos de teste (a materializar)

`src/test/lateral-cut.test.ts` (TS) + extensão em `src/test/wasm-parity.test.ts`:

- **L1 (C1/C2)** — Cenário-âncora isolado: coluna 3560 com 02508(3560×1956) + 3×
  02525(2634×413/413/407) + peças candidatas (menor lado ≤926, altura ≤1233). A árvore
  do candidato tem a faixa como `Z(926)` de altura cheia (não `Q`), e ≥1 peça dentro.
- **L2 (C3)** — a faixa recebe o máximo de peças que cabem (a maior peça candidata
  entra).
- **L3 (C4)** — coluna cheia / faixa estreita demais / sem peça que caiba ⇒ variante
  não gera candidato; resultado idêntico ao baseline (mesma árvore).
- **L4 (C5)** — conservação: `validatePlacementCandidate` = true no cenário-âncora.
- **L5 (C6)** — determinismo: gerar 2× ⇒ árvore idêntica.
- **L6 (C7)** — paridade: TS e WASM ⇒ mesma contagem/medidas/estrutura da faixa.
- **L7 (C8)** — benchmark sem regressão (roda o harness da spec 007).

> A prova de VALOR (nº de chapas cai no âncora) NÃO está aqui — é a medição no APP
> (quickstart §2). Estes testes travam ESTRUTURA, conservação, determinismo, paridade e
> não-regressão.
