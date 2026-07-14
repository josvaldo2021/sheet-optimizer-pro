# Feature Specification: Replanejar o plano automático após salvar layout com repetições

**Feature Branch**: `008-replanejar-apos-salvar`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Após gerar um plano automático é criada a lista de layouts; a partir de um layout posso gerar lotes de peças, que são descontadas do inventário. O problema: se eu selecionar um layout e verificar quantas repetições poderiam ser feitas dele, o cálculo está correto; porém, se eu salvar esse layout com as repetições, terei problemas com a quantidade, pois peças do mesmo layout estão espalhadas nos demais layouts gerados."

## Contexto do problema

O plano automático distribui **todo** o inventário entre os layouts gerados. A
verificação de repetições de um layout é calculada contra o inventário completo
(correto, pois nada foi deduzido ainda). Mas ao salvar esse layout ×N, as peças
consumidas pelas N cópias eram as mesmas que o plano havia atribuído aos demais
layouts. Resultado: os layouts automáticos remanescentes passam a referenciar
peças que já não existem no inventário — contagem dupla, quantidades negativas
ao confirmar lotes e planos de produção inexequíveis.

**Regra de negócio decidida**: ao salvar um layout com repetições, os layouts
automáticos ainda não confirmados são descartados e o plano é **re-otimizado
automaticamente** com o inventário restante. Layouts já confirmados (lotes) e
layouts manuais são preservados intactos.

## Emenda A1 (2026-07-14) — dedução movida para a confirmação do lote

Após a implementação inicial, o usuário constatou que as cópias salvas ×N
(marcadas como confirmadas e já deduzidas) **não exibiam o checkbox de lote** e
portanto nunca entravam num lote. Decisão do usuário (entre três alternativas:
criar lote no save / checkbox nas salvas com dedução única / não deduzir no
save): **salvar não deduz mais o inventário**. As N cópias entram no plano como
chapas pendentes — com checkbox pré-marcado e consumo exato registrado — e
apenas **reservam** inventário; toda dedução acontece uma única vez, na
confirmação do lote. Consequências normativas:

- **FR-002 (emendado)**: o máximo de repetições e o clamp do N são calculados
  contra o **inventário efetivo** = peças cadastradas − reservas de cópias
  salvas ainda não confirmadas.
- **FR-003/FR-005 (emendados)**: cópias salvas pendentes são *preservadas* (como
  os lotes e manuais) no descarte/replanejamento e na troca de variante; apenas
  chapas automáticas comuns são descartadas.
- **FR-006 (emendado)**: a conservação vale sobre reservas: Σ reservas das
  cópias pendentes + inventário efetivo = inventário cadastrado; a dedução real
  ocorre exatamente uma vez, ao confirmar o lote.
- **FR-004 (inalterado na essência)**: o replanejamento usa o inventário efetivo
  menos a reserva do save corrente.
- A verificação de repetições (FR-001) também passa a exibir disponibilidade
  efetiva (descontando reservas pendentes).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Salvar layout repetido sem corromper as quantidades (Priority: P1)

O operador gera um plano automático, seleciona o layout de melhor aproveitamento,
verifica que ele pode ser repetido N vezes e o salva ×N. Após o salvamento, nenhum
layout remanescente na área de trabalho referencia peças que as N cópias já
consumiram: a soma de todas as peças planejadas (cópias salvas + plano
remanescente) nunca excede o inventário original.

**Why this priority**: é o bug em si — hoje o salvamento com repetições corrompe
o controle de quantidades e gera planos de produção impossíveis de executar. Sem
isso, a funcionalidade de repetição é inutilizável em conjunto com o plano
automático.

**Independent Test**: gerar um plano automático com inventário conhecido, salvar
um layout ×N e conferir que (peças nas cópias salvas) + (peças no plano
remanescente) + (inventário restante) = inventário inicial, sem nenhuma
quantidade negativa.

**Acceptance Scenarios**:

1. **Given** um plano automático gerado a partir de um inventário completo,
   **When** o operador salva um layout ×N (N ≤ máximo de repetições indicado),
   **Then** o inventário é reduzido exatamente em N × (peças do layout) e nenhum
   layout automático antigo permanece referenciando essas peças.
