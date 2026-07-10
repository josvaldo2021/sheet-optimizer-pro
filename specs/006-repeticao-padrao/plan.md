# Implementation Plan: Maximização de repetição de padrão de corte

**Branch**: `006-repeticao-padrao` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-repeticao-padrao/spec.md`

## Summary

Adicionar ao fluxo multi-chapa a capacidade de **escolher o padrão de corte pela sua
repetibilidade**, não só pelo aproveitamento de uma chapa. Hoje `runAllSheets`
(`src/pages/Index.tsx`) pede **um** layout ao otimizador (melhor por área) e replica
esse padrão quantas vezes o inventário permitir. Com a opção "priorizar repetição"
ligada, a cada etapa o sistema **monta um conjunto de candidatos**, calcula para cada
um a **repetição possível** (nº de chapas que o padrão cobre) e o **aproveitamento**,
**filtra pelos que ficam ≥ piso configurável** e escolhe o de **maior repetição**
(desempate por aproveitamento). Objetivo primário: **menos padrões distintos → menos
setups na serra** (FR-011). A opção vem **desligada por padrão** → zero regressão.

A lógica de seleção vive num **módulo puro e testável** (`src/lib/pattern-repetition.ts`),
consumido por `Index.tsx`. **Fase A não toca no motor (`src/lib/engine/**`) nem no
WASM** — é orquestração multi-chapa em TS.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18 + Vite

**Primary Dependencies**: motor existente (`optimizeV6`/`optimizeGeneticAsync` via
`cnc-engine`), utilitários de árvore (`extractUsedPiecesWithContext`, `calcPlacedArea`);
UI em `Index.tsx` + `SidebarSection.tsx`

**Storage**: N/A (estado em memória; configurações do usuário na sessão)

**Testing**: vitest (`src/test/`)

**Target Platform**: SPA no navegador (motor via WASM; fallback TS)

**Project Type**: Aplicação web SPA com motor de otimização reutilizável (single project)

**Performance Goals**: acréscimo de candidatos por etapa é barato — os candidatos
homogêneos são pontuados **analiticamente** (ladrilhamento), materializando a árvore
apenas do vencedor. Sem novas chamadas caras de GA por candidato.

**Constraints**: guilhotina; margens; corte mínimo; rotação; peças prioritárias;
determinismo da seleção. **Não** desligar agrupamento (Princípio III).

**Scale/Scope**: mudança concentrada em `runAllSheets` + 1 módulo puro novo + controles
de UI (toggle, piso, resumo). Sem mudança no motor de corte nem no WASM.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Conformidade |
| :--- | :--- |
| **I. Corte Guilhotina é Lei Física** | ✅ Não cria cortes novos; escolhe entre padrões que o motor já produziu (todos guilhotina). Chapas repetidas são cópias exatas de um padrão válido (FR-010). |
| **II. Motor Puro e Agnóstico de UI** | ✅ A lógica de seleção é um **módulo puro** (`src/lib/pattern-repetition.ts`): recebe candidatos + inventário + piso, retorna escolha + resumo. Não conhece React. `src/lib/engine/**` permanece intocado. |
| **III. Qualidade do Corte é Primária** | ✅ O **piso de aproveitamento** impede escolher repetição às custas de desperdício. Agrupamento permanece ligado. Opção OFF por padrão preserva o ótimo por área atual. |
| **IV. A Árvore de Corte é a Fonte da Verdade** | ✅ Composição/BOM de cada candidato é extraída **da árvore** (`extractUsedPiecesWithContext`), nunca por set-difference com o inventário. |
| **V. Determinismo e Cobertura de Testes** | ⚠️ A **seleção** é determinística (ver Complexity Tracking). A **geração** de candidatos via GA herda a aleatoriedade já existente do `optimizeGeneticAsync` (`Math.random`). Mitigação e escopo em Complexity Tracking + research.md. |
| **VI. Paridade TS↔WASM** | ✅ Fase A é orquestração TS pura; **não altera o motor** → nada a portar. Paridade preservada trivialmente. |

**Resultado**: PASS com uma nota de determinismo justificada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-repeticao-padrao/
├── plan.md
├── research.md          # decisões: fonte de candidatos, score, piso, determinismo
├── data-model.md        # Candidato, Padrão, Repetição, Piso, Resumo
├── quickstart.md        # como validar (testes + app)
├── contracts/
│   └── pattern-selection.md  # contrato do módulo puro de seleção
└── tasks.md             # (/speckit-tasks — não criado aqui)
```

### Source Code (repository root)

```text
src/lib/
├── pattern-repetition.ts   # NOVO — módulo puro: pontuação e seleção por repetição   [ADD]
│                           #   scoreCandidate(), selectByRepetition(), homogeneousCandidates()
src/pages/
├── Index.tsx               # runAllSheets: montar candidatos, chamar seleção, replicar [EDITAR]
│                           #   + estado: prioritizeRepetition, utilizationFloor, patternSummary
src/components/
├── SidebarSection.tsx      # controles: toggle "priorizar repetição" + slider piso     [EDITAR]
└── (resumo de padrões)     # exibir nº de padrões distintos + cobertura (reusa replicationInfo) [EDITAR]

src/test/
└── pattern-repetition.test.ts  # NOVO — seleção, piso, empate, fallback, determinismo  [ADD]
```

**Structure Decision**: Single project. A inteligência nova fica num **módulo puro
em `src/lib/`** (fora de `engine/`, pois é orquestração de inventário multi-chapa, não
corte guilhotina), o que a torna testável sem UI e mantém `engine/` estritamente
guilhotina. `Index.tsx` apenas monta candidatos, delega a decisão ao módulo e replica
o vencedor. UI expõe toggle + piso + resumo.

## Complexity Tracking

> Preenchido por causa da nota de determinismo no Constitution Check (Princípio V).

| Violação / Nota | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Determinismo **parcial**: a seleção é determinística, mas um candidato (o "melhor por área") vem do GA, que usa `Math.random()` — logo o padrão final pode variar entre execuções quando esse candidato vence. | O fluxo multi-chapa **já** usa o GA aleatório hoje (comportamento pré-existente, tolerado pelo Princípio V para componentes com aleatoriedade). Tornar a geração 100% determinística (semear o GA ou trocar por `optimizeV6` no loop) é mudança maior e ortogonal a esta feature. | Os candidatos **homogêneos** (ladrilhamento analítico) **são** determinísticos e a seleção é determinística. Os testes de FR-007/SC-005 usam um conjunto de candidatos **fixo/injetado**, validando a seleção sem depender do GA. Semear o GA fica como follow-up (research.md, Decisão 4). |
