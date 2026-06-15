# Feature Specification: Otimização de Plano de Corte

**Feature Branch**: `001-otimizacao-plano-corte`

**Created**: 2026-06-15

**Status**: Retroativo (descreve o comportamento já existente do sistema)

**Input**: User description: "Documentar o que já existe — o motor de otimização de planos de corte (nesting 2D guilhotina) do Sheet Optimizer Pro."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gerar plano de corte otimizado para uma chapa (Priority: P1)

Um operador de corte (marcenaria/serralheria) tem uma lista de peças retangulares
que precisa cortar de uma chapa padrão. Ele informa as dimensões da chapa e a
lista de peças (largura, altura, quantidade) e pede um plano de corte. O sistema
devolve um arranjo que encaixa o máximo de peças possível na chapa usando apenas
cortes retos (guilhotina), desperdiçando o mínimo de material.

**Why this priority**: é a razão de existir do produto. Sem isso, não há valor —
todas as demais histórias dependem deste resultado.

**Independent Test**: fornecer uma chapa e uma lista de peças que cabem em uma
chapa e verificar que o plano gerado aloca as peças sem sobreposição, respeitando
as bordas e usando apenas cortes de borda a borda, com aproveitamento alto.

**Acceptance Scenarios**:

1. **Given** uma chapa e uma lista de peças que cabem nela, **When** o operador
   solicita a otimização, **Then** o sistema retorna um plano em que todas as
   peças estão alocadas, sem sobreposição e dentro das margens.
2. **Given** uma lista com peças idênticas em grande quantidade, **When** a
   otimização é executada, **Then** o sistema agrupa peças compatíveis para
   reduzir o número de cortes e aumentar o aproveitamento.
3. **Given** uma peça que encaixa melhor girada, **When** a otimização é
   executada, **Then** o sistema considera a rotação de 90° para melhorar o
   encaixe (salvo restrição explícita).

---

### User Story 2 - Distribuir peças em múltiplas chapas (Priority: P2)

Quando a quantidade de peças excede o que cabe em uma única chapa, o operador
quer que o sistema use quantas chapas forem necessárias, distribuindo as peças e
nunca cortando a mesma peça duas vezes, até que todo o pedido seja atendido.

**Why this priority**: pedidos reais raramente cabem em uma chapa; sem
multi-chapa o produto só serve a casos triviais.

**Independent Test**: fornecer uma lista cuja área total exceda uma chapa e
verificar que o sistema produz N chapas, que a soma das peças alocadas em todas as
chapas é exatamente o inventário pedido, e que nenhuma peça aparece duplicada.

**Acceptance Scenarios**:

1. **Given** um inventário maior que uma chapa, **When** a otimização é
   executada, **Then** o sistema gera múltiplas chapas até alocar todas as peças.
2. **Given** a otimização multi-chapa em andamento, **When** uma peça é alocada
   em uma chapa, **Then** ela é deduzida do inventário restante e não reaparece em
   chapas seguintes.
3. **Given** todas as peças alocadas, **When** o processo termina, **Then** o
   número de chapas usadas é informado e o inventário restante está vazio.

---

### User Story 3 - Priorizar peças e configurar restrições de corte (Priority: P3)

O operador quer marcar certas peças como prioritárias (devem ser cortadas
primeiro/garantidas nas primeiras chapas) e ajustar restrições do corte — margens
da chapa e distância mínima de quebra — para refletir as limitações da sua serra.

**Why this priority**: melhora a aderência ao processo real, mas o sistema entrega
valor mesmo sem essas opções (com padrões razoáveis).

**Independent Test**: marcar uma peça como prioritária e verificar que ela é
alocada antes das demais; alterar margens e confirmar que a área útil da chapa
diminui de acordo.

**Acceptance Scenarios**:

1. **Given** uma peça marcada como prioritária, **When** a otimização é
   executada, **Then** essa peça é alocada antes das não prioritárias.
2. **Given** margens configuradas, **When** a otimização é executada, **Then**
   nenhuma peça é posicionada dentro da faixa de margem.
3. **Given** uma distância mínima de quebra configurada, **When** a otimização é
   executada, **Then** os cortes respeitam essa distância mínima.

---

### Edge Cases

- **Lista vazia**: solicitar otimização sem peças retorna um plano vazio (chapa
  intacta), sem erro.
- **Peça maior que a chapa útil**: uma peça que não cabe em nenhuma orientação
  não é alocada e permanece reportada como restante, sem travar o processo.
