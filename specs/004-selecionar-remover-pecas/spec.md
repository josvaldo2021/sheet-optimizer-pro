# Feature Specification: Seleção e Remoção de Peças no Layout

**Feature Branch**: `004-selecionar-remover-pecas`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "tornar as peças do layout selecionaveis e removiveis, hoje é possivel remover mas é confuso."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remover peça selecionada por ação visível (Priority: P1)

O usuário visualiza o plano de corte, clica em uma peça do layout e a remove por meio de uma ação claramente visível (ex.: botão "Remover" que aparece quando há seleção) ou pela tecla Delete/Backspace — sem precisar conhecer nenhum comando de texto.

**Why this priority**: É a dor central relatada: hoje a remoção só é possível digitando o comando de texto "U" na barra de comandos, algo que não é descoberto sem instrução prévia. Usuários novos não conseguem corrigir um layout sozinhos.

**Independent Test**: Com um layout contendo ao menos uma peça, clicar na peça e acionar a ação visível de remoção. A peça desaparece do layout e o espaço volta a ficar disponível — tudo sem uso da barra de comandos.

**Acceptance Scenarios**:

1. **Given** um layout com peças alocadas, **When** o usuário clica em uma peça, **Then** surge uma ação visível de remoção associada à peça selecionada.
2. **Given** uma peça selecionada, **When** o usuário aciona a ação de remoção (clique no botão ou tecla Delete/Backspace), **Then** a peça é removida do layout e o aproveitamento/área exibidos são atualizados.
3. **Given** nenhuma peça selecionada (seleção na chapa como um todo), **When** o usuário aciona a tecla Delete, **Then** nada é removido e nenhum erro ocorre.
4. **Given** uma peça removida por engano, **When** o usuário observa a interface, **Then** o comando de texto existente continua funcionando como antes (a remoção visível é um caminho adicional, não substitui o fluxo atual).

---

### User Story 2 - Feedback claro do que está selecionado (Priority: P2)

Ao clicar em uma peça, o usuário vê de forma inequívoca qual peça está selecionada: destaque visual evidente na peça e um indicador com as informações dela (dimensões e identificação/etiqueta, quando houver). Clicar em área vazia ou pressionar Esc limpa a seleção.

**Why this priority**: Parte da confusão atual é não saber o que está selecionado antes de remover. Sem feedback claro, o usuário corre o risco de remover a peça errada — especialmente quando um mesmo recorte representa várias peças agrupadas.

**Independent Test**: Clicar em peças diferentes do layout e verificar que o destaque acompanha o clique e que as informações exibidas (dimensões/etiqueta) correspondem à peça clicada.

**Acceptance Scenarios**:

1. **Given** um layout com várias peças, **When** o usuário clica em uma peça, **Then** apenas essa peça exibe destaque visual de seleção e suas informações (dimensões e etiqueta, se houver) ficam visíveis.
2. **Given** uma peça selecionada, **When** o usuário clica em outra peça, **Then** a seleção migra para a nova peça.
3. **Given** uma peça selecionada, **When** o usuário pressiona Esc ou clica em área vazia da chapa, **Then** a seleção é limpa.
4. **Given** uma seleção que representa múltiplas peças agrupadas (recorte com multiplicidade), **When** o usuário a seleciona, **Then** a interface informa quantas peças serão afetadas pela remoção.

---

### User Story 3 - Consistência do inventário após remoção (Priority: P3)

Quando o usuário remove do layout uma peça vinculada a um item do inventário (peça com etiqueta/identificação), a quantidade pendente desse item é restaurada, para que a peça possa ser realocada em outra chapa ou em nova otimização.

**Why this priority**: Sem devolver a quantidade ao inventário, o usuário perde o rastreio de quantas peças ainda faltam cortar, e o total produzido diverge do pedido. É menos urgente que o fluxo de remoção em si, pois hoje já existe conferência manual.

**Independent Test**: Com um item de inventário de quantidade N parcialmente alocado, remover uma peça desse item do layout e verificar que a quantidade pendente exibida aumenta em 1 (ou na multiplicidade removida).

**Acceptance Scenarios**:

1. **Given** um item do inventário com peças alocadas no layout ativo, **When** o usuário remove uma dessas peças, **Then** a quantidade pendente do item é acrescida do número de peças removidas.
2. **Given** uma peça removida cujo recorte continha sub-cortes com outras peças, **When** a remoção ocorre, **Then** todas as peças contidas no recorte removido têm suas quantidades devolvidas ao inventário.
3. **Given** uma peça sem vínculo com o inventário (recorte manual sem etiqueta), **When** o usuário a remove, **Then** o layout é atualizado normalmente e nenhuma quantidade de inventário é alterada.

