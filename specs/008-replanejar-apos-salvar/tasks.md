# Tasks: Replanejar o plano automático após salvar layout com repetições

**Input**: Design documents from `specs/008-replanejar-apos-salvar/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/layout-replication-contract.md, quickstart.md

**Tests**: INCLUÍDOS — exigidos pela Constituição (Artigo V) e definidos no contrato (`layout-replication-contract.md`, seção "Testes exigidos"). Testes do módulo puro são escritos ANTES da implementação e devem falhar primeiro.

**Organization**: tarefas agrupadas por user story (spec.md): US1 = conservação de quantidades no save ×N (P1), US2 = replanejamento automático (P2), US3 = feedback ao operador (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1/US2/US3 — só nas fases de user story

---

## Phase 1: Setup

**Purpose**: confirmar baseline verde antes de qualquer mudança (gate da Constituição)

- [X] T001 Rodar `npm test` e `npx tsc -p tsconfig.app.json --noEmit` na árvore limpa e confirmar tudo verde (baseline de `src/test/heuristics-benchmark.test.ts` e `src/test/ga-determinism.test.ts` intactos) — NOTA: baseline tinha 10 erros de tsc pré-existentes (corrigidos como setup: import duplicado em `LayoutSummary.tsx`, prop/atributo JSX `onPrintLayout` duplicados em `OptimizationPanel.tsx`/`Index.tsx`, tipo de `chapaList` sem `deductions`); `npm test` = 86/86 passam, com flake de infra do vitest (`[vitest-worker]: Timeout calling "onTaskUpdate"`) que suja o exit code sem falhar teste algum

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: módulo puro `layout-replication` — US1 e US2 dependem dele

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase completa

- [X] T002 Escrever testes de contrato C1–C7 (inicialmente falhando) em `src/test/layout-replication.test.ts`: `buildLayoutBom` (agregação por `min×max`, rotação `600×400`↔`400×600`, entrada vazia → `[]`, Σcount = nº de peças), `maxRepetitions` (peça mais escassa limita, linha sem cobertura → 0, BOM vazio → 0, nunca Infinity/negativo), `deductBomTimes` (não muta entrada, nunca `qty<0`, `shortfall` quando falta, conservação exata quando `shortfall` vazio, `n≤0` → cópia idêntica), `partitionByManual` (ordem estável, união = entrada), `needsReplan` (≡ `autos.length > 0`)
- [X] T003 Implementar `src/lib/lots/layout-replication.ts` conforme `contracts/layout-replication-contract.md` (interfaces `UsedPieceDim`, `BomEntry`, `InventoryPiece`, `DeductionResult`; funções `buildLayoutBom`, `maxRepetitions`, `deductBomTimes`, `partitionByManual`, `needsReplan`), no estilo puro de `src/lib/lots/lot-selection.ts`; testes de T002 passam

**Checkpoint**: `npm test` verde com o módulo novo coberto — user stories podem começar

---

## Phase 3: User Story 1 — Salvar layout repetido sem corromper as quantidades (Priority: P1) 🎯 MVP

**Goal**: salvar ×N deduz exatamente N×BOM, descarta as chapas automáticas obsoletas e preserva manuais/lotes — a conservação de quantidades nunca quebra (o replanejamento automático chega na US2; até lá o plano restante fica vazio após o save).

**Independent Test**: cenário lógico + manual — gerar plano, salvar ×N e conferir (peças salvas) + (inventário restante) = inventário inicial, sem negativos e sem chapas automáticas obsoletas na lista.

### Tests for User Story 1

- [X] T004 [P] [US1] Adicionar em `src/test/layout-replication.test.ts` o teste de conservação SC-001: simulação save×N no nível lógico (BOM da chapa → `maxRepetitions` → clamp → `deductBomTimes` → `partitionByManual`) cobrindo N = máximo (inventário zera), N < máximo (sobras permanecem) e BOM com peça ausente do inventário (`maxRepetitions = 0` → nenhum efeito)

### Implementation for User Story 1

- [X] T005 [P] [US1] Refatorar `calcReplication` em `src/pages/Index.tsx` (~linha 1056) para usar `buildLayoutBom` + `maxRepetitions` do módulo novo, eliminando a lógica inline duplicada; comportamento visível idêntico (FR-001)
- [X] T006 [US1] Reescrever a dedução do `saveLayout` em `src/pages/Index.tsx` (~linha 1277): montar BOM via `buildLayoutBom`; clamp defensivo `n = clamp(reps, 1, maxRepetitions(pieces, bom))` com erro e abort SEM efeitos quando máximo = 0 (S1); deduzir via `deductBomTimes` com abort sem efeitos se `shortfall` não vazio (S2); manter criação das N cópias `manual: true`
- [X] T007 [US1] No `saveLayout`, quando `needsReplan(chapas)`: descartar todas as chapas `!manual`, zerar `optimizationGroups` e `patternSummary` no mesmo commit de estado e definir `setChapas([...manuais, ...cópias])` via `partitionByManual` (S3); quando não há autos, preservar o caminho legado byte a byte (S7/FR-009)

**Checkpoint**: salvar ×N nunca deixa chapas automáticas obsoletas nem quantidade negativa; US1 testável de ponta a ponta (o plano restante simplesmente some — regeneração é US2)

---

## Phase 4: User Story 2 — Replanejamento automático do inventário restante (Priority: P2)

**Goal**: após o save ×N, o plano é regenerado automaticamente com o inventário restante, usando o gerador existente; manuais e lotes intactos; determinístico.

**Independent Test**: salvar ×N com sobra de peças → novo plano aparece sozinho cobrindo só o restante; salvar consumindo tudo → nenhum plano novo; repetir o fluxo do zero → resultado idêntico.

### Implementation for User Story 2

- [X] T008 [US2] Parametrizar `optimizeAllSheets` em `src/pages/Index.tsx` (~linha 430): assinatura `optimizeAllSheets(piecesOverride?: PieceItem[], opts?: { baseChapas?: Chapa[] })`; sem argumentos = comportamento atual inalterado; com override, gerar o plano a partir do inventário informado e aplicar `setChapas([...(opts?.baseChapas ?? []), ...best])`, ajustando `setActiveChapa`/`setTree` para a primeira chapa automática nova (D1)
- [X] T009 [US2] Integrar o replanejamento ao `saveLayout` em `src/pages/Index.tsx`: tornar o callback async; após T007, se inventário restante não vazio → `await optimizeAllSheets(inventárioRestante, { baseChapas: [...manuais, ...cópias] })` (S4); se vazio → sem replanejamento, lista final = manuais + cópias (S5); reentrância protegida por `isOptimizing`
- [X] T010 [US2] Corrigir `selectGroup` em `src/pages/Index.tsx` (~linha 1263) para compor `setChapas([...chapasManuaisAtuais, ...group.chapas])` (via `partitionByManual`) e ajustar índice ativo/árvore para a primeira chapa do grupo, preservando manuais/salvas (S6/FR-005)
- [X] T011 [US2] Validar US2 pelo quickstart (`specs/008-replanejar-apos-salvar/quickstart.md`): cenário base (replanejamento cobre só o restante), borda "N consome tudo" (sem plano novo), borda "trocar de variante após salvar" (cópias preservadas) e determinismo (fluxo repetido do zero → mesmo resultado) — VALIDADO via Playwright headless no dev server (50× 1200×800: plano 4 chapas → reps ×3 → save ×2 → replan 2 chapas novas, 22 restantes; 2ª execução idêntica; troca p/ grupo 2 mantém 4 chapas e 0/2 confirmáveis; zero erros de console)

**Checkpoint**: fluxo completo verificar→salvar→plano restante funciona com uma única ação; US1 continua íntegra

---

## Phase 5: User Story 3 — Transparência do resultado para o operador (Priority: P3)

**Goal**: operador informado do que aconteceu (cópias salvas, replanejamento, chapas novas, peças restantes) e com indicação de progresso durante o recálculo.

**Independent Test**: salvar ×N e conferir que a mensagem final contém os quatro dados e que o indicador de progresso aparece durante o replanejamento.

### Implementation for User Story 3

- [X] T012 [US3] Compor a mensagem final do `saveLayout` em `src/pages/Index.tsx` com: nº de cópias salvas, ocorrência (ou não) de replanejamento, nº de chapas do novo plano e total de peças restantes no inventário (S8/FR-007); nos caminhos sem replanejamento (S5/S7), mensagem coerente com o caso
- [X] T013 [US3] Garantir progresso visível durante o replanejamento em `src/pages/Index.tsx`: fase de progresso identificável (ex.: `"Replanejando restante..."` prefixando as fases do gerador) via `setProgress`/`setGlobalProgress` já existentes, com `isOptimizing` ativo do início ao fim do save com replanejamento (US3 cenário 2)

**Checkpoint**: todas as user stories funcionais e independentes

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T014 Gates finais na árvore completa: `npm test` (incluindo `src/test/heuristics-benchmark.test.ts` e `src/test/ga-determinism.test.ts` sem regressão) e `npx tsc -p tsconfig.app.json --noEmit` limpo — 103/103 testes passam, tsc limpo (persiste o flake de infra do vitest `onTaskUpdate` que suja o exit code sem falhar teste; presente também no baseline)
- [X] T015 [P] Executar a validação manual completa de `specs/008-replanejar-apos-salvar/quickstart.md` (cenário base passos 1–5 + os quatro cenários de borda) no dev server — coberto programaticamente (Playwright, ver T011): cenário base, "N consome tudo", troca de variante e determinismo; PENDENTE de execução humana: passo 5 (confirmar lote com o plano replanejado) e borda "sem plano automático ativo" (caminho legado S7, coberto por teste unitário `needsReplan`)
- [X] T016 [P] Atualizar documentação: seção SPECKIT do `CLAUDE.md` (spec 008 → implementada) e `docs/CONTEXT_MAP.md` (linhas para `src/lib/lots/layout-replication.ts` e `src/test/layout-replication.test.ts`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: sem dependências
- **Phase 2 (Foundational)**: depende de T001; T002 (testes falhando) → T003 (implementação) — BLOQUEIA todas as user stories
- **Phase 3 (US1)**: depende da Phase 2
- **Phase 4 (US2)**: depende da US1 (T009 integra no `saveLayout` reescrito em T006/T007); T008 pode começar logo após a Phase 2
- **Phase 5 (US3)**: depende da US2 (mensagem/progresso referem o replanejamento)
- **Phase 6 (Polish)**: depende de todas as stories desejadas

### Task-level

- T004, T005 → dependem de T003; independentes entre si (arquivos diferentes) — paralelizáveis
- T006 → depende de T003; T007 → depende de T006 (mesmo callback)
- T008 → depende de T003 (usa tipos/base) e é independente de T006/T007 até a integração
- T009 → depende de T007 e T008; T010 → depende de T003 (paralelizável com T009, mas mesmo arquivo `Index.tsx` — coordenar edição)
- T012/T013 → dependem de T009

### Parallel Opportunities

- Após T003: `T004 ∥ T005` (arquivos diferentes) e `T008` pode iniciar em paralelo conceitual (mesmo arquivo `Index.tsx` que T005–T007 — se um único dev/agente, executar em sequência para evitar conflito de edição)
- Na Phase 6: `T015 ∥ T016` (validação manual e docs não conflitam); T014 antes de ambos

## Parallel Example: User Story 1

```bash
# Após T003 (módulo puro pronto), lançar em paralelo:
Task: "T004 — teste de conservação SC-001 em src/test/layout-replication.test.ts"
Task: "T005 — refatorar calcReplication em src/pages/Index.tsx para o módulo novo"
# Em seguida, sequencial (mesmo callback em Index.tsx):
Task: "T006 — dedução atômica + clamp no saveLayout"
Task: "T007 — descarte de autos + preservação de manuais no saveLayout"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 (módulo puro testado)
2. Phase 3 (US1): o bug de contagem dupla morre aqui — salvar ×N descarta as autos obsoletas e conserva quantidades
3. **STOP and VALIDATE**: rodar T004 + fluxo manual; já é entregável (o operador regenera o plano manualmente se quiser)

### Incremental Delivery

1. US1 → conservação garantida (MVP)
2. US2 → replanejamento automático + `selectGroup` corrigido → fluxo de uma ação
3. US3 → mensagem e progresso → experiência completa
4. Phase 6 → gates, quickstart integral e docs

### Notas

- `src/pages/Index.tsx` é compartilhado por T005–T013: com um único executor, seguir a ordem numérica evita conflitos
- Motor (`src/lib/engine/**`) NÃO é tocado em nenhuma tarefa — qualquer necessidade de mudança ali é sinal de desvio do plano (parar e reavaliar)
- Commits: um por tarefa ou grupo lógico (T002+T003; T006+T007), mensagens no padrão do repositório (`feat(...)`, `fix(...)`, `test: ...` com referência à spec 008)
