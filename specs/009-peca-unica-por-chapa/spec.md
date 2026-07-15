# Feature Specification: Peça única por chapa (medida sem repetição)

**Feature Branch**: `009-peca-unica-por-chapa`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "criar funcionalidade que não permite que uma medida marcada pelo usuario, se repita nos layouts. ou seja ao flagar a peça obrigatoriamente o sistema deve alocar 1 peça por chapa. as demais claro, serão utilizadas para montagem do layout"

## Clarifications

### Session 2026-07-15

- Q: A marcação de "medida não repetir" incide por dimensão física ou por linha
  de inventário? → A: Por **linha/entrada de inventário** — cada linha tem sua
  própria flag; duas linhas de mesma dimensão são independentes (marcar uma não
  marca a outra, e apenas as peças da linha marcada ficam limitadas a 1/chapa).
- Q: A peça marcada tem alocação garantida por chapa ou apenas oportunista
  (só quando o otimizador a encaixa)? → A: **Garantida** — enquanto houver
  estoque e a peça couber na chapa, o sistema reserva/prioriza 1 peça marcada por
  chapa, mesmo que isso reduza o aproveitamento das demais peças.
- Q: Se o estoque da medida marcada exceder as chapas que o restante exigiria, o
  que fazer com o excedente? → A: Gerar **chapas adicionais** (uma peça marcada
  por chapa) até esgotar o estoque, aceitando chapas de baixo aproveitamento; o
  excedente nunca vira sobra por causa da restrição.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Marcar uma medida para não repetir na chapa (Priority: P1)

O usuário identifica que uma determinada medida (peça) não pode aparecer mais de
uma vez na mesma chapa — por exemplo, por ser uma peça de acabamento, referência
ou controle de qualidade que exige separação física. Ele marca ("flag") essa
medida na lista de peças. A partir daí, ao gerar o plano de corte, o sistema
coloca **no máximo uma** peça dessa medida em cada chapa. As demais peças
(não marcadas) continuam preenchendo o restante de cada chapa normalmente, para
manter o melhor aproveitamento possível do material.

**Why this priority**: É o núcleo da funcionalidade e entrega valor sozinha. Sem
ela nada mais existe. Uma única medida marcada já demonstra e valida todo o
comportamento.

**Independent Test**: Marcar uma medida com estoque suficiente, gerar o plano
multi-chapa e verificar que nenhuma chapa contém duas ou mais peças dessa medida,
enquanto as chapas continuam sendo preenchidas com as demais peças.

**Acceptance Scenarios**:

1. **Given** uma medida marcada com estoque de N peças e um plano que gera pelo
   menos N chapas, **When** o plano é gerado, **Then** cada uma das N primeiras
   chapas contém exatamente 1 peça dessa medida e nenhuma chapa contém 2 ou mais.
2. **Given** uma medida marcada e outras medidas não marcadas, **When** o plano é
   gerado, **Then** o espaço restante de cada chapa é preenchido com as peças não
   marcadas, mantendo o objetivo de aproveitamento.
3. **Given** uma medida marcada com estoque de 1 peça, **When** o plano é gerado,
   **Then** essa peça aparece em exatamente 1 chapa e em nenhuma outra.

---

### User Story 2 - Marcar várias medidas simultaneamente (Priority: P2)

O usuário marca mais de uma medida diferente como "não repetir". Cada medida
marcada é limitada independentemente a, no máximo, uma peça por chapa; medidas
distintas podem coexistir na mesma chapa (uma de cada), e as não marcadas
preenchem o resto.

**Why this priority**: Estende o valor de P1 para casos reais com múltiplas peças
de controle, mas depende do comportamento base já estar correto.

**Independent Test**: Marcar duas medidas distintas, gerar o plano e verificar
que, em cada chapa, cada medida marcada aparece no máximo uma vez (podendo as
duas coexistir na mesma chapa).

**Acceptance Scenarios**:

1. **Given** duas medidas marcadas A e B com estoque suficiente, **When** o plano
   é gerado, **Then** nenhuma chapa contém 2+ peças de A nem 2+ peças de B, mas
   uma mesma chapa pode conter 1 de A e 1 de B.

---

### User Story 3 - Desmarcar e replanejar (Priority: P3)

O usuário desmarca uma medida previamente marcada. O sistema volta a tratá-la
como peça comum (podendo repetir na mesma chapa) e o plano é recalculado
refletindo a mudança.

**Why this priority**: Reversibilidade é esperada, mas é secundária à restrição
em si. O valor central já existe com marcar/gerar.

**Independent Test**: Marcar uma medida, gerar o plano, desmarcar e gerar de
novo; confirmar que a restrição de 1-por-chapa deixou de ser aplicada.

**Acceptance Scenarios**:

1. **Given** uma medida marcada e um plano gerado sob a restrição, **When** o
   usuário desmarca a medida e replaneja, **Then** o plano volta a permitir
   múltiplas peças dessa medida na mesma chapa.

---

### Edge Cases

- **Estoque maior que o número de chapas naturalmente necessárias**: se a medida
  marcada tem mais peças do que caberiam em chapas separadas pelo restante do
  plano, o sistema gera chapas adicionais suficientes para acomodar 1 peça
  marcada por chapa até esgotar o estoque dessa medida.
- **Estoque menor que o número de chapas**: as chapas excedentes simplesmente não
  contêm a medida marcada (limite é "no máximo 1", nunca obrigatoriedade de
  presença em toda chapa após o esgotamento do estoque).
- **Peça marcada maior que a chapa**: continua não sendo alocável (comportamento
  existente do motor); a marcação não força o impossível.
