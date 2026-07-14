# Implementation Plan: Replanejar o plano automático após salvar layout com repetições

**Branch**: `main` (sem branch dedicada — fluxo atual do repositório) | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-replanejar-apos-salvar/spec.md`

## Summary

Salvar um layout ×N hoje deduz o inventário mas deixa na área de trabalho os
demais layouts do plano automático, que foram calculados assumindo aquelas mesmas
peças — contagem dupla e quantidades furadas. A correção: ao concluir qualquer
salvamento que deduza inventário enquanto existirem chapas automáticas não
confirmadas, descartar essas chapas (e os grupos de variantes obsoletos) e
**re-executar a geração de plano** com o inventário restante, preservando chapas
manuais/salvas e lotes. Abordagem técnica: parametrizar o gerador de plano
existente (`optimizeAllSheets` em `src/pages/Index.tsx`) para aceitar um
inventário explícito, e mover a lógica decidível (BOM do layout, dedução ×N,
máximo de repetições, partição manual/automática, invariante de conservação)
para um módulo puro em `src/lib/lots/`, testado em vitest.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 18, Vite

**Primary Dependencies**: motor próprio em `src/lib/engine/` (`optimizeGeneticAsync`, `optimizeV6`), helpers puros em `src/lib/lots/` e `src/lib/pattern-repetition.ts`; UI shadcn/Tailwind (não tocada além dos componentes de feature)

**Storage**: nenhum — estado de sessão em memória (React state em `Index.tsx`)

**Testing**: vitest (`npm test`); harness de aproveitamento `src/test/heuristics-benchmark.test.ts` (não pode regredir)

**Target Platform**: navegador (SPA), build Vite

**Project Type**: web SPA single-project (`src/`)

**Performance Goals**: replanejamento com a mesma latência da geração de plano atual para o mesmo volume de peças (reusa o mesmo gerador, incluindo cache de layout por assinatura de inventário); indicador de progresso existente reutilizado

**Constraints**: determinismo (mesmo inventário restante → mesmo plano; GA já é semeado — spec 007); motor (`src/lib/engine/**`) não é alterado; conservação exata de quantidades (nunca negativo, nunca acima do inventário original)

**Scale/Scope**: 3 pontos de mudança na UI (`saveLayout`, `optimizeAllSheets` parametrizado, `selectGroup`) + 1 módulo puro novo + 1 arquivo de teste; nenhuma mudança em motor, WASM ou exportação

## Constitution Check

*GATE: aprovado antes da Fase 0; reavaliado após a Fase 1 — sem violações.*

| Princípio | Avaliação |
|-----------|-----------|
| I. Corte guilhotina é lei física | ✅ Nenhuma regra de corte é alterada; layouts salvos são clones de árvores já válidas. |
| II. Motor puro e agnóstico de UI | ✅ `src/lib/engine/**` intocado. A lógica nova decidível vai para módulo puro `src/lib/lots/layout-replication.ts` (dados → dados), seguindo o precedente de `src/lib/lots/lot-selection.ts`. Orquestração (estado React, progresso) permanece em `Index.tsx`. |
| III. Qualidade do corte é o objetivo primário | ✅ O replanejamento reusa o gerador existente por inteiro (mesmas `sortVariants`, mesmo critério de seleção de grupo, `useGrouping` inalterado) — qualidade idêntica à geração original. Gate: `heuristics-benchmark.test.ts` verde. |
| IV. A árvore de corte é a fonte da verdade | ✅ O BOM do layout salvo é extraído da árvore (`extractUsedPiecesWithContext`, árvores rotuladas nos dois fluxos de origem — plano e manual). Sem set-difference com inventário original. Armadilha do `n.label` documentada no contrato. |
| V. Determinismo e cobertura de testes | ✅ GA semeado (spec 007) ⇒ replanejamento determinístico. Módulo puro coberto por `src/test/layout-replication.test.ts`, incluindo o invariante de conservação (SC-001) e os casos de borda da spec. |
| VI. Paridade TS ↔ WASM | ✅ Motor não muda; nada a paridar. |

**Complexity Tracking**: não aplicável — nenhuma violação.

## Project Structure

### Documentation (this feature)

```text
specs/008-replanejar-apos-salvar/
├── spec.md              # Especificação (feita)
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões de desenho
├── data-model.md        # Fase 1 — entidades e transições de estado
├── quickstart.md        # Fase 1 — validação ponta a ponta
├── contracts/
│   └── layout-replication-contract.md  # Contrato do módulo puro + fluxo de save
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec (feito)
└── tasks.md             # Fase 2 (/speckit-tasks — não criado aqui)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── lots/
│       ├── lot-selection.ts          # existente — helpers puros de lote (referência de estilo)
│       └── layout-replication.ts     # NOVO — BOM, dedução ×N, maxReps, partição, invariante
├── pages/
│   └── Index.tsx                     # MODIFICADO — saveLayout, optimizeAllSheets(piecesOverride), selectGroup
├── features/
│   ├── command-bar/
│   │   ├── CommandBar.tsx            # inalterado (já delega onSaveLayout)
│   │   └── ReplicationInfoBox.tsx    # inalterado (clamp defensivo passa a existir também em saveLayout)
│   └── lots/                         # inalterado
└── test/
    └── layout-replication.test.ts    # NOVO — testes do módulo puro + invariantes
```

**Structure Decision**: single-project SPA existente. A feature adiciona um
módulo puro em `src/lib/lots/` (mesma pasta e estilo de `lot-selection.ts`,
criado na spec 003) e um arquivo de teste em `src/test/`. Toda a mudança de
comportamento visível ao usuário fica em `src/pages/Index.tsx`, que já é o dono
do estado de chapas/inventário/plano.

## Desenho da mudança (visão de implementação)

### 1. Módulo puro `src/lib/lots/layout-replication.ts`

Funções (assinaturas no contrato):

- `buildLayoutBom(usedPieces)` — agrega peças extraídas da árvore em BOM por
  dimensão normalizada (`min×max`), insensível à orientação. Hoje essa lógica
  está triplicada (`calcReplication`, `saveLayout`, `runAllSheets`); passa a ter
  uma única implementação.
- `maxRepetitions(pieces, bom)` — máximo de cópias inteiras do BOM suportadas
  pelo inventário (peça mais escassa limita). Usado por `calcReplication` e como
  clamp defensivo em `saveLayout` (FR-002).
- `deductBomTimes(pieces, bom, n)` — retorna cópia do inventário com N×BOM
  deduzido por dimensão (ambas orientações), sem permitir negativo; reporta
  falta (`shortfall`) se o inventário não cobre — chamador trata como erro.
- `partitionByManual(chapas)` — `{ manuais, autos }` por `manual === true`.
- `needsReplan(chapas)` — existe chapa automática não confirmada (`autos.length > 0`).

### 2. `optimizeAllSheets` parametrizado (`Index.tsx`)

Assinatura passa a `optimizeAllSheets(piecesOverride?: PieceItem[], opts?: { baseChapas?: Chapa[] })`:

- Sem argumentos: comportamento atual byte a byte (usa estado `pieces`, zera chapas).
- Com `piecesOverride`: gera o plano a partir do inventário informado; ao aplicar
  o resultado, `setChapas([...baseChapas, ...best])` em vez de substituir — as
  chapas manuais/salvas sobrevivem (FR-005).
- `setOptimizationGroups` recebe apenas os grupos automáticos novos (como hoje);
  ver item 4 para a interação com `selectGroup`.

### 3. `saveLayout(reps)` (`Index.tsx:1277`) — novo fluxo

1. Extrai peças da árvore ativa; monta BOM (`buildLayoutBom`).
2. Clamp defensivo: `n = min(reps, maxRepetitions(pieces, bom))`, mínimo 1;
   se `maxRepetitions === 0`, erro e aborta (nada é deduzido).
3. `deductBomTimes(pieces, bom, n)` → inventário restante (erro se `shortfall`).
4. Cria as N cópias `manual: true` (como hoje).
5. Se `needsReplan(chapas)` (FR-003):
   - descarta chapas automáticas e `optimizationGroups`/`patternSummary` antigos;
   - `setChapas([...manuais, ...novasCopias])`;
   - se restarem peças: `await optimizeAllSheets(inventárioRestante, { baseChapas: manuais+novasCopias })`
     com o progresso existente (`isOptimizing`/`setProgress`) (FR-004, US3);
   - se não restarem: plano fica só com salvos/manuais (edge case).
6. Senão (FR-009): comportamento atual (deduz, salva, reseta árvore).
7. Mensagem final: cópias salvas + replanejamento + chapas novas + peças
   restantes (FR-007).

### 4. `selectGroup` (`Index.tsx:1263`) preserva manuais

Hoje `setChapas(group.chapas)` descarta chapas manuais/salvas ao trocar de
variante. Após o replanejamento isso violaria FR-005 (o usuário trocaria de
grupo e perderia as cópias recém-salvas). Correção mínima:
`setChapas([...chapasManuaisAtuais, ...group.chapas])` e ajuste do índice ativo.

### 5. Testes (`src/test/layout-replication.test.ts`)

- Unitários do módulo puro: BOM com rotação, maxReps (escassez, zero, inventário
  vazio), dedução ×N exata, shortfall, partição.
- Invariante de conservação (SC-001): para cenários gerados, peças(salvas) +
  peças(deduzidas do inventário) conferem exatamente — nunca negativo.
- Regressão de fluxo (nível lógico, sem DOM): simulação save×N → partição →
  dedução → verifica que autos descartados e manuais preservados.
- Gates gerais: `npm test` (inclui `heuristics-benchmark.test.ts` e
  `ga-determinism.test.ts` intactos) e `npx tsc -p tsconfig.app.json --noEmit`.

## Phase 0 — Research

Ver [research.md](./research.md). Sem NEEDS CLARIFICATION pendentes — a decisão
de negócio central (re-otimizar o restante) foi tomada pelo usuário na fase de
especificação; as decisões de desenho D1–D6 estão registradas com alternativas.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — entidades (`PieceItem`, `Chapa`, `Lote`,
  `BOM de layout`, `Grupo de otimização`) e transições de estado do salvamento.
- [contracts/layout-replication-contract.md](./contracts/layout-replication-contract.md)
  — contrato do módulo puro (assinaturas, invariantes, erros) e contrato de
  comportamento do fluxo de save.
- [quickstart.md](./quickstart.md) — roteiro de validação ponta a ponta
  (testes + fluxo manual no dev server).
- Contexto do agente (`CLAUDE.md`, seção SPECKIT) atualizado para apontar a
  spec/plan 008.

## Constitution Re-Check (pós-Fase 1)

Sem mudanças em relação ao gate inicial: nenhum princípio violado, nenhuma
entrada em Complexity Tracking. O ponto de maior atenção segue sendo o Princípio
III — mitigado porque o replanejamento não introduz caminho de otimização novo,
apenas reexecuta o existente com inventário menor.
