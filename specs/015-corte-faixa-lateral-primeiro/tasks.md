---
description: "Task list — Corte da faixa lateral primeiro (geração do layout)"
---

# Tasks: Corte da faixa lateral primeiro (geração do layout)

**Input**: Design documents from `/specs/015-corte-faixa-lateral-primeiro/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/lateral-cut-contract.md, quickstart.md

**Tests**: INCLUÍDOS. O contrato pede L1-L7 (estrutura, gate, conservação, determinismo,
paridade, benchmark) e a constituição (V/VI) exige testes de regressão + paridade.

**Organization**: por user story. US1 (a variante que preenche a faixa) = MVP; US2
(guarda de não-regressão); US3 (conservação/determinismo/paridade).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1 / US2 / US3 (setup/foundational/polish sem label)

## Path Conventions

Motor duplo. TS em `src/lib/engine/`, espelho em `wasm-engine/src/`, testes em
`src/test/`. Rebuild wasm com `npm run build:wasm`. NÃO tocar a camada de plano.

---

## Phase 1: Setup (investigação — bloqueia tudo)

**Purpose**: achar o caminho exato que enterra a faixa e fixar o baseline. Sem isto, o
conserto vai no lugar errado (eco da spec 013).

- [X] T001 ACHADO (2026-07-19) — REDIRECIONA A SPEC. Reproduzi no vitest. RESULTADO:
  `optimizeV6` E `runPlacement` na região ISOLADA 3560×1234 JÁ cortam vertical-primeiro
  (`X(2634)|X(926)`) e PREENCHEM a faixa. A burial NÃO é do motor. Ela aparece só na
  CHAPA INTEIRA pelo GULOSO: `runPlacement` monta a coluna do jumbo como
  `X(3560)→Y→Z(3560)→W(1956=jumbo)+W(1233)→Q(2634=empilhadas)`, e os 926 restantes viram
  RESÍDUO de `W(1233)` no nível Q (5), vazio — os fillers vão p/ outra coluna.
  `buildJumboSheet` na MESMA chapa realista coloca os 6 fillers na faixa (colocadas=10).
  ⇒ CONSERTO real (implementado): ROTEAR as chapas de jumbo do candidato guloso pelo
  `buildJumboSheet` (não `runPlacement`) — `src/pages/Index.tsx`, ramo `engine==="greedy"`.
  É PLANO, não motor; as tarefas de motor T006-T010 (variante + espelho Rust) ficam
  SUPERSEDED (o motor já faz certo). PENDENTE: validar no app + decidir o registro da spec.
- [ ] T002 [P] Confirmar o baseline atual do âncora no app (`of_geral_parcial (3).xls`,
  WASM) e anotar nº de chapas + aproveitamento em `quickstart.md` §5 (referência para
  SC-002).

**Checkpoint**: o ponto de geração do `Q` profundo está identificado (T001) — o conserto
mora nele.

---

## Phase 2: Foundational (fixtures/harness — bloqueia US1-US3)

**Purpose**: base de teste do cenário-âncora reutilizada por todas as stories.

- [ ] T003 Criar `src/test/lateral-cut.test.ts` com o fixture do cenário-âncora
  (coluna 3560 + 02508 + 3× 02525 + peças candidatas) e um helper que extrai a árvore e
  localiza o nó da faixa lateral (nível + dimensões), reusando `extractLeafPieces`/
  navegação de `tree-utils.ts`.

**Checkpoint**: fixture compila e o helper acha a faixa na árvore baseline (hoje `Q`).

---

## Phase 3: User Story 1 — A faixa vira espaço útil, preenchido pela otimização (P1) 🎯 MVP

**Goal**: gerar o corte `Z(peças)|Z(faixa)` vertical-primeiro, otimizar a faixa com o
pool, e a variante competir por área no `optimizeV6` — em TS **e** WASM.

**Independent Test**: no âncora, a faixa vira `Z` raso de altura cheia e recebe peças;
no app o nº de chapas cai/aproveitamento sobe.

### Tests (US1)

- [ ] T004 [P] [US1] L1 em `src/test/lateral-cut.test.ts`: no âncora, a árvore do
  candidato tem a faixa como `Z(926)` de altura cheia (não `Q`) e ≥1 peça dentro (C1/C2).
- [ ] T005 [P] [US1] L2 em `src/test/lateral-cut.test.ts`: a faixa recebe o máximo de
  peças que cabem (a maior candidata entra) (C3).

### Implementation (US1) — TS

- [ ] T006 [US1] Implementar a variante "coluna com faixa lateral isolada" no ponto
  achado em T001 (`src/lib/engine/grouping.ts` e/ou `placement.ts`): quando a região tem
  peças empilhadas + faixa lateral de altura cheia, emitir `Z(stackW)` (peças) e
  `Z(lateralW)` (faixa) — corte vertical de altura cheia ANTES das bandas `W`.
- [ ] T007 [US1] Preencher a faixa `Z(lateralW)` otimizando o pool restante na sub-região
  (`lateralW × regionH`) com `optimizeV6`, enxertando o resultado como filhos do
  `Z(lateralW)` (mesmas peças/medidas; folhas com os labels do pool p/ conservação).
- [ ] T008 [US1] Registrar a variante no leque do `optimizeV6` (`src/lib/engine/optimizer.ts`)
  para competir pela seleção existente (`área → maior retângulo livre → compactação`,
  spec 011) — sem podar nem desligar agrupamento (Princípio III).

### Implementation (US1) — espelho Rust/WASM (Princípio VI)

- [ ] T009 [US1] Espelhar T006 em `wasm-engine/src/grouping.rs` e/ou `placement.rs`
  (mesma lógica do corte lateral; casar ordem de inserção — NÃO iterar HashMap sem
  ordenar, memória `wasm-hashmap-determinismo`).
- [ ] T010 [US1] Espelhar T007/T008 em `wasm-engine/src/optimizer.rs` (registro no leque
  + preenchimento da faixa) e rebuild: `npm run build:wasm`.

**Checkpoint**: T004/T005 verdes (TS); a faixa vira `Z` e recebe peças. Rodar o
quickstart §5 no app (WASM) — a faixa aparece preenchida e o nº de chapas cai. Se a
faixa continuar vazia no app: variante não escolhida (medir área) ou `Q` de outro
caminho (voltar a T001).

---

## Phase 4: User Story 2 — Nunca piorar o resultado (guarda) (P1)

**Goal**: garantir zero regressão e que sem faixa aproveitável o layout é idêntico.

**Independent Test**: benchmark verde; caso sem faixa = árvore idêntica ao baseline.

### Tests (US2)

- [ ] T011 [P] [US2] L3 em `src/test/lateral-cut.test.ts`: coluna cheia / faixa estreita
  demais / sem peça que caiba ⇒ a variante NÃO gera candidato; a árvore é idêntica ao
  baseline (gate / não-regressão por construção) (C4).
- [ ] T012 [US2] L7: rodar `npx vitest run src/test/heuristics-benchmark.test.ts` e
  confirmar nº de chapas ≤ baseline e aproveitamento ≥ baseline em todos os cenários. Se
  MELHORAR, regravar baseline (`RECORD_BASELINE=1`) e anotar no PR (C8).

### Implementation (US2)

- [ ] T013 [US2] Implementar/confirmar o GATE de elegibilidade (`lateralW ≥ menor lado
  de peça restante` E `regionH ≥ menor altura de peça restante`, respeitando `minBreak`)
  em TS e no espelho Rust — sem faixa aproveitável ⇒ nenhum candidato novo (C4).

**Checkpoint**: benchmark verde; caso sem faixa idêntico ao atual, nos dois motores.

---

## Phase 5: User Story 3 — Conservação, determinismo e paridade (P1)

**Goal**: nenhuma peça/medida fantasma; mesmo input → mesmo plano; TS e WASM equivalentes.

**Independent Test**: `validatePlacementCandidate` = true; 2× idêntico; parity test verde.

### Tests (US3)

- [ ] T014 [P] [US3] L4 em `src/test/lateral-cut.test.ts`: conservação no âncora —
  `validatePlacementCandidate(tree, remaining, physicalCount, physicalMeasureSet)` = true
  (C5).
- [ ] T015 [P] [US3] L5 em `src/test/lateral-cut.test.ts`: determinismo — gerar 2× ⇒
  árvore idêntica (fingerprint) (C6).
- [ ] T016 [US3] L6: ESTENDER `src/test/wasm-parity.test.ts` — no âncora, TS e WASM com a
  MESMA contagem alocada, MESMO multiset de medidas e a MESMA estrutura da faixa (`Z`
  nos dois) (C7).

### Implementation (US3)

- [ ] T017 [US3] Auditar a variante (TS + Rust) por não-determinismo (nenhum `Set`/`Map`/
  `HashMap` iterado fora de ordem de inserção) e por divergência TS↔WASM no ponto do
  corte/preenchimento; corrigir o que L15/L16 apontarem. Cf. specs 011/012.

**Checkpoint**: conservação, determinismo e paridade travados nos dois motores.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T018 [P] `npx tsc -p tsconfig.app.json --noEmit` limpo e `npm test` (julgar pelo
  sumário, não pelo exit code — flake do worker do vitest).
- [ ] T019 [P] Atualizar `docs/AI_CONTEXT.md` e `docs/CONTEXT_MAP.md`: a variante do
  corte lateral (onde nasce, gate, faixa vira `Z`) e o espelho Rust.
- [ ] T020 PROVA DE VALOR no app (quickstart §5): âncora → faixa preenchida, nº de chapas
  ≤ 32, 268/268, determinístico. Registrar o número medido em `research.md`/`quickstart`.
- [ ] T021 [P] Atualizar o bloco SPECKIT do `CLAUDE.md`: spec 015 IMPLEMENTADA com o
  resultado medido; marcar a memória `proxima-spec-chapa-dedicada` (o muro de
  profundidade foi contornado pela geração).

---

## Dependencies & Execution Order

- **Setup (T001-T002)** → **Foundational (T003)** bloqueiam tudo. T001 é o gargalo (acha
  o caminho).
- **US1 (T004-T010)**: MVP. Impl TS (T006-T008) depende de T001/T003; Rust (T009-T010)
  espelha T006-T008; testes T004/T005 [P] antes da impl (TDD).
- **US2 (T011-T013)**: depende de US1 (mede o comportamento novo). T011 [P].
- **US3 (T014-T017)**: depende de US1. T014/T015 [P]; T016 depende do rebuild wasm (T010).
- **Polish (T018-T021)**: depois de US1-US3. T020 (app) é a prova final.

### Ordem de completude das stories

US1 (MVP, TS+WASM) → US2 (guarda) → US3 (conservação/determinismo/paridade) → Polish.

## Parallel Opportunities

- Setup: T002 [P] enquanto T001 investiga.
- US1 tests: T004, T005 [P] antes da impl.
- Cross-story tests: T011, T014, T015 [P] (mesmo arquivo — blocos separados).
- Polish: T018, T019, T021 [P].

## Implementation Strategy

**MVP = US1 (T001-T010)**, com o **espelho WASM incluído** (o app roda WASM — sem o Rust
a feature não existe para o usuário). Prova no app no checkpoint da US1: se a faixa não
preencher, PARAR e voltar ao T001 (caminho errado) antes de seguir. US2/US3 endurecem
(não-regressão + conservação/paridade). Medir SEMPRE no trabalho real — benchmark/unit
são rede, não prova de chapas.
