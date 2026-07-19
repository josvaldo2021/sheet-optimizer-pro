# Feature Specification: Corte da faixa lateral primeiro (geração do layout)

**Feature Branch**: `015-corte-faixa-lateral-primeiro`

**Created**: 2026-07-19

**Status**: Draft

**Input**: Destravar o aproveitamento da SOBRA LATERAL das colunas mudando a ORDEM DE
CORTE na geração do layout — isolar a faixa lateral livre com um corte vertical de
altura cheia ANTES dos cortes horizontais das peças empilhadas.

## Contexto e problema (medido no app)

No trabalho real `of_geral_parcial (3).xls` (âncora), numa coluna típica o motor corta
as peças empilhadas **na horizontal primeiro** (uma peça grande + N peças empilhadas)
e deixa a **faixa lateral livre** (ex.: 926 mm de largura) **fragmentada** em N pedaços
de pouca altura (ex.: 3× 926×413). A consolidação (spec 013) junta esses pedaços num
bloco 926×**1233** apenas VISUALMENTE — na estrutura do corte ele continua no nível
**mais fundo** da árvore guilhotina.

Consequência **medida** (logs de diagnóstico, 2026-07-19): **28 a 40 peças do estoque
cabem** nesse bloco 926×1233, mas **nenhuma é aproveitada**:

- A otimização já produziu a estrutura fragmentada (cada faixa tem só 413 de altura →
  nada cabe).
- O pós-processamento também **não** consegue: o bloco útil só existe consolidado, e
  consolidado ele está no nível 5 de 6 do corte — não sobra profundidade para
  sub-cortar e encaixar peças. (Comprovado: um preenchimento pós-layout foi implementado
  e **colocou 0** em todas as chapas, apesar de "cabem 28-40", porque o encaixe estoura
  o teto de níveis de corte.)

**Causa raiz:** a **ordem de corte na geração**. Cortar horizontal-primeiro **enterra**
a faixa lateral. Se o motor cortasse a faixa lateral **verticalmente, de cima a baixo,
primeiro**, ela nasceria como um bloco **raso** de altura cheia — e a **própria
otimização** o preencheria com as peças que cabem, sem depender de pós-processamento.

Isto é o lema **"cortar até o final primeiro"** aplicado na **geração** do layout (não
na consolidação — a spec 013 apenas reagrupa o que já foi cortado, não muda a geração).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A faixa lateral vira espaço útil, preenchido pela otimização (Priority: P1) 🎯 MVP

Quando uma coluna tem uma faixa lateral livre de altura cheia ao lado de peças
empilhadas, o plano de corte passa a **usar essa faixa** para acomodar outras peças que
cabem — em vez de deixá-la como sobra inaproveitável.

**Why this priority**: É o núcleo da feature e a única forma de recuperar o
aproveitamento daquela sobra (o pós-processamento provou-se impossível). Sozinho já
entrega valor.

**Independent Test**: Rodar o âncora (`of_geral_parcial (3).xls`) e verificar que as
faixas laterais de ~926 mm que hoje ficam vazias passam a receber peças que cabem
(menor lado ≤ largura da faixa, altura ≤ altura da faixa), e que o nº de chapas cai
e/ou o aproveitamento sobe.

**Acceptance Scenarios**:

1. **Given** uma coluna com uma peça grande + peças empilhadas e uma faixa lateral
   livre de altura cheia, **When** o layout é gerado, **Then** a faixa lateral é
   isolada como um bloco de altura cheia e recebe peças do estoque que caibam nela.
2. **Given** o cenário-âncora (coluna 3560 com 02508 `3560×1956` + 3× 02525
   `2634×413/413/407`, faixa 926×1233), **When** o layout é gerado, **Then** a faixa
   926×1233 acomoda peças com menor lado ≤ 926 e altura ≤ 1233 (em vez de ficar vazia).
