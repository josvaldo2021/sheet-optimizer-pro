# Feature Specification: Duas novas heurísticas de otimização

**Feature Branch**: `005-novas-heuristicas`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "implementar 2 novas heuristicas"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Melhor aproveitamento em layouts onde as estratégias atuais falham (Priority: P1)

Um operador cadastra um conjunto de peças e executa a otimização. Hoje, para certos conjuntos (ex.: mistura de peças muito compridas com peças pequenas, ou muitas peças de proporções variadas), o plano de corte gerado deixa desperdício evitável ou usa uma chapa a mais do que o necessário. Ao adicionar duas novas estratégias de arranjo ao repertório do otimizador, esses conjuntos passam a ter, em pelo menos parte dos casos, um plano de corte com melhor aproveitamento — sem que o operador precise mudar nada na forma de trabalhar.

**Why this priority**: É o valor central da feature. Aproveitamento de material é o objetivo primário do produto (menos desperdício, menos chapas). Sem essa melhoria mensurável, a feature não se justifica.

**Independent Test**: Rodar a otimização sobre os cenários de benchmark existentes e sobre cenários novos que hoje têm mau aproveitamento; comparar o aproveitamento (área útil ocupada) e o número de chapas antes e depois. A história entrega valor se ao menos um cenário melhora e nenhum piora.

**Acceptance Scenarios**:

1. **Given** um conjunto de peças em que o plano de corte atual tem desperdício evitável, **When** o operador executa a otimização, **Then** o plano resultante tem aproveitamento igual ou melhor que o atual em todos os cenários e estritamente melhor em ao menos um cenário-alvo.
2. **Given** qualquer conjunto de peças já coberto pelos benchmarks atuais, **When** o operador executa a otimização, **Then** o número de chapas usadas nunca aumenta em relação ao comportamento anterior.
3. **Given** o mesmo conjunto de peças executado duas vezes, **When** o operador otimiza, **Then** o plano de corte produzido é idêntico nas duas execuções (determinismo preservado).

---

### User Story 2 - Confiança de que nada foi quebrado (Priority: P1)

Quem mantém o produto precisa ter certeza de que ampliar o repertório de estratégias não introduziu cortes inválidos, resultados não determinísticos, nem divergência entre as duas implementações do motor. Antes de liberar, os planos de corte gerados continuam respeitando as regras físicas do corte (guilhotina, margens, corte mínimo) e são equivalentes independentemente de qual implementação do motor foi usada.

**Why this priority**: Regressão silenciosa de qualidade ou de validade do corte é o maior risco desta mudança. Uma melhoria média que produza um único plano de corte fisicamente impossível é inaceitável.

**Independent Test**: Executar a suíte de regressão sobre todos os cenários; verificar que todo plano gerado é um corte guilhotina válido, que respeita margens e corte mínimo, e que as duas implementações do motor produzem resultados equivalentes para o mesmo input.

**Acceptance Scenarios**:

1. **Given** qualquer conjunto de peças, **When** a otimização usa uma das novas estratégias, **Then** todos os cortes do plano resultante são retos e de borda a borda (guilhotina), respeitando margens e corte mínimo.
2. **Given** o mesmo input, **When** o plano é gerado por qualquer uma das implementações disponíveis do motor, **Then** os resultados são equivalentes entre elas.
3. **Given** a suíte de regressão existente, **When** ela é executada após a mudança, **Then** todos os testes continuam passando.

---

### Edge Cases

