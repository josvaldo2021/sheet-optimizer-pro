# Mapa de Contexto Técnico (Context Map)

Este documento mapeia a estrutura de diretórios e arquivos críticos do projeto **Sheet Optimizer Pro**. O objetivo é permitir que a IA localize rapidamente onde cada regra de negócio ou componente de UI está implementado, evitando a leitura desnecessária de arquivos e economizando tokens.

## 1. Motor de Otimização (`src/lib/engine/`)

Este diretório contém o núcleo lógico do projeto. É a parte mais complexa e onde a maioria das regras de negócio de corte guilhotina reside.

| Arquivo | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `types.ts` | Definições de tipos TypeScript (`TreeNode`, `Piece`, `NodeType`). | Para entender a estrutura de dados da árvore de corte e das peças. |
| `optimizer.ts` | Ponto de entrada para a otimização heurística (`optimizeV6`). | Para entender as estratégias de ordenação e o fluxo principal de posicionamento. |
| `genetic.ts` | Implementação do algoritmo genético (`optimizeGeneticAsync`). | Para modificar a evolução, função de fitness ou estratégias de agrupamento avançadas. |
| `placement.ts` | Lógica de inserção de nós na árvore (`runPlacement`). | Para entender como uma peça é fisicamente alocada na chapa (cortes X, Y, Z). |
| `grouping.ts` | Funções para agrupar peças antes do corte (ex: `groupPiecesByHeight`). | Para alterar ou adicionar novas lógicas de agrupamento de peças idênticas/compatíveis. |
| `tree-utils.ts` | Utilitários para manipular a `TreeNode` (criar raiz, clonar, buscar nós, `extractLeafPieces`/`previewRemoval` para extração de peças-folha e preview de remoção). **Spec 012**: validação de conservação no limite — `validatePlacementCandidate` (INV-1..INV-3), `physicalCount`, `physicalMeasureSet`. **Spec 011**: `largestFreeRect` (maior retângulo livre da chapa, generaliza `getLastLeftover`) — base do desempate por consolidação. **Spec 013**: `consolidateColumns` ("cortar até o final primeiro" — funde faixas W de mesma largura numa coluna Q de altura cheia, isolando a sobra lateral como um bloco; peças não se movem). Todos espelhados em `wasm-engine/src/tree_utils.rs`. | Para operações genéricas na árvore de corte; para a rede de conservação (peça vs grupo, folhas fantasma); ou para a consolidação de sobra (seleção 011 + estrutura 013). |
| `optimizer.ts` (seleção) | **Spec 011**: a escolha do melhor candidato do `optimizeV6` usa `área → maior `largestFreeRect` (consolidação) → compactação`, subordinada à área. Mede na árvore normalizada "como será finalizada" (clone+normalize p/ transposto). Espelho em `optimizer.rs`. | Ao mexer no critério de seleção de layout ou na consolidação de sobra. |
| `normalization.ts` | Funções para limpar e normalizar a árvore após os cortes. | Para entender como sobras (W, Q, R) são consolidadas. |
| `rng.ts` | PRNG determinístico (`mulberry32`, `DEFAULT_GA_SEED`) — spec 007. Toda aleatoriedade do motor passa por aqui (nunca `Math.random`). | Para qualquer componente novo com aleatoriedade (Princípio V: reprodutibilidade). |
| `post-processing.ts` | Lógica executada após a otimização principal (ex: `postOptimizeRegroup`). | Para ajustes finais no plano de corte. |

## 2. Interface do Usuário (`src/`)

A interface é construída em React e gerencia o estado da aplicação, além de renderizar os resultados visuais.

| Arquivo/Diretório | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `pages/Index.tsx` | Componente principal da página. Gerencia o estado global (chapas, peças, progresso). | Para entender o fluxo de dados entre a UI e o motor de otimização. |
| `components/SheetViewer.tsx` | Componente visual que renderiza a chapa e os cortes baseados na `TreeNode`. Inclui barra de seleção (info da peça + botão remover). | Para alterar a forma como o plano de corte é desenhado na tela. |
| `components/SidebarSection.tsx` | Componentes da barra lateral (formulários de entrada, configurações). | Para adicionar novos campos de configuração ou alterar a entrada de dados. |
| `lib/cnc-engine.ts` | Arquivo de "barrel" (exportação centralizada) para o motor. | Para ver a API pública do motor consumida pela UI. |

## 3. Exportação e Relatórios (`src/lib/`)

Módulos responsáveis por gerar saídas do sistema.

