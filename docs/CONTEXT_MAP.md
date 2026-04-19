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
| `tree-utils.ts` | Utilitários para manipular a `TreeNode` (criar raiz, clonar, buscar nós). | Para operações genéricas na árvore de corte. |
| `normalization.ts` | Funções para limpar e normalizar a árvore após os cortes. | Para entender como sobras (W, Q, R) são consolidadas. |
| `post-processing.ts` | Lógica executada após a otimização principal (ex: `postOptimizeRegroup`). | Para ajustes finais no plano de corte. |

## 2. Interface do Usuário (`src/`)

A interface é construída em React e gerencia o estado da aplicação, além de renderizar os resultados visuais.

| Arquivo/Diretório | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `pages/Index.tsx` | Componente principal da página. Gerencia o estado global (chapas, peças, progresso). | Para entender o fluxo de dados entre a UI e o motor de otimização. |
| `components/SheetViewer.tsx` | Componente visual que renderiza a chapa e os cortes baseados na `TreeNode`. | Para alterar a forma como o plano de corte é desenhado na tela. |
| `components/SidebarSection.tsx` | Componentes da barra lateral (formulários de entrada, configurações). | Para adicionar novos campos de configuração ou alterar a entrada de dados. |
| `lib/cnc-engine.ts` | Arquivo de "barrel" (exportação centralizada) para o motor. | Para ver a API pública do motor consumida pela UI. |

## 3. Exportação e Relatórios (`src/lib/`)

Módulos responsáveis por gerar saídas do sistema.

| Arquivo | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `pdf-export.ts` | Geração de relatórios em PDF usando `jspdf`. | Para alterar o layout ou os dados incluídos no PDF final. |
| `excel-export.ts` | Exportação de dados para planilhas Excel usando `xlsx`. | Para modificar as colunas ou o formato do arquivo Excel gerado. |
| `layout-utils.ts` | Utilitários para agrupar layouts idênticos. | Para entender como chapas repetidas são consolidadas nos relatórios. |

## 4. Testes (`src/test/`)

Suíte de testes Vitest para garantir a estabilidade do motor.

| Arquivo | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `optimization.test.ts` | Testes de regressão para cenários de otimização complexos. | Para validar se mudanças no motor não quebraram o comportamento esperado. |
| `regroup-waste.test.ts` | Testes focados em reagrupamento de sobras e bugs específicos. | Para entender casos extremos (edge cases) e bugs resolvidos anteriormente. |

## 5. Documentação e Configuração (Raiz)

Arquivos na raiz do projeto que fornecem contexto adicional.

| Arquivo | Responsabilidade Principal | Quando Consultar |
| :--- | :--- | :--- |
| `package.json` | Dependências e scripts do projeto. | Para verificar bibliotecas instaladas ou comandos de build/teste. |
| `vite.config.ts` | Configuração do bundler Vite. | Para alterar configurações de build ou plugins. |

Utilize este mapa para direcionar suas buscas e leituras de arquivos, focando apenas no que é estritamente necessário para a tarefa em mãos.
