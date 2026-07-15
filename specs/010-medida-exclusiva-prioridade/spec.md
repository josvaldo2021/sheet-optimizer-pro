# Feature Specification: Medida marcada exclusiva por chapa e prioritária no primeiro layout

**Feature Branch**: `010-medida-exclusiva-prioridade`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "ao flagar uma medidas para que não se repitam no layout, em caso de multiplas medidas diferentes elas não podem aparecer na mesma chapa, alem disso a otimização sempre deve colocar essa peça como prioridade e ser processada no primeiro layout."

## Contexto e relação com a spec 009

Esta funcionalidade **refina a spec 009** ("peça única por chapa"). A spec 009
limita cada linha marcada a no máximo 1 peça por chapa e **permite** que medidas
marcadas diferentes coexistam na mesma chapa (uma de cada). Esta spec **altera**
esse comportamento em dois pontos:

1. **Exclusividade total por chapa**: medidas marcadas **diferentes** não podem
   aparecer juntas na mesma chapa. Combinado com a regra da 009, isso significa
   **no máximo 1 peça marcada por chapa no total** (de qualquer linha marcada).
2. **Prioridade e primeiro layout**: as peças marcadas devem ser **processadas
   primeiro** e alocadas a partir das **primeiras chapas** do plano, com
   prioridade sobre as peças não marcadas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Uma única peça marcada por chapa, sem misturar medidas (Priority: P1)

O usuário marca duas ou mais medidas diferentes como "não repetir na chapa".
Ao gerar o plano, o sistema garante que **nenhuma chapa contenha duas peças
marcadas**, mesmo que sejam de medidas diferentes. Cada chapa tem no máximo uma
peça marcada (de uma única medida); as peças não marcadas preenchem o restante.

**Why this priority**: É o núcleo da mudança pedida — a exclusividade entre
medidas marcadas diferentes. Entrega valor sozinha e é diretamente verificável.

**Independent Test**: Marcar as medidas A e B (ambas com estoque), gerar o plano
e verificar que nenhuma chapa contém simultaneamente uma peça de A e uma de B —
nem duas de A, nem duas de B.

**Acceptance Scenarios**:

1. **Given** as medidas marcadas A e B com estoque suficiente, **When** o plano é
   gerado, **Then** nenhuma chapa contém 2 ou mais peças marcadas no total
   (nunca A+B juntas, nunca A+A, nunca B+B).
2. **Given** apenas a medida A marcada, **When** o plano é gerado, **Then** o
   comportamento é idêntico ao da spec 009 (no máximo 1 A por chapa).
3. **Given** medidas marcadas e não marcadas, **When** o plano é gerado, **Then**
   cada chapa tem no máximo 1 peça marcada e o restante é preenchido com peças
   não marcadas.

---

### User Story 2 - Peças marcadas prioritárias, alocadas nas primeiras chapas (Priority: P1)

O usuário espera que as peças marcadas sejam tratadas como prioridade: o sistema
as processa primeiro e as coloca nas **primeiras chapas** do plano (uma por
chapa), antes de dedicar chapas às peças comuns.

**Why this priority**: É a segunda metade explícita do pedido ("prioridade" e
"primeiro layout"). Junto com US1 forma o comportamento completo.

**Independent Test**: Marcar N peças (somando N unidades marcadas), gerar o plano
e verificar que as N primeiras chapas contêm exatamente 1 peça marcada cada, e as
chapas seguintes contêm apenas peças não marcadas.

**Acceptance Scenarios**:

1. **Given** N peças marcadas no total (de uma ou mais medidas) e peças não
   marcadas, **When** o plano é gerado, **Then** cada uma das **primeiras N
   chapas** contém exatamente 1 peça marcada.
2. **Given** uma peça marcada e muitas peças não marcadas, **When** o plano é
   gerado, **Then** a peça marcada aparece já na **primeira chapa**.
3. **Given** peças marcadas, **When** o plano é gerado, **Then** nenhuma peça
   marcada é deixada para o fim/como sobra enquanto houver chapa disponível.

---

### User Story 3 - Desmarcar volta ao comportamento normal (Priority: P3)

O usuário desmarca as medidas; o sistema volta a tratá-las como peças comuns
(sem exclusividade nem prioridade) no próximo plano.

**Why this priority**: Reversibilidade esperada, secundária ao comportamento
central.

**Independent Test**: Marcar, gerar, desmarcar e replanejar; confirmar que a
exclusividade e a prioridade deixam de ser aplicadas.

**Acceptance Scenarios**:

1. **Given** medidas marcadas e um plano sob as novas regras, **When** o usuário
   desmarca e replaneja, **Then** o plano volta a permitir múltiplas peças (antes
   marcadas) na mesma chapa e sem prioridade especial.

---

### Edge Cases

- **Total de peças marcadas maior que o nº de chapas naturalmente necessárias**:
  o sistema gera chapas adicionais suficientes para acomodar 1 peça marcada por
  chapa até esgotar o estoque marcado (herdado da spec 009).
- **Só peças marcadas (nenhuma não marcada)**: cada chapa tem exatamente 1 peça
  marcada; o número de chapas = total de peças marcadas.
- **Uma peça marcada não cabe na chapa**: permanece não alocável (comportamento
  existente do motor); a exclusividade/prioridade não força o impossível.
