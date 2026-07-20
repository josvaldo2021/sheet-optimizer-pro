---

description: "Task list for feature implementation"
---

# Tasks: Agrupamento de colunas com alturas próximas

**Input**: Design documents from `/specs/016-agrupamento-alturas-proximas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUÍDOS — o Princípio V da constituição exige cobertura determinística, e o
histórico do projeto (specs 012/015) mostra que mudanças nesta camada quebram conservação em
silêncio. Os casos normativos são G1–G9 do contrato.

**Organization**: agrupadas por user story. ATENÇÃO à realidade deste código: US1 e US2 são
duas metades da MESMA função (`consolidateColumnsX`) — elas NÃO são paralelizáveis entre si e
US2 não é opcional (sem a guarda, US1 pode piorar o aproveitamento e viola o Princípio III).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1, US2, US3 conforme spec.md

## Path Conventions

Single project. Produção em `src/lib/engine/` e `src/pages/`; testes em `src/test/`.

---

## Phase 1: Setup

**Purpose**: fixar a linha de base antes de mexer em qualquer coisa.

- [x] T001 Registrar a baseline ANTES da mudança: rodar `npm test` e anotar o sumário verde no rascunho de trabalho; rodar `npx vitest run src/test/consolidate-columns-x.test.ts` e confirmar os 5 casos existentes passando
- [x] T002 Medir e anotar o número de chapas ATUAL no app com o âncora `of_geral_parcial (3).xls` seguindo `specs/016-agrupamento-alturas-proximas/quickstart.md` §5 (esperado: 31). Sem este número não há como julgar SC-002 depois

**Checkpoint**: baseline conhecida (testes verdes + nº de chapas).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: mudanças estruturais na função que TODAS as stories usam. Sem elas nenhuma story
pode ser implementada.

**⚠️ CRITICAL**: nenhuma story começa antes desta fase terminar.

- [x] T003 Adicionar o 5º parâmetro opcional `tol?: number` à assinatura de `consolidateColumnsX` em `src/lib/engine/tree-utils.ts:472`, com a semântica de TRÊS estados do contrato (omitido = desligado; `0` = sem piso físico; `> 0` = piso). Nenhuma mudança de comportamento ainda: com `tol` omitido o código segue o caminho atual
- [x] T004 Estender a função interna `single(x)` (`src/lib/engine/tree-utils.ts:481`) para devolver também o índice original `idx` da coluna, conforme `ColumnInfo` em `data-model.md`. Regras de candidatura permanecem inalteradas
- [x] T005 Verificar que `npx vitest run src/test/consolidate-columns-x.test.ts` e `npx tsc -p tsconfig.app.json --noEmit` continuam verdes após T003/T004 (refactor puro, zero mudança de saída)

**Checkpoint**: assinatura e dados intermediários prontos; comportamento ainda idêntico ao de hoje.

---

## Phase 3: User Story 1 — Agrupar colunas de alturas próximas (Priority: P1) 🎯 MVP

**Goal**: colunas cujas peças têm alturas diferentes (diferença nula ou ≥ `tol`) passam a formar
uma faixa única de altura `max(h)`, com corte de correção preservando a altura original de cada
peça mais baixa.

**Independent Test**: com o cenário-âncora (peças de altura 2388 e 2320, `tol = 50`), a árvore
resultante tem UMA faixa `Y(2388)`, a peça de 2320 aparece sob `Z(w) → W(2320)`, e a sobra do
topo é um bloco único de largura somada. Sem tocar em app nem em preenchimento.

### Tests for User Story 1 ⚠️

> Escrever ANTES da implementação e confirmar que FALHAM.

- [x] T006 [P] [US1] Caso G1 em `src/test/consolidate-columns-x.test.ts`: 2 colunas (peças 592×2388 e 561×2320) com `tol = 50` ⇒ 1 faixa `Y(2388)`, peça 2320 sob `Z→W(2320)`, largura da faixa = soma das larguras de COLUNA
- [x] T007 [P] [US1] Caso G2 em `src/test/consolidate-columns-x.test.ts`: diferença de 12 mm com `tol = 50` ⇒ NÃO agrupa, árvore inalterada (guarda FÍSICA)
- [x] T008 [P] [US1] Caso G3 em `src/test/consolidate-columns-x.test.ts`: diferença exatamente igual a `tol` ⇒ agrupa (limite inclusivo)
- [x] T009 [P] [US1] Caso G4 em `src/test/consolidate-columns-x.test.ts`: 3 colunas de alturas 2388/2320/2000 com `tol = 50` ⇒ conjunto único, cada peça com a sua altura original
- [x] T010 [P] [US1] Caso G6 (regressão C9) em `src/test/consolidate-columns-x.test.ts`: alturas idênticas com `tol` qualquer ⇒ saída idêntica à da spec 015. Inclui manter verde o teste existente "não agrupa colunas de alturas diferentes", que chama SEM `tol`
- [x] T011 [P] [US1] Caso G7 em `src/test/consolidate-columns-x.test.ts`: conservação após G1 e G4 — multiset de `(w, h, label)` preservado (INV-A) e `calcPlacedArea` não regride (INV-C). É o teste que pega peça fantasma

### Implementation for User Story 1

- [x] T012 [US1] Substituir a formação de conjuntos por altura exata (`byHeight` com `Math.round(h)`, `src/lib/engine/tree-utils.ts:520-530`) pela formação GULOSA determinística de `research.md` R5: candidatos ordenados por altura DESC com desempate por `idx` ASC; semente = mais alto livre; absorve todo livre com `diff === 0` ou `diff >= tol`; conjuntos com < 2 membros descartados
- [x] T013 [US1] Construir a faixa com `bandH = max(h)` do conjunto e emitir o CORTE DE CORREÇÃO em `src/lib/engine/tree-utils.ts:546-550`: membro com `h === bandH` continua folha `Z(w)`; membro com `h < bandH − EPS` vira `Z(w) → W(h)[peça]`. `wSum = Σ colW` permanece como está (INV-B)
- [x] T014 [US1] Ajustar `fillStrip` (`src/lib/engine/tree-utils.ts:551`) para usar `usableH − bandH` como altura da tira (hoje usa `s.h` da primeira coluna, que deixa de ser a altura da faixa)
- [x] T015 [US1] Rodar `npx vitest run src/test/consolidate-columns-x.test.ts` e `npx tsc -p tsconfig.app.json --noEmit`; T006–T011 devem passar

**Checkpoint**: agrupamento por altura próxima funciona no nível da árvore, sem guarda econômica
e sem estar ligado no app.

---

## Phase 4: User Story 2 — Não agrupar quando piora (Priority: P1)

**Goal**: rejeitar a fusão de um conjunto quando ela encolhe o maior bloco livre da chapa.

**Independent Test**: montar um conjunto dentro do limiar cuja fusão reduz o maior retângulo
livre e verificar que as colunas permanecem intactas.

**⚠️ Dependência real**: MESMA função da US1 — implementar em sequência, não em paralelo.

### Tests for User Story 2 ⚠️

- [x] T016 [P] [US2] Caso G5 em `src/test/consolidate-columns-x.test.ts`: conjunto cuja fusão encolhe o maior bloco livre ⇒ rejeitado, colunas preservadas estruturalmente. Cenário sugerido: colunas 393 com peças de altura 2500 e 1800 e `tol = 0` — a fusão daria tira de 786×690 (542k) contra o bloco livre atual de 393×1390 (546k)
- [x] T017 [P] [US2] Caso complementar em `src/test/consolidate-columns-x.test.ts`: conjunto cuja fusão AUMENTA o maior bloco livre ⇒ aceito (garante que a guarda não bloqueia tudo)

### Implementation for User Story 2

- [x] T018 [US2] Implementar a guarda econômica em `consolidateColumnsX` (`src/lib/engine/tree-utils.ts`): para cada conjunto candidato com alturas NÃO uniformes, medir `largestFreeRect` (já existe, `tree-utils.ts:392`) sobre um CLONE da árvore com e sem a fusão e rejeitar se a área do maior bloco encolher. A medição DEVE ocorrer ANTES de `fillStrip` (research R4) — medir depois reprovaria justamente os casos bem-sucedidos
- [x] T019 [US2] Garantir que um conjunto rejeitado devolve as colunas ao `ROOT` na ordem e estrutura ORIGINAIS (C5: identidade estrutural, não equivalência), e que a rejeição de um conjunto não impede a avaliação dos demais na mesma chapa
- [x] T020 [US2] Verificar que conjuntos de altura uniforme continuam passando trivialmente pela guarda (`Σ colW × sobra ≥ max colW × sobra`) e que T010 (regressão C9) segue verde

**Checkpoint**: agrupamento seguro — só ocorre quando não piora a sobra. Ainda desligado no app.

---

## Phase 5: User Story 3 — Preencher a sobra consolidada (Priority: P2)

**Goal**: ligar a feature no plano e deixar a tira consolidada ser preenchida com as peças
restantes, como já acontece no caso de altura idêntica.

**Independent Test**: com peças restantes que caibam na tira, verificar que elas são colocadas
lá e que nenhuma peça já colocada é reutilizada.

### Tests for User Story 3 ⚠️

- [x] T021 [P] [US3] Caso G9 em `src/test/consolidate-columns-x.test.ts`: cenário G1 com `fill` de peças que cabem na tira ⇒ peças do pool colocadas na tira única, sem repetir peça já colocada
- [x] T022 [P] [US3] Caso G8 em `src/test/consolidate-columns-x.test.ts`: determinismo (duas execuções sobre a mesma entrada ⇒ árvores estruturalmente idênticas, C7) e idempotência (segunda passada não altera o resultado, C8)

### Implementation for User Story 3

- [x] T023 [US3] Passar `minBreak` como `tol` na chamada de `consolidateColumnsX` em `src/pages/Index.tsx:668` — é o ponto em que a feature entra em produção. `minBreak` já está em escopo nesse bloco
- [x] T024 [US3] Conferir que `collapseRedundantCuts` (`src/pages/Index.tsx:675`), que roda logo depois, colapsa o `W` de correção quando ele não subdivide (diff = 0) e NÃO colapsa quando subdivide (diff > 0), preservando o resíduo

**Checkpoint**: feature ligada no app, com preenchimento.

---

## Phase 6: Polish, Medição e Aceite

**Purpose**: as verificações que realmente decidem se a feature fica.

- [x] T025 Rodar `npm test` completo e comparar com a baseline do T001. `heuristics-benchmark.test.ts` não pode regredir em aproveitamento. Julgar pelo SUMÁRIO, não pelo exit code (flake conhecido do worker do vitest)
- [!] T026 Validação visual do cenário-âncora no app conforme `quickstart.md` §4, com Quebra Mínima em 50 mm: as peças `02545/26` (2388) e `02554/26` (2320) numa faixa única, a de 2320 com resíduo de 68 mm acima. FALHA A PROCURAR: peça de 2320 desenhada com 2388 (fantasma, violação de FR-006)
- [x] T027 Medir o número de chapas no âncora conforme `quickstart.md` §5 e comparar com o T002. **ACEITE: ≤ 31 chapas.** Se subir, reverter ou investigar ANTES de commitar — nem os testes nem o benchmark medem número de chapas
- [!] T028 Verificar conservação no plano do app conforme `quickstart.md` §6: 268/268 peças, nenhuma medida divergente do inventário
- [x] T029 [P] Atualizar o bloco da spec 016 em `CLAUDE.md` (entre os marcadores SPECKIT) trocando "PLANEJADA" pelo resultado real: número de chapas medido, o que funcionou e o que não funcionou
- [x] T030 [P] Atualizar `docs/AI_CONTEXT.md` com a regra nova do agrupamento em X (piso de maquinabilidade + guarda de bloco livre), na seção onde a spec 015 já está descrita

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as stories
- **US1 (Phase 3)**: depende da Phase 2
- **US2 (Phase 4)**: depende da US1 — mesma função, mesmo arquivo
- **US3 (Phase 5)**: depende da US2 (ligar no app sem a guarda arriscaria o aproveitamento)
- **Polish (Phase 6)**: depende de US1+US2+US3

### Within Each User Story

- Testes escritos e FALHANDO antes da implementação
- Formação de conjuntos (T012) antes da construção da faixa (T013) antes do ajuste da tira (T014)
- Guarda (T018) antes do comportamento de rejeição (T019)

### Parallel Opportunities

- Todos os testes marcados [P] dentro de uma story podem ser escritos juntos (são casos
  independentes no mesmo `describe`)
- T029 e T030 são arquivos de documentação diferentes ⇒ paralelos
- **NÃO paralelizável**: T012–T014, T018–T019 e T023 tocam as mesmas duas funções

---

## Parallel Example: User Story 1

```bash
# Escrever juntos os casos de teste da US1 (mesmo arquivo, casos independentes):
Task: "G1 — âncora 2388/2320 agrupa com tol=50"
Task: "G2 — diferença 12 com tol=50 NÃO agrupa"
Task: "G3 — diferença igual a tol agrupa"
Task: "G4 — 3 colunas num conjunto"
Task: "G6 — regressão do caso uniforme"
Task: "G7 — conservação e área"
```

---

## Implementation Strategy

### MVP

O MVP útil é **US1 + US2 juntas** — não US1 sozinha. US1 sem a guarda pode reduzir o
aproveitamento, o que viola o Princípio III da constituição. US1 sozinha só é entregável como
checkpoint interno de desenvolvimento, nunca ligada no app.

### Ordem recomendada

1. Phase 1 + Phase 2 (baseline e assinatura)
2. Phase 3 (US1) — validar no nível de árvore
3. Phase 4 (US2) — a guarda
4. Phase 5 (US3) — ligar no app
5. Phase 6 — **o aceite real é o T027** (≤ 31 chapas no âncora)

### Critério de reversão

Se o T027 medir MAIS de 31 chapas, reverter. Precedente: a spec 014 fase 2 foi revertida
inteira por medir pior no app, mesmo com testes verdes.

---

## Notes

- Sem espelho Rust e sem rebuild WASM: `consolidateColumnsX` só existe em TS e não é chamada
  pelo motor (research R1). Se durante a implementação aparecer necessidade de mexer em
  `placement.ts`/`optimizer.ts`/`genetic.ts`, PARE — é sinal de que o desenho saiu do trilho
- Commitar por grupo lógico; a working tree já carrega as specs 011/013/015 não commitadas
- Nunca igualar as alturas para "simplificar" a faixa: isso cria peça fantasma (spec 012)

---

## Resultado da execução (2026-07-20)

- **T001** baseline: 271 testes verdes (exit 1 = flake conhecido do vitest-worker).
- **T025** depois: **282 verdes**, 0 falhas. `heuristics-benchmark` sem regressão.
- **T002/T027 — medição no app** (âncora `of_geral_parcial (3).xls`, 38 linhas):

  | Quebra Mínima | Feature OFF | Feature ON |
  |---|---|---|
  | 0 | 31 chapas / 25 layouts | **31 / 25** |
  | 50 | 32 chapas / 23 layouts | **32 / 23** |

  O 31→32 vem do `minBreak` no MOTOR (ele já alimentava `optimizeV6`/GA), não desta spec.
  **ACEITE cumprido no sentido "nunca pior"** (≤ 31 na configuração padrão), mas SEM ganho
  de chapas.
- **A feature dispara de verdade** (instrumentação temporária, removida depois): 46 conjuntos
  de altura próxima com quebra 0 (38 aceitos / 8 rejeitados pela guarda) e 50 com quebra 50
  (36 aceitos / 14 rejeitados). O valor entregue é CONSOLIDAÇÃO DA SOBRA, não menos chapas.
- **[!] T026 e T028 NÃO verificados por mim**: a validação visual do cenário-âncora (as duas
  peças na mesma faixa, resíduo de 68 mm) e a conferência de conservação no plano do app
  ficam para o usuário, que tem o cenário à vista.
