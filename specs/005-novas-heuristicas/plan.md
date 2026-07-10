# Implementation Plan: Duas novas heurísticas de otimização

**Branch**: `005-novas-heuristicas` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-novas-heuristicas/spec.md`

## Summary

Ampliar o repertório de estratégias de ordenação do otimizador com **duas novas
heurísticas de arranjo**, adicionadas ao conjunto avaliado por `optimizeV6` (e,
por reuso, pelo algoritmo genético). Como o otimizador já mantém apenas o **melhor
plano** entre todas as estratégias (maior área ocupada; empate resolvido por
compacidade determinística), acrescentar estratégias é **monotônico**: só pode
melhorar ou empatar o resultado — nunca piorar. O trabalho consiste em (1)
escolher duas ordenações que preencham lacunas do conjunto atual, (2) implementá-las
em **paridade TS↔Rust/WASM**, e (3) provar com testes de regressão que ao menos um
cenário-alvo melhora e nenhum regride.

## Technical Context

**Language/Version**: TypeScript 5.x (motor de referência) + Rust (ponte WASM), React 18 + Vite

**Primary Dependencies**: Motor puro em `src/lib/engine/`; `wasm-engine/` (Rust → wasm-pack); vitest para testes

**Storage**: N/A (motor puro, sem I/O)

**Testing**: vitest (`src/test/`), fixtures xlsx/rpt em `parts/` e `src/test/fixtures/`

**Target Platform**: SPA no navegador; motor roda em TS puro e em WASM

**Project Type**: Aplicação web SPA com motor de otimização reutilizável (single project)

**Performance Goals**: +2 estratégias sobre um conjunto de 12 (~17% a mais de
avaliações de ordenação por variante). O conjunto de ordenações é o eixo mais
barato do laço (o custo pesado está nas variantes de agrupamento, já
"gated"). Impacto de tempo esperado: marginal e imperceptível em uso normal.

**Constraints**: Corte guilhotina; margens (`ml/mr/mt/mb`); `minBreak`; rotação 90°
salvo restrição; determinismo total; paridade TS↔WASM.

**Scale/Scope**: Mudança cirúrgica em 2 arquivos de motor (1 TS, 1 Rust) + testes.
Sem mudança de UI, tipos, contratos externos ou estruturas de dados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Conformidade |
| :--- | :--- |
| **I. Corte Guilhotina é Lei Física** | ✅ As heurísticas só reordenam a lista de peças antes do posicionamento; `runPlacement` (inalterado) continua sendo o único a produzir cortes, todos guilhotina. |
| **II. Motor Puro e Agnóstico de UI** | ✅ Mudança 100% dentro de `src/lib/engine/` e `wasm-engine/src/`; comparadores são funções puras de `(Piece,Piece)→number`. Sem UI, I/O ou efeitos colaterais. |
| **III. Qualidade do Corte é Primária (NON-NEGOTIABLE)** | ✅ Objetivo é aproveitamento. Agrupamento permanece ligado (não se toca em `useGrouping`). Monotonicidade garante não-regressão de aproveitamento. |
| **IV. A Árvore de Corte é a Fonte da Verdade** | ✅ Nada muda na extração/contagem; a seleção do melhor plano segue por área da árvore + compacidade, como hoje. |
| **V. Determinismo e Cobertura de Testes** | ✅ Comparadores são determinísticos; desempate de seleção inalterado (`>` estrito preserva incumbente em empate). Novos testes de regressão obrigatórios. |
| **VI. Paridade TS↔WASM** | ✅ As duas ordenações são adicionadas em `getSortStrategies()` (TS) **e** em `cmp_by_strategy` + `NUM_SORT_STRATEGIES` (Rust), com semântica idêntica. |

**Resultado**: PASS. Nenhuma violação; seção "Complexity Tracking" não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/005-novas-heuristicas/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — análise de lacunas e escolha das heurísticas
├── data-model.md        # Fase 1 — entidade "estratégia de ordenação" e invariantes
├── quickstart.md        # Fase 1 — como validar (build TS/WASM + testes)
├── contracts/
│   └── sort-strategy.md  # Contrato interno da estratégia de ordenação (TS+Rust)
└── tasks.md             # Fase 2 (/speckit-tasks) — NÃO criado aqui
```

### Source Code (repository root)

```text
src/lib/engine/
├── optimizer.ts         # getSortStrategies(): +2 comparadores asc (12 → 14)  [EDITAR]
├── genetic.ts           # reusa getSortStrategies() — herda as novas          [sem edição]
├── placement.ts         # runPlacement — inalterado
└── ...

wasm-engine/src/
├── optimizer.rs         # cmp_by_strategy: +2 arms; NUM_SORT_STRATEGIES 12→14 [EDITAR]
├── genetic.rs           # usa NUM_SORT_STRATEGIES — herda as novas             [sem edição]
└── post_processing.rs   # usa NUM_SORT_STRATEGIES — herda as novas             [sem edição]

src/test/
├── optimization.test.ts # cenários de regressão de aproveitamento             [EDITAR/ADD]
└── new-heuristics.test.ts (novo) # monotonicidade + paridade + cenário-alvo   [ADD]
```

**Structure Decision**: Single project. A feature é uma extensão pontual do motor
existente. Os pontos de edição são exatamente dois arquivos de produção
(`optimizer.ts`, `optimizer.rs`) por causa da **paridade obrigatória** (Princípio VI);
tudo o mais (genetic TS/Rust, post-processing) herda automaticamente por reuso de
`getSortStrategies()` / `NUM_SORT_STRATEGIES`.

## Complexity Tracking

> Não aplicável — Constitution Check passou sem violações.
