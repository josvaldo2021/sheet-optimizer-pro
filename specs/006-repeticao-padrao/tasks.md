---

description: "Task list for feature: Maximização de repetição de padrão de corte"
---

# Tasks: Maximização de repetição de padrão de corte

**Input**: Design documents from `specs/006-repeticao-padrao/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pattern-selection.md, quickstart.md

**Tests**: INCLUÍDOS — o módulo de seleção é puro e o spec exige determinismo (FR-007)
e comportamento de piso/fallback testáveis.

**Organization**: por user story. US1 (menos padrões distintos) é o valor central;
US2 (controle do piso + visibilidade) refina e torna seguro.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos/blocos diferentes, sem dependência pendente)
- **[Story]**: US1 (repetição) ou US2 (controle/piso/resumo)

## Path Conventions

- Módulo puro: `src/lib/pattern-repetition.ts` (NOVO)
- Orquestração/UI: `src/pages/Index.tsx`, `src/components/SidebarSection.tsx`
- Testes: `src/test/` (vitest)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Criar o esqueleto do módulo puro e do teste.

- [X] T001 `src/lib/pattern-repetition.ts` criado com os tipos (`LayoutCandidate`, `RepetitionEval`, `RepetitionConfig`, `SelectionResult`, `BomEntry`, `RemainingItem`) e as funções `scoreCandidate`/`selectByRepetition`/`homogeneousCandidates` + `bestAreaCandidate`
- [X] T002 [P] `src/test/pattern-repetition.test.ts` criado com fixtures injetáveis de candidatos e inventário

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Núcleo puro de pontuação e seleção — ambas as stories dependem dele.

**⚠️ CRITICAL**: US1 e US2 não podem ser implementadas sem isto.

### Tests (TDD) ⚠️

- [X] T003 [P] Testes de `scoreCandidate` (reps pela peça mais escassa com rotação, coverage, passesFloor, pureza) — verdes
- [X] T004 [P] Testes de `selectByRepetition` (maior reps sob piso, empate reps→util, fallback, reps=0, determinismo) — verdes

### Implementation

- [X] T005 `scoreCandidate` implementado (contagem por peça mais escassa, com rotação, puro)
- [X] T006 `selectByRepetition` implementado (filtro piso → reps → util → key; fallback `floorReached=false`)
- [X] T007 `homogeneousCandidates` implementado (ladrilhamento analítico, `buildTree` lazy)

**Checkpoint**: Núcleo puro completo e verde — decisão de repetição testável sem UI.

---

## Phase 3: User Story 1 - Plano com menos padrões distintos (Priority: P1) 🎯 MVP

**Goal**: Com a opção ligada, o plano multi-chapa usa menos padrões de corte distintos, cada um repetido mais, respeitando um piso (default 85%).

**Independent Test**: Otimizar um pedido multi-chapa com a opção ligada vs. desligada; nº de padrões distintos cai com aproveitamento ≥ piso.

### Implementation for User Story 1

- [X] T008 [US1] Estado `prioritizeRepetition` (default `false`) + `utilizationFloor` (0.85) + `patternSummary` adicionados; toggle na seção "Repetição de Padrão" da sidebar
- [X] T009 [US1] `runAllSheets` monta `[bestAreaCandidate(...), ...homogeneousCandidates(...)]` quando ligado (BOM via `extractUsedPiecesWithContext`, util via `calcPlacedArea`)
- [X] T010 [US1] Chama `selectByRepetition`; se o vencedor é homogêneo, `result = chosen.buildTree()` e o caminho existente de dedução/replicação segue inalterado
- [X] T011 [US1] Cache: **nenhuma mudança necessária** — o `layoutCache` fornece apenas o candidato "melhor-por-área"; os homogêneos são recomputados e a seleção re-roda a cada etapa, então o cache não força o padrão antigo (documentado)
- [X] T012 [US1] Bug latente do `optimizeV6` TS **evitado por construção**: a árvore homogênea é montada a partir do subconjunto de `inv` (que carrega labels uid) → `hasLabels=true` → ramo seguro; no navegador roda em WASM
- [X] T013 [US1] Não-regressão verificada: com a flag OFF, suíte completa verde (76 passed, 0 failed), `tsc` limpo, build OK

**Checkpoint**: MVP — menos padrões distintos com a opção ligada; comportamento intacto com ela desligada.

---

## Phase 4: User Story 2 - Controle do equilíbrio e visibilidade (Priority: P2)

**Goal**: Operador ajusta o piso de aproveitamento e vê quantos padrões distintos existem e a cobertura de cada um.

**Independent Test**: Mudar o piso para dois valores no mesmo pedido → piso maior não reduz aproveitamento médio; resumo mostra padrões distintos e cobertura.

### Implementation for User Story 2

- [X] T014 [US2] Slider "Aproveitamento mínimo" (50–99%, default 85%) na seção "Repetição de Padrão", visível quando a opção está ligada
- [X] T015 [US2] `patternSummary` computado do grupo escolhido (padrões distintos via `treeFingerprint`, chapas por padrão, `floorReached` = todos os padrões ≥ piso)
- [X] T016 [US2] Resumo exibido na sidebar (nº de padrões distintos + cobertura/util por padrão)
- [X] T017 [US2] Aviso na UI quando `floorReached=false` (piso não atingido → usado o de maior aproveitamento)

**Checkpoint**: US1 + US2 — controle previsível do trade-off e visibilidade dos padrões.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T018 [P] `npx tsc --noEmit` limpo (exit 0)
- [X] T019 Suíte completa verde: 76 passed, 2 skipped, 0 failed; build de produção OK (SC-003)
- [~] T020 Quickstart: partes automatizadas OK (testes puros 11/11, suíte, tsc, build). **Sanidade manual no navegador (opção ON, dois valores de piso, resumo) NÃO executada neste ambiente** — requer `npm run dev` + interação. Ver observação no relatório.
- [X] T021 [P] Nota adicionada em `docs/CONTEXT_MAP.md` sobre `src/lib/pattern-repetition.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: sem dependências.
- **Foundational (2)**: depende do Setup — **BLOQUEIA** US1 e US2 (núcleo puro de decisão).
- **US1 (3)**: depende da Foundational — entrega o valor (MVP).
- **US2 (4)**: depende da Foundational e integra com a US1 (usa o `utilizationFloor` e o `PatternSummary` que a US1 já produz), mas é testável de forma independente (ajuste de piso + resumo).
- **Polish (5)**: depende de US1 (e US2, se incluída).

