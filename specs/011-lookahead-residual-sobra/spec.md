# Feature Specification: Seleção de layout por lookahead residual (a sobra que recebe a próxima peça)

**Feature Branch**: `011-lookahead-residual-sobra`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description (síntese da conversa): ao escolher entre layouts de uma chapa, o que diferencia uma chapa melhor não é a *forma* da sobra, e sim a **oportunidade de encaixar outra peça nessa sobra**. Layouts que fragmentam o espaço livre desperdiçam material porque empurram peças para chapas seguintes; layouts que consolidam o espaço livre num bloco que **cabe a próxima peça** aproveitam mais. Caso de referência: "Estudo de Layouts — Chapa 2, forma correta".

## Contexto e motivação

Hoje o motor escolhe o layout de uma chapa pelo **maior preenchimento da chapa
atual** e desempata por um critério cru (`calcCompactness`, "menos colunas").
Nenhum dos dois **olha para as peças que ainda faltam cortar** — é uma decisão
míope, chapa a chapa. Quando dois layouts empatam no preenchimento da chapa
atual, o motor não distingue entre um que deixa o espaço livre **fragmentado**
(incapaz de receber a próxima peça) e um que deixa um **bloco consolidado** que
**comporta a próxima peça** — e frequentemente escolhe o fragmentado.

Esta feature adiciona um **critério de lookahead residual**: entre layouts
candidatos, preferir aquele cujo maior espaço livre residual **comporta a próxima
(ou a maior) peça ainda não alocada**. O efeito é **mais peças por chapa / menos
chapas no total** — ou seja, **mais aproveitamento**, não menos.

**Não** é premiar sobra. Uma sobra que não recebe nada não ganha vantagem alguma;
só é preferida a sobra que **será preenchida** por uma peça real que ainda falta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sobra que recebe a próxima peça vence o empate (Priority: P1)

Ao gerar o plano, quando dois layouts de uma chapa preenchem a mesma área com as
mesmas peças, o sistema escolhe aquele cujo maior espaço livre **comporta a
próxima peça ainda não alocada**, para que essa peça caiba (nesta chapa ou na
seguinte) sem gerar chapa extra.

**Why this priority**: É o núcleo do pedido e o que gera valor (menos chapas).
O caso "Chapa 2 forma correta" do estudo é exatamente este.

**Independent Test**: Reproduzir o cenário da Chapa 2 (2× 3748×646, 1× 5766×1618,
1× 3388×189, chapa 6000×3210) e verificar que o layout escolhido deixa o espaço
livre **consolidado** num retângulo que comporta a próxima peça do inventário —
em vez de fragmentá-lo em faixas que não comportam nada.

**Acceptance Scenarios**:

1. **Given** dois layouts candidatos de uma chapa com **mesma área alocada**,
   um com espaço livre fragmentado e outro com um bloco livre que comporta a
   próxima peça, **When** o sistema seleciona o layout da chapa, **Then** escolhe
   o do bloco que comporta a próxima peça.
2. **Given** o cenário-âncora da Chapa 2, **When** o plano é gerado, **Then** o
   maior retângulo livre da chapa comporta a próxima peça ainda não alocada
   (o que não acontece no layout fragmentado atual).
3. **Given** um plano multi-chapa completo, **When** comparado ao mesmo plano sem
   o critério, **Then** o número total de chapas é **igual ou menor** e o
   aproveitamento é **igual ou maior**.

---

### User Story 2 - Nunca premiar espaço vazio (guarda-corpo) (Priority: P1)

O critério de lookahead é **subordinado** ao aproveitamento: nunca faz o sistema
escolher uma chapa com **menos peças** (menor área alocada) nem gerar uma chapa a
mais só para deixar um bloco livre "melhor".

