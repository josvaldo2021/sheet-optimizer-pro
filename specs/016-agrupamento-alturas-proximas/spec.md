# Feature Specification: Agrupamento de colunas com alturas próximas

**Feature Branch**: `016-agrupamento-alturas-proximas`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description (arquivo `melhoria-agrupamento.md`, relato do usuário sobre a árvore real do app):

> Duas colunas laterais isoladas — uma com peça de altura 2388 (02545/26) e outra com peça de
> altura 2320 (02554/26) — NÃO são agrupadas porque o modelo atual só agrupa colunas de altura
> IGUAL. A diferença é de 68 mm. "Supondo que a distância de quebra fosse de 50 mm, então
> faríamos o agrupamento baseado na maior, depois faríamos a correção na menor."
> "Quando não agrupar? Se a área da nova sobra gerada for inferior à área dos fragmentos atuais."

## Contexto do Problema

Hoje, ao final do plano, colunas de MESMA altura são fundidas numa única faixa horizontal, o que
consolida a sobra do topo num bloco único e permite preenchê-la com peças restantes. Quando as
alturas diferem — mesmo por poucos milímetros — cada coluna permanece isolada, e a sobra acima
de cada uma fica fragmentada em retalhos estreitos, individualmente inaproveitáveis.

No cenário-âncora do usuário, duas colunas vizinhas (alturas 2388 e 2320) deixam duas sobras
separadas em vez de um bloco contínuo de largura somada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agrupar colunas de alturas próximas (Priority: P1)

O usuário gera o plano de corte. Duas ou mais colunas cujas peças têm alturas que diferem por
menos que a tolerância configurada passam a ser agrupadas numa única faixa, dimensionada pela
MAIOR altura. A peça mais baixa é cortada com a sua altura ORIGINAL (correção dentro da faixa),
deixando um pequeno resíduo próprio; acima da faixa nasce uma sobra ÚNICA e contínua, com a
largura somada das colunas agrupadas.

**Why this priority**: é o comportamento pedido; sozinho já converte sobras fragmentadas em um
bloco reutilizável, que é o pré-requisito para caber mais peças por chapa.

**Independent Test**: montar o cenário-âncora (coluna com peça de altura 2388 e coluna com peça
de altura 2320, tolerância ≥ 68 mm) e verificar que o plano resultante apresenta UMA faixa
agrupada, que cada peça mantém a sua medida original, e que a sobra do topo é um único bloco de
largura igual à soma das larguras das colunas.

**Acceptance Scenarios**:

1. **Given** duas colunas com peças de alturas 2388 e 2320 (diferença 68) e "Quebra Mínima" de
   50 mm, **When** o plano é gerado, **Then** as duas colunas aparecem numa faixa única de
   altura 2388, a peça de 2320 mantém altura 2320 (com resíduo de 68 mm acima dela), e a área
   livre acima da faixa é um bloco contínuo de largura somada.
2. **Given** duas colunas cujas peças diferem em altura por MENOS que a "Quebra Mínima" (ex.:
   diferença de 12 mm com quebra mínima de 50 mm), **When** o plano é gerado, **Then** as
   colunas NÃO são agrupadas — o corte de correção não é executável.
3. **Given** um plano em que o agrupamento por altura próxima ocorreu,
   **When** as peças do plano são contadas e medidas, **Then** toda peça do inventário alocada
   antes continua alocada, com a MESMA medida (nenhuma peça perdida, nenhuma peça inflada).
4. **Given** o mesmo inventário e a mesma configuração,
   **When** o plano é gerado duas vezes, **Then** o resultado é idêntico.

---

### User Story 2 - Não agrupar quando o agrupamento piora a sobra (Priority: P1)

O agrupamento por altura próxima só acontece quando compensa. Se a sobra consolidada resultante
for MENOR (em área aproveitável) que a sobra que já existia fragmentada, o agrupamento é
descartado e o layout atual é mantido.

**Why this priority**: sem esta guarda, o agrupamento pode destruir área útil ao criar resíduos
sob as peças mais baixas — piorando o aproveitamento, que é o objetivo primário do produto.

**Independent Test**: montar um caso em que a diferença de altura está dentro da tolerância mas
o resíduo criado sob a peça baixa supera o ganho de consolidação; verificar que o layout
permanece inalterado.

