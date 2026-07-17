# Feature Specification: Qualidade de corte para peças identificadas

**Feature Branch**: `012-qualidade-pecas-identificadas`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Peças identificadas (rótulo de OF) hoje recebem planos de corte piores que peças anônimas, e a sobra sai fragmentada. Investigação mostrou que identificar uma peça faz o planejador considerar um conjunto muito menor de estratégias. Habilitar as estratégias completas para peças identificadas, hoje, quebra a conservação (peças somem do rastreio; o plano relata mais peças do que existem no inventário). Corrigir a conservação primeiro; só então liberar a qualidade."

## Contexto

O usuário importa trabalhos do relatório de OF, onde **toda peça chega identificada**
por um código (ex.: `02539/26`). A identificação é fundamental: é ela que permite
deduzir o estoque, montar lotes e dizer ao operador qual peça é qual na chapa.

Hoje o planejador trata trabalhos identificados de forma diferente de trabalhos
anônimos, e pior: com peças identificadas ele considera um conjunto drasticamente
reduzido de estratégias de corte. Na prática, **100% dos trabalhos reais do usuário
caem no modo reduzido** — ninguém corta peças anônimas.

O efeito visível é sobra fragmentada. Numa chapa de 5980×3190 com 4 peças de
2473×1262 e 2 de 2634×406, o plano deixa **dois retalhos separados de 1034×1262**
em vez de um único 1034×2524. Dois pedaços pequenos não são reaproveitáveis; um
retalho inteiro é.

Essa diferença de tratamento não é gratuita: ela protege o sistema de uma falha
mais grave. Quando as estratégias completas são liberadas para peças identificadas
hoje, o plano **perde a conservação** — peças agrupadas durante o planejamento não
voltam a ser peças individuais rastreáveis no plano final. Isso produz duas falhas
observadas:

- **Peças que somem do rastreio**: quatro peças de 250×200 empilhadas aparecem no
  plano como uma única peça de 250×800 carregando a identificação de apenas uma
  delas. As outras três desaparecem.
- **Peças que aparecem do nada**: um inventário de 385 peças produz um plano que
  relata 429 peças alocadas.

No uso real isso significaria **dedução de estoque errada e um plano de corte que
mente sobre o que está cortando** — consequências piores que sobra fragmentada.

Esta spec trata a causa na ordem correta: **primeiro a conservação, depois a
qualidade**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O plano nunca mente sobre as peças (Priority: P1)

O usuário planeja um trabalho identificado e confia que o plano corresponde à
realidade: cada peça do inventário aparece no plano no máximo uma vez, com a sua
medida real, e é possível saber a qual item do inventário cada peça cortada
pertence.

**Why this priority**: é a fundação. Sem conservação, todo o resto (dedução de
estoque, lotes, identificação na chapa) fica corrompido — e é a única coisa que
impede a liberação da qualidade (US2). Um plano bonito com contagem errada é pior
que um plano feio com contagem certa.

**Independent Test**: planejar um inventário identificado de tamanho conhecido e
verificar que o total de peças no plano é igual ao total consumido do inventário,
que nenhuma peça do plano tem medida inexistente no inventário, e que cada peça do
plano aponta para o item que a originou.

**Acceptance Scenarios**:

1. **Given** um inventário identificado com um total conhecido de peças, **When** o
   plano é gerado, **Then** a soma das peças alocadas mais as não alocadas é igual
   ao total do inventário, nunca maior.
2. **Given** um inventário com várias peças idênticas e identificadas
   individualmente, **When** o planejador as combina para aproveitar melhor a chapa,
   **Then** cada peça continua aparecendo no plano como uma peça própria, com a sua
   identificação e a sua medida real.
3. **Given** qualquer plano gerado, **When** as peças do plano são inspecionadas,
   **Then** toda peça identificada tem uma medida que existe no inventário (em
   alguma orientação permitida) — nunca a medida de um conjunto de peças.

---

### User Story 2 - Identificar uma peça não piora o corte (Priority: P2)

O usuário importa um trabalho do relatório de OF e recebe um plano tão bom quanto
receberia se as mesmas peças não tivessem identificação — mesmo aproveitamento,
mesmo número de chapas, e sobra tão consolidada quanto o planejador conseguir.