**Why this priority**: É a preocupação explícita do usuário ("não corre o risco
do algoritmo considerar uma chapa com sobra sendo melhor?"). Sem esta garantia, a
feature poderia piorar o aproveitamento — inaceitável (objetivo primário).

**Independent Test**: Em qualquer cenário, confirmar que, entre dois layouts de
áreas alocadas diferentes, o sistema sempre prefere o de **maior área**; o
lookahead só decide **empates**.

**Acceptance Scenarios**:

1. **Given** dois layouts com áreas alocadas diferentes, **When** o sistema
   escolhe, **Then** escolhe o de maior área alocada, independentemente do
   formato do espaço livre.
2. **Given** o conjunto de cenários de referência (benchmark), **When** o plano
   é gerado com o critério, **Then** **nenhum** cenário piora em aproveitamento
   nem em número de chapas.

---

### User Story 3 - Escolha determinística e reproduzível (Priority: P3)

A escolha guiada pelo lookahead é determinística: o mesmo inventário produz
sempre o mesmo plano.

**Why this priority**: Requisito de estabilidade/testabilidade do motor; secundário
ao ganho em si.

**Independent Test**: Gerar o mesmo plano duas vezes com o mesmo inventário e
confirmar planos idênticos.

**Acceptance Scenarios**:

1. **Given** um inventário fixo, **When** o plano é gerado duas vezes, **Then**
   os planos (chapas e cortes) são idênticos.

---

### Edge Cases

- **Nenhuma peça restante comporta qualquer sobra**: o lookahead não muda nada;
  vale o desempate atual (ex.: sobra mais compacta). Sem regressão.
- **Empate em área E em capacidade de receber a próxima peça**: aplicar o
  desempate secundário existente (compactação) e, por fim, um critério estável
  para garantir determinismo.
- **"Próxima peça" ambígua** (várias peças distintas ainda por alocar): usar a
  **maior peça ainda não alocada** como referência do lookahead (a mais difícil
  de encaixar depois); a maior peça caber garante que menores também cabem.
- **Peça restante maior que qualquer sobra possível**: o lookahead não penaliza
  nem premia (nenhuma sobra a comporta); sem efeito.
- **Rotação**: a verificação de "cabe" considera a peça em qualquer orientação
  permitida (como o resto do motor).
- **Interação com peças marcadas (specs 009/010)**: o lookahead não pode violar a
  exclusividade/prioridade das marcadas; opera dentro das mesmas restrições de
  alocação já vigentes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Ao selecionar o layout de uma chapa entre candidatos de **mesma
  área alocada**, o sistema MUST preferir aquele cujo **maior espaço livre
  residual comporta a próxima peça ainda não alocada** (em qualquer orientação
  permitida).
- **FR-002**: O critério de lookahead residual MUST ser **estritamente
  subordinado** ao aproveitamento: entre layouts de áreas alocadas diferentes, o
  sistema MUST sempre escolher o de **maior área**; o lookahead só decide empates.
- **FR-003**: O critério MUST NOT aumentar o número total de chapas do plano nem
  reduzir o aproveitamento em relação ao plano sem o critério, em nenhum cenário
  de referência.
- **FR-004**: Quando nenhuma peça restante comporta o espaço livre de qualquer
  candidato, o sistema MUST recair no desempate existente (comportamento atual),
  sem regressão.
- **FR-005**: A "próxima peça" usada como referência do lookahead MUST ser a
  **maior peça ainda não alocada** do inventário restante (critério estável).
- **FR-006**: A escolha guiada pelo lookahead MUST ser **determinística** (mesmo
  inventário → mesmo plano), com um critério de desempate final estável.
- **FR-007**: O critério MUST respeitar as restrições de alocação existentes
  (corte guilhotina; exclusividade/prioridade de peças marcadas das specs
  009/010).
- **FR-008**: O caso "Chapa 2 forma correta" do estudo de layouts MUST ser
  incorporado como **cenário de referência** verificável (o maior espaço livre
  passa a comportar a próxima peça).

### Key Entities *(include if feature involves data)*

- **Layout candidato**: uma disposição possível das peças numa chapa, com uma
  **área alocada** e um conjunto de **espaços livres residuais**.
- **Espaço livre residual**: região não ocupada de uma chapa; o que importa é o
  **maior retângulo livre** e se ele comporta outra peça.
- **Próxima peça (referência do lookahead)**: a **maior peça ainda não alocada**
  do inventário restante, usada para avaliar a utilidade do espaço livre.
- **Plano multi-chapa**: sequência de chapas; a métrica de sucesso é o total de
  chapas e o aproveitamento global.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No cenário-âncora da Chapa 2, o **maior retângulo livre** do layout
  escolhido **comporta a próxima peça ainda não alocada** (hoje não comporta).
- **SC-002**: Em **100%** dos cenários de referência (benchmark), o número total
  de chapas do plano é **igual ou menor** com o critério ativo.
- **SC-003**: Em **100%** dos cenários de referência, o aproveitamento de material
  é **igual ou maior** com o critério ativo (**nenhuma** regressão).
- **SC-004**: Em pelo menos o cenário-âncora (e idealmente em outros com sobra
  aproveitável), o critério resulta em **pelo menos 1 peça a mais** encaixada sem
  chapa adicional, ou **1 chapa a menos** no total.
- **SC-005**: O mesmo inventário gera planos idênticos em execuções repetidas
  (determinismo em 100% das execuções).

## Assumptions

- O critério é implementado como **desempate subordinado** à hierarquia já
  vigente: (1) maior área alocada na chapa; (2) [desempates existentes]; e agora
  (3) maior espaço livre comporta a próxima peça. Ele **não** rebaixa o
  preenchimento da chapa atual em troca de sobra — decisão registrada para evitar
  o risco levantado pelo usuário; refinar em `/speckit-clarify` se a intenção for
  permitir uma troca marginal de preenchimento por menos chapas no total.
- "Comporta a próxima peça" = existe um retângulo livre que acomoda a maior peça
  ainda não alocada em alguma orientação permitida, respeitando margens e
  restrição mínima de corte.
- O aproveitamento (área alocada e nº de chapas) permanece o **objetivo primário e
  inegociável**; o lookahead só reordena empates a favor do aproveitamento futuro.
- A validação de não-regressão usa o harness de benchmark existente como portão.
- O motor permanece guilhotinado; o critério é de **seleção entre layouts**, não
  um novo tipo de corte.
- A referência "maior peça não alocada" é uma aproximação pragmática da "próxima
  peça"; caso o usuário queira um lookahead mais profundo (várias peças à frente),
  isso é uma evolução futura fora do escopo desta spec.
