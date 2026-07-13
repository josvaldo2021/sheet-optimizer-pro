# Tasks: Comparar Heurísticas e Evoluir o Otimizador

**Input**: Design documents from `specs/007-comparar-heuristicas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/benchmark-contract.md, quickstart.md

**Tests**: incluídos — o harness de benchmark É entregável da feature (FR-004/FR-005) e a
constituição exige regressão coberta por teste para qualquer mudança de motor.

**Organization**: tarefas agrupadas por user story. US1/US2 são análise (Fase A do plano);
US3 é a evolução medida (Fase B, motor TS+Rust).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos distintos, sem dependência pendente)
- **[Story]**: US1 (relatório comparativo), US2 (priorização), US3 (evolução medida)

## Path Conventions

Projeto único: motor em `src/lib/engine/`, espelho Rust em `wasm-engine/src/`, testes em
`src/test/`, artefatos de análise em `specs/007-comparar-heuristicas/`.

---

## Phase 1: Setup

**Purpose**: ponto de partida verificado

- [X] T001 Confirmar base verde: `npm test` e `npx tsc --noEmit` sem falhas; anotar duração atual da suíte (orçamento: benchmark não pode estourá-la em >50%, ver plan.md Performance Goals)

---

## Phase 2: Foundational (infraestrutura de medição)

**Purpose**: harness de benchmark + baseline persistido — usado pela US2 (números de
impacto) e obrigatório para os gates da US3. **US1 não depende desta fase e pode correr
em paralelo.**

- [X] T002 [P] Definir os ≥ 5 cenários de benchmark (perfis `pecas-pequenas`, `pecas-grandes`, `misto` — reusar fixture de OF, `alto-volume` oversubscrito, `restricoes-agressivas` com margens/minBreak altos) e criar `src/test/fixtures/benchmark-baseline.json` com seção `cenarios` preenchida e `baseline` vazia, no formato de `specs/007-comparar-heuristicas/contracts/benchmark-contract.md`
- [X] T003 Implementar harness em `src/test/heuristics-benchmark.test.ts`: loop multi-chapa determinístico sobre `optimizeV6` (dedução de peças via percurso `extractAll` local ignorando `label` — armadilha nº 1 do CLAUDE.md), métricas derivadas da árvore (aproveitamento %, chapas, peças alocadas), comparação com `baseline` conforme contrato (falha em regressão) e checagem de determinismo (2 execuções → árvores idênticas)
- [X] T004 Gerar e gravar o baseline: executar harness em modo gravação, preencher `baseline`, `versao` (`baseline-2026-07`) e `geradoEm` em `src/test/fixtures/benchmark-baseline.json`; `npm test` verde com harness incluído (FR-004, SC-003)

**Checkpoint**: baseline registrado — US3 tem gate funcionando; US2 tem números reais

---

## Phase 3: User Story 1 — Diagnóstico comparativo do otimizador (Priority: P1) 🎯 MVP

**Goal**: `relatorio-comparativo.md` com as 15 técnicas do catálogo classificadas
(coberta/parcial/ausente/não-aplicável) e justificadas com referência ao código real.

**Independent Test**: abrir o relatório e conferir 15/15 técnicas classificadas com
justificativa baseada em comportamento observável (SC-001); não requer Fases 2+.

### Implementation for User Story 1

- [X] T005 [US1] Verificar no código as classificações preliminares (research.md Decisão 3) das técnicas 1–8 (construtivas: BL/BLF, FFDH, NFDH, BFDH, Best-Fit; estruturais: 2-stage, 3-stage, restrição de giro) citando módulo/função (`src/lib/engine/grouping.ts`, `placement.ts`, `optimizer.ts`, `void-filling.ts`) e redigir as seções correspondentes de `specs/007-comparar-heuristicas/relatorio-comparativo.md` com os campos do data-model (veredito, justificativa, equivalência/restrição excludente)
- [X] T006 [US1] Completar o relatório com as técnicas 9–15 (busca em árvore, AG/BRKGA — documentar ausência de semente em `src/lib/engine/genetic.ts` como ressalva, GRASP, Tabu, SA, strip packing — `groupStripPackingDP`, geração de colunas — parentesco com `src/lib/pattern-repetition.ts`) em `specs/007-comparar-heuristicas/relatorio-comparativo.md`
- [X] T007 [US1] Revisão de completude do relatório: 15/15 com exatamente uma classificação; `equivalencia` presente em toda coberta/parcial; `restricaoExcludente` presente em toda não-aplicável (FR-001, FR-002, cenários de aceitação 1–3 da US1)

**Checkpoint**: US1 entregue — diagnóstico auditável, valor standalone (MVP)

---

## Phase 4: User Story 2 — Priorização de oportunidades (Priority: P2)

**Goal**: `priorizacao.md` com ranking C1..Cn (impacto/compatibilidade/esforço/status) e
descartes justificados.

**Independent Test**: ≥ 3 oportunidades ranqueadas; nenhuma técnica não-aplicável na
lista; toda ausente/parcial avaliada; técnicas com aleatoriedade têm plano de
reprodutibilidade (SC-002, cenários de aceitação da US2).

### Implementation for User Story 2

- [X] T008 [US2] Redigir `specs/007-comparar-heuristicas/priorizacao.md` a partir do relatório (T007) e do baseline (T004): oportunidades C1 (PRNG semeado no GA), C2 (best-fit de faixa BFDH-like), C3 (GRASP determinístico, status condicional), C4 (busca em árvore, status futura) e descartes com motivo (Tabu/SA — redundância com GA; geração de colunas — esforço desproporcional), cada uma com os campos do data-model (impactoEsperado, compatibilidade com guilhotina/rotação/margens/minBreak/determinismo, esforco, status)
- [X] T009 [US2] Validar a priorização contra o relatório: toda técnica `ausente`/`parcial`/ressalva mapeada para oportunidade ou descarte justificado; C1 e C3 explicitam mecanismo de reprodutibilidade (semente fixa) — FR-003, SC-002

**Checkpoint**: US1 + US2 entregues — Fase A do plano completa

---

## Phase 5: User Story 3 — Evolução medida do algoritmo (Priority: P3)

**Goal**: implementar candidatos priorizados nos dois motores; adotar apenas os aprovados
no gate do benchmark (nenhum cenário piora, ≥ 1 melhora mensurável); determinismo e
paridade preservados.

**Independent Test**: harness (T003) antes/depois: nenhuma regressão, ≥ 1 melhora
≥ 0,5 p.p. ou −1 chapa; GA semeado → 2 execuções idênticas (SC-004..006).

**Depends on**: Phase 2 (gate) + T008 (ranking confirma escopo C1+C2, C3 condicional).

### C1 — PRNG semeado no GA (determinismo, Princípio V)

- [X] T010 [P] [US3] Criar PRNG determinístico puro (ex.: mulberry32) com semente em `src/lib/engine/rng.ts` (módulo novo, dados → dados, sem I/O)
- [X] T011 [US3] Substituir todos os `Math.random` de `src/lib/engine/genetic.ts` (linhas ~264–601) pelo PRNG de T010, injetável via parâmetro **opcional** de semente em `optimizeGeneticAsync` com default fixo (assinatura existente continua válida — contrato §4); `id()` de `tree-utils.ts` fica fora do escopo (não afeta o plano de corte)
- [X] T012 [P] [US3] Paridade Rust: PRNG equivalente com mesma semente default em `wasm-engine/src/genetic.rs` (mesma sequência de decisões que o TS não é exigida; exigido: determinismo interno de cada motor — contrato §3.3)
- [X] T013 [US3] Teste de determinismo do GA em `src/test/ga-determinism.test.ts`: mesmo input executado 2× → planos idênticos; incluir GA nos cenários do harness a partir daqui se o tempo de suíte permitir (plan.md Performance Goals)

### C2 — Seleção best-fit de faixa (BFDH-like)

- [X] T014 [US3] Implementar variante de agrupamento best-fit (peça → faixa aberta com menor sobra residual) como nova função **no fim** de `src/lib/engine/grouping.ts`, registrada como builder adicional no torneio de `src/lib/engine/optimizer.ts` (monotonicidade preservada; critério de seleção do torneio intocado — contrato §4)
- [X] T015 [US3] Paridade Rust: mesma variante em `wasm-engine/src/grouping.rs` + registro posicional no torneio em `wasm-engine/src/optimizer.rs`
- [X] T016 [US3] Medir C2 no harness (`npx vitest run src/test/heuristics-benchmark.test.ts`): aprovar se nenhum cenário piora e ≥ 1 melhora ≥ 0,5 p.p. ou −1 chapa (contrato §3); reprovado → reverter T014/T015 e registrar números em `priorizacao.md` (`resultadoMedicao`, FR-007)

### C3 — GRASP determinístico (condicional ao resultado de C1/C2 e orçamento de suíte)

- [X] T017 [US3] (Condicional — decisão registrada em priorizacao.md: NÃO implementar nesta rodada) Prototipar GRASP semeado em `src/lib/engine/grasp.ts` (multi-start: perturbação gulosa-aleatorizada da ordem via `rng.ts` + busca local por swaps, reusando `runPlacement`); medir no harness; adotar (com paridade `wasm-engine/src/`) ou descartar registrando `resultadoMedicao` em `specs/007-comparar-heuristicas/priorizacao.md`

### Gates finais da US3

- [X] T018 [US3] Rebuild do WASM (script de build do repo) + teste de paridade TS↔WASM verde + `npm test` completo verde + `npx tsc --noEmit` limpo (contrato §3.4; para Rust: `cargo test` em `wasm-engine/`)
- [X] T019 [US3] Se alguma melhora legítima alterou saída de cenário: atualizar `src/test/fixtures/benchmark-baseline.json` com nova `versao` e justificativa explícita (contrato §3.5 — nunca silenciosa); consolidar `resultadoMedicao` de todas as candidatas em `specs/007-comparar-heuristicas/priorizacao.md` (FR-005..007, SC-004..006)

**Checkpoint**: todas as user stories entregues; motor evoluído só com ganho comprovado

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 [P] Atualizar `docs/AI_CONTEXT.md` (GA semeado/determinístico, novas variantes se adotadas) e `docs/CONTEXT_MAP.md` (linhas para `rng.ts`, `heuristics-benchmark.test.ts`, `benchmark-baseline.json`, `grasp.ts` se existir)
- [X] T021 [P] Atualizar bloco SPECKIT de `CLAUDE.md` com o estado final da feature (candidatos adotados/reprovados)
- [X] T022 Validação final pelo `specs/007-comparar-heuristicas/quickstart.md` (Definition of Done: SC-001..SC-006) e conferência dos portões da constituição (`npm test`, `npx tsc --noEmit`, zero regressão de aproveitamento)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: sem dependências
- **Phase 2 (Foundational)**: depende de T001. Bloqueia US3 e os números da US2; **não bloqueia US1**
- **Phase 3 (US1)**: depende só de T001 — pode correr em paralelo com a Phase 2
- **Phase 4 (US2)**: depende de T007 (relatório) e T004 (baseline para impacto)
- **Phase 5 (US3)**: depende de T004 (gate) e T008 (escopo confirmado); internamente C1 (T010→T011→T013, T012 paralelo) e C2 (T014→T015→T016) são independentes entre si; T017 depende de T013+T016; T018→T019 fecham
- **Phase 6 (Polish)**: depende do fim da US3 (ou do ponto em que se decidir parar)

### Story Dependency Graph

```text
T001 ──┬── Phase 2 (T002 → T003 → T004) ──┬── US3 (C1: T010→T011→T013; T012 ∥)
       │                                   │        (C2: T014→T015→T016)
       └── US1 (T005 → T006 → T007) ───────┴── US2 (T008 → T009) → (T017?) → T018 → T019 → Polish
