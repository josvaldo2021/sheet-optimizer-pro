# Research: Peça única por chapa (medida sem repetição)

Fase 0 do plano. Resolve as decisões técnicas antes do design detalhado. Cada
item segue o formato Decisão / Racional / Alternativas.

## R1 — Onde enforçar a restrição (nível do plano vs. motor)

**Decision**: Enforçar no **nível do plano** — no ponto onde o inventário de cada
chapa é montado dentro de `runAllSheets` (`src/pages/Index.tsx`, ~linhas 481-491),
apoiado por um módulo puro `src/lib/unique-per-sheet.ts`. O motor
(`src/lib/engine/**`) e a ponte WASM não mudam de comportamento.

**Rationale**: A restrição "no máximo 1 peça de uma linha por chapa" é uma regra
de **alocação/inventário**, não de corte. `runAllSheets` já expande `remaining[].qty`
em `inv` por chapa; limitar essa expansão a 1 para linhas marcadas é uma mudança
local e determinística. Preserva Princípios II (motor puro) e VI (paridade
TS↔WASM), e segue o padrão já usado pelas specs 006 (`pattern-repetition.ts`) e
008 (`lots/layout-replication.ts`): módulo puro + integração fina no `Index.tsx`.

**Alternatives considered**:
- *Enforçar dentro do motor (`optimizeV6`/`placement`)*: exigiria propagar a flag
  pela fronteira WASM e duplicar a regra em Rust (Princípio VI), aumentando risco
  de regressão de aproveitamento sem ganho. Rejeitado.
- *Pós-processar a árvore removendo peças marcadas em excesso*: violaria a
  garantia (peça sumiria) e desperdiçaria trabalho do otimizador. Rejeitado.

## R2 — Nova flag vs. reutilizar `priority`

**Decision**: Adicionar campo **novo** `uniquePerSheet?: boolean` em `PieceItem`.
Não reutilizar `priority`.

**Rationale**: A semântica atual de `priority` é um **filtro de UI**: em
`Index.tsx` (linhas 391-392 e 449-450) `hasPriority ? pieces.filter(p.priority) : pieces`
— quando qualquer peça é priority, o plano otimiza **apenas** as priority e
ignora as demais. Isso é o oposto do requisito (peças marcadas são **capadas**,
não exclusivas; as não marcadas continuam sendo usadas). Sobrecarregar `priority`
quebraria o comportamento existente. `priorityLabels` no motor é apenas parâmetro
de assinatura (não consumido na lógica atual do GA), então também não serve de
mecanismo de garantia.

**Alternatives considered**:
- *Reutilizar `priority`*: colide com o filtro existente. Rejeitado.
- *Marcar por dimensão (W×H) em vez de por linha*: descartado na fase de
  clarificação (decisão: por linha de inventário). Ver `spec.md` › Clarifications.

## R3 — Garantia de alocação (peça marcada presente em cada chapa)

**Decision**: O **cap de 1 por chapa** (só 1 peça marcada ofertada ao motor por
chapa) garante o invariante duro **≤1/chapa (SC-001)** por construção. Para a
**presença garantida** quando há estoque (SC-002), confiar na colocação natural
do motor com agrupamento ligado (a peça marcada única quase sempre é alocada),
e **assegurar por teste de regressão** (fixtures em que estoque marcado ≥ nº de
chapas ⇒ cada chapa contém exatamente 1). Peça marcada eventualmente não colocada
numa chapa simplesmente rola para a próxima (o loop já continua até esgotar o
inventário), então nunca vira sobra (FR-006).

**Rationale**: Como só existe 1 peça marcada no `inv` da chapa, o motor não tem
como colocar 2+ (SC-001 é impossível de violar). O único risco residual é o motor
**deferir** a peça marcada única (chapa com 0 quando caberia 1), afetando SC-002.
Medir isso com fixtures representativas é mais barato e seguro que introduzir um
mecanismo de reserva no motor.

**Fallback (se o gate de medição reprovar SC-002)**: ordenar as linhas marcadas à
frente do `inv` da chapa (peça marcada primeiro na lista passada ao otimizador),
aumentando a probabilidade de colocação sem alterar o motor. Só adotar se um
cenário de teste demonstrar deferimento indevido; caso contrário manter o caminho
simples. Nenhuma mudança de motor/WASM em qualquer dos casos.