---

### Edge Cases

- Remover uma peça cujo nó contém sub-cortes: toda a subárvore (peças e cortes internos) é removida junto — a interface deve deixar isso claro antes/durante a ação (ex.: contagem de peças afetadas).
- Seleção apontando para a chapa inteira (raiz): a ação de remoção não deve estar disponível/habilitada.
- Recorte com multiplicidade (representa várias peças idênticas): a remoção afeta todas as peças representadas; a contagem informada ao usuário deve refletir isso.
- Tecla Delete/Backspace pressionada enquanto o foco está em um campo de texto (ex.: barra de comandos, filtros): não deve remover peça do layout.
- Remoção da última peça da chapa: o layout volta ao estado vazio sem erros e os indicadores de aproveitamento zeram.
- Layout pertencente a um resultado de otimização em lote: a remoção deve atualizar a chapa correta do grupo ativo, sem afetar as demais.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário DEVE poder selecionar uma peça do layout com um clique, com destaque visual inequívoco na peça selecionada.
- **FR-002**: Com uma peça selecionada, o sistema DEVE exibir uma ação de remoção visível e autoexplicativa (sem depender de comando de texto).
- **FR-003**: O usuário DEVE poder remover a peça selecionada também pela tecla Delete/Backspace, exceto quando o foco estiver em um campo de entrada de texto.
- **FR-004**: A interface DEVE exibir as informações da peça selecionada (dimensões e etiqueta/identificação, quando existir).
- **FR-005**: Quando a seleção representar mais de uma peça (recorte agrupado ou com sub-cortes), o sistema DEVE informar quantas peças serão removidas antes de concluir a ação.
- **FR-006**: O usuário DEVE poder limpar a seleção clicando em área vazia da chapa ou pressionando Esc.
- **FR-007**: A ação de remoção NÃO DEVE estar disponível quando a seleção corresponder à chapa inteira (nenhuma peça selecionada).
- **FR-008**: Após a remoção, o sistema DEVE atualizar imediatamente o layout, os indicadores de área/aproveitamento e a lista de peças pendentes.
- **FR-009**: Peças removidas que estejam vinculadas a itens do inventário DEVEM ter suas quantidades devolvidas à lista de peças pendentes, incluindo as peças contidas em sub-cortes removidos junto.
- **FR-010**: O comando de texto de remoção existente DEVE continuar funcionando, mantendo compatibilidade com o fluxo atual de usuários avançados.

### Key Entities

- **Peça alocada**: uma peça posicionada no layout da chapa; possui dimensões, posição, possível etiqueta de vínculo com o inventário e possível multiplicidade (representa N peças idênticas).
- **Seleção**: o alvo atual das ações do usuário no layout; pode ser uma peça, um recorte que agrupa peças ou a chapa inteira (estado "nada selecionado" para fins de remoção).
- **Item de inventário**: cadastro de peça com quantidade solicitada e quantidade pendente; a remoção de peças alocadas restaura a quantidade pendente correspondente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário que nunca usou o sistema consegue remover uma peça do layout em até 2 interações (selecionar + remover), sem consultar documentação nem conhecer comandos de texto.
- **SC-002**: 100% das remoções feitas pela nova ação produzem o mesmo resultado no layout que o fluxo de remoção já existente (nenhuma divergência de comportamento entre os dois caminhos).
- **SC-003**: Em qualquer momento, o usuário identifica corretamente qual peça está selecionada apenas olhando para a tela (destaque + informações da peça visíveis).
- **SC-004**: Após qualquer remoção, a soma "peças alocadas + peças pendentes" de cada item do inventário permanece igual à quantidade solicitada (nenhuma peça "desaparece" da contagem).

## Assumptions

- A seleção é única (uma peça/recorte por vez); seleção múltipla para remoção em massa fica fora do escopo desta versão.
- Não haverá etapa de confirmação (dialog) para remoção de peça única; a informação de contagem (FR-005) cobre o caso de remoções que afetam várias peças. Desfazer (undo) fica fora do escopo desta versão.
- O comando de texto "U" atual permanece como atalho para usuários avançados; esta feature adiciona caminhos visíveis, não remove os existentes.
- O comportamento estrutural da remoção (remover o recorte e liberar o espaço no plano de corte guilhotina) permanece o mesmo do fluxo atual; a feature trata de descoberta, feedback e consistência de inventário, não de novas regras de corte.
- A devolução de quantidade ao inventário aplica-se apenas a peças identificáveis (com etiqueta vinculada a item do inventário); recortes manuais sem etiqueta não alteram o inventário.