- **Peças idênticas em massa**: grandes quantidades de peças iguais são agrupadas;
  a contagem do plano deve refletir cada peça individual mesmo quando agrupadas.
- **Empate entre arranjos**: para o mesmo conjunto de entradas, o resultado deve
  ser estável (mesmo plano a cada execução).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST aceitar uma lista de peças retangulares, cada uma com
  largura, altura, quantidade e, opcionalmente, um rótulo de identificação.
- **FR-002**: O sistema MUST aceitar as dimensões da chapa e suas margens
  (superior, inferior, esquerda, direita), derivando a área útil de corte.
- **FR-003**: O sistema MUST produzir um plano de corte que aloque peças usando
  exclusivamente cortes retos de borda a borda (guilhotina) — sem cortes em L,
  recortes internos ou formatos não retangulares.
- **FR-004**: O sistema MUST buscar o maior aproveitamento de material possível,
  minimizando o desperdício e o número de chapas.
- **FR-005**: O sistema MUST considerar a rotação de peças em 90° para melhorar o
  encaixe, exceto quando a rotação for explicitamente restrita.
- **FR-006**: O sistema MUST agrupar peças com dimensões compatíveis para reduzir
  o número de cortes, sem que isso altere a contagem de peças individuais
  entregue ao usuário.
- **FR-007**: Quando nem todas as peças couberem em uma chapa, o sistema MUST
  distribuí-las em múltiplas chapas, deduzindo as peças alocadas a cada chapa e
  garantindo que nenhuma peça seja cortada mais de uma vez.
- **FR-008**: Os usuários MUST poder marcar peças como prioritárias, e o sistema
  MUST alocá-las antes das peças não prioritárias.
- **FR-009**: O sistema MUST respeitar uma distância mínima de quebra/corte
  configurável.
- **FR-010**: O sistema MUST reportar, ao final, o aproveitamento de material (por
  chapa e total), quais peças foram alocadas e quais permaneceram não alocadas.
- **FR-011**: Para um mesmo conjunto de entradas, o sistema MUST produzir o mesmo
  plano de corte (resultado determinístico).
- **FR-012**: O sistema MUST tratar entradas degeneradas (lista vazia, peça maior
  que a chapa) sem falhar, retornando um plano coerente e reportando peças não
  alocadas.

### Key Entities *(include if feature involves data)*

- **Peça**: um retângulo a ser cortado, definido por largura, altura e
  quantidade; pode ter um rótulo de identificação e uma marcação de prioridade.
- **Chapa**: o material bruto de onde as peças são cortadas, definido por
  dimensões externas e margens que reduzem a área útil.
- **Plano de Corte**: o resultado da otimização — o arranjo hierárquico de cortes
  guilhotina que posiciona as peças em uma chapa, do qual derivam contagem, área
  e aproveitamento.
- **Inventário Restante**: as peças ainda não alocadas após uma chapa, usadas como
  entrada para a próxima chapa na otimização multi-chapa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em cenários de referência com agrupamento ativo, o plano aloca em
  média **30 ou mais peças por chapa**, contra ~9 peças/chapa quando o agrupamento
  é desligado — ou seja, a qualidade do agrupamento é mensurável e não regride.
- **SC-002**: A soma das peças alocadas em todas as chapas é **exatamente igual**
  ao inventário solicitado, sem duplicação e sem perda (conservação de peças).
- **SC-003**: Nenhuma peça do plano ultrapassa as bordas/margens da chapa e
  nenhuma se sobrepõe a outra.
- **SC-004**: Executar a otimização duas vezes com o mesmo input produz planos
  idênticos (100% reproduzível).
- **SC-005**: O sistema processa um pedido típico do operador e retorna o plano de
  corte sem intervenção manual adicional.

## Assumptions

- Este spec é **retroativo**: descreve o comportamento que o sistema já entrega
  hoje, servindo de linha de base para evoluções futuras, não um trabalho a fazer.
- A otimização opera sempre com o agrupamento de peças ativo; desligá-lo é
  considerado uma degradação inaceitável de qualidade e não é um modo de uso
  suportado.
- Rotação de peças em 90° é permitida por padrão.
- Visualização do plano na tela e exportação (PDF/Excel) são funcionalidades
  relacionadas, mas estão **fora do escopo** deste spec e serão documentadas
  separadamente.
- O resultado da otimização é consumido por outras partes do sistema (UI,
  relatórios), que assumem a conservação de peças e o aproveitamento aqui
  especificados.