- **Peças marcadas de dimensões muito pequenas**: mesmo cabendo várias na chapa,
  a regra de exclusividade mantém no máximo 1 marcada por chapa (aproveitamento
  menor é aceito e esperado).
- **Interação com salvar layout ×N (spec 008) e repetição de padrão (spec 006)**:
  nenhuma chapa produzida por essas rotinas pode conter 2+ peças marcadas
  (de qualquer medida); a prioridade das marcadas vale no plano automático.
- **Ordem entre várias peças marcadas**: quando há várias peças marcadas para as
  primeiras chapas, o sistema as distribui 1 por chapa; a ordem relativa entre
  elas não é garantida além de "todas antes das peças comuns".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST garantir que nenhuma chapa contenha mais de **uma
  peça marcada no total**, contando todas as medidas marcadas em conjunto
  (exclusividade entre medidas marcadas diferentes, além da não repetição da
  mesma medida).
- **FR-002**: O sistema MUST tratar as peças marcadas como **prioridade**,
  processando-as antes das peças não marcadas ao montar o plano.
- **FR-003**: O sistema MUST alocar as peças marcadas a partir das **primeiras
  chapas** do plano — cada uma das primeiras chapas recebe exatamente 1 peça
  marcada enquanto houver estoque marcado.
- **FR-004**: O sistema MUST preencher o espaço restante de cada chapa (marcada
  ou não) com peças **não marcadas**, preservando o objetivo de aproveitamento.
- **FR-005**: O sistema MUST NOT deixar uma peça marcada sem alocação enquanto
  houver ao menos uma chapa que a comporte (marcadas nunca viram sobra por causa
  da restrição).
- **FR-006**: O sistema MUST gerar chapas adicionais quando o total de peças
  marcadas exceder o número de chapas que o restante exigiria, até esgotar o
  estoque marcado a 1 por chapa.
- **FR-007**: O sistema MUST preservar as marcações do usuário ao longo de
  replanejamentos e não perdê-las por gatilhos automáticos de recálculo.
- **FR-008**: Ao desmarcar uma medida, o sistema MUST voltar a tratá-la como peça
  comum (sem exclusividade nem prioridade) no próximo plano.
- **FR-009**: A restrição de exclusividade e a prioridade MUST valer em conjunto
  com as funcionalidades existentes de salvar layout ×N (spec 008) e repetição de
  padrão (spec 006): nenhuma chapa produzida por essas rotinas pode conter 2+
  peças marcadas.

### Key Entities *(include if feature involves data)*

- **Medida marcada (peça "não repetir")**: linha do inventário sinalizada pelo
  usuário (mesmo conceito e mecanismo da spec 009). Esta spec redefine a regra de
  convivência entre marcadas: passam a ser **mutuamente exclusivas por chapa** e
  **prioritárias**.
- **Chapa (layout)**: unidade sobre a qual as restrições incidem — a contagem de
  peças marcadas (de qualquer medida) dentro de uma mesma chapa nunca passa de 1.
- **Plano multi-chapa**: conjunto ordenado de chapas; as peças marcadas ocupam as
  primeiras posições (1 por chapa).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das chapas de qualquer plano gerado, a contagem total de
  peças marcadas (somando todas as medidas marcadas) é ≤ 1.
- **SC-002**: Dado um total de N peças marcadas, as **N primeiras chapas** do
  plano contêm exatamente 1 peça marcada cada, em 100% dos casos em que há chapas
  suficientes.
- **SC-003**: Nenhuma peça marcada permanece como sobra quando existe chapa que a
  comporte (0% de marcadas não alocadas nesse cenário).
- **SC-004**: Peças não marcadas continuam sendo alocadas normalmente: o total de
  peças não marcadas colocadas não diminui em relação ao mesmo cenário sem
  nenhuma marcação além do necessário para respeitar a exclusividade.
- **SC-005**: O usuário consegue marcar/desmarcar e ver o plano refletir a
  mudança em uma única ação de replanejamento.
- **SC-006**: Nenhuma marcação é perdida após replanejamentos sucessivos (100%
  preservadas dentro da sessão).

## Assumptions

- Esta spec **redefine** o comportamento da flag da spec 009 (não é um modo
  separado/opcional): a partir daqui, medidas marcadas são mutuamente exclusivas
  por chapa e prioritárias. O item de aceite da 009 que permitia coexistência de
  marcadas distintas na mesma chapa é **substituído** por FR-001.
- "Prioridade" e "primeiro layout" significam que as peças marcadas são alocadas
  antes das não marcadas e ocupam as primeiras chapas (1 por chapa); não
  significa concentrar todas as marcadas em uma única chapa (o que contrariaria a
  exclusividade).
- A regra continua sendo "no máximo 1 marcada por chapa" (limite superior); após
  esgotar o estoque marcado, as chapas seguintes ficam sem peça marcada.
- A funcionalidade prioriza a garantia de exclusividade/prioridade sobre o
  aproveitamento máximo do material — aceita-se piora de aproveitamento como
  consequência esperada.
- O motor de corte permanece guilhotinado e a marcação é uma regra de alocação,
  não um novo tipo de corte.
- A marcação é estado de sessão por linha do inventário, como na spec 009.
- O escopo cobre o plano multi-chapa gerado pelo sistema; não há requisito de
  reordenar retroativamente lotes já confirmados.