```

### Parallel Opportunities

- **T002 ∥ T005**: fixtures de benchmark e início do relatório não compartilham arquivos
- **Phase 2 inteira ∥ Phase 3 inteira** (uma pessoa em cada frente)
- **T010 ∥ T012**: PRNG TS e Rust em arquivos distintos (T011 espera T010)
- **C1 ∥ C2** dentro da US3: módulos disjuntos (`genetic.*` vs `grouping.*`/`optimizer.*`)
- **T020 ∥ T021**: docs distintos

## Parallel Example: início da execução

```bash
# Após T001, disparar em paralelo:
Task: "T002 Criar cenários e benchmark-baseline.json (seção cenarios)"
Task: "T005 Redigir relatorio-comparativo.md — técnicas 1–8"

# Dentro da US3, após T008:
Task: "T010 PRNG em src/lib/engine/rng.ts"
Task: "T012 PRNG em wasm-engine/src/genetic.rs"
Task: "T014 Variante best-fit em src/lib/engine/grouping.ts"
```

## Implementation Strategy

### MVP First (US1)

1. T001 → T005–T007: o relatório comparativo sozinho já entrega o valor "saber onde o
   algoritmo está forte e onde há lacunas" — parar e validar aqui é legítimo.

### Incremental Delivery

1. T001 + Phase 2 → infraestrutura de medição permanente (valor além desta feature)
2. US1 → diagnóstico (MVP) — commit/demo
3. US2 → decisão ranqueada — commit/demo
4. US3 candidato a candidato: **cada Cx é um incremento adotado ou revertido
   individualmente pelo gate do benchmark** — nunca um "big bang" no motor
5. Polish → docs e fechamento

### Notas

- Empates no torneio preservam o incumbente: C2 só muda saídas quando melhora (research
  Decisão 5) — regressão detectada pelo harness é bug de implementação, não trade-off.
- Reprovação de candidato **não é falha da feature**: o registro da medição (FR-007) é
  entregável tão válido quanto a adoção.
- Commits por tarefa ou grupo lógico; mensagens em pt-BR seguindo padrão do repo
  (`feat(engine): ...`, `docs(spec 007): ...`).
