# Research: Medida marcada exclusiva por chapa e prioritária

Fase 0. Resolve decisões técnicas. Formato Decisão / Racional / Alternativas.

## R1 — Exclusividade total: onde e como impor

**Decision**: Impor no nível do plano, na montagem do `inv` por chapa
(`runAllSheets`), ofertando **no máximo 1 peça marcada no total** por chapa (uma
única linha marcada com estoque) — substituindo o cap per-linha da 009.

**Rationale**: A 009 já provou que controlar o `inv` é o ponto único de controle:
tudo que constrói árvore (otimização direta, `homoBuild`, clones de replicação)
deriva do `inv`. Reduzir o `inv` a ≤1 marcada total garante ≤1 marcada em
qualquer chapa produzida, sem tocar motor/WASM (Princípios II/VI). É a menor
mudança possível sobre a base da 009.

**Alternatives considered**:
- *Pós-processar a árvore removendo marcadas em excesso*: violaria a garantia de
  colocação e desperdiçaria trabalho. Rejeitado.
- *Impor no motor*: exigiria propagar a flag ao WASM e duplicar em Rust
  (Princípio VI), com risco de regressão de aproveitamento. Rejeitado.

## R2 — Prioridade / "primeiro layout"

**Decision**: Ofertar uma peça marcada em **toda** chapa enquanto houver estoque
marcado, colocando-a no **início** do `inv`. Isso faz as peças marcadas serem
consumidas nas primeiras chapas (1 por chapa), satisfazendo "prioridade" e
"primeiras chapas" por construção.

**Rationale**: Se cada chapa consome 1 marcada até esgotar, as marcadas ocupam as
`totalMarcadas` primeiras chapas. Colocar a marcada no início do `inv` dá
prioridade de ordenação/colocação. Não é preciso um mecanismo de "reserva" no
motor.

**Alternatives considered**:
- *Concentrar todas as marcadas na primeira chapa*: contraria a exclusividade
  (FR-001) e o próprio pedido ("não podem aparecer na mesma chapa"). Rejeitado.
- *Dedicar as primeiras chapas só a marcadas (sem preencher com não marcadas)*:
  pioraria o aproveitamento sem necessidade; a exclusividade só limita a 1
  marcada, o resto pode ser preenchido. Rejeitado.

## R3 — Garantia de colocação da peça marcada na chapa corrente

**Decision (ATUALIZADA na implementação)**: Após otimizar a chapa, **verificar se
a peça marcada foi colocada** (via `extractLeafPieces`, comparando o uid). Se
NÃO foi, **refazer a chapa com `runPlacement` colocando a marcada PRIMEIRO** na
lista — `runPlacement` posiciona em ordem, então a marcada entra numa chapa vazia
(colocação garantida) e as não marcadas preenchem ao redor. É um fallback no
nível do plano, agnóstico ao motor (funciona para TS e WASM).

**Rationale**: `optimizeV6` escolhe o layout de **maior área** e pode **excluir**
uma peça marcada **pequena** (mandando-a para `remaining` → ela cairia no fim do
plano, quebrando a prioridade — bug relatado pelo usuário). Só ofertar a marcada
no início do `inv` NÃO resolve, porque `optimizeV6` reordena por estratégia de
sort. O fallback com `runPlacement` (que respeita a ordem dada) garante a
colocação sem tocar no comportamento do motor nem na paridade WASM.

**Implementação**: `src/pages/Index.tsx` (`runAllSheets`), logo após obter o
`result` (fresco ou do cache): `if (markedUid && !placed) result =
runPlacement(inv, ...).tree` e regrava o cache com o layout corrigido. Gated por
`markedUid` → planos sem marcação são intocados (não-regressão do benchmark).
Testes: `src/test/exclusive-priority-placement.test.ts` (o `runPlacement`
marcada-primeiro sempre coloca a marcada; o fallback recupera quando o
`optimizeV6` exclui).

**Alternatives considered**:
- *Confiar só na colocação natural + ordenar no `inv`*: insuficiente —
  `optimizeV6` reordena e maximiza área, excluindo marcadas pequenas. Foi a
  primeira tentativa; reprovada pelo relato do usuário. Substituída pelo fallback.
- *Mudar o `optimizeV6` para "must-include labels"*: quebraria a paridade TS↔WASM
  (Princípio VI) a menos que o Rust também mudasse. Rejeitado — o fallback no
  plano é agnóstico ao motor.
- *Reserva/seed no motor*: a árvore guilhotina não suporta "fixar peça e preencher
  em volta" de forma limpa. Rejeitado.

## R4 — Consistência do cache de layout

**Decision**: A chave do cache passa a ser `exclusiveSheetInvKey(remaining)`,
refletindo a fatia exclusiva (dims da marcada escolhida + dims/qty das não
marcadas). Chapas com a mesma fatia exclusiva reusam o layout.

**Rationale**: Após esgotar as marcadas, as chapas restantes (só não marcadas) são
idênticas e cacheáveis. Enquanto há marcadas, a chave inclui a dim da marcada
corrente. Mantém correção e ganho de desempenho.

**Alternatives considered**:
- *Desligar o cache quando há marcação*: perde ganho no caso comum (muitas chapas
  idênticas). Preterido.

## R5 — Substituição do comportamento da spec 009

**Decision**: A 010 **substitui** a regra de coexistência da 009 (não é toggle).
`runAllSheets` deixa de usar `capForSheet` (per-linha) e passa a usar a seleção
exclusiva. O caso de teste US2 da 009 (A e B coexistindo) é **atualizado** para
exclusividade; `capForSheet`/`sheetInvKey`/`perSheetQty` permanecem no módulo como
funções unit-tested (não usadas pelo plano), evitando remoção desnecessária.

**Rationale**: O spec (Assumptions) define a mudança como redefinição do
comportamento da flag. Manter as funções antigas testadas evita churn e permite
reuso futuro; apenas o ponto de integração e o teste comportamental mudam.

**Alternatives considered**:
- *Tornar exclusividade um toggle de UI*: mais superfície (novo controle, novo
  estado, ramo condicional no plano). Fora do que o usuário pediu ("ao flagar…
  não podem aparecer na mesma chapa" = comportamento da flag). Registrado como
  possível evolução se o usuário pedir na clarificação.
- *Remover `capForSheet`*: churn desnecessário; mantido.

## Resumo de decisões

| # | Decisão |
|---|---------|
| R1 | Exclusividade via `inv` ≤1 marcada total; ponto único de controle |
| R2 | 1 marcada por chapa em toda chapa até esgotar, no início do `inv` (prioridade) |
| R3 | Colocação por colocação natural + validação por teste; fallback de ordenação |
| R4 | Cache por `exclusiveSheetInvKey` (fatia exclusiva) |
| R5 | 010 substitui a coexistência da 009 (não toggle); teste US2 atualizado |

Nenhum `NEEDS CLARIFICATION` remanescente.
