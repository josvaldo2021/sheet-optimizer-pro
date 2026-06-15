# Feature Specification: Importar Lista de Peças do Relatório OF (.rpt)

**Feature Branch**: `002-importar-relatorio-of`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "Adicionar uma nova forma de ler arquivos de peças: planilhas de relatório OF (aba `of_geral_parcial.rpt`), extraindo pedido, quantidade, altura e largura das colunas B, M, O e R, a partir da linha 9 até a última linha com dado na coluna B."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar um relatório OF automaticamente (Priority: P1)

O operador exporta do sistema de produção um relatório de ordens de fabricação
(planilha com a aba `of_geral_parcial.rpt`) e quer carregá-lo no Sheet Optimizer
Pro sem precisar reorganizar colunas nem escolher um formato. Ele usa a importação
normal de peças; o sistema **reconhece o layout do relatório** e extrai a lista de
peças sozinho.

**Why this priority**: é o coração da feature — sem o reconhecimento automático e a
extração correta, não há valor. Tudo o mais depende disso.

**Independent Test**: importar o arquivo de exemplo `lote 1 medida de chapa.xls` e
verificar que as peças aparecem com pedido, quantidade, altura e largura corretos,
sem o usuário escolher nada.

**Acceptance Scenarios**:

1. **Given** um relatório OF com dados a partir da linha 9, **When** o operador o
   importa pela ação de importação normal, **Then** o sistema reconhece o layout e
   carrega as peças sem pedir escolha de formato.
2. **Given** uma linha de dados do relatório, **When** ela é importada, **Then**
   o pedido (coluna B) vira o rótulo da peça, a quantidade (coluna M) vira a
   quantidade, a altura (coluna O) e a largura (coluna R) viram as dimensões.
3. **Given** o relatório importado, **When** a importação termina, **Then** o
   sistema mostra um retorno de quantas peças/linhas foram carregadas.

---

### User Story 2 - Não truncar em linhas em branco intermediárias (Priority: P1)

Alguns relatórios trazem **linhas em branco no meio** dos dados (o pedido da coluna
B fica vazio em algumas linhas). O operador espera que a importação leia até o fim
real da lista, ignorando essas lacunas, em vez de parar na primeira linha vazia.

**Why this priority**: é uma regra crítica de correção — parar na primeira lacuna
perderia peças silenciosamente, gerando planos de corte incompletos. Por isso é P1
junto da extração.

**Independent Test**: importar `lote 1 medida de chapa.xls` (que tem lacunas entre
as linhas 9 e 59) e confirmar que a peça da última linha com dado em B (linha 59) é
carregada e que nenhuma linha de dado entre as lacunas foi perdida.

**Acceptance Scenarios**:

1. **Given** um relatório com linhas em branco entre linhas de dados, **When** é
   importado, **Then** as linhas em branco são ignoradas e as linhas de dados
   seguintes continuam sendo lidas.
2. **Given** o fim dos dados, **When** a importação varre as linhas, **Then** o
   limite é a **última linha com valor na coluna B**, não a primeira linha vazia.

---

### User Story 3 - Conviver com os formatos já suportados (Priority: P2)

O operador continua importando suas planilhas antigas (formato atual) normalmente.
O novo reconhecimento do relatório OF não pode quebrar nem alterar esses fluxos.

**Why this priority**: protege o que já funciona; importante, mas o valor novo está
nas histórias P1.

**Independent Test**: importar um arquivo no formato atual e confirmar que ele é
lido exatamente como antes.

**Acceptance Scenarios**:

1. **Given** um arquivo no formato atualmente suportado, **When** é importado,
   **Then** ele é lido como antes, sem regressão.
2. **Given** um arquivo que não é reconhecido como nenhum layout suportado,
   **When** o operador tenta importar, **Then** o sistema avisa em vez de carregar
   dados incorretos.

---

### Edge Cases

- **Linhas em branco intermediárias**: ignoradas; não encerram a leitura (US2).
- **Linha de dado incompleta** (sem quantidade ou sem uma das dimensões): a linha é
  ignorada e contabilizada no retorno da importação, sem abortar o restante.
