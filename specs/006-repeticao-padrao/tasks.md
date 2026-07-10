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

- [ ] T001 Criar `src/lib/pattern-repetition.ts` com os tipos de `data-model.md` (`LayoutCandidate`, `RepetitionEval`, `RepetitionConfig`, `PatternSummary`, `SelectionResult`) e assinaturas vazias de `scoreCandidate`/`selectByRepetition`/`homogeneousCandidates` conforme `contracts/pattern-selection.md`
- [ ] T002 [P] Criar `src/test/pattern-repetition.test.ts` com fixtures de candidatos injetáveis (BOM/util/perSheet) e um inventário `remaining` de exemplo, sem asserts finais

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Núcleo puro de pontuação e seleção — ambas as stories dependem dele.

**⚠️ CRITICAL**: US1 e US2 não podem ser implementadas sem isto.

### Tests (TDD) ⚠️

- [ ] T003 [P] Em `src/test/pattern-repetition.test.ts`, testes de `scoreCandidate`: `reps` = `min` de `floor((disponível−count)/count)` sobre o BOM (com rotação); `coverage = 1+reps`; `passesFloor`; pureza (não muta entradas) (contrato)
- [ ] T004 [P] Em `src/test/pattern-repetition.test.ts`, testes de `selectByRepetition`: vence maior `reps` entre `passesFloor`; empate `reps`→`util`→`key`; fallback (nenhum ≥ piso → maior `util`, `floorReached=false`); `reps=0` quando nada repete; **determinismo** (mesma entrada → mesma saída) (FR-002/006/007/011)

### Implementation

- [ ] T005 Implementar `scoreCandidate` em `src/lib/pattern-repetition.ts` (contagem de repetição reutilizando a lógica de `Index.tsx:546-558`, agora pura e com rotação)
- [ ] T006 Implementar `selectByRepetition` em `src/lib/pattern-repetition.ts` (filtro por piso → maior `reps` → desempate `util` → `key`; fallback sinalizado)
- [ ] T007 Implementar `homogeneousCandidates` em `src/lib/pattern-repetition.ts`: para cada dimensão distinta com `qty` suficiente, candidato pontuado por ladrilhamento (`perSheet = max(floor(uW/w)·floor(uH/h), floor(uW/h)·floor(uH/w))`, `util`, `buildTree` lazy)

**Checkpoint**: Núcleo puro completo e verde — decisão de repetição testável sem UI.

---

## Phase 3: User Story 1 - Plano com menos padrões distintos (Priority: P1) 🎯 MVP

**Goal**: Com a opção ligada, o plano multi-chapa usa menos padrões de corte distintos, cada um repetido mais, respeitando um piso (default 85%).

**Independent Test**: Otimizar um pedido multi-chapa com a opção ligada vs. desligada; nº de padrões distintos cai com aproveitamento ≥ piso.

### Implementation for User Story 1

- [ ] T008 [US1] Em `src/pages/Index.tsx`, adicionar estado `prioritizeRepetition` (bool, default `false`) e `utilizationFloor` (default `0.85`); adicionar toggle mínimo para ligar/desligar (controle refinado vem na US2)
- [ ] T009 [US1] Em `runAllSheets` (`src/pages/Index.tsx`), quando `prioritizeRepetition` está ligada: montar `candidates = [bestAreaCandidate, ...homogeneousCandidates(...)]`, onde `bestAreaCandidate` deriva do resultado já obtido (BOM via `extractUsedPiecesWithContext`, `util` via `calcPlacedArea`)
- [ ] T010 [US1] Em `runAllSheets`, chamar `selectByRepetition`, materializar `chosen.buildTree()`, e reusar o caminho existente de dedução/replicação para o padrão escolhido (linhas ~563-598)
- [ ] T011 [US1] Ajustar o **cache de layout** (`buildInvKey`/`layoutCache`, `Index.tsx:436-445`) para não forçar o padrão antigo no modo repetição: incluir `prioritizeRepetition` + `utilizationFloor` na chave (ou ignorar o cache quando ligado)
- [ ] T012 [US1] Mitigar o **bug latente do `optimizeV6` TS** ao materializar candidato homogêneo (peças sem label quebram o ramo de agrupamento — ver spec 005): rotular as peças do subconjunto antes de chamar `optimizeV6`, ou construir a árvore em grade diretamente
- [ ] T013 [US1] Garantir **não-regressão**: com `prioritizeRepetition=false`, `runAllSheets` segue exatamente o caminho atual (não monta candidatos, não chama o módulo) — validar via suíte existente

**Checkpoint**: MVP — menos padrões distintos com a opção ligada; comportamento intacto com ela desligada.

---

## Phase 4: User Story 2 - Controle do equilíbrio e visibilidade (Priority: P2)

**Goal**: Operador ajusta o piso de aproveitamento e vê quantos padrões distintos existem e a cobertura de cada um.

**Independent Test**: Mudar o piso para dois valores no mesmo pedido → piso maior não reduz aproveitamento médio; resumo mostra padrões distintos e cobertura.

### Implementation for User Story 2

- [ ] T014 [P] [US2] Em `src/components/SidebarSection.tsx`, adicionar o slider "Aproveitamento mínimo" (0–100%, default 85%) vinculado a `utilizationFloor`, visível quando `prioritizeRepetition` está ligada
- [ ] T015 [US2] Em `runAllSheets`/`Index.tsx`, acumular `PatternSummary` (nº de padrões distintos, chapas por padrão, `floorReached`) ao longo das etapas
- [ ] T016 [P] [US2] Exibir o resumo de padrões na UI reaproveitando o padrão de `replicationInfo` (nº de padrões distintos + cobertura por padrão + aviso quando `floorReached=false`) (FR-008/SC-007)
- [ ] T017 [US2] Sinalizar na UI quando o piso não foi atingido em alguma etapa (fallback do FR-006)

**Checkpoint**: US1 + US2 — controle previsível do trade-off e visibilidade dos padrões.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T018 [P] `npx tsc --noEmit` limpo
- [ ] T019 Rodar suíte completa `npm test` — verde, sem regressão (SC-003)
- [ ] T020 Executar `specs/006-repeticao-padrao/quickstart.md` ponta a ponta (testes puros + sanidade no app com opção on/off e dois valores de piso)
- [ ] T021 [P] Nota breve em `docs/CONTEXT_MAP.md` sobre `src/lib/pattern-repetition.ts` (novo módulo de orquestração de repetição multi-chapa)

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