| Arquivo | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `pdf-export.ts` | Geração de relatórios em PDF usando `jspdf`. | Para alterar o layout ou os dados incluídos no PDF final. |
| `excel-export.ts` | Exportação de dados para planilhas Excel usando `xlsx`. | Para modificar as colunas ou o formato do arquivo Excel gerado. |
| `layout-utils.ts` | Utilitários para agrupar layouts idênticos. | Para entender como chapas repetidas são consolidadas nos relatórios. |
| `pattern-repetition.ts` | Módulo **puro** de seleção de padrão por repetibilidade no fluxo multi-chapa (spec 006): `scoreCandidate`, `selectByRepetition`, `homogeneousCandidates`. Consumido por `runAllSheets` em `Index.tsx`. | Para alterar como o plano prioriza padrões que se repetem em mais chapas sob um piso de aproveitamento. |
| `lots/layout-replication.ts` | Módulo **puro** de replicação de layout e replanejamento pós-save (spec 008 + emenda A1): `buildLayoutBom`, `maxRepetitions`, `allocateDeductions` (reservas id-a-id por cópia), `effectiveInventory` (peças − reservas pendentes), `partitionByPreserved`, `needsReplan`. Salvar ×N reserva; a dedução real acontece só na confirmação do lote. Consumido por `calcReplication`/`saveLayout`/`selectGroup` em `Index.tsx`. | Para alterar o cálculo de repetições, as reservas do save ×N ou o gatilho de replanejamento. |
| `unique-per-sheet.ts` | Módulo **puro** da marcação `uniquePerSheet` (specs 009+010). **Spec 010 (EM USO no `runAllSheets`)**: `pickMarkedForSheet` (1ª linha marcada com estoque), `buildSheetInvExclusive` (≤1 marcada NO TOTAL por chapa, marcada PRIMEIRO = prioridade/primeiras chapas), `exclusiveSheetInvKey` (chave de cache da fatia exclusiva). `countMarkedOnSheet` conta via árvore (`extractLeafPieces`, Princípio IV). **Spec 009 (mantidas, FORA de uso no plano)**: `splitMarked`, `perSheetQty`, `capForSheet` (per-linha), `sheetInvKey`. Enforçado no `runAllSheets` de `Index.tsx` (montagem do `inv` + chave do cache); motor/WASM intocados. | Para alterar exclusividade/prioridade das marcadas ou a chave de cache do plano. |

## 4. Testes (`src/test/`)

Suíte de testes Vitest para garantir a estabilidade do motor.

| Arquivo | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `optimization.test.ts` | Testes de regressão para cenários de otimização complexos. | Para validar se mudanças no motor não quebraram o comportamento esperado. |
| `regroup-waste.test.ts` | Testes focados em reagrupamento de sobras e bugs específicos. | Para entender casos extremos (edge cases) e bugs resolvidos anteriormente. |
| `heuristics-benchmark.test.ts` | Harness de benchmark (spec 007): 5 cenários vs baseline em `fixtures/benchmark-baseline.json`; falha em regressão de aproveitamento/chapas e em não-determinismo. Regravar baseline: `RECORD_BASELINE=1`. | Antes de qualquer mudança que possa afetar aproveitamento; contrato em `specs/007-comparar-heuristicas/contracts/benchmark-contract.md`. |
| `ga-determinism.test.ts` | Garante GA reprodutível (PRNG semeado, spec 007): mesmo input 2× → planos idênticos. | Ao mexer em `genetic.ts`/`rng.ts` ou introduzir aleatoriedade. |
| `layout-replication.test.ts` | Contrato do módulo de replicação/replanejamento (spec 008, C1–C7) + invariante de conservação SC-001 no save ×N. | Ao mexer em `lots/layout-replication.ts` ou no fluxo de salvar layout com repetições. |
| `grouped-expansion.test.ts` | Invariantes INV-1..INV-4 da expansão de grupo rotulado (spec 012): contrato do PRODUTOR (P1-P5, cada membro casa com a medida do grupo) e do CONSUMIDOR (C1-C5, as 4 combinações eixo×rotação via `runPlacement`) + cenário-âncora. | Ao mexer em `grouping.ts`/`placement.ts` ou na expansão de qualquer grupo rotulado. |
| `wasm-parity.test.ts` | Rede TS↔WASM (spec 012): mesmo input ⇒ mesma contagem alocada + conservação + "nenhuma folha afirma medida inexistente" (multiset de medidas + igualdade de área). Carrega o pkg `--target web` no Node. | **ESTENDER ao mexer no motor** — compilar o Rust não é verificação; só este teste prova paridade. |

## 5. Documentação e Configuração (Raiz)

Arquivos na raiz do projeto que fornecem contexto adicional.

| Arquivo | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `package.json` | Dependências e scripts do projeto. | Para verificar bibliotecas instaladas ou comandos de build/teste. |
| `vite.config.ts` | Configuração do bundler Vite. | Para alterar configurações de build ou plugins. |

Utilize este mapa para direcionar suas buscas e leituras de arquivos, focando apenas no que é estritamente necessário para a tarefa em mãos.