3. **Given** um caso SEM faixa lateral aproveitável (coluna cheia, ou faixa pequena
   demais), **When** o layout é gerado, **Then** o resultado é igual ao atual (a nova
   ordem só age quando há faixa lateral de altura cheia que valha a pena).

---

### User Story 2 - Nunca piorar o resultado (guarda) (Priority: P1)

A mudança de ordem de corte é subordinada ao resultado: nunca produzir **mais chapas**
nem **menos aproveitamento** que o layout atual, em nenhum cenário.

**Why this priority**: Condição de segurança — mexer na geração do layout é sensível e
não pode regredir trabalhos que já iam bem.

**Independent Test**: Rodar o harness de benchmark (spec 007) em todos os cenários e
confirmar que nenhum piora em nº de chapas nem em aproveitamento; se melhorar, regravar
o baseline.

**Acceptance Scenarios**:

1. **Given** qualquer cenário do benchmark, **When** o layout é gerado, **Then** nº de
   chapas ≤ atual e aproveitamento ≥ atual.
2. **Given** o cenário-âncora, **When** comparado ao layout atual, **Then** usa **menos
   chapas** ou **maior aproveitamento** (nunca pior).

---

### User Story 3 - Conservação, determinismo e paridade entre motores (Priority: P1)

O novo corte não pode perder, duplicar nem inventar peça/medida; o mesmo inventário
gera sempre o mesmo plano; e os dois motores de otimização produzem resultados
equivalentes.

**Why this priority**: São invariantes inegociáveis do produto (a rede de conservação
da spec 012, o determinismo e a paridade entre as duas implementações do motor). Uma
mudança na geração vale para as DUAS implementações.

**Independent Test**: Verificar conservação por contagem na árvore (nenhuma peça
perdida, nenhuma medida fantasma), gerar o plano 2× (planos idênticos), e confirmar que
as duas implementações do motor concordam para o mesmo input.

**Acceptance Scenarios**:

1. **Given** um inventário, **When** o layout é gerado, **Then** o conjunto de peças
   alocadas + não alocadas é exatamente o inventário, e nenhuma peça tem medida que não
   exista no inventário.
2. **Given** o mesmo inventário, **When** o layout é gerado duas vezes, **Then** os
   planos são idênticos.
3. **Given** o mesmo inventário, **When** processado pelas duas implementações do
   motor, **Then** os resultados são equivalentes.

---

### Edge Cases

- **Sem faixa lateral aproveitável**: coluna cheia, ou faixa mais estreita que qualquer
  peça restante, ou baixa demais ⇒ a nova ordem não age; layout idêntico ao atual.
- **Faixa lateral que ninguém preenche**: existe a faixa de altura cheia mas nenhuma
  peça do estoque cabe ⇒ o resultado não pode ficar PIOR que o atual (no mínimo, a
  mesma sobra; idealmente a sobra num bloco único reutilizável).
- **Corte guilhotina preservado**: o corte vertical de altura cheia é reto de borda a
  borda (guilhotina válida); nenhum corte em L ou não-retangular é introduzido.
- **Peça rotacionável**: a peça que preenche a faixa pode entrar girada 90° se couber
  melhor (salvo restrição).
- **Interação com agrupamento**: a nova ordem convive com o agrupamento de peças (nunca
  desligar o agrupamento).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Ao gerar o layout de uma coluna que tem uma faixa lateral livre de altura
  cheia ao lado de peças empilhadas, o motor DEVE isolar essa faixa com um corte
  vertical de altura cheia ANTES dos cortes horizontais das peças, de modo que a faixa
  fique disponível como um bloco de altura cheia.
- **FR-002**: A faixa lateral isolada DEVE ser preenchida pela PRÓPRIA otimização com
  peças do estoque que caibam nela (não por um passo de pós-processamento).
- **FR-003**: O corte introduzido DEVE ser guilhotina puro (reto, de borda a borda); a
  feature NÃO pode introduzir cortes em L, recortes internos ou formatos não
  retangulares.
