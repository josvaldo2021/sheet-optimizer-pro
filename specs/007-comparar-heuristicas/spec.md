# Feature Specification: Comparar Heurísticas e Evoluir o Otimizador

**Feature Branch**: `007-comparar-heuristicas`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "comparar heuristicas e verificar o que pode aprender e evoluir o algoritmo atual"

## Contexto

O documento `heuristicas.md` (raiz do repositório) cataloga as principais heurísticas e
metaheurísticas da literatura para o problema de corte 2D guilhotinado, em quatro grupos:
construtivas/gulosas (BL/BLF, FFDH, NFDH, BFDH, Best-Fit), estruturais por estágios
(2-stage, 3-stage, restrição de giro, busca em árvore), metaheurísticas (AG/BRKGA, GRASP,
Busca Tabu, Simulated Annealing) e variantes específicas (strip packing, geração de
colunas). Esta feature compara esse catálogo com o comportamento do otimizador atual,
identifica o que ele já cobre e o que pode aprender, e evolui o algoritmo com as técnicas
de maior potencial — sempre medindo o efeito no aproveitamento de material.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diagnóstico comparativo do otimizador atual (Priority: P1)

Como mantenedor do produto, quero um relatório comparativo que confronte cada técnica do
catálogo de referência com o comportamento do otimizador atual, classificando-a como
**coberta**, **parcialmente coberta**, **ausente** ou **não aplicável** (com justificativa),
para saber objetivamente onde o algoritmo está forte e onde há lacunas.

**Why this priority**: sem o diagnóstico não há como decidir o que vale a pena evoluir; é a
fundação de todo o resto e já entrega valor sozinho (conhecimento consolidado e auditável
sobre o estado do otimizador).

**Independent Test**: abrir o relatório e verificar que 100% das técnicas listadas no
catálogo de referência aparecem classificadas, cada uma com justificativa baseada no
comportamento observável do otimizador (não em suposições).

**Acceptance Scenarios**:

1. **Given** o catálogo de referência com N técnicas, **When** o relatório comparativo é
   produzido, **Then** todas as N técnicas aparecem com uma das quatro classificações e
   justificativa individual.
2. **Given** uma técnica cujo conceito o otimizador já aplica sob outro nome (ex.:
   agrupamento por altura igual ≈ corte em estágios), **When** ela é classificada,
   **Then** a equivalência é explicada em vez de marcá-la como ausente.
3. **Given** uma técnica incompatível com as regras do produto (ex.: posicionamento livre
   não guilhotinado), **When** ela é classificada, **Then** é marcada como não aplicável
   com a restrição de domínio que a exclui.

---

### User Story 2 - Priorização de oportunidades de evolução (Priority: P2)

Como mantenedor do produto, quero uma lista ranqueada das técnicas ausentes ou parciais
com potencial de melhorar o aproveitamento, avaliando impacto esperado, compatibilidade
com as regras do domínio (corte guilhotina, rotação, margens, corte mínimo, determinismo)
e esforço relativo, para decidir com critério o que implementar primeiro.

**Why this priority**: transforma o diagnóstico em decisão; evita investir em técnicas de
baixo retorno ou incompatíveis com o produto.

**Independent Test**: verificar que a lista contém ao menos 3 oportunidades ranqueadas,
cada uma com impacto esperado no aproveitamento, análise de compatibilidade e esforço
relativo, e que técnicas marcadas como não aplicáveis no diagnóstico não aparecem nela.

**Acceptance Scenarios**:

1. **Given** o diagnóstico da User Story 1, **When** a priorização é produzida, **Then**
   toda técnica ausente/parcial é avaliada e as descartadas têm o motivo registrado.
2. **Given** uma técnica que introduz aleatoriedade (ex.: metaheurística), **When** ela é
   priorizada, **Then** a avaliação registra como o comportamento será mantido
   reprodutível (mesmo input → mesmo plano de corte).

---

### User Story 3 - Evolução medida do algoritmo (Priority: P3)

Como usuário final (quem planeja cortes), quero que o otimizador incorpore as técnicas
mais promissoras da priorização, de modo que meus planos de corte usem menos material —
sem jamais piorar os resultados que já obtenho hoje.

**Why this priority**: é o valor final da feature, mas depende das duas anteriores e só
deve acontecer com ganho comprovado por medição.

**Independent Test**: rodar a suíte de cenários de referência antes e depois da evolução e
comparar aproveitamento e número de chapas por cenário.

**Acceptance Scenarios**:

1. **Given** a suíte de cenários de referência com o aproveitamento baseline registrado,
   **When** o otimizador evoluído é executado sobre os mesmos cenários, **Then** nenhum
   cenário piora em aproveitamento nem em número de chapas.
2. **Given** a mesma suíte, **When** os resultados são comparados ao baseline, **Then** ao
   menos um cenário melhora de forma mensurável (aproveitamento maior ou menos chapas).
3. **Given** o mesmo input executado duas vezes no otimizador evoluído, **When** os planos
   de corte são comparados, **Then** são idênticos.
4. **Given** uma técnica candidata que, medida, não melhora nenhum cenário ou piora algum,
   **When** a decisão de adoção é tomada, **Then** a técnica é descartada e o resultado da
   medição fica registrado.

---

### Edge Cases

- Técnica da literatura que pressupõe chapa de comprimento infinito (strip packing): deve
  ser classificada quanto à aplicabilidade a chapas finitas com margens, não ignorada.
