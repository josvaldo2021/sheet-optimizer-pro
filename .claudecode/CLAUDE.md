# Instruções para o Claude Code (ou qualquer IA)

Este arquivo contém instruções de alto nível para garantir que as interações com o projeto **Sheet Optimizer Pro** sejam eficientes e sigam os padrões estabelecidos.

## 1. Onboarding Rápido

Sempre que iniciar uma nova sessão ou tarefa complexa, leia primeiro os seguintes arquivos para obter o contexto necessário sem precisar ler todo o código-fonte:

1.  `docs/AI_CONTEXT.md`: Entendimento da arquitetura, motor de otimização e regras de negócio.
2.  `docs/CONTEXT_MAP.md`: Localização rápida de arquivos e responsabilidades.
3.  `docs/ALGORITHM_IMPROVEMENTS.md` e `docs/bugs/bug_arvore.md`: Conhecimento de melhorias recentes e bugs conhecidos.
4.  `docs/bugs/`: Pasta com documentação de bugs conhecidos (aproveitamento, distância de quebra, etc.).

## 2. Padrões de Código

*   **TypeScript:** Use tipagem estrita sempre que possível. Consulte `src/lib/engine/types.ts` para os tipos principais.
*   **Imutabilidade:** Ao manipular a árvore de corte (`TreeNode`), prefira funções puras e retorne novos objetos (use `cloneTree` de `tree-utils.ts` se necessário).
*   **Componentes React:** Use componentes funcionais com Hooks. Feature components ficam em `src/features/` (sheet-setup, piece-list, optimization, lots, command-bar). Componentes visuais reutilizáveis ficam em `src/components/`. UI base (shadcn) em `src/components/ui/`.
*   **Testes:** Ao modificar o motor de otimização, execute os testes com `npm test` para garantir que não houve regressões.

## 3. Estrutura da Árvore de Corte (`TreeNode`)

A árvore segue a lógica de corte guilhotina. Lembre-se da hierarquia e do significado de cada nó como uma **coordenada de corte** ou **nível de alocação**:
`ROOT` -> `X` (Executa um corte na vertical) -> `Y` (Executa um corte na horizontal dentro do espaço criado pelo corte X) -> `Z` (Executa um corte na vertical dentro do espaço criado pelo corte Y) / `W` (Executa um corte na horizontal dentro do espaço criado pelo corte Z) / `Q` (Executa um corte na vertical dentro do espaço criado pelo corte Z) / `R` (Executa um corte na horizontal dentro do espaço criado pelo corte R).

**Exemplo:** Uma peça de 1000x1000 é alocada através de uma sequência de coordenadas de corte, como um nó `X` com `valor: 1000` e um nó `Y` com `valor: 1000`.

## 4. Como Economizar Tokens

*   Não peça para ler arquivos de componentes de UI (`src/components/ui/`) a menos que precise modificá-los. Eles são componentes padrão do shadcn.
*   Ao depurar o motor de otimização, foque nos arquivos listados na Seção 1 do `docs/CONTEXT_MAP.md`.
*   Utilitários de exportação (PDF, Excel, layout-utils) estão em `src/lib/export/`.
*   Fixtures de teste (.xlsx, dados de bugs) estão em `src/test/fixtures/`.
*   Use o comando `python3 .claudecode/generate_context_summary.py` para obter um resumo rápido do contexto se necessário.

---
*Autor: Manus AI*