**Alternatives considered**:
- *Reserva no motor (semear a chapa com a peça marcada e otimizar o resto ao
  redor)*: a árvore guilhotina não suporta "fixar peça e preencher em volta" de
  forma limpa; exigiria mudança profunda no motor e no WASM. Rejeitado.

## R4 — Consistência do cache de layout por chapa

**Decision**: A chave do cache de layout (`buildInvKey`, ~linha 461/507 de
`Index.tsx`) MUST passar a refletir a **fatia capada** por chapa (função
`sheetInvKey` no módulo puro), não o `remaining` integral.

**Rationale**: O cache reusa a árvore quando duas chapas têm a mesma "assinatura"
de inventário. Se a chave usar `remaining` integral (com qty grande da linha
marcada) mas o `inv` otimizado for capado (qty 1), o cache pode devolver um layout
computado para outra fatia, potencialmente violando o cap ou desperdiçando reuso
correto. Chavear pela fatia capada mantém o cache correto e ainda acelera chapas
idênticas (comum quando há muitas peças marcadas espalhadas 1/chapa).

**Alternatives considered**:
- *Desligar o cache quando há marcação*: simples, mas perde o ganho de desempenho
  justamente no caso comum (muitas chapas quase idênticas com 1 marcada cada).
  Aceitável como fallback, mas inferior. Preterido.

## R5 — Interação com specs 006 (repetição de padrão) e 008 (save ×N / reservas)

**Decision**: A contagem de peças marcadas por chapa (derivada da árvore) é a
fonte única para ambas as integrações:
- **006**: o cálculo de repetição de um padrão que contenha linha marcada é
  limitado pelo estoque dessa linha (cada chapa replicada consome 1). Como o
  `capForSheet` já garante ≤1 por chapa candidata, a replicação nunca produz 2+
  numa mesma chapa; a quantidade de repetições respeita o estoque marcado.
- **008**: `maxRepetitions`/`effectiveInventory`/reservas tratam a linha marcada
  como no máximo 1 por cópia salva; nenhuma reserva/cópia contém 2+ da linha
  marcada. A flag é preservada ao reconstruir o inventário efetivo (análogo a
  `manual || saved`).

**Rationale**: Centralizar a contagem por árvore (Princípio IV) evita divergência
entre os fluxos e mantém o invariante único ("≤1 por chapa") verdadeiro em todos
os caminhos que produzem chapas (plano automático, repetição, save ×N).

**Alternatives considered**:
- *Ignorar a interação (só cobrir o plano automático)*: deixaria brechas onde
  repetição/save recriariam 2+ marcadas por chapa, contrariando FR-010. Rejeitado.

## R6 — Persistência e UX da marcação

**Decision**: A marcação é estado de sessão em `pieces` (`PieceItem.uniquePerSheet`),
alternável por um controle por linha na lista de peças (`SidebarSection.tsx`), com
indicador visual. Preservada em replanejamentos (não perdida por recálculo).

**Rationale**: Consistente com como `priority` (por peça) e `manual`/`saved` (por
chapa) já vivem no estado da sessão; sem necessidade de persistência em disco. O
requisito FR-007/SC-005 é satisfeito preservando a flag ao reconstruir inventário.

**Alternatives considered**:
- *Persistir marcação em armazenamento local*: fora do escopo (nenhuma outra flag
  é persistida hoje). Rejeitado.

## Resumo de decisões

| # | Decisão |
|---|---------|
| R1 | Enforçar no nível do plano (`runAllSheets`) + módulo puro; motor/WASM intocados |
| R2 | Campo novo `uniquePerSheet?: boolean`; não reutilizar `priority` (é filtro) |
| R3 | Cap garante ≤1 (SC-001); presença (SC-002) validada por regressão; fallback = ordenar à frente |
| R4 | Chave do cache = fatia capada por chapa (`sheetInvKey`) |
| R5 | Contagem por árvore como fonte única para specs 006 e 008 (FR-010) |
| R6 | Flag = estado de sessão por linha; preservada em replanejamento |

Nenhum `NEEDS CLARIFICATION` remanescente.
