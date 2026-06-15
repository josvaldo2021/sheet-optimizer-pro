# Feature Specification: Selecionar Chapas ao Confirmar o Plano

**Feature Branch**: `003-selecionar-chapas-lote`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "Após gerar o plano de corte, o botão ✅ CONFIRMAR PLANO cria um lote com todas as chapas. Quero poder selecionar quais chapas entram no lote (ex.: as 10 melhores de 30), em vez de confirmar todas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirmar um lote só com as chapas escolhidas (Priority: P1)

O operador gera um plano com muitas chapas (ex.: 30) mas, naquele momento, só quer
produzir um subconjunto (ex.: as 10 de melhor aproveitamento). Antes de confirmar,
ele marca/desmarca as chapas e confirma. O lote é criado apenas com as chapas
marcadas, e só as peças dessas chapas são deduzidas do inventário.

**Why this priority**: é o núcleo do pedido — sem a seleção, o operador é obrigado
a confirmar tudo ou nada. Todo o resto depende disso.

**Independent Test**: gerar um plano com várias chapas, marcar apenas algumas,
confirmar, e verificar que o lote contém exatamente as marcadas e que o inventário
foi reduzido somente pelas peças delas.

**Acceptance Scenarios**:

1. **Given** um plano automático com N chapas, **When** o operador confirma com
   apenas K marcadas, **Then** o lote criado contém exatamente essas K chapas.
2. **Given** a confirmação parcial, **When** o lote é criado, **Then** somente as
   peças das chapas marcadas são deduzidas do inventário.
3. **Given** o plano recém-gerado, **When** o operador abre a confirmação, **Then**
   nenhuma chapa vem marcada por padrão; o operador marca as que deseja antes de
   confirmar.

---

### User Story 2 - Produzir o restante depois, em outro lote (Priority: P1)

Após confirmar parte das chapas, o operador quer que as chapas **não** selecionadas
continuem disponíveis na tela, para confirmá-las em um lote posterior, sem precisar
otimizar de novo.

**Why this priority**: sem isso, selecionar um subconjunto faria o operador perder
o restante do plano — inviabilizaria o caso de uso "as melhores agora, o resto
depois".

**Independent Test**: confirmar K de N chapas e verificar que as N−K restantes
seguem visíveis e podem ser confirmadas em um segundo lote, deduzindo então as
peças delas.

**Acceptance Scenarios**:

1. **Given** uma confirmação parcial de K chapas, **When** o lote é criado,
   **Then** as N−K chapas restantes permanecem disponíveis (não são descartadas).
2. **Given** as chapas restantes, **When** o operador as marca e confirma, **Then**
   um segundo lote é criado com elas e o inventário é deduzido de acordo.
3. **Given** chapas já confirmadas em um lote, **When** uma nova confirmação ocorre,
   **Then** elas não voltam a ser confirmadas nem deduzidas de novo.

---

### User Story 3 - Enxergar o que será confirmado (Priority: P2)

Antes de confirmar, o operador quer ver claramente quantas chapas estão
selecionadas (de quantas), para não confirmar a quantidade errada.

**Why this priority**: melhora a confiança e evita erro, mas o valor central já é
entregue pelas histórias P1.

**Independent Test**: marcar/desmarcar chapas e verificar que o contador de
selecionadas reflete a escolha antes da confirmação.

**Acceptance Scenarios**:

1. **Given** chapas marcadas/desmarcadas, **When** o operador olha a área de
   confirmação, **Then** vê quantas chapas estão selecionadas e o total.
2. **Given** nenhuma chapa marcada, **When** o operador tenta confirmar, **Then** o
   sistema impede a ação e avisa que é preciso selecionar ao menos uma chapa.

---

### Edge Cases

- **Nenhuma chapa marcada**: confirmar é bloqueado, com aviso.
- **Todas marcadas**: resultado idêntico ao comportamento atual (lote com todas).
- **Chapas manuais/já confirmadas**: não participam da seleção nem da dedução.
- **Confirmar todas em partes**: confirmar K, depois as restantes, deve resultar no
  mesmo inventário final que confirmar tudo de uma vez.
- **Editar uma chapa manualmente após gerar**: fora do escopo desta feature; a
  seleção considera o estado atual das chapas automáticas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir marcar/desmarcar individualmente cada chapa
  automática gerada, antes de confirmar o plano.
- **FR-002**: Todas as chapas automáticas MUST vir **desmarcadas** por padrão; o
  operador marca explicitamente as que deseja incluir no lote.
- **FR-003**: Ao confirmar, o sistema MUST criar o lote contendo **apenas** as
  chapas marcadas.
- **FR-004**: Ao confirmar, o sistema MUST deduzir do inventário **apenas** as peças
  das chapas marcadas.
- **FR-005**: As chapas não marcadas MUST permanecer disponíveis após a confirmação
  (não descartadas), podendo formar um lote posterior.
- **FR-006**: O sistema MUST impedir a confirmação quando nenhuma chapa estiver
  marcada, informando o usuário.
- **FR-007**: O sistema MUST exibir quantas chapas estão selecionadas (e o total)
  antes da confirmação.
- **FR-008**: Chapas já confirmadas (manuais) MUST NOT participar da seleção nem
  voltar a ser deduzidas.
- **FR-009**: Após uma confirmação parcial, o usuário MUST conseguir selecionar e
  confirmar as chapas restantes em um novo lote.

### Key Entities *(include if feature involves data)*

- **Chapa (gerada)**: uma chapa do plano automático; passa a ter um estado de
  **seleção para o lote** (marcada/desmarcada), marcada por padrão.
- **Lote**: agrupa as chapas confirmadas e as peças deduzidas; agora reflete apenas
  o subconjunto selecionado.
- **Inventário de peças**: reduzido somente pelas peças das chapas confirmadas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: De um plano de 30 chapas, selecionar 10 cria um lote com exatamente
  essas 10 chapas.
- **SC-002**: As 20 chapas não selecionadas permanecem disponíveis e podem ser
  confirmadas em um segundo lote.
- **SC-003**: Marcar todas as chapas e confirmar produz um lote com todas elas e o
  mesmo inventário final de "confirmar tudo".
- **SC-004**: Após uma confirmação parcial, o inventário equivale ao original menos
  apenas as peças das chapas confirmadas.
- **SC-005**: O operador vê a contagem de chapas selecionadas antes de confirmar.

## Assumptions

- A seleção se aplica apenas às chapas **automáticas** (não confirmadas). Chapas já
  aplicadas a um lote anterior ficam de fora.
- Padrão = todas **desmarcadas**; o operador marca o que quer incluir (escolha do
  usuário, voltada ao caso de selecionar poucas chapas de muitas).
- "As melhores" é um critério do próprio operador nesta versão (seleção manual). Um
  atalho de "selecionar as N melhores por aproveitamento" fica como evolução futura,
  fora do escopo.
- A dedução por chapa usa o mapeamento de peças já registrado na geração do plano
  (cada chapa carrega as peças que consumiu), garantindo dedução exata por
  subconjunto.
