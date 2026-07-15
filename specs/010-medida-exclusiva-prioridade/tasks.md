---
description: "Task list for feature: Medida marcada exclusiva por chapa e prioritária"
---

# Tasks: Medida marcada exclusiva por chapa e prioritária no primeiro layout

**Input**: Design documents from `specs/010-medida-exclusiva-prioridade/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/exclusive-priority-contract.md, quickstart.md

**Tests**: INCLUÍDOS — Constituição (Princípio V) + contrato (casos E1–E6).

**Organization**: por user story. US1 (exclusividade) e US2 (prioridade) são
ambas P1 e compartilham o mesmo núcleo (fatia exclusiva marcada-primeiro); os
critérios de teste, porém, são distintos. Convenção: single-project SPA.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos distintos, sem dependência pendente)
- **[Story]**: US1/US2/US3; Setup/Foundational/Polish sem label

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: esqueleto das novas funções puras. Sem novo dado (reusa
`PieceItem.uniquePerSheet` da 009) e sem novas dependências.

- [X] T001 Adicionar stubs de `pickMarkedForSheet`, `buildSheetInvExclusive` e `exclusiveSheetInvKey` a `src/lib/unique-per-sheet.ts`, conforme `contracts/exclusive-priority-contract.md` (mantendo `capForSheet`/`sheetInvKey`/`perSheetQty` existentes)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: lógica pura da exclusividade + prioridade. Todas as user stories dependem dela.

**⚠️ CRITICAL**: nenhuma user story pode ser concluída antes desta fase.

- [X] T002 [P] Escrever testes de unidade E1–E5 em `src/test/unique-per-sheet.test.ts` (`pickMarkedForSheet` escolhe a 1ª marcada com estoque; `buildSheetInvExclusive` oferta exatamente 1 marcada + não marcadas integrais, marcada no início; identidade sem marcação; `exclusiveSheetInvKey` consistente) — devem FALHAR contra os stubs de T001
- [X] T003 Implementar as 3 funções em `src/lib/unique-per-sheet.ts` (puras, sem mutação, determinísticas) até E1–E5 passarem

**Checkpoint**: módulo puro verde — integração pode começar.

---

## Phase 3: User Story 1 - Exclusividade total (≤1 marcada por chapa) (Priority: P1) 🎯 MVP

**Goal**: nenhuma chapa contém 2+ peças marcadas no total, mesmo de medidas diferentes.

**Independent Test**: marcar A e B (com estoque), gerar o plano e verificar que nenhuma chapa contém A+B nem duas da mesma medida.

### Tests for User Story 1 ⚠️

- [X] T004 [P] [US1] Adicionar teste de simulação de exclusividade/conservação (E6a/E6d) em `src/test/unique-per-sheet.test.ts` (SC-001: toda chapa ≤1 marcada total; conservação das não marcadas) **e ATUALIZAR** o caso US2 da spec 009 (que assertava A e B coexistindo) para exclusividade (A e B nunca juntas)

### Implementation for User Story 1

- [X] T005 [US1] Substituir a montagem do `inv` por chapa em `src/pages/Index.tsx` (`runAllSheets`, ~L480-493): usar `pickMarkedForSheet(remaining)` para escolher no máximo 1 linha marcada; cada linha marcada contribui `p === markedPick ? 1 : 0`, não marcadas mantêm `qty`; deixar de usar `perSheetQty` (depende de T003)
- [X] T006 [US1] Trocar a chave do cache de layout para `exclusiveSheetInvKey(remaining)` em `src/pages/Index.tsx` (~L507), consistente com a fatia exclusiva (depende de T003)

**Checkpoint**: US1 funcional — MVP (nenhuma chapa com 2+ marcadas).

---

## Phase 4: User Story 2 - Prioridade e primeiras chapas (Priority: P1)

**Goal**: peças marcadas processadas primeiro, ocupando as primeiras chapas (1 por chapa) até esgotar.

**Independent Test**: marcar N peças (total), gerar o plano e verificar que as N primeiras chapas contêm 1 marcada cada e as seguintes não têm marcada.

### Tests for User Story 2 ⚠️

- [X] T007 [P] [US2] Adicionar teste de simulação de prioridade em `src/test/unique-per-sheet.test.ts` (SC-002: primeiras N chapas contêm exatamente 1 marcada cada; SC-003: nenhuma marcada vira sobra enquanto houver chapa)

### Implementation for User Story 2

- [X] T008 [US2] Garantir em `src/pages/Index.tsx` que a peça marcada escolhida é o **primeiro** elemento do `inv` real (prioridade de colocação) — montar a entrada da marcada antes das não marcadas na expansão de uid (deriva de T005; ajustar a ordem se necessário)

**Checkpoint**: US1 e US2 funcionam; marcadas exclusivas E nas primeiras chapas.

---

## Phase 5: User Story 3 - Desmarcar volta ao normal (Priority: P3)

**Goal**: desmarcar remove exclusividade e prioridade no próximo plano.

**Independent Test**: marcar, gerar, desmarcar, replanejar → sem exclusividade nem prioridade.

### Tests for User Story 3 ⚠️

- [X] T009 [P] [US3] Adicionar teste em `src/test/unique-per-sheet.test.ts`: sem linhas marcadas, `buildSheetInvExclusive` é identidade sobre as não marcadas; `uniquePerSheet` preservado por `pickMarkedForSheet`/`buildSheetInvExclusive`

### Implementation for User Story 3

- [X] T010 [US3] Verificar em `src/pages/Index.tsx` que desmarcar dispara replanejamento sem exclusividade/prioridade e preserva a flag em `effectiveInventory`/`selectGroup` (herdado da 009; ajustar apenas se necessário) (FR-007, FR-008)

**Checkpoint**: todas as user stories independentemente funcionais.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: interação FR-009 (specs 006/008) e portões de qualidade.

- [X] T011 [P] Adicionar teste FR-009 em `src/test/unique-per-sheet.test.ts`: replicar uma chapa-base com 1 marcada mantém ≤1 marcada por cópia; fatia exclusiva com dim compartilhada entre marcada e não marcada oferta só 1 marcada (protege 006/008)
- [X] T012 [P] Regressão: rodar `src/test/heuristics-benchmark.test.ts` e confirmar baseline intacta (planos sem marcação bit-a-bit iguais — Princípio III)
- [X] T013 Rodar `npx tsc -p tsconfig.app.json --noEmit` e garantir tipos limpos
- [X] T014 Executar a validação manual de `quickstart.md` no app (duas medidas marcadas → SC-001 exclusividade + SC-002 primeiras chapas)
- [X] T015 [P] Atualizar `docs/CONTEXT_MAP.md` (linha de `unique-per-sheet.ts`: `runAllSheets` passa a usar seleção exclusiva marcada-primeiro; spec 010)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende de T001; BLOQUEIA as user stories.
- **US1 (Phase 3)**: núcleo da mudança (`runAllSheets`), após Foundational.
- **US2 (Phase 4)**: deriva de US1 (T005) — a prioridade é a ordenação da mesma
  fatia; testável independentemente.
- **US3 (Phase 5)**: após Foundational; mudança mínima (herdada da 009).
- **Polish (Phase 6)**: após as stories.

### Within Each User Story

- Testes escritos e FALHANDO antes da implementação.
- Módulo puro (Fase 2) antes da integração no `Index.tsx`.
- Integração antes das interações cross-cutting (Fase 6).

### Parallel Opportunities

- T002 [P] em paralelo à finalização de T001.
- T004/T007/T009/T011 [P] são no mesmo arquivo de teste — serializar se editados juntos.
- Na Fase 6, T011/T012/T015 [P] (arquivos distintos).

---

## Parallel Example: User Story 1

```bash
# Escrever o teste de exclusividade antes da implementação:
Task: "T004 exclusividade/conservação + atualizar teste US2 da 009"

