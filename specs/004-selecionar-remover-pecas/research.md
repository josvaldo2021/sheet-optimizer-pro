# Research — Seleção e Remoção de Peças no Layout

**Feature**: `004-selecionar-remover-pecas` | **Date**: 2026-07-09

Nenhum NEEDS CLARIFICATION restou na spec; a pesquisa consistiu em levantar o
comportamento atual do código para ancorar as decisões de design.

## R1. Estado atual da seleção

**Descoberta**: seleção já existe e funciona.

- `Index.tsx:52` — `const [selectedId, setSelectedId] = useState("root")`.
- `SheetViewer.tsx` — todo nó renderizado recebe `onClick` → `onSelectNode(id)` e classe `sv-selected` quando `selectedId === n.id` (linhas 197-498).
- O painel lateral de árvore (`renderActionTree`, Index.tsx:1490+) também seleciona nós e marca o ativo.

**Decisão**: não criar novo mecanismo de seleção; reutilizar `selectedId` e melhorar o feedback (barra de seleção + destaque). Seleção única, como já é.

**Alternativas consideradas**: seleção múltipla (rejeitada — fora do escopo da spec, assunção registrada); estado de seleção separado por chapa (rejeitada — `selectedId` já é resetado ao trocar de chapa/layout).

## R2. Estado atual da remoção

**Descoberta**: remoção existe apenas via comando de texto `U` na `CommandBar`.

- `Index.tsx:138-145` — `processCommand("U")`: `cloneTree` → `deleteNode(t, selectedId)` → `updateTreeAndChapas(t)` → `setSelectedId("root")`. Sem efeito quando `selectedId === "root"`.
- `deleteNode` (`tree-utils.ts:68-74`) remove o nó e toda a subárvore, em qualquer profundidade.
- O placeholder do input chama o comando de "U (UNDO)" — nome enganoso: é *remover nó selecionado*, não desfazer.
- Não há botão visível, tecla de atalho, nem confirmação/preview.

**Decisão**: extrair a sequência para um handler único `removeSelected()` usado pelo botão, pelo teclado e pelo comando `U` (garante SC-002 por construção). Ajustar o texto do placeholder para não chamar `U` de "UNDO".

**Alternativas consideradas**: implementar undo real (rejeitada — fora do escopo, assunção da spec); confirmação por dialog (rejeitada — spec assume contagem informativa em vez de dialog).

## R3. Ciclo de vida do inventário (`pieces`)

**Descoberta**: o inventário NÃO é deduzido quando uma peça entra no layout em edição; a dedução acontece só em pontos discretos:

- `saveLayout` (Index.tsx:1117-1135) — deduz por dimensões (com rotação) e **remove itens com `qty <= 0` da lista**.
- Fluxos de otimização — grupos carregam `deductions: Array<{id, qty}>`.
- `returnLotToInventory` (Index.tsx:1158+) — padrão existente de devolução: procura item por dimensões (ambas orientações) e recria o item quando não existe mais.

**Implicação**: remover peça de um layout **ainda não salvo** não deve tocar o inventário (nada foi deduzido). Remover peça de **chapa salva reaberta** (`editingExistingChapa === true`, Index.tsx:118) deve devolver quantidades, senão a contagem "alocadas + pendentes = solicitadas" (SC-004) quebra.

**Decisão**: devolução condicionada a `editingExistingChapa`; função pura `restorePiecesToInventory` seguindo o padrão de `returnLotToInventory` (match por label quando houver, fallback dimensões com rotação, recriação de item zerado).

**Alternativas consideradas**: deduzir/devolver a cada inserção/remoção em tempo real (rejeitada — mudaria o modelo mental de todo o app e o contrato de `saveLayout`); nunca devolver (rejeitada — viola FR-009/SC-004).

## R4. Contagem de peças afetadas pela remoção

**Descoberta**: as dimensões de uma peça-folha dependem de ancestrais (ex.: folha Y tem largura do X pai), então extrair peças apenas da subárvore selecionada produz dimensões erradas. Já existe extração correta com contexto de pais: `extractUsedPiecesWithContext(node, requireLabel)` local do `Index.tsx:206+`.

**Armadilhas do CLAUDE.md aplicáveis**: (1) funções que checam `n.label` retornam 0 para peças não rotuladas — contagem deve ignorar label; (4) folhas sempre são peças alocadas, desperdício nunca é folha (tipos folha: Y/Z/W/Q sem filhos, R sempre).

**Decisão**: calcular peças removidas por **diff de extrações da árvore inteira** (antes vs. depois de `deleteNode` simulado em clone). Deriva 100% da árvore (constituição IV), lida com `multi` e com sub-cortes aninhados sem lógica especial.

**Alternativas consideradas**: contar folhas × multi só na subárvore (rejeitada para devolução — dimensões dependem de ancestrais; aceitável só para contagem, mas o diff resolve os dois casos com um mecanismo); marcar nós com metadados de origem (rejeitada — muda o `TreeNode`, toca o motor sem necessidade).

## R5. Tratamento de teclado em SPA React

**Descoberta**: não há nenhum listener global de teclado hoje (`addEventListener`/`onKeyDown` só no input da `CommandBar`, que usa `autoFocus`). Risco principal: Backspace/Delete durante digitação no input de comando ou nos formulários da sidebar.

**Decisão**: listener `keydown` no `document` via `useEffect` em `Index.tsx`, com guarda: ignorar evento quando `document.activeElement` for `INPUT`, `TEXTAREA` ou elemento `contenteditable`. `Escape` fora de inputs limpa a seleção; dentro do input mantém o comportamento atual (fecha sugestões).

**Alternativas consideradas**: `onKeyDown` no container do `SheetViewer` com `tabIndex` (rejeitada — exige foco no viewer, quebra o fluxo "clicar na peça e apertar Delete" quando o foco está em outro lugar); biblioteca de hotkeys (rejeitada — dependência nova para dois atalhos).
