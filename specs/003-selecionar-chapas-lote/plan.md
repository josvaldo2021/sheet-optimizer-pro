# Implementation Plan: Selecionar Chapas ao Confirmar o Plano

**Branch**: `main` (trunk-based) | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-selecionar-chapas-lote/spec.md`

## Summary

Hoje `confirmAutoPlan` (em `Index.tsx`) confirma **todas** as chapas automáticas em
um único lote. A feature adiciona um estado de **seleção por chapa** e permite
confirmar apenas o subconjunto marcado; as não marcadas continuam disponíveis para
um lote posterior. A matemática de dedução/seleção é extraída para um módulo puro
e testável.

## Technical Context

**Language/Version**: TypeScript 5.x (React 18 + Vite).
**Primary Dependencies**: nenhuma nova.
**Testing**: vitest — teste unitário do módulo puro de seleção/dedução.
**Project Type**: SPA web; lógica de lote extraída como função pura.
**Constraints**: não regredir o fluxo atual (confirmar tudo com um clique).

## Constitution Check

| Princípio | Situação | Observação |
| --------- | -------- | ---------- |
| II. Pureza/agnóstico de UI | ✅ PASS | Seleção/dedução em `src/lib/lots/lot-selection.ts` (puro). UI só lê/escreve estado. |
| IV. Fonte da verdade | ✅ PASS | Dedução usa as `deductions` já registradas por chapa na geração do plano; não faz set-difference com inventário. |
| V. Determinismo e testes | ✅ PASS | Função pura coberta por teste (SC-001/SC-003/SC-004). |
| I, III, VI | ✅ N/A | Não toca no motor de corte. |

**Gate**: PASS.

## Project Structure

```text
specs/003-selecionar-chapas-lote/
├── spec.md, plan.md, tasks.md
└── checklists/requirements.md

src/lib/lots/lot-selection.ts          # NOVO — helpers puros (seleção, dedução, contagem)
src/test/lot-selection.test.ts         # NOVO — testes
src/pages/Index.tsx                    # estado `selected` por chapa + confirmAutoPlan refatorado
src/features/optimization/LayoutSummary.tsx  # checkbox por grupo + "N de ×M"
src/features/optimization/OptimizationPanel.tsx  # repassa callbacks + contador no botão
```

**Structure Decision**:
- Cada chapa ganha `selected?: boolean`; o default é **desmarcado** (`selected`
  ausente/`false` = fora do lote), análogo ao `manual` já existente.
- `confirmAutoPlan` confirma `chapas.filter(c => !c.manual && c.selected === true)`,
  marcando **apenas essas** como `manual` (confirmadas); as demais permanecem auto.
- A UI agrupa por layout idêntico; o checkbox do grupo alterna `selected` de todas
  as chapas do grupo, e um seletor "N de ×M" marca as N primeiras do grupo (cobre
  "10 de 30" mesmo quando os layouts se repetem).
- Helpers puros: `selectedAutoChapas`, `applyDeductions`, `countSelectedAuto`.

## Complexity Tracking

Sem violações. A granularidade por grupo+quantidade (em vez de chapa individual
crua) é a realização prática de "selecionar chapas" dado que a UI já apresenta
layouts idênticos agrupados — evita uma lista de 30 itens redundantes.