- **Coluna B vazia desde o início / nenhuma linha de dado a partir da 9**: nada é
  importado e o sistema informa que não encontrou peças.
- **Pedido repetido em várias linhas**: cada linha de dado é uma peça própria; o
  mesmo rótulo de pedido pode aparecer em mais de uma peça.
- **Cabeçalho do relatório desalinhado** (rótulos da linha 7 não batem com as
  colunas de dados): irrelevante — a extração usa posição fixa de coluna, não os
  rótulos do cabeçalho.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST reconhecer automaticamente o layout do relatório OF ao
  importar um arquivo de peças, sem o usuário escolher um formato.
- **FR-002**: Para o layout do relatório OF, o sistema MUST iniciar a leitura dos
  dados na **linha 9**.
- **FR-003**: O sistema MUST determinar o fim dos dados pela **última linha com
  valor na coluna B (pedido)** e MUST ignorar linhas em branco situadas entre a
  linha 9 e essa última linha.
- **FR-004**: Para cada linha de dado, o sistema MUST mapear: coluna **B → pedido
  (rótulo)**, coluna **M → quantidade**, coluna **O → altura**, coluna **R →
  largura**.
- **FR-005**: O sistema MUST preservar o identificador do pedido (ex.: `01966/26`)
  como rótulo da peça importada.
- **FR-006**: O sistema MUST continuar suportando os formatos de importação já
  existentes, sem regressão.
- **FR-007**: O sistema MUST tratar os valores de dimensão como **milímetros**,
  consistente com o restante da aplicação.
- **FR-008**: O sistema MUST ignorar linhas de dado incompletas (sem quantidade ou
  sem dimensão) sem abortar a importação das demais.
- **FR-009**: O sistema MUST informar, ao final, um resumo da importação (quantas
  peças/linhas foram carregadas e quantas foram ignoradas).
- **FR-010**: Quando o arquivo não for reconhecido como nenhum layout suportado, o
  sistema MUST avisar o usuário em vez de importar dados incorretos.

### Key Entities *(include if feature involves data)*

- **Relatório OF**: arquivo de planilha exportado da produção (aba
  `of_geral_parcial.rpt`), com cabeçalho nas primeiras linhas e dados a partir da
  linha 9, em colunas de posição fixa (B/M/O/R).
- **Peça** (já existente): retângulo a cortar — recebe rótulo (pedido), quantidade,
  altura e largura a partir do relatório.
- **Resumo de Importação**: contagem do que foi carregado vs ignorado, devolvida ao
  usuário ao final.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Importar `lote 1 medida de chapa.xls` carrega todas as linhas de dado
  entre a linha 9 e a 59 (pulando as em branco), com a soma das quantidades igual à
  soma da coluna M dessas linhas.
- **SC-002**: Uma linha em branco entre linhas de dados **não** interrompe a
  importação (a peça da linha 59 é carregada).
- **SC-003**: 100% dos identificadores de pedido são preservados como rótulo das
  peças importadas.
- **SC-004**: A importação dos formatos já suportados continua funcionando sem
  regressão.
- **SC-005**: Após importar, o operador vê um retorno claro de quantas peças foram
  carregadas (e quantas linhas ignoradas, se houver).

## Assumptions

- O reconhecimento automático do layout se baseia em marcadores identificáveis do
  relatório (ex.: a aba `of_geral_parcial.rpt` e/ou o padrão de dados a partir da
  linha 9). O sinal exato de detecção é decisão de implementação (plan).
- Mapeamento de dimensões conforme indicado pelo usuário: **O = altura**,
  **R = largura**. Os dados de exemplo não permitem inferir isso sozinhos.
- A prioridade de peça não existe neste formato; peças importadas entram **sem
  prioridade**.
- Valores numéricos estão em **milímetros**.
- O pedido (coluna B) é texto (ex.: `01966/26`) e é usado como rótulo, não como
  identificador único — pedidos podem se repetir entre peças.
- Arquivos de exemplo `lote 1 medida de chapa.xls` e `lote 2 medida de chapa.xls`
  (em `parts/`) servem de fixtures de referência para os testes.
