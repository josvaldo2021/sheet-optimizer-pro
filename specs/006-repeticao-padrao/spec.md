# Feature Specification: Maximização de repetição de padrão de corte

**Feature Branch**: `006-repeticao-padrao`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "estratégia de maximização de repetição de padrão de corte no plano multi-chapa: escolher, entre layouts candidatos, o padrão que pode ser repetido no maior número de chapas mantendo um bom aproveitamento (piso configurável), reduzindo setups distintos na serra"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plano com menos padrões distintos para a serra (Priority: P1)

Um operador tem um pedido grande (muitas peças, várias chapas). Hoje o sistema
escolhe, para cada chapa, o layout de maior aproveitamento — o que frequentemente
produz um padrão diferente por chapa, ou um padrão ótimo que só se repete uma vez
porque contém uma peça escassa. Cada padrão distinto é um novo ajuste (setup) na
seccionadora: reprogramar cortes, conferir, retrabalho. Com esta feature, o operador
liga a opção "priorizar repetição de padrão" e o sistema passa a preferir padrões que
podem ser **cortados iguais no maior número de chapas**, desde que o aproveitamento
fique acima de um piso que ele define. O resultado é um plano com **poucos padrões
distintos**, cada um repetido muitas vezes — menos setups, produção mais rápida.

**Why this priority**: É o valor central. Em produção real, o custo de troca de setup
domina o tempo de corte; reduzir padrões distintos tem impacto direto e imediato.

**Independent Test**: Rodar a otimização de um pedido multi-chapa com a opção ligada
e com ela desligada; comparar o número de **padrões de corte distintos** e o
aproveitamento médio. A história entrega valor se o número de padrões distintos cai
mantendo o aproveitamento acima do piso configurado.

**Acceptance Scenarios**:

1. **Given** um pedido que gera várias chapas e a opção de repetição ligada com piso de aproveitamento definido, **When** o operador otimiza, **Then** o plano usa menos padrões de corte distintos que o modo padrão, e todo padrão escolhido tem aproveitamento ≥ piso.
2. **Given** a opção ligada, **When** existe um layout de altíssimo aproveitamento que só se repete uma vez e um layout ligeiramente menor que se repete muitas vezes (ambos ≥ piso), **Then** o sistema prefere o que se repete mais.
3. **Given** a opção **desligada**, **When** o operador otimiza, **Then** o comportamento é idêntico ao atual (máximo aproveitamento por chapa), sem regressão.

---

### User Story 2 - Controle do equilíbrio entre repetição e aproveitamento (Priority: P2)

O operador precisa poder ajustar o quanto o sistema "abre mão" de aproveitamento em
troca de repetição, porque isso muda por tipo de trabalho. Ele define um **piso de
aproveitamento** (ex.: 85%): padrões abaixo do piso nunca são escolhidos só por
repetirem muito. Ele consegue ver, para o plano gerado, quantos padrões distintos
existem e quantas vezes cada um se repete, para decidir se o piso está bom.

**Why this priority**: Sem o controle, a otimização por repetição poderia sacrificar
material demais. O piso é o que torna a feature segura e confiável para o dia a dia.

**Independent Test**: Ajustar o piso para dois valores diferentes no mesmo pedido e
verificar que um piso mais alto resulta em aproveitamento médio maior (e possivelmente
mais padrões distintos), enquanto um piso mais baixo permite mais repetição.

**Acceptance Scenarios**:

1. **Given** um pedido e a opção ligada, **When** o operador aumenta o piso de aproveitamento, **Then** o aproveitamento médio do plano não diminui (pode aumentar) e nenhum padrão abaixo do novo piso é usado.
2. **Given** um plano gerado com a opção ligada, **When** o operador consulta o resumo, **Then** ele vê o número de padrões distintos e quantas chapas cada padrão cobre.

---

### Edge Cases