**Acceptance Scenarios**:

1. **Given** duas colunas dentro da tolerância cuja fusão produziria sobra consolidada de área
   aproveitável MENOR que a sobra fragmentada atual, **When** o plano é gerado, **Then** o
   agrupamento não é aplicado e o layout permanece o atual.
2. **Given** duas colunas dentro da tolerância cuja fusão AUMENTA a sobra aproveitável,
   **When** o plano é gerado, **Then** o agrupamento é aplicado.

---

### User Story 3 - Preencher a sobra consolidada (Priority: P2)

Após o agrupamento por altura próxima, a faixa livre acima da faixa agrupada é oferecida ao
preenchimento com as peças ainda não alocadas, do mesmo modo que já acontece no agrupamento por
altura idêntica.

**Why this priority**: é onde o ganho de material se materializa; depende inteiramente da US1,
por isso vem depois.

**Independent Test**: com peças restantes que caibam na sobra consolidada, verificar que elas
são colocadas lá e que a contagem de peças por chapa aumenta em relação ao plano sem
agrupamento.

**Acceptance Scenarios**:

1. **Given** um plano com sobra consolidada e peças restantes que caibam nela, **When** o plano
   é gerado, **Then** ao menos uma dessas peças ocupa a sobra consolidada.
2. **Given** nenhuma peça restante cabe na sobra consolidada, **When** o plano é gerado,
   **Then** a sobra permanece vazia e nenhuma peça é distorcida para preenchê-la.

---

### Edge Cases

- **Diferença zero**: colunas de altura exatamente igual continuam agrupadas como hoje (o novo
  comportamento é uma generalização, não uma substituição).
- **Diferença exatamente igual à "Quebra Mínima"**: permitida (limite inclusivo).
- **Diferença pequena e não nula (menor que a "Quebra Mínima")**: NÃO agrupa. É o caso mais
  perigoso — igualar as alturas inflaria a peça baixa, criando peça fantasma.
- **Mais de duas colunas**: o agrupamento considera o conjunto; a faixa usa a maior altura do
  conjunto e cada peça mantém a sua altura original. Uma coluna cuja diferença para a mais alta
  do conjunto caia na faixa proibida (não nula e menor que a quebra mínima) fica de fora.
- **Coluna mais larga que a peça** (coluna que absorveu resíduo de largura): a faixa usa a
  largura da PEÇA e a soma total considera a largura da COLUNA, preservando a conservação de
  área — como já ocorre no agrupamento por altura idêntica.
- **"Quebra Mínima" igual a zero**: qualquer diferença de altura vira candidata; só a guarda da
  FR-004 decide. (Não há risco de corte impossível porque a máquina não tem restrição
  declarada.)
- **"Quebra Mínima" alta**: só diferenças grandes viram candidatas; diferenças pequenas ficam
  bloqueadas. O comportamento converge para o de hoje (apenas alturas idênticas) conforme o
  valor cresce.
- **Resíduo sob a peça baixa fica menor que qualquer peça do inventário**: é desperdício
  legítimo; ele entra no cálculo da guarda da US2, não em uma exceção separada.
- **Corte guilhotina**: nenhuma configuração de agrupamento pode produzir um corte que não
  atravesse a peça ou sub-peça de borda a borda.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST agrupar colunas cujas alturas de peça difiram por um valor que
  permita o corte de correção — isto é, diferença NULA (caso já suportado hoje) ou diferença
  MAIOR OU IGUAL à "Quebra Mínima" (o resíduo criado é largo o bastante para ser cortado).
- **FR-002**: A faixa agrupada MUST ser dimensionada pela MAIOR altura entre as colunas do
  conjunto.
- **FR-003**: Cada peça agrupada MUST conservar a sua altura ORIGINAL; o sistema MUST aplicar um
  corte de correção que separe a peça mais baixa do resíduo criado acima dela dentro da faixa.
- **FR-004**: O sistema MUST NÃO aplicar o agrupamento quando a sobra consolidada resultante for
  de área aproveitável INFERIOR à das sobras fragmentadas existentes; nesse caso o layout atual
  MUST ser mantido inalterado.
- **FR-005**: O sistema MUST oferecer a sobra consolidada acima da faixa agrupada ao
  preenchimento com peças ainda não alocadas.
