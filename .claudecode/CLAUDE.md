# Instruções para o Claude Code (ou qualquer IA)

Este arquivo contém instruções de alto nível para garantir que as interações com o projeto **Sheet Optimizer Pro** sejam eficientes e sigam os padrões estabelecidos.

## 1. Onboarding Rápido

Sempre que iniciar uma nova sessão ou tarefa complexa, leia primeiro os seguintes arquivos para obter o contexto necessário sem precisar ler todo o código-fonte:

1.  `AI_CONTEXT.md`: Entendimento da arquitetura, motor de otimização e regras de negócio.
2.  `CONTEXT_MAP.md`: Localização rápida de arquivos e responsabilidades.
3.  `ALGORITHM_IMPROVEMENTS.md` e `BUG ARVORE.MD`: Conhecimento de melhorias recentes e bugs conhecidos.

## 2. Padrões de Código

*   **TypeScript:** Use tipagem estrita sempre que possível. Consulte `src/lib/engine/types.ts` para os tipos principais.
*   **Imutabilidade:** Ao manipular a árvore de corte (`TreeNode`), prefira funções puras e retorne novos objetos (use `cloneTree` de `tree-utils.ts` se necessário).
*   **Componentes React:** Use componentes funcionais com Hooks. Prefira os componentes do `shadcn/ui` localizados em `src/components/ui/`.
*   **Testes:** Ao modificar o motor de otimização, execute os testes com `npm test` para garantir que não houve regressões.

## 3. Estrutura da Árvore de Corte (`TreeNode`)

A árvore segue a lógica de corte guilhotina. Lembre-se da hierarquia e do significado de cada nó como uma **coordenada de corte** ou **nível de alocação**:
`ROOT` -> `X` (Coordenada de corte horizontal) -> `Y` (Coordenada de corte vertical) -> `Z` (Coordenada de alocação de peça) / `W` (Coordenada de alocação de desperdício) / `Q` (Coordenada de alocação de sobra) / `R` (Coordenada de alocação de refugo).

**Exemplo:** Uma peça de 1000x1000 é alocada através de uma sequência de coordenadas de corte, como um nó `X` com `valor: 1000` e um nó `Y` com `valor: 1000` em níveis sucessivos da árvore, culminando em um nó `Z` que representa a peça final.

## 4. Como Economizar Tokens

*   Não peça para ler arquivos de componentes de UI (`src/components/ui/`) a menos que precise modificá-los. Eles são componentes padrão do shadcn.
*   Ao depurar o motor de otimização, foque nos arquivos listados na Seção 1 do `CONTEXT_MAP.md`.
*   Use o comando `python3 .claudecode/generate_context_summary.py` para obter um resumo rápido do contexto se necessário.

---
*Autor: Manus AI*
