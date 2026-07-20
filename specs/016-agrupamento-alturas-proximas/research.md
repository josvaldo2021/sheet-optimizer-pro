# Phase 0 — Research: Agrupamento de colunas com alturas próximas

## R1. Onde o agrupamento acontece hoje

**Achado**: `consolidateColumnsX` (`src/lib/engine/tree-utils.ts:472`) é um pós-processo PURO da
camada de PLANO, chamado APENAS em `src/pages/Index.tsx:668` (e re-exportado por
`src/lib/cnc-engine.ts:22`). NÃO é chamado de dentro do motor (`optimizer.ts`, `genetic.ts` só
chamam `consolidateColumns`, que é outra coisa — spec 013, nível W→Q / Y→Z).

**Decisão**: a mudança fica 100% em `consolidateColumnsX` + o seu call-site em `Index.tsx`.

**Consequência (Princípio VI)**: **NÃO há espelho Rust/WASM a fazer**. `consolidate_columns_x`
não existe em `tree_utils.rs` porque a função nasceu na camada de plano (spec 015). Sem rebuild
de WASM, sem risco de divergência TS↔WASM.

**Alternativa rejeitada**: mover o agrupamento para dentro do motor — dobraria o trabalho
(espelho Rust + rebuild) e o motor já não é o lugar: a decisão depende do pool de peças
restantes do PLANO.

---

## R2. Semântica do campo "Quebra Mínima" (`minBreak`)

**Achado**: o campo existe em `src/features/sheet-setup/SheetSetupPanel.tsx:147` ("Quebra
Mínima" → `minBreak`), já atravessa `engine-adapter` → `optimizeV6`/`genetic`, e no
`tree-utils.ts:146-151` é usado exatamente como PISO: um corte que deixe uma sobra
`0 < diff < minBreak` entre irmãos é REJEITADO ("Distância de quebra insuficiente").

**Decisão**: reusar `minBreak` como piso do resíduo de correção. Uma coluna entra no conjunto
quando `diff == 0` (caso de hoje) ou `diff >= minBreak`. Isto casa com o exemplo do usuário
(diff 68, quebra 50 ⇒ agrupa) e com o uso já estabelecido do campo.

**Alternativa rejeitada**: tratar `minBreak` como TETO de tolerância (`diff <= minBreak`).
Rejeitada por contradizer o exemplo do usuário (68 > 50 e ele quer agrupar) e por ser
fisicamente errada: uma tira de 12 mm não é cortável numa máquina com quebra de 50.

**Alternativa rejeitada**: campo novo na UI. O usuário pediu explicitamente para reusar o
existente.

---

## R3. Como representar a "correção na menor" na árvore guilhotina

**Achado**: a faixa agrupada hoje é `X(Σ colW) → Y(h) → Z(w_i)[peça]`, com todas as peças de
mesma altura `h` como folhas `Z`.

**Decisão**: para a peça mais BAIXA de um conjunto (`h_i < bandH`), a folha `Z` vira
`Z(w_i) → W(h_i)[peça]`. Como `Y` corta altura, `Z` corta largura e `W` corta altura de novo,
o `W(h_i)` é exatamente o corte de correção: a peça sai com a altura ORIGINAL e o resíduo
`w_i × (bandH − h_i)` fica livre acima dela, dentro da própria sub-coluna. Cortes continuam
guilhotinados de borda a borda (Princípio I).

**Validado contra o resto do pipeline**:
- `calcPlacedArea` (`tree-utils.ts:175-178`) já soma folhas `W` como `z.valor * w.valor` ⇒ a
  área não regride (foi o bug corrigido na spec 015 para folhas `Y`).
- `largestFreeRect` (`tree-utils.ts:426-428`) já mede o "fundo do Z" como `zw × (rh − ΣW)` ⇒ o
  resíduo de correção é contabilizado sem código novo.
- `collapseRedundantCuts` roda DEPOIS e colapsa o `W` quando ele não subdivide (peça de altura
  igual à faixa), então o caso `diff == 0` continua produzindo exatamente a árvore de hoje.
- Profundidade: a faixa vai a `X→Y→Z→W` (4 níveis) e a tira de preenchimento é um `Y` irmão
  remapeado com `remapXToZ(x, 2)` ⇒ o teto de 6 níveis (`R`) não é ameaçado pela mudança.

**Alternativa rejeitada**: igualar as alturas na faixa. Violaria FR-006 / Princípio III (peça
fantasma — exatamente a classe de bug que a spec 012 caçou).

---

## R4. Como avaliar a guarda "quando não agrupar" (FR-004/FR-010)

**Decisão**: por conjunto candidato, comparar `largestFreeRect` da chapa ANTES e DEPOIS da
fusão daquele conjunto, num CLONE da árvore e **antes** de qualquer preenchimento da tira.
Aceita se `área(depois) >= área(antes)`.

**Rationale**:
- `largestFreeRect` já existe (spec 011) e é derivado 100% da árvore (Princípio IV).
- Medir antes do preenchimento é obrigatório: o `fillStrip` consome a sobra consolidada e faria
  a guarda reprovar justamente os agrupamentos bem-sucedidos.
- O caso `diff == 0` passa trivialmente (`Σ colW × sobra` ≥ `max colW × sobra`) ⇒ nenhuma
  regressão do comportamento da spec 015.

**Alternativa rejeitada**: soma de todas as áreas livres. A soma é invariante à consolidação
(as peças não se movem) menos o resíduo de correção, então reprovaria SEMPRE que houvesse
correção — matando a feature. Descartada com o usuário.

**Alternativa rejeitada**: exigir que alguma peça restante caiba na sobra. Decisão explícita do
usuário: a sobra em bloco vale por si.

---

## R5. Determinismo do agrupamento por altura (Princípio V)

**Achado**: hoje o agrupamento chaveia por `Math.round(h)` num `Map`, cuja ordem de iteração é
a de inserção ⇒ determinístico. Com tolerância, "quais colunas formam um conjunto" deixa de ser
uma relação de equivalência (não é transitiva) e passa a depender da ORDEM de formação.

**Decisão**: formação gulosa determinística — ordenar os candidatos por altura DESC, desempate
pelo índice original ASC; a semente é o candidato mais alto ainda livre; absorve todo candidato
livre cuja diferença para a semente seja `0` ou `>= minBreak`. A faixa nasce na posição da
PRIMEIRA coluna do conjunto na ordem ORIGINAL (regra já vigente).

**Rationale**: semear pela MAIOR altura é o que o usuário descreveu ("agrupamento baseado na
maior"), e a ordenação total elimina qualquer dependência de ordem de `Map`. Sem `Math.random`,
sem `HashMap` (não há Rust envolvido).

---

## R6. Guardas de medição

**Decisão**: nenhum número de chapas é declarado vitorioso sem medição no app com o âncora
`of_geral_parcial (3).xls` (31 chapas hoje). `heuristics-benchmark.test.ts` é a rede contra
regressão de aproveitamento; testes unitários novos em
`src/test/consolidate-columns-x.test.ts` (estender o arquivo existente, não criar outro).

**Rationale**: histórico do projeto (specs 012/014) — benchmark e testes unitários NÃO pegam
número de chapas; só o app decide. E a spec 014 fase 2 foi revertida por medir mal.