**Why this priority**: é o valor que o usuário pediu, e a razão de existir desta
spec. Depende inteiramente da US1 e só pode ser liberada depois dela.

**Independent Test**: planejar o mesmo conjunto de peças duas vezes — uma com
identificação, outra sem — e comparar aproveitamento e número de chapas.

**Acceptance Scenarios**:

1. **Given** um conjunto de peças, **When** o plano é gerado com elas identificadas
   e depois sem identificação, **Then** o aproveitamento e o número de chapas do
   plano identificado são iguais ou melhores que os do anônimo.
2. **Given** o cenário-âncora do usuário (4 peças de 2473×1262 e 2 de 2634×406 numa
   chapa de 5980×3190, todas identificadas), **When** o plano é gerado, **Then** as
   6 peças são alocadas na mesma chapa, cada uma com a sua identificação, e nenhuma
   peça fica de fora.
3. **Given** qualquer cenário de referência já medido, **When** o plano é gerado,
   **Then** o aproveitamento não regride em relação à medição anterior.

---

### User Story 3 - A espera pelo plano continua suportável (Priority: P3)

O usuário gera o plano de um trabalho típico e, mesmo com o planejador considerando
muito mais estratégias, a espera continua suportável e acompanhada de progresso.

**Why this priority**: liberar as estratégias completas aumenta muito o trabalho de
busca — cerca de 9× nas medições, levando um trabalho típico de ~20s para ~2min.
Esse custo foi **explicitamente aceito** pelo usuário em troca de aproveitamento:
material desperdiçado custa mais que a espera. Esta história existe apenas para
garantir que a espera permaneça acompanhada e dentro da ordem de grandeza prevista
— não para otimizá-la.

**Independent Test**: medir o tempo de geração do plano de um trabalho típico e
confirmar que fica na ordem de ~2 minutos, com progresso visível.

**Acceptance Scenarios**:

1. **Given** um trabalho típico do usuário, **When** o plano é gerado, **Then** o
   resultado sai em até ~2 minutos, com indicação de progresso enquanto processa.
2. **Given** um trabalho em processamento, **When** o usuário observa a tela,
   **Then** ele vê o progresso avançar e não uma interface aparentemente travada.

---

### Edge Cases

- **Peças combinadas de medidas diferentes**: quando o planejador combina peças que
  não são idênticas, cada uma deve voltar ao plano com a sua própria medida — não
  com uma medida média ou com a medida do conjunto.
- **Peças combinadas e giradas**: quando um conjunto de peças combinadas é girado
  90° para caber, as peças individuais devem manter suas medidas reais e a
  orientação correta.
- **Combinações em grade**: quando peças idênticas são combinadas em duas direções
  (uma grade), cada peça da grade deve aparecer individualmente identificada.
- **Trabalho misto**: um inventário com algumas peças identificadas e outras não
  deve ser tratado com o conjunto completo de estratégias, e as não identificadas
  não devem ganhar identificação inventada.
- **Combinação profunda demais**: se uma combinação não puder ser desfeita em peças
  individuais rastreáveis dentro dos limites da estrutura de corte, ela MUST ser
  descartada como candidata em vez de produzir um plano não rastreável.
- **Inventário grande**: trabalhos com muitas peças distintas não podem estourar o
  tempo tolerável (ver US3).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O plano MUST alocar cada peça do inventário no máximo uma vez. O total
  de peças relatadas no plano MUST NUNCA exceder o total disponível no inventário.
- **FR-002**: Toda peça alocada no plano MUST ser rastreável ao item de inventário
  que a originou, preservando a sua identificação.
- **FR-003**: Toda peça alocada MUST ter as medidas reais da peça do inventário, em
  alguma orientação permitida. O plano MUST NUNCA apresentar como uma peça a medida
  de um conjunto de peças.
- **FR-004**: A identificação de uma peça MUST NOT reduzir o conjunto de estratégias
  de otimização que o planejador considera. Trabalhos identificados e anônimos MUST
  ser planejados com o mesmo poder de busca.
- **FR-005**: O aproveitamento e o número de chapas de um trabalho identificado MUST
  ser iguais ou melhores que os do mesmo trabalho sem identificação.
- **FR-006**: Nenhum cenário de referência já medido MUST regredir em aproveitamento
  ou número de chapas. Melhorias MUST ser incorporadas como a nova referência.
