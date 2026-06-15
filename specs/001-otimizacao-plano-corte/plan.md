# Implementation Plan: Otimização de Plano de Corte

**Branch**: `001-otimizacao-plano-corte` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-otimizacao-plano-corte/spec.md`

**Note**: Plano **retroativo** — descreve a arquitetura já implementada do motor de
otimização, servindo de linha de base para evoluções futuras.

## Summary

O motor de otimização recebe uma lista de peças retangulares e as dimensões úteis
da chapa e produz uma árvore de corte guilhotina (`TreeNode`) que maximiza o
aproveitamento de material. Há duas entradas principais: `optimizeV6` (heurístico,
síncrono, com 50+ estratégias de ordenação/agrupamento) e `optimizeGeneticAsync`
(algoritmo genético, assíncrono, com progresso). O motor é TypeScript puro, com
uma implementação espelho em Rust→WASM; `engine-adapter.ts` despacha entre as duas
e cai para TS em caso de falha do WASM. A otimização multi-chapa vive na UI
(`runAllSheets` em `Index.tsx`), que chama o motor em loop deduzindo peças por
chapa.

## Technical Context

**Language/Version**: TypeScript 5.x (React 18 + Vite); motor espelho em Rust
compilado para WebAssembly.

**Primary Dependencies**: React, Vite, Tailwind + shadcn/ui (UI); `jspdf`, `xlsx`
(exportação — fora do escopo deste spec); módulo WASM (`wasm-bridge.ts`).

**Storage**: sem persistência de servidor. `localStorage` guarda apenas a flag
`useWasmEngine` (TS vs WASM).

**Testing**: vitest (`src/test/`), com fixtures `.xlsx` em `parts/` e
`src/test/fixtures/`.

**Target Platform**: navegador com suporte a WebAssembly; o motor TS roda em
qualquer runtime JS (e nos testes Node/vitest).

**Project Type**: SPA web com uma biblioteca de otimização pura (`src/lib/engine/`)
reutilizável e agnóstica de UI.

**Performance Goals**: GA executa de forma assíncrona reportando progresso
(`OptimizationProgress`) para não travar a UI; multi-chapa itera até alocar todo o
inventário (teto de segurança `maxSheets`).

**Constraints**: cortes exclusivamente guilhotina; resultado determinístico para o
mesmo input; paridade TS↔WASM; nunca operar com agrupamento desligado.

**Scale/Scope**: inventários de dezenas a milhares de peças distribuídas em
múltiplas chapas; meta de 30+ peças/chapa em cenários de referência.

## Constitution Check

*GATE: deve passar antes da Fase 0 e ser reavaliado após a Fase 1.*

| Princípio | Situação | Evidência |
| --------- | -------- | --------- |
| I. Corte guilhotina é lei física | ✅ PASS | A árvore `TreeNode` (tipos `ROOT/X/Y/Z/W/Q/R`) codifica cortes de borda a borda; nenhuma alocação não retangular. |
| II. Motor puro e agnóstico de UI | ✅ PASS | `src/lib/engine/**` não importa React/DOM; recebe `Piece[]`, retorna `TreeNode`. A multi-chapa (que toca UI) fica em `Index.tsx`, fora do motor. |
| III. Qualidade primária (NON-NEGOTIABLE) | ✅ PASS | `optimizeV6` usa agrupamento por padrão; `useGrouping=false` não é usado em produção (só em testes de comparação). |
| IV. Árvore como fonte da verdade | ✅ PASS | Contagem/área derivam da árvore (`calcPlacedArea`, `countAllocatedPieces`); `runAllSheets` extrai peças da árvore, não por set-difference. |
| V. Determinismo e testes | ✅ PASS | `optimizeV6` é determinístico; suíte em `src/test/` cobre regressões. ⚠ ver Complexity Tracking para o GA. |
| VI. Paridade TS↔WASM | ✅ PASS | `engine-adapter.ts` despacha e cai para TS no erro; ambas implementam o mesmo contrato. |

**Resultado do gate**: PASS. Uma observação sobre determinismo do GA está
registrada em Complexity Tracking (não é violação, é restrição documentada).

## Project Structure

### Documentation (this feature)

```text
specs/001-otimizacao-plano-corte/
├── plan.md              # Este arquivo (/speckit-plan)
├── spec.md              # O QUÊ/POR QUÊ (/speckit-specify)
├── research.md          # Fase 0 — decisões de design já tomadas no código
├── data-model.md        # Fase 1 — entidades (TreeNode, Piece, ...)
├── quickstart.md        # Fase 1 — como validar o motor
├── contracts/
│   └── engine-api.md     # Contrato da API pública do motor
└── tasks.md             # Fase 2 (/speckit-tasks — não criado aqui)
```

### Source Code (repository root)

```text
src/lib/engine/
├── types.ts             # TreeNode, Piece, PieceItem, OptimizationProgress, Lot
├── engine-adapter.ts    # Despacho TS↔WASM; entradas optimizeV6 / optimizeGeneticAsync
├── optimizer.ts         # optimizeV6 (heurístico) + getSortStrategies
├── genetic.ts           # optimizeGeneticAsync / optimizeGeneticV1 (GA)
├── placement.ts         # runPlacement / createPieceNodes — inserção física na árvore
├── grouping.ts          # ~20 estratégias de agrupamento de peças
├── scoring.ts           # scoreFit, regras de minBreak, posições de corte Z
├── normalization.ts     # normalizeTree — consolida sobras (W/Q/R)
├── post-processing.ts   # postOptimizeRegroup, unifyColumnWaste, collapse/clamp
├── void-filling.ts      # fillVoids — preenche vazios com peças restantes
├── tree-utils.ts        # createRoot, clone, find, calcPlacedArea, countAllocatedPieces
└── wasm-bridge.ts       # tryInitWasm, getWasm, isWasmReady

src/lib/cnc-engine.ts    # Barrel: API pública consumida pela UI
src/pages/Index.tsx      # runAllSheets — orquestração multi-chapa (camada de UI)
src/test/                # Testes de regressão (optimization.test.ts, regroup-waste.test.ts)
```

**Structure Decision**: o motor é uma biblioteca pura em `src/lib/engine/`,
exposta por um barrel (`src/lib/cnc-engine.ts`). A orquestração multi-chapa NÃO
está no motor — vive em `Index.tsx` (`runAllSheets`) porque coordena estado/progresso
de UI. Essa separação preserva os Princípios II e VI.

## Complexity Tracking

> Preenchido apenas para registrar restrições/observações relevantes (não há
> violações de constituição).

| Item | Por que existe | Como é mitigado |
| ---- | -------------- | --------------- |
| Algoritmo genético tem componente estocástico | GA explora um espaço de soluções maior que o heurístico puro, melhorando aproveitamento | População inicial vem de estratégias heurísticas determinísticas; testes asseguram limites/aproveitamento mínimo em vez de igualdade exata de plano (Princípio V) |
| Duas implementações (TS + WASM) | WASM dá performance; TS é referência/fallback e roda nos testes | `engine-adapter.ts` centraliza o despacho e cai para TS no erro; paridade é exigida por contrato (Princípio VI) |
| Multi-chapa fora do motor | Coordena progresso e estado de UI | Mantida em `Index.tsx`; o motor permanece puro e testável isoladamente |