- Técnica que melhora cenários com muitas peças pequenas mas piora cenários com peças
  grandes: a regra "nenhum cenário piora" prevalece; adoção só com salvaguarda que
  preserve o comportamento anterior nos cenários afetados (ex.: técnica concorre como
  estratégia adicional, e o melhor resultado vence).
- Empate de aproveitamento entre plano antigo e novo: o resultado não pode oscilar entre
  execuções; o critério de desempate deve ser estável.
- Catálogo de referência atualizado no futuro (novas técnicas adicionadas ao documento): o
  relatório comparativo deve ser reexecutável/atualizável sem refazer tudo do zero.
- Cenário de benchmark em que o baseline já atinge aproveitamento próximo do máximo
  teórico: ausência de melhoria nesses cenários não conta contra a evolução.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST dispor de um relatório comparativo que classifique cada
  técnica do catálogo de referência (`heuristicas.md`) como coberta, parcialmente coberta,
  ausente ou não aplicável, com justificativa individual baseada no comportamento
  observável do otimizador atual.
- **FR-002**: O relatório MUST registrar, para técnicas classificadas como não aplicáveis,
  qual regra de domínio as exclui (ex.: corte guilhotina obrigatório).
- **FR-003**: O sistema MUST dispor de uma priorização ranqueada das técnicas ausentes ou
  parciais, avaliando cada uma quanto a impacto esperado no aproveitamento,
  compatibilidade com as regras do domínio e esforço relativo, incluindo o motivo de
  descarte das não selecionadas.
- **FR-004**: O sistema MUST registrar um baseline de aproveitamento e número de chapas do
  otimizador atual sobre uma suíte de cenários de referência representativa (peças
  pequenas, grandes, mistas, alto volume), reutilizável para comparações futuras.
- **FR-005**: Toda técnica adotada na evolução MUST ser validada contra o baseline: nenhum
  cenário da suíte pode piorar em aproveitamento ou número de chapas, e ao menos um
  cenário deve melhorar de forma mensurável.
- **FR-006**: O otimizador evoluído MUST permanecer determinístico: o mesmo input produz
  sempre o mesmo plano de corte, inclusive para técnicas que envolvam aleatoriedade.
- **FR-007**: Técnicas candidatas reprovadas na medição MUST ter o resultado registrado
  junto aos artefatos da feature, para não serem reavaliadas do zero no futuro.
- **FR-008**: O relatório comparativo e a priorização MUST ficar versionados junto aos
  artefatos da feature, atualizáveis quando o catálogo de referência mudar.

### Key Entities

- **Técnica de referência**: uma heurística/metaheurística do catálogo (`heuristicas.md`),
  com nome, grupo (construtiva, estrutural, metaheurística, variante) e descrição.
- **Classificação de cobertura**: o veredito sobre uma técnica (coberta / parcial /
  ausente / não aplicável) com justificativa e, quando aplicável, a equivalência com o
  comportamento atual.
- **Oportunidade de evolução**: técnica ausente/parcial avaliada com impacto esperado,
  compatibilidade de domínio, esforço relativo e posição no ranking.
- **Cenário de benchmark**: conjunto nomeado de peças + chapa com margens e restrições,
  usado para medir aproveitamento e número de chapas.
- **Medição**: resultado de executar o otimizador sobre um cenário — aproveitamento (%),
  chapas usadas, identificação da versão do algoritmo (baseline ou evoluído).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das técnicas do catálogo de referência classificadas no relatório
  comparativo, cada uma com justificativa.
- **SC-002**: Ao menos 3 oportunidades de evolução ranqueadas com impacto, compatibilidade
  e esforço documentados.
- **SC-003**: Baseline de aproveitamento e chapas registrado para ao menos 5 cenários de
  referência distintos.
- **SC-004**: Após a evolução, nenhum cenário da suíte piora em aproveitamento ou número
  de chapas em relação ao baseline.
- **SC-005**: Ao menos 1 cenário da suíte melhora de forma mensurável (≥ 0,5 ponto
  percentual de aproveitamento ou ≥ 1 chapa a menos).
- **SC-006**: Duas execuções consecutivas com o mesmo input produzem planos de corte
  idênticos em 100% dos cenários da suíte.

## Assumptions

- O escopo inclui tanto a análise (relatório + priorização) quanto a evolução do
  algoritmo; quais técnicas serão implementadas é decisão da fase de planejamento, com
  base na priorização — a spec não fixa técnicas específicas.
- O catálogo de referência é o `heuristicas.md` existente na raiz do repositório; ele será
  movido/copiado para os artefatos da feature como fonte de verdade versionada.
- A suíte de cenários de referência será montada a partir dos cenários e fixtures de teste
  já existentes no projeto, complementada se necessário para cobrir os perfis exigidos
  (peças pequenas, grandes, mistas, alto volume).
- "Melhorar o algoritmo" significa melhorar aproveitamento de material e/ou reduzir chapas
  — nunca às custas de regressão em cenário existente (princípio de qualidade do corte é
  inegociável no projeto).
- Técnicas com aleatoriedade só são adotáveis se tornadas reprodutíveis; caso contrário
  ficam registradas como oportunidade futura.
- O comportamento evoluído vale para todas as implementações do motor (a paridade entre
  implementações é princípio do projeto e será tratada no planejamento).
