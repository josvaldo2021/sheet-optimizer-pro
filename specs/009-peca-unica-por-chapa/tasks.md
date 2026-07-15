---
description: "Task list for feature: Peça única por chapa (medida sem repetição)"
---

# Tasks: Peça única por chapa (medida sem repetição)

**Input**: Design documents from `specs/009-peca-unica-por-chapa/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/unique-per-sheet-contract.md, quickstart.md

**Tests**: INCLUÍDOS — exigidos pela Constituição (Princípio V: cobertura de
regressão do motor/plano) e pelo contrato do módulo puro (casos C1–C7).

**Organization**: agrupadas por user story (P1→P3) para implementação e teste
independentes. Convenção de caminhos: single-project SPA (`src/`, `src/test/`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[Story]**: US1/US2/US3 (fases de story); Setup/Foundational/Polish sem label

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: mudança de tipo mínima que habilita o resto. Sem novas dependências.

- [X] T001 Adicionar campo `uniquePerSheet?: boolean` a `PieceItem` em `src/lib/engine/types.ts`, com JSDoc deixando explícito que é flag de **nível de plano**, ignorada pela lógica do motor e removida antes da fronteira WASM (Princípios II/VI)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: módulo puro que concentra toda a lógica testável da restrição. Todas as user stories dependem dele.

**⚠️ CRITICAL**: nenhuma user story pode ser concluída antes desta fase.

- [X] T002 Criar o esqueleto do módulo puro `src/lib/unique-per-sheet.ts` com as assinaturas `splitMarked`, `capForSheet`, `sheetInvKey`, `countMarkedOnSheet` (stubs) conforme `contracts/unique-per-sheet-contract.md`
- [X] T003 [P] Escrever os testes de unidade C1–C6 em `src/test/unique-per-sheet.test.ts` (capping por linha, identidade sem marcação, qty=1/qty=0, `splitMarked` sem mutação, `sheetInvKey` consistente, `countMarkedOnSheet` por árvore) — devem FALHAR contra os stubs de T002
- [X] T004 Implementar as quatro funções em `src/lib/unique-per-sheet.ts` (puras, sem mutação de entrada, determinísticas) até C1–C6 passarem

**Checkpoint**: módulo puro pronto e verde — integração nas stories pode começar.

---

## Phase 3: User Story 1 - Marcar uma medida para não repetir na chapa (Priority: P1) 🎯 MVP

**Goal**: marcar uma linha e o plano multi-chapa aloca no máximo 1 peça dessa linha por chapa (garantida enquanto há estoque), com as demais peças preenchendo o restante.

**Independent Test**: marcar 1 linha com `qty` alto, gerar o plano e verificar que nenhuma chapa tem 2+ dessa linha e que, com estoque ≥ nº de chapas, cada chapa tem exatamente 1 (quickstart passos 1 e 4).

### Tests for User Story 1 ⚠️ (escrever antes da implementação)

- [X] T005 [P] [US1] Adicionar o teste de simulação/conservação C7 em `src/test/unique-per-sheet.test.ts`: simular o loop `runAllSheets` com `capForSheet`, asserindo SC-001 (≤1/chapa), SC-002 (estoque≥chapas ⇒ 1/chapa) e conservação FR-006 (soma de marcadas colocadas = estoque; nada vira sobra)

### Implementation for User Story 1

- [X] T006 [US1] Integrar `capForSheet` na montagem do `inv` por chapa em `src/pages/Index.tsx` (`runAllSheets`, ~L481-491): expandir cada linha marcada no máximo 1×/chapa; linhas não marcadas inalteradas (depende de T004)
- [X] T007 [US1] Trocar a chave do cache de layout para `sheetInvKey` (fatia capada) em `src/pages/Index.tsx` (~L461 `buildInvKey` / ~L507 `invKey`), evitando reusar layout que viole o cap (depende de T004)
- [X] T008 [US1] Adicionar controle por linha "não repetir na chapa" + indicador visual na lista de peças em `src/components/SidebarSection.tsx`, gravando `uniquePerSheet` via `setPieces` sem alterar outras propriedades (FR-001, FR-009; depende de T001)

**Checkpoint**: US1 funcional — MVP demonstrável (marcar → plano respeita ≤1/chapa).

---

## Phase 4: User Story 2 - Marcar várias medidas simultaneamente (Priority: P2)

**Goal**: várias linhas marcadas, cada uma limitada independentemente a ≤1/chapa; linhas marcadas distintas podem coexistir (uma de cada) na mesma chapa.

**Independent Test**: marcar duas linhas A e B com estoque suficiente e verificar que cada chapa tem ≤1 de A e ≤1 de B, podendo conter 1 de A e 1 de B juntas.

### Tests for User Story 2 ⚠️

- [X] T009 [P] [US2] Adicionar teste de múltiplas linhas marcadas em `src/test/unique-per-sheet.test.ts`: `capForSheet` capa cada linha marcada independentemente; simulação garante ≤1 por linha marcada por chapa com A e B coexistindo

### Implementation for User Story 2

- [X] T010 [US2] Confirmar/ajustar em `src/components/SidebarSection.tsx` que a marcação é por linha (estado por-row, sem toggle global), permitindo marcar A e B independentemente (deriva de T008; ajustar apenas se necessário)

**Checkpoint**: US1 e US2 funcionam independentemente.

---

## Phase 5: User Story 3 - Desmarcar e replanejar (Priority: P3)

**Goal**: desmarcar volta a linha a peça comum (repetição permitida) no próximo plano; a marcação persiste através de replanejamentos enquanto ativa.

**Independent Test**: marcar, gerar, desmarcar, replanejar → repetição volta a ser permitida; e um replanejamento com a flag ativa a preserva.

### Tests for User Story 3 ⚠️

- [X] T011 [P] [US3] Adicionar teste em `src/test/unique-per-sheet.test.ts`: com flag desligada `capForSheet` é identidade (repetição permitida); helper de reconstrução de inventário preserva `uniquePerSheet`

### Implementation for User Story 3

- [X] T012 [US3] Preservar `uniquePerSheet` ao reconstruir `PieceItem[]` em `effectiveInventory`/`selectGroup`/replanejamento em `src/pages/Index.tsx` (análogo à preservação de `manual || saved`) (FR-007, SC-005)
- [X] T013 [US3] Garantir que desmarcar dispara replanejamento sem a restrição em `src/pages/Index.tsx`/`src/components/SidebarSection.tsx` (FR-008, SC-004)

**Checkpoint**: todas as user stories independentemente funcionais.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: interação FR-010 com specs 006/008 e portões de qualidade.

- [X] T014 [P] Garantir que a repetição de padrão (spec 006) respeita o cap: limitar a repetição de um layout que contenha linha marcada pelo estoque dessa linha em `src/lib/pattern-repetition.ts` + call site em `runAllSheets`; teste em `src/test/pattern-repetition.test.ts` (nenhuma chapa replicada com 2+ marcadas) (FR-010)
- [X] T015 [P] Garantir que save ×N / reservas (spec 008) respeitam ≤1 marcada por cópia: ajustar `maxRepetitions`/`allocateDeductions`/`effectiveInventory` em `src/lib/lots/layout-replication.ts`; teste em `src/test/layout-replication.test.ts` (FR-010)
- [X] T016 [P] Regressão: rodar `src/test/heuristics-benchmark.test.ts` e confirmar baseline intacta (planos sem marcação bit-a-bit iguais — Princípio III)
- [X] T017 Rodar `npx tsc -p tsconfig.app.json --noEmit` e garantir tipos limpos com o novo campo
- [ ] T018 Executar a validação manual de `quickstart.md` no app (SC-001..SC-005 e FR-010, passos 4 e 5)
- [X] T019 [P] Atualizar `docs/CONTEXT_MAP.md` (linha para `src/lib/unique-per-sheet.ts`) e nota em `docs/AI_CONTEXT.md` se necessário

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende de T001; BLOQUEIA todas as user stories.
- **User Stories (Phase 3+)**: dependem da Fase 2 (módulo puro pronto).
  - US1 é o MVP; US2 e US3 podem seguir em paralelo após a Fase 2, mas US2/US3
    tocam pontos que US1 introduz em `Index.tsx`/`SidebarSection.tsx` (coordenar).
- **Polish (Phase 6)**: depois das stories desejadas.

### User Story Dependencies

- **US1 (P1)**: após Foundational. Introduz a integração base (`runAllSheets`, cache, UI).
- **US2 (P2)**: após Foundational; deriva do controle de UI de US1 (T008).
- **US3 (P3)**: após Foundational; preservação/replan em `Index.tsx`.

### Within Each User Story

- Testes escritos e FALHANDO antes da implementação.
- Módulo puro (Fase 2) antes da integração em `Index.tsx`/UI.
- Integração no plano antes das interações cross-cutting (Fase 6).

### Parallel Opportunities

- T003 (testes de unidade) em paralelo à finalização de T002.
- Na Fase 6, T014/T015/T016/T019 são [P] (arquivos distintos).
- T005/T009/T011 são [P] entre si (mesmo arquivo de teste, seções distintas —
  coordenar se editadas juntas; caso conflito de arquivo, serializar).

---

## Parallel Example: User Story 1

```bash
# Escrever o teste de conservação antes da implementação:
Task: "T005 Simulação/conservação C7 em src/test/unique-per-sheet.test.ts"

# Depois, integração (arquivos distintos podem ir em paralelo):
Task: "T007 Chave de cache sheetInvKey em src/pages/Index.tsx"
Task: "T008 Controle de UI em src/components/SidebarSection.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fase 1 (Setup) → T001.
2. Fase 2 (Foundational) → T002–T004 (módulo puro verde).
3. Fase 3 (US1) → T005–T008.
4. **PARAR e VALIDAR**: quickstart passos 1 e 4 (≤1/chapa, 1/chapa com estoque≥chapas).
5. Demonstrar o MVP.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → validar → demo (MVP).
3. US2 → validar → demo.
4. US3 → validar → demo.
5. Polish (FR-010 + portões) → regressão de benchmark verde, tsc limpo.

---

## Notes

- [P] = arquivos distintos, sem dependência pendente.
- Julgar `npm test` pelo sumário (flake conhecido do vitest-worker pode sair 1
  com tudo verde).
- Motor e WASM permanecem intocados em comportamento; a flag não cruza a fronteira
  WASM (Princípios II/VI).
- Contagem de peças marcadas por chapa deriva sempre da árvore (Princípio IV).
- Commit após cada task ou grupo lógico.