2. **Given** um layout salvo ×N, **When** o operador confirma lotes com os
   layouts remanescentes, **Then** nenhuma quantidade do inventário fica negativa
   e nenhuma peça é produzida em quantidade maior que a cadastrada.
3. **Given** um plano automático em que as peças do layout selecionado também
   aparecem em outros layouts, **When** o operador salva o layout ×N,
   **Then** os demais layouts automáticos não confirmados desaparecem da lista e
   são substituídos pelo resultado do replanejamento.

---

### User Story 2 - Replanejamento automático do inventário restante (Priority: P2)

Após salvar o layout ×N, o sistema recalcula automaticamente um novo plano para
as peças que sobraram no inventário, sem exigir nenhuma ação adicional do
operador. Layouts já confirmados em lotes e layouts manuais permanecem exatamente
como estavam.

**Why this priority**: sem o replanejamento automático o operador teria de
perceber sozinho que o plano ficou obsoleto e regenerá-lo manualmente — a
correção do P1 sem este passo deixaria o fluxo incompleto e propenso a erro
humano.

**Independent Test**: salvar um layout ×N com sobra de peças no inventário e
verificar que um novo plano aparece automaticamente cobrindo apenas as peças
restantes, com os layouts salvos/manuais/confirmados intocados.

**Acceptance Scenarios**:

1. **Given** um salvamento ×N que deixa peças no inventário, **When** o
   salvamento conclui, **Then** um novo plano automático é gerado apenas com o
   inventário restante e exibido ao operador.
2. **Given** um salvamento ×N que consome todo o inventário, **When** o
   salvamento conclui, **Then** nenhum plano novo é gerado e a lista passa a
   conter apenas os layouts salvos/confirmados/manuais.
3. **Given** layouts manuais e lotes já confirmados na sessão, **When** ocorre o
   replanejamento, **Then** esses layouts e lotes permanecem inalterados (mesmas
   peças, mesmas quantidades, mesma ordem).
4. **Given** o mesmo inventário restante e as mesmas configurações de chapa,
   **When** o replanejamento é executado mais de uma vez, **Then** o resultado é
   idêntico (comportamento determinístico).

---

### User Story 3 - Transparência do resultado para o operador (Priority: P3)

Ao concluir o salvamento com repetições, o operador é informado do que aconteceu:
quantas cópias foram salvas, que o restante do plano foi recalculado, quantas
chapas o novo plano usa e quantas peças permanecem no inventário.

**Why this priority**: o descarte e a regeneração do plano são efeitos colaterais
significativos; sem comunicação clara o operador pode achar que "perdeu" layouts.
É um complemento de usabilidade sobre P1/P2.

**Independent Test**: salvar um layout ×N e verificar que a mensagem de resultado
menciona as cópias salvas, o replanejamento e o estado do inventário.

**Acceptance Scenarios**:

1. **Given** um salvamento ×N com replanejamento, **When** o processo conclui,
   **Then** o operador vê uma confirmação informando N cópias salvas, o número de
   chapas do novo plano e o total de peças restantes no inventário.
2. **Given** um replanejamento em andamento, **When** o cálculo demora,
   **Then** o operador vê indicação de progresso, como já ocorre na geração do
   plano automático.

---

### Edge Cases

- **Salvamento consome todo o inventário**: não há o que replanejar; a área de
  plano automático fica vazia e o sistema informa que não restam peças.
- **Layout manual desenhado do zero com plano automático ativo**: salvar esse
  layout também deduz inventário e, portanto, também invalida o plano automático
  → a mesma regra de replanejamento se aplica a qualquer salvamento que deduza
  peças enquanto existirem layouts automáticos não confirmados.
- **Não há plano automático ativo**: salvar um layout (×1 ou ×N) funciona como
  hoje; nada a descartar nem replanejar.
- **Peças restantes que não cabem em nenhuma chapa**: o replanejamento segue as
  regras existentes do plano automático (peças não posicionáveis permanecem no
  inventário e são reportadas).
- **N menor que o máximo de repetições**: as sobras das peças do layout voltam a
  ser consideradas no replanejamento junto com as demais.
- **Limite máximo de chapas da sessão**: o replanejamento respeita o mesmo limite
  vigente para o plano automático original.
- **Replanejamento não encontra solução para parte das peças**: as peças
  permanecem no inventário e o operador é informado, como no fluxo atual de
  geração de plano.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST continuar calculando o máximo de repetições de um
  layout contra o inventário atual completo (comportamento vigente, considerado
  correto).
