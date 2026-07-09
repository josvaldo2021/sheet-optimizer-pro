# Tasks: Seleção e Remoção de Peças no Layout

**Input**: Design documents from `specs/004-selecionar-remover-pecas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-selection-removal.md, quickstart.md

**Tests**: INCLUÍDOS — a constituição (Princípio V) exige cobertura vitest para toda mudança no motor; os helpers `extractLeafPieces`/`previewRemoval` são mudanças em `src/lib/engine/`.

**Organization**: Tarefas agrupadas por user story para permitir implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 (remoção visível), US2 (feedback de seleção), US3 (inventário)

## Path Conventions

Single project SPA: código em `src/`, testes em `src/test/` (vitest).

---

## Phase 1: Setup

**Purpose**: Garantir baseline verde antes de qualquer mudança (projeto já existe; sem scaffolding).

- [X] T001 Rodar `npm test` e `npx tsc --noEmit` e confirmar baseline verde; anotar qualquer falha pré-existente para não atribuí-la à feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Helpers puros do motor usados por todas as user stories (contagem/diff de peças derivada da árvore — constituição IV).

**⚠️ CRITICAL**: US1 (status/contagem), US2 (contador no botão) e US3 (devolução) dependem destes helpers.

- [X] T002 Implementar `extractLeafPieces(tree: TreeNode)` puro em `src/lib/engine/tree-utils.ts`: percorre a árvore com contexto de ancestrais (dimensão da folha depende do X/Y/Z/W pai), IGNORA `label` (armadilha crítica nº 1 do CLAUDE.md), expande `multi`, considera folhas Y/Z/W/Q sem filhos e R sempre; usar como referência a lógica de `extractUsedPiecesWithContext` em `src/pages/Index.tsx:206+` com `requireLabel=false`
- [X] T003 Implementar `previewRemoval(tree: TreeNode, nodeId: string)` puro em `src/lib/engine/tree-utils.ts`: `cloneTree` → `deleteNode(clone, nodeId)` → diff multiset de `extractLeafPieces(tree)` vs `extractLeafPieces(clone)` → retorna `Array<{w, h, label?}>`; não muta `tree` (contrato C1)
- [X] T004 Exportar `extractLeafPieces` e `previewRemoval` no barrel `src/lib/cnc-engine.ts`
- [X] T005 Criar `src/test/remove-piece.test.ts` com testes vitest de `extractLeafPieces` e `previewRemoval`: contagem com `multi`, subárvore com sub-cortes aninhados (remover X remove peças dos Y/Z internos), peças sem label contadas, remoção de folha simples, desperdício nunca contado, `tree` de entrada não mutada

**Checkpoint**: `npm test` verde com os testes novos — user stories podem começar

---

## Phase 3: User Story 1 - Remover peça selecionada por ação visível (Priority: P1) 🎯 MVP

**Goal**: Remover peça clicada via botão visível ou tecla Delete/Backspace, sem comando de texto; comando `U` passa a delegar ao mesmo handler (SC-002).

**Independent Test**: Cenários V1, V2 e V5 do quickstart.md — montar layout, clicar numa peça, remover pelo botão e pela tecla; digitar `U` produz resultado idêntico; Backspace dentro de campo de texto não remove nada.

### Implementation for User Story 1

- [X] T006 [US1] Extrair handler unificado `removeSelected()` em `src/pages/Index.tsx`: no-op se `selectedId === "root"`; senão `previewRemoval` (para contagem no status) → `cloneTree` + `deleteNode` → `updateTreeAndChapas` → `setSelectedId("root")` → `setStatus("N peça(s) removida(s)")`; fazer `processCommand("U")` (Index.tsx:138-145) delegar para este handler (contrato C5)
- [X] T007 [US1] Adicionar props opcionais `selectionInfo?: SelectionInfo | null` e `onRemoveSelected?: () => void` à interface `SheetViewerProps` e renderizar barra de seleção (overlay fixo no topo do viewport da chapa) com botão `🗑 Remover N peça(s)` quando `selectionInfo` presente, em `src/components/SheetViewer.tsx`; comportamento inalterado quando props ausentes (contrato C3)
- [X] T008 [US1] Em `src/pages/Index.tsx`, calcular `RemovalPreview`/`SelectionInfo` via `useMemo` sobre `tree`+`selectedId` (null quando `selectedId === "root"` — FR-007) e passar `selectionInfo` + `onRemoveSelected={removeSelected}` ao `<SheetViewer>` (uso na linha ~1627)
- [X] T009 [US1] Adicionar listener global `keydown` via `useEffect` em `src/pages/Index.tsx`: `Delete`/`Backspace` → `removeSelected()`; guarda obrigatória: ignorar quando `document.activeElement` for `INPUT`, `TEXTAREA` ou `[contenteditable]` (RV-5, contrato C4)
- [X] T010 [P] [US1] Corrigir placeholder do input em `src/features/command-bar/CommandBar.tsx:77`: `U` descrito como "remover seleção", não "UNDO"

**Checkpoint**: US1 completa — remoção descobrível funcionando de ponta a ponta (MVP)

---

## Phase 4: User Story 2 - Feedback claro do que está selecionado (Priority: P2)

**Goal**: Usuário sempre sabe o que está selecionado (destaque + info da peça + contagem de afetadas) e consegue desselecionar por Esc ou clique em área vazia.

**Independent Test**: Cenário V3 do quickstart.md — clicar em peças diferentes migra o destaque e as infos; recorte com `multi`/sub-cortes informa total de peças; Esc e clique no fundo limpam a seleção.

### Implementation for User Story 2

- [X] T011 [US2] Enriquecer a barra de seleção em `src/components/SheetViewer.tsx`: exibir tipo+valor do nó, dimensões `w×h` quando folha única, `label` quando presente, contagem destacada no botão ("Remover 3 peça(s)") e hint "Esc para desselecionar" (dados já vêm de `selectionInfo` — FR-004/FR-005)
- [X] T012 [US2] Completar `SelectionInfo` no `useMemo` de `src/pages/Index.tsx`: `dims` quando o nó selecionado é folha (via `findNode` + contexto do pai), `label` do nó ou descendente único, `pieceCount` de `previewRemoval`
- [X] T013 [US2] Estender o listener de teclado em `src/pages/Index.tsx`: `Escape` fora de campos de texto → `setSelectedId("root")` (comportamento do Esc dentro do input da CommandBar preservado — fecha sugestões)
- [X] T014 [US2] Clique no fundo da chapa (área fora de qualquer nó) → `onSelectNode("root")` em `src/components/SheetViewer.tsx`, com `stopPropagation` já existente nos nós garantindo que clique em peça não borbulhe
- [X] T015 [P] [US2] Verificar e reforçar o estilo `.sv-selected` em `src/index.css` (contorno + preenchimento perceptíveis; validar contraste sobre peças brancas `PIECE_BG`)

**Checkpoint**: US1 e US2 funcionam de forma independente — seleção inequívoca

---

## Phase 5: User Story 3 - Consistência do inventário após remoção (Priority: P3)

**Goal**: Remoção em chapa salva reaberta devolve quantidades ao inventário (peças com label, incluindo sub-cortes removidos juntos); layout não salvo não toca o inventário.

**Independent Test**: Cenário V4 do quickstart.md — salvar layout (deduz), reabrir chapa, remover peça etiquetada → qty pendente aumenta; item zerado reaparece; remoção em layout novo não altera inventário.

### Implementation for User Story 3

- [X] T016 [P] [US3] Criar função pura `restorePiecesToInventory(pieces: PieceItem[], removed: Array<{w, h, label?}>): PieceItem[]` em `src/lib/inventory-utils.ts` (novo): match por `label` primeiro, fallback dimensões com rotação `(w,h)|(h,w)`, recria item zerado/filtrado, ignora peças sem label, não muta entrada (contrato C2; padrão de `returnLotToInventory` em `src/pages/Index.tsx:1158+`)
- [X] T017 [P] [US3] Estender `src/test/remove-piece.test.ts` com testes de `restorePiecesToInventory`: devolução por label, fallback com rotação, recriação de item zerado, peça sem label ignorada, multiplicidade (N peças removidas → qty +N), imutabilidade da entrada
- [X] T018 [US3] Integrar em `removeSelected()` em `src/pages/Index.tsx`: quando `editingExistingChapa === true`, aplicar `setPieces(restorePiecesToInventory(pieces, preview))` com as peças do `previewRemoval`; layout novo (`editingExistingChapa === false`) não altera inventário (RV-3/RV-4, tabela D4 do plan.md)

**Checkpoint**: Todas as user stories independentes e funcionais — SC-004 válido

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação final e portões de qualidade da constituição.

- [X] T019 Executar os cenários manuais V1–V6 do `specs/004-selecionar-remover-pecas/quickstart.md` com `npm run dev` (inclui casos extremos: última peça da chapa, subárvore inteira, chapa de grupo de otimização)
- [X] T020 Rodar portões finais: `npm test` verde e `npx tsc --noEmit` limpo (fluxo de desenvolvimento da constituição)
- [X] T021 [P] Atualizar `docs/CONTEXT_MAP.md` (linha do `SheetViewer.tsx`/`tree-utils.ts`) mencionando barra de seleção e helpers `extractLeafPieces`/`previewRemoval`, mantendo concisão (restrição "economia de contexto" da constituição)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende de T001 — BLOQUEIA todas as user stories (helpers usados por US1/US2/US3)
- **US1 (Phase 3)**: depende da Phase 2; nenhuma dependência de outra story
- **US2 (Phase 4)**: depende da Phase 2; T011/T012 estendem artefatos criados em T007/T008 (barra de seleção) — implementar após US1 ou coordenar edições no mesmo arquivo
- **US3 (Phase 5)**: depende da Phase 2; T018 integra no handler criado em T006 (US1)
- **Polish (Phase 6)**: depende de todas as stories desejadas

### Task-level Dependencies

- T003 ← T002; T004 ← T002+T003; T005 ← T002+T003
- T006 ← T003 (usa `previewRemoval`); T007 independente de T006; T008 ← T006+T007; T009 ← T006; T010 independente
- T011 ← T007; T012 ← T008; T013 ← T009; T014/T015 independentes entre si
- T016/T017 independentes entre si; T018 ← T006+T016

### Parallel Opportunities

- Phase 2: T002 [P] pode começar junto com nada mais (T003-T005 dependem dela); T005 paraleliza com T004
- US1: T010 [P] paraleliza com qualquer tarefa (arquivo próprio `CommandBar.tsx`)
- US2: T015 [P] (`index.css`) paraleliza com T011-T014
- US3: T016 [P] e T017 [P] paralelizáveis entre si e com US2 (arquivos novos/distintos)
- Polish: T021 [P] paraleliza com T019/T020

## Parallel Example: User Story 3

```bash
# Arquivos distintos, sem dependência mútua:
Task: "Criar restorePiecesToInventory em src/lib/inventory-utils.ts"        # T016
Task: "Testes de restorePiecesToInventory em src/test/remove-piece.test.ts" # T017
# Em paralelo com US2 (T011-T015), se desejado
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline) → Phase 2 (helpers puros + testes)
2. Phase 3 (US1): botão de remover + Delete/Backspace + `U` unificado
3. **STOP e VALIDAR**: cenários V1/V2/V5 do quickstart — remoção descobrível já resolve a dor central
4. Demo/entrega possível aqui

### Incremental Delivery

1. + US2 → seleção inequívoca (V3) → entrega
2. + US3 → inventário consistente (V4) → entrega
3. Polish → portões da constituição + docs

### Observação sobre conflitos de arquivo

`Index.tsx` e `SheetViewer.tsx` são tocados pelas três stories; ao trabalhar em paralelo, coordenar edições (as tarefas foram fatiadas para que cada uma toque seções distintas: handler, useMemo, listener, overlay).

---

## Notes

- Total: 21 tarefas (T001–T021)
- Constituição: motor permanece puro (T002-T004 são funções dados→dados); contagem/devolução derivam da árvore, nunca de set-difference com inventário original
- Commit após cada tarefa ou grupo lógico; parar em qualquer checkpoint para validar a story de forma independente
