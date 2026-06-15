# Tasks: Selecionar Chapas ao Confirmar o Plano

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## T001 — Módulo puro de seleção/dedução [P1, FR-003/FR-004/FR-008]
Criar `src/lib/lots/lot-selection.ts`:
- `selectedAutoChapas(chapas)` → chapas com `!manual && selected !== false`.
- `applyDeductions(pieces, chapas)` → novo inventário deduzindo as `deductions`.
- `countSelectedAuto(chapas)` e `countAuto(chapas)` para o contador da UI.
**Done**: funções puras exportadas e tipadas.

## T002 — Testes do módulo [P1, SC-001/SC-003/SC-004]
Criar `src/test/lot-selection.test.ts` com chapas sintéticas + `deductions`:
- selecionar subconjunto deduz só as peças dele (SC-004);
- todas selecionadas = comportamento atual (SC-003);
- contagem de selecionadas/total correta.
**Done**: `npm test` verde.

## T003 — Estado `selected` por chapa [P1, FR-002]
Em `Index.tsx`: adicionar `selected?: boolean` ao tipo das chapas; iniciar `true`
ao gerar o plano (`setChapas(best...)`). Handlers `setChapaSelected(idx, val)` e
`setGroupSelectedCount(indices, n)`.
**Done**: estado existe e default = todas marcadas.

## T004 — confirmAutoPlan parcial [P1, FR-003/FR-004/FR-005/FR-006/FR-008]
Refatorar `confirmAutoPlan` para usar os helpers: lote só com selecionadas, deduz
só elas, marca só elas como `manual`; as não selecionadas continuam auto (FR-005).
Bloquear quando nenhuma selecionada (FR-006).
**Done**: confirmação parcial cria lote correto; restantes permanecem.

## T005 — UI de seleção [P1/P2, FR-001/FR-007]
`LayoutSummary`: checkbox por grupo + "N de ×M" quando `count>1`.
`OptimizationPanel`/botão: texto "Confirmar N de M chapas" e desabilitar com 0.
**Done**: dá para marcar/desmarcar e ver a contagem antes de confirmar.

## T006 — Verificação
`npx tsc --noEmit` limpo, `npm test` verde, conferir SC-001..SC-005.
