---
description: "Task list for feature: Seleção de layout por lookahead residual"
---

# Tasks: Seleção de layout por lookahead residual (a sobra que recebe a próxima peça)

**Input**: Design documents from `specs/011-lookahead-residual-sobra/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/residual-lookahead-contract.md, quickstart.md

**Tests**: INCLUÍDOS — Constituição (Princípio V) + contrato (L1–L4, S1–S5).

**Organization**: por user story. US1 (desempate residual) e US2 (guarda de
subordinação) são P1 e compartilham a implementação TS. A **paridade TS↔WASM**
(Princípio VI) é fase própria e **obrigatória** — não mesclar sem ela.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos distintos, sem dependência pendente)
- **[Story]**: US1/US2/US3; Setup/Foundational/Parity/Polish sem label

---

## Phase 1: Setup

**Purpose**: mapear os pontos de espelho no Rust antes de mexer.

- [ ] T001 Localizar no Rust o equivalente do gap-walk de `getLastLeftover` (em `wasm-engine/src/tree_utils.rs` ou onde estiver) e confirmar o ponto de seleção em `wasm-engine/src/optimizer.rs` (~L164, `best_area`/`best_compactness`), anotando os locais exatos para o espelho (T009/T010)

---

## Phase 2: Foundational (helper TS — bloqueia as user stories)

**Purpose**: o helper geométrico que mede "a sobra comporta a próxima peça".

**⚠️ CRITICAL**: nenhuma user story pode ser concluída antes desta fase.

- [ ] T002 [P] Escrever unit tests L1–L4 de `largestFreeRect` e o helper `residualFits` em `src/test/residual-lookahead.test.ts` (árvore vazia → chapa inteira; faixa à direita; **maior** gap ≠ gap final; chapa cheia → null; `residualFits` respeita rotação e `minBreak`) — devem FALHAR
- [ ] T003 Implementar `largestFreeRect(tree, usableW, usableH)` e `residualFits(tree, usableW, usableH, piece, minBreak)` em `src/lib/engine/tree-utils.ts` (puros, derivados da árvore, generalizando o gap-walk de `getLastLeftover`) até L1–L4 passarem

**Checkpoint**: helper TS verde.

---

## Phase 3: User Story 1 - Desempate por sobra que recebe a próxima peça (Priority: P1) 🎯 MVP

**Goal**: entre layouts de mesma área, escolher o cujo maior livre comporta a maior peça restante (cenário-âncora Chapa 2).

**Independent Test**: reproduzir a Chapa 2 e verificar que o maior retângulo livre do layout escolhido comporta a próxima peça (o fragmentado atual não comporta).

### Tests for User Story 1 ⚠️

- [ ] T004 [P] [US1] Adicionar em `src/test/residual-lookahead.test.ts`: S1 (âncora "Chapa 2": 6000×3210; 2× 3748×646, 1× 5766×1618, 1× 3388×189 + uma "próxima peça" que cabe no bloco ~2252×1592 mas não nos retalhos 2018×646 → escolhido comporta a próxima peça); S3 (nada cabe → resultado idêntico ao atual); S4 (determinismo)

### Implementation for User Story 1

- [ ] T005 [US1] Inserir o desempate residual no laço de seleção do `optimizeV6` em `src/lib/engine/optimizer.ts` (~L192): de `area → compactness` para `area → residualFits(maior peça de result.remaining) → compactness`; primeiro-vence em empate total (determinismo) (depende de T003)

**Checkpoint**: US1 funcional em TS (MVP de referência).

---

## Phase 4: User Story 2 - Subordinação ao aproveitamento (guarda) (Priority: P1)

**Goal**: o residual NUNCA escolhe menor área; nunca gera chapa extra; sem regressão.

**Independent Test**: entre áreas diferentes vence a maior; o benchmark não regride.

### Tests for User Story 2 ⚠️

- [ ] T006 [P] [US2] Adicionar S2 em `src/test/residual-lookahead.test.ts`: candidato com MAIS área e livre fragmentado vence candidato com menos área e livre consolidado (área manda; residual só desempata)

### Implementation / Validation for User Story 2

- [ ] T007 [US2] Rodar `src/test/heuristics-benchmark.test.ts` e confirmar que NENHUM cenário piora em aproveitamento nem em nº de chapas (SC-002/SC-003); registrar se algum MELHOROU (para regravar baseline em T013)

**Checkpoint**: guarda validado — nenhuma regressão de aproveitamento.

---

## Phase 5: User Story 3 - Determinismo (Priority: P3)

**Goal**: mesmo input → mesmo plano.

**Independent Test**: gerar o plano duas vezes e comparar.

- [ ] T008 [US3] Rodar `src/test/ga-determinism.test.ts` (continua verde) e confirmar S4; se necessário, reforçar o desempate final estável em `src/lib/engine/optimizer.ts` (FR-006)

**Checkpoint**: todas as user stories independentes funcionais em TS.

---

## Phase 6: Paridade TS↔WASM (Princípio VI) — OBRIGATÓRIA

**Purpose**: o motor WASM (Rust) deve produzir o MESMO plano que o TS. Não mesclar sem isto.

- [ ] T009 Espelhar `largest_free_rect` no Rust em `wasm-engine/src/tree_utils.rs` (ou onde vive o gap-walk), equivalente ao TS de T003
- [ ] T010 Espelhar a hierarquia de seleção em `wasm-engine/src/optimizer.rs` (~L164): `area → residual-fit(maior remaining) → compactness` (depende de T009)
- [ ] T011 Rodar `npm run build:wasm` e reconstruir o motor WASM (depende de T009/T010)
- [ ] T012 Verificar paridade (S5): confirmar que TS e WASM produzem o MESMO plano nos cenários de teste (âncora + benchmark); divergência = espelho incompleto (depende de T011)

**Checkpoint**: TS e WASM equivalentes.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T013 Se o benchmark MELHOROU (T007), regravar baseline: `RECORD_BASELINE=1 npx vitest run src/test/heuristics-benchmark.test.ts` e documentar o ganho (chapas a menos / aproveitamento a mais)
- [ ] T014 [P] Rodar `npx tsc -p tsconfig.app.json --noEmit` (tipos limpos)
- [ ] T015 Validação manual no app: reproduzir a Chapa 2 e confirmar que a próxima peça é encaixada no bloco consolidado (SC-001/SC-004)
- [ ] T016 [P] Atualizar `docs/CONTEXT_MAP.md` (seleção do `optimizeV6` agora usa lookahead residual; helper `largestFreeRect`; espelho Rust) e nota em `docs/AI_CONTEXT.md` se necessário

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: sem dependências.
- **Foundational (2)**: helper TS; BLOQUEIA as user stories.
- **US1 (3)**: núcleo TS (seleção), após Foundational.
- **US2 (4)**: guarda/benchmark, após US1.
- **US3 (5)**: determinismo, após US1.
- **Paridade (6)**: após o TS estar correto (US1–US3); OBRIGATÓRIA antes de mesclar.
- **Polish (7)**: após paridade.

### Within Each Story

- Testes escritos e FALHANDO antes da implementação.
- Helper (Fase 2) antes da seleção (Fase 3).
- TS de referência correto antes do espelho Rust (Fase 6).

### Parallel Opportunities

- T002 [P] em paralelo à finalização de T001.
- T004/T006 [P] são no mesmo arquivo de teste — serializar se editados juntos.
- T009 e o começo de T010 tocam arquivos Rust distintos; T011/T012 são sequenciais.
- T014/T016 [P] no Polish (arquivos distintos).

---

## Implementation Strategy

### MVP (referência TS)

1. Setup (T001) → 2. Foundational (T002–T003) → 3. US1 (T004–T005) → 4. US2
   (T006–T007) → 5. US3 (T008). **PARAR e VALIDAR** o TS (âncora + benchmark).

### Entrega completa (com paridade)

6. Paridade Rust+wasm (T009–T012) — **obrigatória** para mesclar (Princípio VI).
7. Polish (T013–T016): baseline (se melhorou), tsc, validação no app, docs.

---

## Notes

- [P] = arquivos distintos, sem dependência pendente.
- Julgar `npm test` pelo sumário (flake do vitest-worker).
- Esta feature MUDA O MOTOR — a paridade TS↔WASM (Fase 6) é requisito, não opcional.
- Aproveitamento é objetivo primário: o residual é SÓ desempate; o benchmark é o portão.
- Tudo derivado da árvore (Princípio IV); determinismo preservado (Princípio V).
- Commit após cada task ou grupo lógico.