- **FR-002**: Ao salvar um layout ×N, o sistema MUST deduzir do inventário
  exatamente N vezes a lista de peças do layout, e MUST impedir que N exceda o
  máximo de repetições possível com o inventário atual.
- **FR-003**: Ao concluir um salvamento que deduz peças do inventário, o sistema
  MUST descartar todos os layouts automáticos ainda não confirmados, pois foram
  calculados com um inventário que não existe mais.
- **FR-004**: Após o descarte, se restarem peças no inventário, o sistema MUST
  gerar automaticamente um novo plano para o inventário restante, usando as
  mesmas configurações (chapa, margens, opções de otimização) do plano vigente.
- **FR-005**: O replanejamento MUST preservar intactos os layouts manuais, os
  layouts salvos (incluindo as N cópias recém-salvas) e os lotes já confirmados.
- **FR-006**: Em nenhum estado do fluxo a soma das peças presentes em layouts
  (salvos + automáticos) MAY exceder as quantidades do inventário original;
  quantidades de inventário nunca ficam negativas.
- **FR-007**: O sistema MUST informar ao operador, ao final do salvamento: número
  de cópias salvas, ocorrência do replanejamento, número de chapas do novo plano
  e peças restantes no inventário.
- **FR-008**: O replanejamento MUST ser determinístico: o mesmo inventário
  restante e as mesmas configurações produzem sempre o mesmo plano.
- **FR-009**: Se não houver layouts automáticos não confirmados no momento do
  salvamento, o sistema MUST manter o comportamento atual (deduzir inventário e
  salvar, sem descarte nem replanejamento).

### Key Entities

- **Inventário de Peças**: lista de peças cadastradas com dimensões e quantidade
  necessária; fonte única de disponibilidade para planos e repetições.
- **Layout (padrão de corte)**: arranjo de peças em uma chapa; pode ser
  automático (gerado pelo plano, não confirmado), manual ou salvo (confirmado
  pelo operador, com dedução de inventário aplicada).
- **Plano Automático**: conjunto de layouts automáticos gerados de uma vez a
  partir do inventário completo; torna-se obsoleto quando o inventário muda.
- **Repetição de Layout**: quantidade de vezes que um mesmo layout pode ser
  reproduzido com o inventário atual; limitada pela peça mais escassa.
- **Lote**: registro de produção criado a partir de layouts confirmados, com as
  peças consumidas; imutável perante replanejamentos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em todos os cenários de teste do fluxo (gerar plano → verificar
  repetições → salvar ×N → confirmar lotes restantes), a conservação de
  quantidades é exata: peças salvas + peças no plano remanescente + inventário
  restante = inventário inicial, com zero quantidades negativas.
- **SC-002**: 100% dos layouts automáticos não confirmados são recalculados (ou
  removidos, se não restarem peças) após um salvamento que deduz inventário.
- **SC-003**: O operador completa o fluxo "verificar repetições → salvar ×N →
  seguir com o plano restante" com uma única ação de salvamento, sem etapas
  manuais adicionais de correção ou regeneração.
- **SC-004**: Repetir o mesmo fluxo com os mesmos dados produz sempre o mesmo
  resultado final (mesmos layouts, mesmas quantidades) em 100% das execuções.
- **SC-005**: Layouts manuais e lotes confirmados existentes antes do salvamento
  permanecem byte-a-byte inalterados em 100% dos cenários.

## Assumptions

- O replanejamento reutiliza as configurações vigentes da sessão (dimensões da
  chapa, margens, corte mínimo, opções de otimização), sem perguntar nada ao
  operador.
- O limite máximo de chapas da sessão vale também para o plano replanejado.
- A verificação de repetições contra o inventário completo é o comportamento
  correto e não muda — o que muda é a consequência do salvamento.
- O tempo do replanejamento é equivalente ao da geração do plano original para o
  mesmo volume de peças; a indicação de progresso existente é suficiente.
- A qualidade de aproveitamento do plano replanejado segue os mesmos critérios do
  plano automático normal; não há exigência de que o novo plano use menos chapas
  que o trecho descartado.
- Desfazer um salvamento ×N (devolução ao inventário) segue os mecanismos já
  existentes de devolução de lote e não faz parte do escopo desta feature.