- **FR-004**: A geração DEVE **conservar** todas as peças — nenhuma peça perdida,
  duplicada ou inventada; nenhuma folha do plano pode afirmar uma medida que não exista
  no inventário (medido por contagem na árvore).
- **FR-005**: O resultado DEVE ser **determinístico** (mesmo inventário → mesmo plano).
- **FR-006**: As DUAS implementações do motor de otimização DEVEM produzir resultados
  equivalentes para o mesmo input (a mudança de geração vale para ambas).
- **FR-007**: O sistema NÃO DEVE produzir mais chapas nem menos aproveitamento que o
  layout atual, em nenhum cenário (guarda de não-regressão).
- **FR-008**: A nova ordem de corte DEVE agir apenas quando há uma faixa lateral de
  altura cheia que valha a pena isolar; sem isso, o layout é idêntico ao atual.
- **FR-009**: O ganho DEVE ser **medido no trabalho real** (`of_geral_parcial (3).xls`)
  antes de ser dado como concluído — o benchmark sintético e os testes de unidade NÃO
  capturam o nº de chapas do âncora e servem apenas como rede de não-regressão.

### Key Entities *(include if feature involves data)*

- **Coluna**: uma faixa vertical do plano de corte contendo uma ou mais peças; pode ter
  uma **faixa lateral livre** ao lado das peças.
- **Faixa lateral**: a região livre de **altura cheia** ao lado das peças de uma coluna
  (ex.: 926×1233); a entidade central desta feature — hoje enterrada/fragmentada, a ser
  isolada como um bloco raso preenchível.
- **Peça de preenchimento**: peça do estoque cujo menor lado ≤ largura da faixa e altura
  ≤ altura da faixa (em alguma orientação), candidata a ocupar a faixa isolada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No cenário-âncora, a faixa lateral de ~926×1233 que hoje fica **vazia**
  passa a acomodar peças que cabem (deixa de haver bloco livre grande com peças
  disponíveis que caibam).
- **SC-002**: No trabalho-âncora, o plano usa **menos chapas** e/ou **maior
  aproveitamento** que o atual (nunca pior).
- **SC-003**: Em **todos** os cenários do benchmark, nº de chapas ≤ atual e
  aproveitamento ≥ atual (zero regressões).
- **SC-004**: **Nenhuma** peça é perdida, duplicada ou inventada, e nenhuma folha afirma
  medida inexistente (conservação total).
- **SC-005**: O mesmo inventário gera planos idênticos em execuções repetidas
  (determinismo), e as duas implementações do motor concordam.

## Assumptions

- O corte vertical de altura cheia que isola a faixa lateral é **guilhotina válido** — o
  produto já modela apenas cortes retos de borda a borda; esta feature apenas muda a
  ORDEM em que os cortes são feitos, não sua natureza.
- A oportunidade existe e é significativa: no âncora, 28-40 peças cabem no bloco hoje
  desperdiçado (medido). O ganho de chapas/aproveitamento é **input-dependente** e será
  confirmado por medição no trabalho real (lição das iterações anteriores: só a medição
  no app decide; benchmark e unit tests são rede de não-regressão).
- A mudança vive no **motor** de otimização de UMA chapa (geração do layout), não na
  camada de plano. Como o produto usa duas implementações equivalentes do motor, a
  mudança precisa valer para ambas.
- A consolidação de sobra (spec 013) permanece — ela reagrupa a sobra remanescente; esta
  feature ataca a GERAÇÃO, complementando-a.
- Melhorias já feitas na camada de plano (guloso maior-primeiro + escolha do melhor
  entre motores) estão FORA do escopo desta spec e não são alteradas por ela.
- A rede de conservação da spec 012 continua válida e é a guarda de "nenhuma medida
  fantasma" ao mudar a geração.