- **FR-007**: Combinações de peças que não possam ser desfeitas em peças individuais
  rastreáveis MUST ser descartadas como candidatas, nunca aceitas no plano final.
- **FR-008**: A geração do plano de um trabalho típico MUST concluir em até ~2
  minutos, exibindo progresso enquanto processa. Qualidade prevalece sobre tempo:
  reduzir o esforço de busca para acelerar o plano está FORA de escopo — o custo de
  tempo é aceito conscientemente em troca de aproveitamento.

### Key Entities

- **Peça**: uma unidade física a ser cortada. Tem medidas reais, uma identificação
  (quando vinda de um relatório de OF) e pertence a um item do inventário.
- **Item de inventário**: uma linha do trabalho, com medida e quantidade. Origem das
  peças e destino das deduções.
- **Combinação de peças**: agrupamento temporário que o planejador faz durante a
  busca para aproveitar melhor a chapa. É um meio, não um fim — MUST sempre poder
  ser desfeito em peças individuais rastreáveis no plano final.
- **Plano de corte**: o resultado do planejamento. É a fonte da verdade sobre o que
  será cortado; toda contagem e dedução deriva dele.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para um inventário identificado de N peças, o plano relata exatamente
  N peças entre alocadas e não alocadas — nunca mais que N.
- **SC-002**: 100% das peças identificadas no plano têm medida existente no
  inventário. Zero peças com medida de conjunto.
- **SC-003**: 100% das peças alocadas são rastreáveis ao item de inventário de
  origem, permitindo dedução de estoque correta.
- **SC-004**: No cenário-âncora do usuário, as 6 peças são alocadas na mesma chapa,
  todas identificadas.
- **SC-005**: Em todos os cenários de referência, o aproveitamento é igual ou
  superior ao medido antes da mudança, e o número de chapas é igual ou menor.
- **SC-006**: Para trabalhos idênticos, planejar com identificação produz
  aproveitamento igual ou melhor que planejar sem identificação (hoje é pior).
- **SC-007**: O mesmo trabalho planejado duas vezes produz o mesmo plano.
- **SC-008**: O plano de um trabalho típico conclui em até ~2 minutos, com progresso
  visível durante todo o processamento.

## Assumptions

- **A identificação é obrigatória e não negociável.** Remover ou simplificar a
  identificação das peças para viabilizar a otimização está fora de cogitação: é
  ela que sustenta dedução de estoque, lotes e a leitura do plano pelo operador.
- **Combinar peças durante a busca é desejável e deve continuar.** É o que produz
  bons aproveitamentos; o problema não é combinar, é não desfazer a combinação de
  forma rastreável no plano final.
- **A qualidade atual é o piso, não a meta.** Espera-se melhora em trabalhos
  identificados; qualquer piora, em qualquer cenário, é falha.
- **O custo de tempo foi aceito conscientemente** (decidido pelo usuário em
  2026-07-16): um trabalho típico pode ir de ~20s para ~2min. Material
  desperdiçado custa mais que a espera. Consequência de escopo: **reduzir o esforço
  de busca para acelerar o plano NÃO faz parte desta spec** — nem calibrar o corte
  automático que hoje limita a busca em inventários grandes, nem selecionar
  estratégias promissoras em vez de testar todas. Se o tempo se mostrar intolerável
  na prática, vira trabalho seguinte, com medição própria.
- **Sobra consolidada fica para depois.** O usuário definiu o princípio "as sobras
  não podem fragmentar, não importa se havia ou não outra peça no inventário" — um
  retalho inteiro vale mais que dois pedaços, independente do inventário atual.
  Isso é trabalho seguinte e corrige a mira da spec 011 (que media a sobra contra as
  peças ainda não alocadas, e não pelo valor da sobra em si). Esta spec não persegue
  consolidação de sobra: ela devolve ao planejador o poder de busca que hoje lhe
  falta, do qual a consolidação depende.
- **O comportamento vale para as duas implementações do motor** (Princípio VI):
  qualquer mudança de comportamento é espelhada, e divergência é bug.
- **Trabalho típico** é assumido como um trabalho vindo de um relatório de OF, na
  ordem de centenas de peças — a base para o critério de tempo (FR-008/US3).