- **FR-006**: O sistema MUST conservar todas as peças: nenhuma peça alocada antes do agrupamento
  pode desaparecer, duplicar, ou ter a sua medida alterada.
- **FR-007**: Todo corte gerado MUST ser guilhotinado (reto, de borda a borda).
- **FR-008**: O plano MUST permanecer determinístico: mesmo inventário e mesma configuração
  produzem exatamente o mesmo resultado.
- **FR-009**: O limiar de agrupamento MUST ser o valor do campo "Quebra Mínima" já existente na
  interface de configuração da chapa. Nenhum campo novo é criado. Ele funciona como PISO de
  MAQUINABILIDADE: o resíduo de correção (diferença de altura) precisa ter ao menos essa medida
  para que a serra consiga executar o corte. Diferenças MENORES que a "Quebra Mínima" (e não
  nulas) NÃO permitem agrupamento — não há como cortar uma tira mais estreita que a quebra
  mínima, e igualar as alturas inflaria a peça mais baixa (proibido pela FR-006). Não existe
  teto: diferenças grandes são barradas economicamente pela guarda da FR-004, não por um limite
  fixo.
- **FR-010**: A guarda da FR-004 MUST comparar a área do MAIOR bloco livre contíguo da chapa
  ANTES e DEPOIS do agrupamento: o agrupamento é aceito somente se o maior bloco livre resultante
  for MAIOR OU IGUAL ao maior bloco livre atual. A guarda NÃO exige que exista, naquele momento,
  uma peça restante que caiba na sobra consolidada — a sobra em bloco único vale por si.

### Key Entities

- **Coluna**: agrupamento vertical de peças com a mesma largura de sub-coluna, ocupando uma faixa
  da chapa; caracterizada por largura da coluna, largura da peça e altura da peça.
- **Faixa agrupada**: conjunto de colunas fundidas horizontalmente, com uma altura única (a
  maior do conjunto) e largura igual à soma das larguras das colunas.
- **Resíduo de correção**: área livre criada acima de uma peça mais baixa dentro da faixa
  agrupada, de altura igual à diferença entre a altura da faixa e a altura daquela peça.
- **Sobra consolidada**: bloco livre contínuo acima da faixa agrupada, candidato a
  preenchimento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No cenário-âncora do usuário (colunas de peças 2388 e 2320), as duas colunas
  passam a ser exibidas como uma faixa agrupada única, com a sobra do topo em um único bloco.
- **SC-002**: No relatório de referência do usuário (`of_geral_parcial (3).xls`, 268 peças), o
  número de chapas do plano é MENOR OU IGUAL ao número atual (31), e nunca maior.
- **SC-003**: Em 100% dos planos gerados, a quantidade e as medidas das peças alocadas são
  idênticas às do inventário — zero peças perdidas e zero peças com medida inventada.
- **SC-004**: O tempo para gerar o plano completo do relatório de referência permanece abaixo de
  2 minutos.
- **SC-005**: Nenhum caso de teste de regressão de aproveitamento existente piora após a
  mudança.

## Assumptions

- O agrupamento por altura próxima é uma GENERALIZAÇÃO do agrupamento por altura idêntica já
  existente, não um mecanismo paralelo; o caso "diferença zero" continua produzindo exatamente o
  layout de hoje.
- O agrupamento acontece na montagem do plano (etapa de consolidação pós-otimização), não exige
  mudar o critério de seleção de layout do otimizador.
- Os cenários de medição são os já usados no projeto: o cenário-âncora do relato do usuário para
  validação visual e o relatório de OF de referência para contagem de chapas.
- A peça mais baixa fica alinhada à BASE da faixa e o resíduo de correção fica ACIMA dela,
  contíguo à sobra consolidada quando possível.
- A guarda da FR-004 é avaliada por conjunto candidato de colunas: um agrupamento reprovado não
  impede que outro conjunto na mesma chapa seja agrupado.
- O campo "Quebra Mínima" ganha um segundo uso (piso do resíduo de correção) sem mudar o uso
  atual; ele já expressa exatamente "a menor tira que a serra consegue cortar", que é a
  restrição em jogo.
- O "Não agrupar" da FR-009 é uma restrição FÍSICA (corte impossível) e o da FR-004 é uma
  restrição ECONÔMICA (não compensa); as duas são avaliadas independentemente.
