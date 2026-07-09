# Contrato de UI — Seleção e Remoção de Peças

**Feature**: `004-selecionar-remover-pecas` | **Date**: 2026-07-09

Contratos entre `Index.tsx` (orquestração/estado), `SheetViewer.tsx`
(apresentação) e `tree-utils.ts` (helpers puros).

## C1. Helpers puros (motor — `src/lib/engine/tree-utils.ts`)

```ts
/** Extrai todas as peças-folha da árvore com dimensões reais (contexto de
 *  ancestrais aplicado). IGNORA label (armadilha crítica nº 1). Expande multi. */
export function extractLeafPieces(tree: TreeNode): Array<{ w: number; h: number; label?: string }>;

/** Peças que deixam de existir se o nó `nodeId` for removido.
 *  Implementação: diff multiset de extractLeafPieces(tree) vs
 *  extractLeafPieces(cloneTree(tree) sem nodeId). Puro, sem efeitos. */
export function previewRemoval(tree: TreeNode, nodeId: string): Array<{ w: number; h: number; label?: string }>;
```

Pós-condições:
- `previewRemoval(tree, "root")` → lança ou retorna `[]` (chamador nunca invoca com root).
- Determinístico: mesmo `tree`+`nodeId` ⇒ mesmo resultado (constituição V).
- Não modifica `tree` (constituição II).

## C2. Devolução ao inventário (puro — pode viver em `src/lib/` ou junto do Index)

```ts
/** Retorna NOVO array de inventário com qty devolvida para cada peça removida
 *  que possua label. Match: label → dimensões (w,h)|(h,w). Recria item zerado.
 *  Peças sem label são ignoradas. Não muta `pieces`. */
export function restorePiecesToInventory(
  pieces: PieceItem[],
  removed: Array<{ w: number; h: number; label?: string }>,
): PieceItem[];
```

## C3. Props novas do `SheetViewer` (retrocompatíveis, opcionais)

```ts
interface SheetViewerProps {
  // ... props existentes inalteradas ...
  /** Dados da seleção atual; null/undefined ⇒ barra de seleção oculta. */
  selectionInfo?: {
    tipo: string;
    valor: number;
    label?: string;
    pieceCount: number;
    dims?: { w: number; h: number };
  } | null;
  /** Remoção da seleção atual. Ausente ⇒ botão não renderiza. */
  onRemoveSelected?: () => void;
  /** Sobe a seleção para o recorte pai. Passado apenas quando o pai não é a raiz. */
  onSelectParent?: () => void;
}
```

Comportamento contratado do `SheetViewer`:
- `selectionInfo` presente ⇒ renderiza barra de seleção (overlay no viewport da chapa) com tipo/valor, dims/label quando presentes, botão `⬆ Recorte pai` (quando `onSelectParent` presente) e botão `🗑 Remover {pieceCount} peça(s)`.
- Clique no fundo da chapa (fora de qualquer nó) ⇒ `onSelectNode("root")`.
- Clique repetido no nó já selecionado ⇒ o orquestrador (`handleSelectNode` em `Index.tsx`) sobe a seleção pela cadeia de ancestrais (peça → Z → Y → X → volta à peça), tornando recortes contêiner selecionáveis pelo layout.
- Clique em sobra/desperdício ⇒ seleciona o recorte que a contém: sobras internas (R/Q/W/Z) borbulham para o contêiner Q/W/Z/Y; a sobra mesclada no topo das colunas resolve a coluna X sob o cursor via segmentos (`yw-merged`), tornando colunas vazias diretamente selecionáveis. A SOBRA lateral direita (fora de qualquer corte) continua limpando a seleção.
- Nenhuma mudança de comportamento quando as props novas estão ausentes (usos existentes continuam compilando e funcionando).

## C4. Teclado (listener global em `Index.tsx`)

| Tecla | Pré-condição | Efeito |
| :--- | :--- | :--- |
| `Delete` / `Backspace` | foco fora de input/textarea/contenteditable E `selectedId !== "root"` | `removeSelected()` |
| `Escape` | foco fora de input/textarea/contenteditable | `setSelectedId("root")` |
| qualquer | foco em campo de texto | evento ignorado (comportamento nativo preservado) |

## C5. Handler unificado `removeSelected()` (Index.tsx)

- Chamado por: botão da barra de seleção, teclado (C4) e `processCommand("U")`.
- Sequência: preview → `cloneTree`+`deleteNode` → `updateTreeAndChapas` → devolução condicional (`editingExistingChapa`) → `setSelectedId("root")` → status.
- Garantia SC-002: `processCommand("U")` delega para este handler — impossibilidade estrutural de divergência entre caminhos.
- No-op quando `selectedId === "root"`.