- **Nada se repete**: se nenhum padrão candidato acima do piso puder ser repetido (inventário sem peças suficientes), o sistema recai no comportamento padrão (melhor aproveitamento por chapa) sem travar.
- **Piso inatingível**: se nenhum candidato atinge o piso configurado, o sistema usa o de maior aproveitamento disponível e sinaliza que o piso não foi atingido.
- **Peça única / pedido pequeno**: um pedido que cabe em uma chapa não tem o que repetir; o resultado é o mesmo do modo padrão.
- **Empate de repetição**: quando dois padrões repetem o mesmo número de vezes e ambos ≥ piso, o desempate é por aproveitamento (maior primeiro), de forma determinística.
- **Peças prioritárias**: peças marcadas como prioritárias continuam sendo respeitadas; a repetição não pode adiar indefinidamente uma peça prioritária.
- **Inventário se esgota no meio de uma repetição**: só se conta uma repetição quando há peças suficientes para **um padrão completo**; repetições parciais não são criadas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer uma opção (ligada/desligada) para "priorizar repetição de padrão" na otimização multi-chapa.
- **FR-002**: Quando a opção está ligada, o sistema MUST escolher, entre os layouts candidatos de cada etapa, aquele que pode ser repetido no maior número de chapas com o inventário restante, **entre os candidatos cujo aproveitamento é ≥ piso configurado**.
- **FR-003**: O sistema MUST permitir ao operador configurar o **piso de aproveitamento** usado como restrição, com um valor padrão razoável.
- **FR-004**: Um padrão só MUST contar como "repetível" para uma chapa adicional quando o inventário restante comporta o **conjunto completo** de peças daquele padrão.
- **FR-005**: Quando a opção está **desligada**, o resultado MUST ser idêntico ao comportamento atual (máximo aproveitamento por chapa) — sem regressão.
- **FR-006**: Quando nenhum candidato atinge o piso, o sistema MUST usar o de maior aproveitamento e sinalizar que o piso não foi atingido, sem falhar.
- **FR-007**: A seleção por repetição MUST ser determinística: mesmo pedido e mesmas configurações produzem o mesmo plano, com desempate estável (repetição, depois aproveitamento).
- **FR-011**: Quando reduzir padrões distintos conflita com reduzir o número total de chapas, o sistema MUST priorizar **menos padrões distintos** (respeitado o piso de aproveitamento); o total de chapas é objetivo secundário.
- **FR-008**: O sistema MUST apresentar ao operador, para o plano gerado, o **número de padrões de corte distintos** e quantas chapas cada padrão cobre.
- **FR-009**: A feature MUST respeitar todas as restrições de corte já vigentes (guilhotina, margens, corte mínimo, rotação) e as peças prioritárias.
- **FR-010**: Todo padrão de corte gerado MUST permanecer um plano válido e fisicamente cortável (as chapas repetidas são cópias exatas de um padrão válido).

### Key Entities *(include if feature involves data)*

- **Layout candidato**: um plano de corte possível para uma chapa, com seu aproveitamento e sua composição de peças (quais peças e quantas). Vários candidatos competem a cada etapa.
- **Padrão de corte**: um layout escolhido que será cortado igual em uma ou mais chapas. Caracterizado por sua composição de peças e seu aproveitamento.
- **Contagem de repetição**: quantas chapas adicionais um padrão pode cobrir dado o inventário restante, limitada pela peça mais escassa do padrão.
- **Piso de aproveitamento**: restrição configurável (percentual) abaixo da qual um padrão não é elegível para ser escolhido por repetição.
- **Resumo de padrões**: para um plano, o conjunto de padrões distintos e o número de chapas que cada um cobre.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em pedidos multi-chapa representativos, com a opção ligada e piso definido, o **número de padrões de corte distintos** é menor que no modo padrão em ao menos um cenário-alvo, sem nenhum padrão abaixo do piso.
- **SC-002**: Nenhum plano gerado com a opção ligada usa um padrão com aproveitamento abaixo do piso configurado (a menos que sinalizado que o piso é inatingível).
- **SC-003**: Com a opção **desligada**, 100% dos cenários existentes produzem exatamente o mesmo plano de antes — zero regressão.
- **SC-004**: Aumentar o piso de aproveitamento nunca reduz o aproveitamento médio do plano resultante.
- **SC-005**: 100% de reprodutibilidade: mesmo pedido e mesmas configurações produzem o mesmo plano.
- **SC-006**: 100% dos padrões e chapas repetidas gerados são planos de corte válidos (guilhotina, margens, corte mínimo).
- **SC-007**: O operador consegue ver, em cada plano, quantos padrões distintos existem e a cobertura de cada um.

## Assumptions

- **Objetivo primário** (decidido): reduzir **setups distintos na serra** (menos padrões diferentes). Quando isso conflita com minimizar o número total de chapas, **prevalece menos padrões distintos**, respeitado o piso de aproveitamento — o total de chapas é objetivo secundário. O piso protege o material contra repetições de baixo aproveitamento.
- "Bom aproveitamento" é operacionalizado como um **piso percentual configurável** (restrição dura), não como um peso difuso — mais previsível para o operador. Valor padrão assumido: 85%.
- A feature atua na **etapa de escolha do layout** do fluxo multi-chapa (qual padrão usar e quantas vezes repetir), não muda como uma chapa individual é cortada.
- O mecanismo de repetição existente (contar quantas cópias completas o inventário suporta, limitado pela peça mais escassa) é reutilizado como base da contagem de repetição.
- A opção vem **desligada por padrão**, preservando o comportamento atual como default e garantindo não-regressão.
- Determinismo, corte guilhotina, margens, corte mínimo, rotação e peças prioritárias permanecem invioláveis (constituição do projeto).
