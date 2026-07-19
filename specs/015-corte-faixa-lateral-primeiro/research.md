# Phase 0 — Research: Corte da faixa lateral primeiro

## R1 — Localizar o caminho que gera o `Q` profundo (a faixa lateral enterrada)

- **Decision**: O conserto mora onde uma LINHA (`Y`) de altura combinada é subdividida
  em **bandas horizontais `W`** (uma por peça empilhada) com um **resíduo `Q`** à
  direita de cada banda — produzindo `Y→Z→W-bandas→Q`. O padrão do âncora
  (`NORM=926×413` em 3 fatias vs `CONSOL=926×1233`) é exatamente esse: a faixa lateral
  926 vira 3 nós `Q` (nível 5), um por banda de 413.
- **Achado**: O caminho "combined pre-seed" do `runPlacement` (`placement.ts` L238-290)
  JÁ é vertical-first — isola a stack num `Z(baseW)` e faz "lateral fill" em `Z`s
  irmãos sob o mesmo `Y` (raso). Logo o padrão profundo NÃO vem daí. Suspeito nº1:
  as variantes de BANDA/STRIP em `grouping.ts` (`groupStripPackingDP` /
  `groupStripPackingDPTransposed` / `groupPiecesBandFirst`/`BandLast`), que montam
  faixas por altura via knapsack — geram `W-bandas` e o resíduo lateral vira `Q`.
- **Research task (T-inicial da Fase 2)**: instrumentar/inspecionar a ÁRVORE REAL do
  âncora (já temos os números; falta o caminho) para confirmar QUAL função emite o
  `Q(926)`. Método: rodar `optimizeV6` no cenário-âncora isolado (coluna 3560 com
  02508 + 3× 02525) num teste, imprimir a árvore, e casar com a função geradora.
- **Alternatives considered**: assumir cegamente que é o `runPlacement` — REJEITADO
  (a leitura mostra que o pre-seed já é vertical-first; mudar ali não tocaria o âncora,
  repetindo o erro da spec 013 que "não viu diferença" por cobrir o nível errado).

## R2 — ONDE introduzir o corte lateral: nova VARIANTE que compete por área

- **Decision**: NÃO reescrever o caminho existente in-place. Em vez disso, adicionar
  uma **nova estratégia/variante de geração** ("coluna com faixa lateral isolada"):
  ao montar uma linha/coluna com peças empilhadas + faixa lateral de altura cheia, ela
  emite `Z(peças) | Z(faixa)` (corte vertical de altura cheia PRIMEIRO), e a faixa `Z`
  é otimizada com o pool restante. Essa variante **entra no leque que o `optimizeV6`
  já seleciona por ÁREA** (a fronteira de seleção da spec 011: `área → free-rect →
  compactação`).
- **Rationale**: NÃO-REGRESSÃO POR CONSTRUÇÃO. As ~54 variantes já competem por área;
  a nova só VENCE quando de fato preenche a faixa (⇒ mais área alocada). Se não ajudar
  num caso, outra variante ganha e o layout fica idêntico ao atual (FR-007/FR-008
  satisfeitos sem gate manual frágil). Evita o risco de "mexer na geração e regredir".
- **Alternatives considered**:
  - **Reestruturar o gerador de bandas in-place** (sempre cortar lateral-first) —
    arriscado: muda TODOS os casos, pode regredir onde a banda-first era melhor.
  - **Pós-processar a árvore** (rotacionar `W-banda→Q` para `Z|Z`) — é a spec 013 (só
    reagrupa) + o pós-fill que PROVAMOS impossível (profundidade). Rejeitado.

## R3 — Detecção de "faixa lateral que vale a pena" (gate natural)

- **Decision**: A variante só emite o corte lateral quando: (a) existe faixa lateral de
  **altura cheia** ao lado das peças empilhadas; (b) `larguraFaixa ≥ menor lado de
  alguma peça restante` E `alturaFaixa ≥ menor altura de alguma peça restante` (há o
  que colocar); senão a variante não produz candidato (o leque segue sem ela). Respeita
  `minBreak`.
- **Rationale**: Gate embutido na própria geração do candidato — sem podar as
  estratégias de agrupamento (Princípio III intacto) e sem flag global. Barato.
- **Alternatives considered**: gate por flag/heurística global no `optimizeV6` —
  rejeitado (arrisca desligar caminhos e cair no anti-padrão do guard `hasLabels` da
  spec 012).

## R4 — Paridade TS↔WASM (Princípio VI) — o item de maior risco

- **Decision**: Espelhar a nova variante EXATAMENTE em `wasm-engine/src` (a função
  geradora + sua entrada no leque de `optimizer.rs`) e **rebuild wasm**. Estender
  `wasm-parity.test.ts`: mesmo input ⇒ mesma contagem alocada, mesmo multiset de
  medidas, e a MESMA estrutura no ponto do corte lateral (a faixa é `Z` raso nos dois).
- **Rationale**: O app roda WASM por padrão; sem o espelho a feature não existe para o
  usuário e vira dívida de paridade (Princípio VI). Lições registradas:
  `normalizeTree` TS/Rust divergem (spec 011) e HashMap Rust é não-determinístico
  entre processos (spec 012, memória `wasm-hashmap-determinismo`) — a nova variante
  NÃO pode iterar HashMap sem ordenar; casar a ordem de inserção do `Map` do TS.
- **Alternatives considered**: só TS (o app usa WASM) — rejeitado; divergência viva.

## R5 — Medição: o âncora só se prova no APP

- **Decision**: A prova de valor (SC-001/002) é rodar `of_geral_parcial (3).xls` no APP
  (WASM) e conferir que a faixa 926×1233 recebe peças e que nº de chapas cai /
  aproveitamento sobe. Usar a receita Playwright (memória `playwright-run-recipe`).
  `heuristics-benchmark` + `wasm-parity` + o novo `lateral-cut.test.ts` são a rede de
  NÃO-REGRESSÃO e de estrutura, NÃO a prova de chapas.
- **Rationale**: Lição dura das specs 011/012/014 e das iterações desta sessão: o
  benchmark sintético e os unit tests NÃO capturam o nº de chapas do âncora; só o app
  decide. Toda mudança de geração é medida no trabalho real antes de concluir (FR-009).
- **Alternatives considered**: confiar no benchmark — rejeitado (não pega o âncora).

## Riscos / ressalvas registradas

- Se o teste isolado do âncora (R1) mostrar que o `Q` profundo vem de MAIS de um
  caminho, a variante precisa cobrir todos — ou a seleção por área não a escolherá.
  (Eco da spec 013: cobrir só um nível "não viu diferença".)
- A variante nova adiciona uma passada de otimização da faixa (`optimizeV6` na sub-
  região) por candidato — medir custo; a faixa é estreita ⇒ poucas peças ⇒ barato.
- Determinismo: a otimização da faixa `Z` reusa o mesmo motor (já semeado, spec 007);
  não introduzir `Set`/`Map` iterados fora de ordem no Rust.
- Conservação: a faixa preenchida usa peças do pool; a rede da spec 012
  (`validatePlacementCandidate`) barra qualquer fantasma no limite candidato→plano.