### Within Each Story

- Testes do módulo puro (T003/T004) antes da implementação (T005–T007).
- US1: estado/toggle → montagem de candidatos → seleção/replicação → cache/bug/não-regressão.
- US2: slider → acumulação do resumo → exibição → sinalização de fallback.

### Parallel Opportunities

- T001 antes; T002 em paralelo.
- T003 e T004 em paralelo (blocos de teste distintos).
- US2: T014 e T016 em paralelo (componentes distintos).

---

## Parallel Example: Foundational (testes)

```bash
Task: "scoreCandidate: reps/coverage/passesFloor/pureza (T003)"
Task: "selectByRepetition: piso/empate/fallback/determinismo (T004)"
```

---

## Implementation Strategy

### MVP First (US1)

1. Setup → esqueleto do módulo + teste.
2. Foundational → núcleo puro (score + seleção + candidatos homogêneos), verde.
3. US1 → integrar no `runAllSheets` + toggle; provar menos padrões distintos com a opção ligada e zero regressão com ela desligada.
4. **PARAR e VALIDAR** o MVP.

### Incremental Delivery

1. Núcleo puro pronto (testável isoladamente).
2. US1 → menos setups na serra → demo (piso fixo 85%).
3. US2 → slider de piso + resumo de padrões → release.
4. Polish → tsc, suíte, quickstart, docs.

---

## Notes

- **OFF por padrão** garante SC-003 (zero regressão) por construção — priorizar T013.
- **Determinismo** (FR-007): garantido na seleção (testada com candidatos injetados). O candidato "melhor por área" herda a aleatoriedade pré-existente do GA — ver Complexity Tracking do plano; semear o GA é follow-up fora de escopo.
- **Fonte da verdade** (Princípio IV): BOM/util sempre da árvore (`extractUsedPiecesWithContext`/`calcPlacedArea`), nunca set-difference.
- **Sem tocar motor/WASM** nesta fase — só `src/lib/` + UI. Commitar após cada grupo lógico.
