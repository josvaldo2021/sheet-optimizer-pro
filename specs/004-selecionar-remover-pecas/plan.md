# Implementation Plan: Seleção e Remoção de Peças no Layout

**Branch**: `004-selecionar-remover-pecas` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-selecionar-remover-pecas/spec.md`

## Summary

Hoje a remoção de uma peça do layout exige: (1) clicar na peça no `SheetViewer` (seleção já existe via `selectedId`/`onSelectNode`) e (2) digitar o comando de texto `U` na `CommandBar` — fluxo não descobrível. A feature adiciona caminhos visíveis sobre a mecânica de remoção existente (`deleteNode` + `updateTreeAndChapas`): uma barra de seleção com informações da peça e botão "Remover N peça(s)", atalhos de teclado (Delete/Backspace remove, Esc desseleciona), clique em área vazia desseleciona, e devolução de quantidades ao inventário quando a chapa editada já teve peças deduzidas. Nenhuma mudança em algoritmo de otimização ou na estrutura da árvore.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18

**Primary Dependencies**: Vite, Tailwind CSS + shadcn/ui (não tocar `src/components/ui/**`)

**Storage**: N/A (estado em memória React; sem persistência)

**Testing**: vitest (`npm test`), `npx tsc --noEmit`

**Target Platform**: SPA web (navegadores desktop modernos)

**Project Type**: Web app single-project (`src/`)

**Performance Goals**: preview de remoção (contagem de peças afetadas) recalculado a cada mudança de seleção sem lag perceptível (<16ms; árvores têm dezenas de nós)

**Constraints**: remoção estrutural idêntica ao comando `U` existente (mesmo `deleteNode`); teclado não pode interceptar digitação em campos de texto; motor (`src/lib/engine/**`) permanece puro

**Scale/Scope**: 2 componentes de UI (`Index.tsx`, `SheetViewer.tsx`), 1 helper puro no motor, ~1 arquivo de teste novo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação | Status |
| :--- | :--- | :--- |
| I. Corte Guilhotina é Lei Física | Remoção reutiliza `deleteNode` (remove subárvore inteira); a árvore resultante continua guilhotinada por construção. Nenhum corte novo é criado. | ✅ PASS |
| II. Motor Puro e Agnóstico de UI | Único acréscimo ao motor é um helper puro de extração/diff de peças (dados → dados, sem I/O). Toda a interação (teclado, botão, seleção) fica na UI. | ✅ PASS |
| III. Qualidade do Corte é Objetivo Primário | Nenhuma mudança em otimizador, agrupamento ou estratégias. `useGrouping` intocado. | ✅ PASS |
| IV. A Árvore de Corte é a Fonte da Verdade | Contagem de peças afetadas e devolução ao inventário derivam de **diff de extrações da árvore** (antes/depois da remoção simulada), nunca de set-difference com inventário original. Contagem ignora `label`; devolução usa `label` apenas para vincular ao item de inventário. | ✅ PASS |
| V. Determinismo e Cobertura de Testes | Lógica nova (diff de peças, devolução ao inventário) extraída em funções puras testadas em vitest. Sem aleatoriedade. | ✅ PASS |
| VI. Paridade TypeScript ↔ WASM | Edição manual da árvore é recurso exclusivo da UI TS (não passa pelo otimizador nem pela ponte WASM). Nenhuma mudança de comportamento do motor de otimização. | ✅ PASS (N/A) |

**Pós-Phase 1 (re-check)**: design mantém motor puro (helper `extractPiecesFromSubtreeDiff` é função pura em `tree-utils.ts` ou módulo novo); nenhuma violação introduzida. ✅

## Project Structure

### Documentation (this feature)

```text
specs/004-selecionar-remover-pecas/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-selection-removal.md   # Contrato de interação da UI
└── tasks.md             # Phase 2 output (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/
├── pages/
│   └── Index.tsx                 # [EDITAR] handler removeSelected, listener de teclado,
│                                 #   preview de remoção (useMemo), devolução ao inventário
├── components/
│   └── SheetViewer.tsx           # [EDITAR] barra de seleção (info + botão Remover),
│                                 #   clique em área vazia desseleciona; novas props opcionais
├── features/command-bar/
│   └── CommandBar.tsx            # [SEM MUDANÇA] comando "U" continua funcionando
├── lib/engine/
│   └── tree-utils.ts             # [EDITAR] helper puro: extração de peças-folha p/ diff
├── index.css                     # [EDITAR se necessário] reforço do estilo .sv-selected
└── test/
    └── remove-piece.test.ts      # [NOVO] testes das funções puras (diff + devolução)
```

**Structure Decision**: single-project SPA existente; a feature é 100% incremental sobre `Index.tsx` (estado/orquestração), `SheetViewer.tsx` (apresentação) e `tree-utils.ts` (helper puro). Nada em `src/components/ui/**` é modificado.

## Design Overview

### D1. Mecânica de remoção (inalterada, reutilizada)

O caminho `U` atual em `processCommand` (Index.tsx:138-145) faz: `cloneTree` → `deleteNode(t, selectedId)` → `updateTreeAndChapas(t)` → `setSelectedId("root")`. Um novo handler `removeSelected()` executa **exatamente a mesma sequência** (extraída para função compartilhada para garantir SC-002: zero divergência entre os dois caminhos), acrescida de:

1. **Preview/contagem** — antes de remover, calcular peças afetadas via diff de extração (D3).
2. **Devolução ao inventário** — quando aplicável (D4).
3. **Status** — mensagem de sucesso na `CommandBar` (ex.: `"3 peça(s) removida(s)"`).

`processCommand("U")` passa a delegar para `removeSelected()` — um único código para os dois caminhos.

### D2. Superfície de UI

- **Barra de seleção** (nova, em `SheetViewer`): quando `selectedId !== "root"`, exibir overlay fixo no topo do viewport da chapa com: tipo+valor do nó, dimensões da peça (quando folha), `label` (se houver), contagem de peças da subárvore, botão **"🗑 Remover N peça(s)"** e botão/hint **"Esc para desselecionar"**. Props novas (opcionais, retrocompatíveis): `selectionInfo?: SelectionInfo | null` e `onRemoveSelected?: () => void`.
- **Teclado** (listener global via `useEffect` em `Index.tsx`, `keydown` no `document`):
  - `Delete`/`Backspace` → `removeSelected()` se `selectedId !== "root"`.
  - `Escape` → `setSelectedId("root")`.
  - **Guarda obrigatória**: ignorar quando `document.activeElement` for `input`, `textarea` ou `[contenteditable]` (a `CommandBar` tem `autoFocus`; Esc dentro do input continua fechando sugestões como hoje).
- **Desselecionar por clique**: clique no fundo da chapa (área da chapa fora de qualquer peça/nó) → `onSelectNode("root")`.
- **Destaque de seleção**: manter `.sv-selected`; reforçar visualmente (contorno + preenchimento) se o estilo atual for sutil demais — validação manual no quickstart.

### D3. Contagem de peças afetadas (FR-005) — diff pela árvore

Dimensões de uma peça-folha dependem de ancestrais (valor do X para altura de folha Y etc.), então extrair peças **só da subárvore** é insuficiente. Estratégia (constituição IV):

```
preview(tree, selectedId):
  before = extractLeafPieces(tree)          # ignora label; respeita multi
  t2 = cloneTree(tree); deleteNode(t2, selectedId)
  after = extractLeafPieces(t2)
  removed = multisetDiff(before, after)     # [{w, h, label?}, ...]
```

`extractLeafPieces` é o novo helper puro (mesma semântica do `extractUsedPiecesWithContext(node, requireLabel=false)` local do `Index.tsx`, movido/exposto como função pura reutilizável). Recalculado em `useMemo` a cada mudança de `selectedId`/`tree` — árvores manuais têm dezenas de nós, custo desprezível.

**Armadilha coberta**: folhas sempre são peças alocadas (nunca desperdício); tipos folha Y/Z/W/Q sem filhos e R sempre. Contagem NÃO filtra por `label` (armadilha crítica nº 1 do CLAUDE.md).

### D4. Devolução ao inventário (US3)

Fato do fluxo atual: o inventário (`pieces`) só é deduzido em `saveLayout` (Index.tsx:1117-1135) ou nos fluxos de otimização (grupos com `deductions`). Portanto:

| Contexto da remoção | Inventário já deduzido? | Ação |
| :--- | :--- | :--- |
| Layout novo em edição (`editingExistingChapa === false`) | Não | Nenhuma (nada a devolver) |
| Chapa salva reaberta (`editingExistingChapa === true`) | Sim | Devolver: para cada peça removida **com label** vinculável, `qty++` no item correspondente; recriar o `PieceItem` se ele foi filtrado ao zerar (padrão já existente em `returnLotToInventory`, Index.tsx:1158+) |
| Peça sem label / recorte manual | N/A | Só atualiza layout (assunção da spec) |

Lógica extraída em função pura `restorePiecesToInventory(pieces: PieceItem[], removed: RemovedPiece[]): PieceItem[]` (testável em vitest; casamento por label primeiro, fallback por dimensões com rotação — mesmo critério de `returnLotToInventory`).

### D5. O que NÃO muda

- `CommandBar` e comando `U` (FR-010) — apenas o corpo de `processCommand("U")` delega ao handler comum.
- Motor de otimização, `placement.ts`, `genetic.ts`, ponte WASM.
- `src/components/ui/**`.

## Complexity Tracking

Sem violações da constituição — tabela não aplicável.