# Depois, integração no runAllSheets:
Task: "T005 fatia exclusiva no inv (Index.tsx)"
Task: "T006 chave de cache exclusiva (Index.tsx)"  # mesmo arquivo → sequencial
```

---

## Implementation Strategy

### MVP First (US1 + US2, ambas P1)

1. Fase 1 (Setup) → T001.
2. Fase 2 (Foundational) → T002–T003 (módulo verde).
3. Fase 3 (US1) → T004–T006 (exclusividade).
4. Fase 4 (US2) → T007–T008 (prioridade).
5. **PARAR e VALIDAR**: quickstart (duas medidas marcadas: ≤1/chapa + primeiras chapas).
6. Demonstrar o MVP.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → exclusividade → validar.
3. US2 → prioridade → validar.
4. US3 → desmarcar → validar.
5. Polish (FR-009 + portões) → regressão do benchmark verde, tsc limpo.

---

## Notes

- [P] = arquivos distintos, sem dependência pendente.
- Julgar `npm test` pelo sumário (flake do vitest-worker pode sair 1 com tudo verde).
- 010 SUBSTITUI a coexistência da 009 (não é toggle); `capForSheet`/`sheetInvKey`/
  `perSheetQty` continuam no módulo (unit-tested) mas saem de uso no `runAllSheets`.
- Motor e WASM permanecem intocados; a flag não cruza a fronteira WASM.
- Contagem de marcadas por chapa deriva sempre da árvore (Princípio IV).
- Commit após cada task ou grupo lógico.
