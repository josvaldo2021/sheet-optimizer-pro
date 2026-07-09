# Data Model — Seleção e Remoção de Peças no Layout

**Feature**: `004-selecionar-remover-pecas` | **Date**: 2026-07-09

Nenhuma entidade persistida nova. A feature introduz estruturas transitórias de
UI derivadas das entidades existentes do motor.

## Entidades existentes (referência)

- **`TreeNode`** (`src/lib/engine/types.ts`): árvore de corte. Campos relevantes:
  `id`, `tipo` (ROOT/X/Y/Z/W/Q/R), `valor`, `multi`, `filhos`, `label?`,
  `transposed?`. Invariante: folha = peça alocada; desperdício nunca é folha.
- **`PieceItem`** (inventário): `id`, `qty` (pendente), `w`, `h`, `label`,
  `priority?`. Itens com `qty <= 0` são removidos da lista ao salvar layout.

## Estruturas novas (transitórias, UI)

### `RemovedPiece`

Uma peça que deixa de existir no layout quando a subárvore selecionada é removida.
Produzida pelo diff de extração (antes/depois de `deleteNode` em clone).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `w` | `number` | Largura real da peça (contexto dos ancestrais aplicado) |
| `h` | `number` | Altura real da peça |
| `label` | `string?` | Etiqueta de vínculo com inventário; ausente em recorte manual |

Regras:
- Deriva exclusivamente da árvore (constituição IV); `multi` já expandido (um
  registro por peça física).
- `label` ausente ⇒ peça não afeta inventário na devolução.

### `RemovalPreview`

Calculado por `useMemo` a cada mudança de `selectedId`/`tree`; alimenta a barra
de seleção e o handler de remoção.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `nodeId` | `string` | Nó selecionado (`selectedId`), nunca `"root"` |
| `pieces` | `RemovedPiece[]` | Peças afetadas pela remoção da subárvore |
| `count` | `number` | `pieces.length` — exibido no botão ("Remover N peça(s)") |

Estados:
- `selectedId === "root"` ⇒ preview é `null` ⇒ barra de seleção oculta, remoção indisponível (FR-007).

### `SelectionInfo` (props do `SheetViewer`)

Dados exibidos na barra de seleção.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `tipo` | `NodeType` | Tipo do nó selecionado |
| `valor` | `number` | Dimensão do corte/peça |
| `label` | `string?` | Etiqueta exibida quando presente |
| `pieceCount` | `number` | Nº de peças afetadas (de `RemovalPreview.count`) |
| `dims` | `{w, h}?` | Dimensões da peça quando o nó selecionado é folha única |

## Transições de estado

```
Seleção:
  root ──clique em peça──▶ nó selecionado ──clique em outra peça──▶ outro nó
  nó selecionado ──Esc │ clique em área vazia │ remoção concluída──▶ root

Remoção (removeSelected):
  [selectedId !== "root"]
  1. preview = diff(tree, selectedId)            # RemovalPreview
  2. t = cloneTree(tree); deleteNode(t, selectedId)
  3. updateTreeAndChapas(t)                      # sincroniza chapa ativa se editando
  4. se editingExistingChapa:
       pieces = restorePiecesToInventory(pieces, preview.pieces com label)
  5. setSelectedId("root"); status de sucesso
```

## Regras de validação

- **RV-1**: remoção com `selectedId === "root"` é no-op silencioso (FR-007, cenário 3 da US1).
- **RV-2**: `count` do preview considera `multi` e sub-cortes aninhados (diff da árvore inteira garante isso).
- **RV-3**: devolução ao inventário só ocorre quando `editingExistingChapa === true` E a peça removida tem `label` vinculável; match por `label`, fallback por dimensões com rotação (`(w,h)` ou `(h,w)`); item inexistente (zerado e filtrado) é recriado — padrão de `returnLotToInventory`.
- **RV-4**: invariante SC-004 — para cada item de inventário: `alocadas(chapas salvas) + qty pendente === solicitado` antes e depois de qualquer remoção.
- **RV-5**: Delete/Backspace/Esc são ignorados quando o foco está em `INPUT`, `TEXTAREA` ou `[contenteditable]`.