- **Conjunto trivial** (uma única peça, ou peças que preenchem exatamente a chapa): as novas estratégias não devem piorar nem alterar o resultado ótimo já alcançado.
- **Empate entre estratégias**: quando uma nova estratégia produz aproveitamento idêntico ao de uma estratégia existente, o critério de escolha do melhor plano deve permanecer determinístico (desempate estável).
- **Peças que não cabem na chapa**: a introdução das novas estratégias não muda o tratamento de peças impossíveis de alocar; elas continuam reportadas como não alocadas, sem travar a otimização.
- **Rotação**: peças rotacionáveis e não rotacionáveis devem ser tratadas pelas novas estratégias exatamente com as mesmas regras já vigentes.
- **Custo de tempo**: adicionar duas estratégias aumenta o trabalho do otimizador; o tempo de otimização deve permanecer dentro de um limite aceitável para o operador.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O otimizador MUST passar a considerar duas novas estratégias de arranjo de peças, adicionais às já existentes, ao buscar o melhor plano de corte.
- **FR-002**: As novas estratégias MUST ficar ativas por padrão no fluxo de otimização, sem exigir configuração ou ação extra do operador.
- **FR-003**: Cada plano de corte produzido com as novas estratégias MUST ser um corte guilhotina válido, respeitando margens e corte mínimo.
- **FR-004**: O sistema MUST escolher, dentre todas as estratégias (antigas e novas), o plano com melhor aproveitamento, mantendo o critério de seleção determinístico e com desempate estável.
- **FR-005**: Para qualquer input, o número de chapas e o aproveitamento resultantes MUST ser iguais ou melhores que o comportamento anterior à mudança; nenhum cenário de referência pode regredir.
- **FR-006**: O resultado da otimização MUST permanecer determinístico: o mesmo input produz sempre o mesmo plano de corte.
- **FR-007**: As duas implementações do motor MUST produzir resultados equivalentes para o mesmo input após a introdução das novas estratégias.
- **FR-008**: As novas estratégias MUST tratar rotação de peças com as mesmas regras já existentes (rotação 90° permitida salvo restrição explícita).
- **FR-009**: A mudança MUST ser coberta por testes de regressão que demonstrem melhora em ao menos um cenário-alvo e ausência de regressão nos demais.

### Key Entities *(include if feature involves data)*

- **Estratégia de arranjo (heurística)**: uma forma de ordenar/priorizar peças antes do posicionamento, que resulta em um plano de corte candidato. O otimizador avalia várias estratégias e mantém o melhor plano.
- **Plano de corte**: o resultado da otimização — a descrição hierárquica de como a chapa é dividida e onde cada peça é alocada. É a fonte da verdade para contagem de peças, aproveitamento e desperdício.
- **Cenário-alvo**: conjunto de peças representativo escolhido para demonstrar o ganho das novas estratégias.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em ao menos um cenário-alvo, o aproveitamento de material melhora de forma mensurável (ou o número de chapas cai) em relação ao comportamento anterior.
- **SC-002**: Em 100% dos cenários de referência existentes, o aproveitamento e o número de chapas são iguais ou melhores que antes — nenhuma regressão.
- **SC-003**: 100% dos planos de corte gerados nos cenários de teste são cortes guilhotina válidos, respeitando margens e corte mínimo.
- **SC-004**: 100% de reprodutibilidade: cada cenário produz o mesmo plano em execuções repetidas.
- **SC-005**: As duas implementações do motor produzem resultados equivalentes em 100% dos cenários de teste.
- **SC-006**: O tempo de otimização nos cenários de referência não aumenta além de um limite aceitável para o operador (ex.: sem tornar a operação perceptivelmente mais lenta em uso normal).

## Assumptions

- "Heurística" aqui significa uma nova **estratégia de arranjo/ordenação de peças** integrada ao otimizador heurístico existente, não um novo algoritmo separado (como um segundo algoritmo genético). Esta é a interpretação de menor risco e maior alinhamento com a arquitetura atual (o otimizador já avalia um repertório de estratégias e mantém o melhor plano).
- As duas novas estratégias são **adicionais**: nenhuma estratégia existente é removida ou substituída, preservando o princípio de nunca reduzir o repertório de estratégias.
- O objetivo primário das duas heurísticas é **melhorar aproveitamento de material**; ganho de performance não é objetivo e não pode vir às custas de aproveitamento.
- As novas estratégias respeitam todas as invariantes de domínio já vigentes: corte guilhotina, margens, corte mínimo, regras de rotação.
- Os cenários-alvo para demonstrar o ganho serão escolhidos entre casos onde as estratégias atuais deixam desperdício evitável; se nenhum caso novo for fornecido, casos representativos serão derivados dos benchmarks e fixtures existentes.
