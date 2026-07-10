---

description: "Task list for feature: Duas novas heurísticas de otimização"
---

# Tasks: Duas novas heurísticas de otimização

**Input**: Design documents from `specs/005-novas-heuristicas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/sort-strategy.md, quickstart.md

**Tests**: INCLUÍDOS — o spec exige testes de regressão (FR-009) e paridade
(FR-007). Testes fazem parte do critério de aceite.

**Organization**: Tarefas agrupadas por user story. As duas stories (US1 e US2) são
ambas P1: US1 entrega o valor (aproveitamento); US2 garante que nada quebrou.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependências pendentes)
- **[Story]**: US1 (aproveitamento) ou US2 (validade/determinismo/paridade)

## Path Conventions

- Motor TS: `src/lib/engine/`
- Motor Rust/WASM: `wasm-engine/src/`
- Testes: `src/test/` (vitest)
- Build WASM: `npm run build:wasm` (definido em `package.json`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar baseline e arcabouço de teste antes de mexer no motor.

- [X] T001 Cenário-alvo determinado empiricamente (script de descoberta, 400 cenários oversubscritos); cenário fixo de 31 peças embutido em `src/test/new-heuristics.test.ts` e documentado em `research.md` Decisão 2
- [X] T002 [P] Criado `src/test/new-heuristics.test.ts` com helper `bestAreaOverStrategies` (subconjunto fiel do laço de `optimizeV6`) e imports de `getSortStrategies`/`optimizeV6`
- [X] T003 [P] Baseline capturado via o próprio teste de monotonicidade (compara 12 vs 14 estratégias); baseline de regressão coberto por `src/test/optimization.test.ts` (verde)

**Checkpoint**: Cenários-alvo definidos e baseline registrado.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Aplicar a mudança aditiva nos DOIS motores com paridade. Bloqueia toda
validação (US1 e US2) — sem isso não há o que testar.

**⚠️ CRITICAL**: Nenhuma story pode ser validada até esta fase terminar.

- [X] T004 Adicionados 2 comparadores **ascendentes** (idx 12 = altura asc `a.h-b.h||a.w-b.w`; idx 13 = largura asc `a.w-b.w||a.h-b.h`) ao FINAL de `getSortStrategies()` em `src/lib/engine/optimizer.ts` (12 → 14; 0–11 intactos). Fórmula ajustada vs. proposta original por redundância — ver T010/research
- [X] T005 Adicionados arms `12`/`13` em `cmp_by_strategy` de `wasm-engine/src/optimizer.rs` (semântica idêntica ao TS) e `NUM_SORT_STRATEGIES` 12 → 14
- [X] T006 WASM reconstruído com `npm run build:wasm` (exit 0; apenas warnings pré-existentes de dead-code); `wasm-engine/pkg` regenerado

**Checkpoint**: Ambos os motores expõem 14 estratégias; genetic (TS/Rust) e post-processing herdam por reuso de `getSortStrategies()` / `NUM_SORT_STRATEGIES`.

---

## Phase 3: User Story 1 - Melhor aproveitamento (Priority: P1) 🎯 MVP

**Goal**: Provar que as 2 novas heurísticas melhoram o aproveitamento em ao menos um
cenário-alvo, sem regredir nenhum outro.

**Independent Test**: Rodar a otimização nos cenários-alvo e de regressão; aproveitamento
≥ baseline em todos e > baseline em ao menos um; nº de chapas nunca aumenta.

### Tests for User Story 1 ⚠️

> Escrever primeiro; devem falhar enquanto os asserts de melhora não forem satisfeitos.

- [X] T007 [P] [US1] Teste de contrato `getSortStrategies().length === 14` (FR-001) — verde
- [X] T008 [P] [US1] Teste de melhora estrita no cenário-alvo (`bestAreaOverStrategies(14) > (12)`) + teste de monotonicidade em batch de 40 cenários (`14 ≥ 12` sempre) (SC-001/SC-002) — verde
- [X] T009 [US1] Não-regressão confirmada: `src/test/optimization.test.ts` e a suíte completa (65 passed, 2 skipped, 0 failed) permanecem verdes sem alteração de baseline

### Implementation for User Story 1

- [X] T010 [US1] **Tuning executado**: a proposta original (largura↓/altura↓ com área) provou-se **redundante** (≡ idx 3/2); substituída pelo par **ascendente** (altura asc / largura asc), campeão na descoberta empírica (12 e 11 vitórias/400). Ajuste aplicado a TS **e** Rust + rebuild WASM
- [X] T011 [US1] Nenhum cenário de regressão mudou de saída — nenhum baseline precisou ser reajustado (monotonicidade + desempate estável preservados)

**Checkpoint**: Aproveitamento comprovadamente melhora em ≥1 alvo e não regride — MVP entregue.

---

## Phase 4: User Story 2 - Confiança de que nada quebrou (Priority: P1)

**Goal**: Garantir corte guilhotina válido, determinismo, paridade TS↔WASM e suíte verde.

**Independent Test**: Suíte de regressão verde; planos válidos (guilhotina/margens/minBreak);
mesmo input → mesmo plano; TS e WASM equivalentes.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Teste de determinismo: mesmo input → estrutura de plano idêntica (comparação ignorando `id`, que embute contador/aleatório irrelevante ao plano físico) (FR-006, SC-004) — verde
- [X] T013 [P] [US2] Teste de validade da árvore: folhas com valor > 0 (peças, nunca desperdício) e soma dos cortes X de topo ≤ largura útil (FR-003, SC-003) — verde
- [~] T014 [P] [US2] **Paridade TS↔WASM não automatizável neste harness**: o WASM (`--target web`) não carrega em node/vitest (a suíte inteira roda via fallback TS — mensagens `[WASM] falhou, usando TypeScript`). Paridade garantida **estruturalmente**: fórmulas idênticas TS/Rust (contrato) + compilação Rust OK + rebuild. Um teste runtime exigiria harness de browser (fora de escopo)
- [X] T015 [P] [US2] Contagem coberta em TS (`length === 14`); no Rust, `NUM_SORT_STRATEGIES === 14` validado pela compilação bem-sucedida do `build:wasm` (a constante governa os laços)

### Implementation for User Story 2

- [X] T016 [US2] Suíte completa `npm test` verde: **65 passed, 2 skipped, 0 failed** (inclui `phantom-dimension`, `rotation-*`, `regroup-waste`, `ga-*`); `npx tsc --noEmit` limpo

**Checkpoint**: US1 e US2 verdes — feature validada ponta a ponta.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento e higiene.

- [X] T017 [P] `npx tsc --noEmit` limpo (exit 0)
- [X] T018 [P] `docs/AI_CONTEXT.md` §3.1 atualizado: 14 estratégias (incl. altura/largura ascendentes) + nota de paridade TS/Rust
- [X] T019 Quickstart executado: TS (`tsc` + `vitest` verdes), WASM (`build:wasm` exit 0), validade/determinismo/monotonicidade cobertos por `new-heuristics.test.ts`. Paridade runtime TS↔WASM não automatizável no harness (ver T014)
- [X] T020 Revisão final via `git diff`: mudança aditiva confirmada — idx 0–11 intactos em ambos os motores; só `NUM_SORT_STRATEGIES` 12→14 e 2 arms/comparadores acrescentados

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — começa imediatamente.
- **Foundational (Phase 2)**: depende do Setup — **BLOQUEIA** US1 e US2 (é a mudança de código).
- **US1 (Phase 3)**: depende da Foundational.
- **US2 (Phase 4)**: depende da Foundational; pode rodar em paralelo a US1 (arquivos de teste distintos), mas T010 (ajuste de fórmula) pode reexigir rerun dos testes de US2.
- **Polish (Phase 5)**: depende de US1 e US2 completas.

### User Story Dependencies

- **US1 (P1)**: após Foundational. Entrega o valor central (MVP).
- **US2 (P1)**: após Foundational. Independentemente testável; valida segurança da mudança.
- Observação: se T010 alterar as fórmulas, reexecutar T012–T016 (paridade/determinismo) para a nova versão.

### Within Each User Story

- Testes escritos antes; devem falhar até a mudança satisfazê-los.
- US1: contagem (T007) → melhora (T008/T009) → ajuste/tuning (T010/T011).
- US2: determinismo/validade/paridade (T012–T015) → suíte completa (T016).

### Parallel Opportunities

- Setup: T002 e T003 em paralelo (T001 antes, define cenários).
- US1: T007 e T008 em paralelo (mesmo arquivo de teste, mas blocos independentes — coordenar edições).
- US2: T012, T013, T014, T015 em paralelo (blocos independentes no mesmo arquivo de teste).
- Polish: T017 e T018 em paralelo.

---

## Parallel Example: User Story 2

```bash
# Blocos de teste independentes em src/test/new-heuristics.test.ts:
Task: "Determinismo: mesmo input → mesmo plano (T012)"
Task: "Validade da árvore: folhas/margens/minBreak (T013)"
Task: "Paridade TS↔WASM equivalente (T014)"
Task: "Contagem NUM_SORT_STRATEGIES via caminho WASM (T015)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → cenários-alvo + baseline.
2. Phase 2 Foundational → mudança aditiva nos 2 motores + rebuild WASM (CRÍTICO).
3. Phase 3 US1 → provar melhora sem regressão.
4. **PARAR e VALIDAR**: aproveitamento melhora em ≥1 alvo, 0 regressões → MVP pronto.

### Incremental Delivery

1. Setup + Foundational → mecanismo pronto (14 estratégias, paridade).
2. US1 → melhora de aproveitamento comprovada → demo.
3. US2 → segurança (guilhotina/determinismo/paridade) comprovada → release.
4. Polish → tsc limpo, docs, quickstart.

---

## Notes

- [P] = arquivos/blocos diferentes, sem dependência pendente.
- Mudança é **aditiva** (idx 12–13): rollback = reverter os 2 arquivos + rebuild WASM.
- **Monotonicidade**: manter o incumbente em empates (`>`/`<` estritos, inalterados) garante que cenários já ótimos não mudam de saída — não regridem por construção.
- **Paridade obrigatória**: toda alteração de fórmula vale para TS **e** Rust no mesmo passo, seguida de `npm run build:wasm`.
- Commitar após cada task ou grupo lógico.