- **Todas as medidas marcadas**: cada chapa recebe no máximo 1 de cada medida; o
  plano pode exigir muitas chapas e aproveitamento baixo — resultado aceito e
  esperado.
- **Interação com "salvar layout ×N" e reservas (spec 008)**: um layout salvo e
  repetido ×N representa N chapas iguais; cada repetição contém no máximo 1 da
  medida marcada, e a restrição deve continuar válida no replanejamento do
  restante. Uma medida marcada não pode ser incluída num layout salvo em
  quantidade maior que 1 por chapa.
- **Interação com repetição de padrão (spec 006)**: repetir um padrão que contém
  a medida marcada é permitido apenas enquanto cada chapa resultante mantiver no
  máximo 1 peça dessa medida.
- **Marcação persiste ao replanejar**: recalcular o plano (por qualquer gatilho)
  preserva as marcações do usuário.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que o usuário marque e desmarque uma medida
  (peça) como "não repetir na chapa" a partir da lista de peças.
- **FR-002**: Ao gerar o plano de corte, o sistema MUST alocar **no máximo uma**
  peça de cada medida marcada por chapa.
- **FR-003**: Enquanto houver estoque de uma medida marcada, o sistema MUST
  alocar exatamente 1 peça dessa medida por chapa gerada (nunca 0 quando há
  estoque e a chapa comporta a peça, nunca 2+). Essa alocação MUST ser
  **garantida/reservada**: o sistema prioriza colocar a peça marcada mesmo que
  isso reduza o aproveitamento das demais peças na chapa.
- **FR-004**: O sistema MUST continuar preenchendo o espaço restante de cada
  chapa com as peças não marcadas, preservando o objetivo de aproveitamento do
  material.
- **FR-005**: O sistema MUST tratar cada medida marcada de forma independente —
  medidas marcadas distintas podem coexistir na mesma chapa (uma de cada).
- **FR-006**: O sistema MUST gerar chapas adicionais quando o estoque de uma
  medida marcada exceder o número de chapas que o restante do plano exigiria,
  até esgotar esse estoque a 1 por chapa.
- **FR-007**: O sistema MUST preservar as marcações do usuário ao longo de
  replanejamentos e não perdê-las por gatilhos automáticos de recálculo.
- **FR-008**: Ao desmarcar uma medida, o sistema MUST voltar a tratá-la como peça
  comum (repetição permitida) no próximo plano gerado.
- **FR-009**: O sistema MUST indicar visualmente na lista de peças quais medidas
  estão marcadas como "não repetir".
- **FR-010**: A restrição MUST ser respeitada em conjunto com as funcionalidades
  existentes de salvar layout ×N / reservas (spec 008) e repetição de padrão
  (spec 006): nenhuma chapa produzida por essas rotinas pode conter 2+ peças de
  uma medida marcada.

### Key Entities *(include if feature involves data)*

- **Medida marcada (peça "não repetir")**: uma **linha/entrada do inventário**
  que o usuário sinalizou para não se repetir na mesma chapa. Atributo booleano
  por linha; independente das demais flags existentes (ex.: manual, saved) e
  independente de outras linhas com a mesma dimensão (marcar uma não marca a
  outra; apenas as peças da linha marcada ficam limitadas a 1/chapa).
- **Chapa (layout)**: a unidade sobre a qual a restrição incide — a contagem de
  peças de uma medida marcada dentro de uma mesma chapa nunca pode passar de 1.
- **Plano multi-chapa**: o conjunto de chapas geradas; determina quantas chapas
  existem e, portanto, quantas peças marcadas podem ser distribuídas (1 por
  chapa).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das chapas de qualquer plano gerado, a contagem de peças de
  cada medida marcada é ≤ 1.
- **SC-002**: Quando o estoque de uma medida marcada é ≥ ao número de chapas do
  plano, 100% das chapas contêm exatamente 1 peça dessa medida.
- **SC-003**: Peças não marcadas continuam sendo alocadas normalmente: o total de
  peças não marcadas colocadas no plano não diminui em relação ao mesmo cenário
  sem nenhuma marcação (a restrição não descarta peças comuns).
- **SC-004**: O usuário consegue marcar/desmarcar uma medida e ver o plano
  refletir a mudança em uma única ação de replanejamento, sem passos manuais
  adicionais.
- **SC-005**: Nenhuma medida marcada é perdida após replanejamentos sucessivos
  (as marcações persistem em 100% dos recálculos dentro da sessão).

## Assumptions

- "Medida marcada" refere-se a uma linha/entrada do inventário (confirmado em
  Clarifications): se duas linhas distintas tiverem a mesma dimensão, cada uma
  tem sua própria marcação independente e somente as peças da linha marcada ficam
  limitadas a 1/chapa.
- A restrição é "no máximo 1 por chapa" (limite superior). A obrigatoriedade de
  presença vale apenas enquanto houver estoque da medida marcada e a chapa
  comportar a peça; após o esgotamento, chapas restantes ficam sem ela.
- A funcionalidade prioriza a garantia de não-repetição sobre o aproveitamento
  máximo do material: aceita-se piora de aproveitamento como consequência
  esperada de espalhar peças marcadas em chapas separadas.
- O motor de corte continua guilhotinado e puro (Princípios I e II da
  constituição); a restrição é uma regra de alocação, não um novo tipo de corte.
- A marcação é um estado da peça no inventário da sessão, análogo às flags já
  existentes (`manual`, `saved`), e reutiliza o mesmo fluxo de replanejamento.
- O escopo cobre o plano multi-chapa gerado pelo sistema; não há requisito de
  reordenar retroativamente chapas já confirmadas/lote fechado.
