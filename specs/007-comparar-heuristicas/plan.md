# Implementation Plan: Comparar Heurísticas e Evoluir o Otimizador

**Branch**: `main` (sem branch dedicada até aqui) | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-comparar-heuristicas/spec.md`

## Summary

Confrontar o catálogo de heurísticas da literatura (`heuristicas.md`, movido para
`specs/007-comparar-heuristicas/heuristicas.md` como fonte versionada) com o
comportamento real do motor (`optimizeV6` + agrupamentos + GA), produzir um relatório de
cobertura e uma priorização ranqueada, montar um harness de benchmark com baseline
persistido, e então evoluir o motor apenas com técnicas que comprovem ganho no benchmark
sem regressão. A abordagem técnica segue o padrão da spec 005: candidatos entram como
**novas estratégias no torneio existente** do `optimizeV6` (monotonicidade: adicionar
estratégia nunca piora o melhor resultado), com paridade TS↔WASM no mesmo PR. Exceção:
o candidato de determinismo (PRNG semeado no GA) altera infraestrutura, não estratégia.

Divisão em duas fases de entrega, como na spec 006:

- **Fase A — Análise e baseline (não toca o motor):** relatório comparativo,
  priorização, harness de benchmark e baseline registrado. Cobre User Stories 1 e 2 e
  FR-001..FR-004, FR-008.
- **Fase B — Evolução medida (toca o motor, TS + Rust):** implementar os candidatos
  priorizados, medir contra o baseline, adotar somente aprovados. Cobre User Story 3 e
  FR-005..FR-007.

## Technical Context

**Language/Version**: TypeScript 5 (ES2020, Vite) para o motor de referência; Rust
(edition 2021, `wasm32-unknown-unknown`) para a ponte WASM em `wasm-engine/`.

**Primary Dependencies**: motor puro sem dependências externas; UI React 18 + shadcn
(não afetada na Fase A; Fase B não muda API pública do motor). Testes com Vitest.

**Storage**: arquivos versionados — relatório e priorização em markdown dentro de
`specs/007-comparar-heuristicas/`; baseline de benchmark em JSON dentro de
`src/test/fixtures/`.

**Testing**: `npm test` (vitest, `src/test/`); `npx tsc --noEmit`; testes Rust via
`cargo test` em `wasm-engine/` quando a Fase B tocar o motor Rust; teste de paridade
TS↔WASM existente como regressão.

**Target Platform**: navegador (SPA); motor executa em thread principal/worker e em WASM.

**Project Type**: SPA web com biblioteca de otimização pura embutida.

**Performance Goals**: a suíte de benchmark completa deve rodar dentro do `npm test`
sem estourar o tempo atual da suíte em mais de ~50% (benchmark é teste, não produto).
Nenhum requisito novo de latência do otimizador em produção.

**Constraints**: corte guilhotina obrigatório; determinismo (mesmo input → mesmo plano);
margens/`minBreak` respeitados; paridade TS↔WASM para qualquer mudança de motor;
aproveitamento nunca regride em cenário existente (piso da spec, FR-005).

**Scale/Scope**: catálogo com 15 técnicas em 4 grupos; suíte de benchmark com ≥ 5
cenários nomeados; Fase B limitada aos 2–3 candidatos top-ranqueados (decisão final na
priorização, gated por medição).

## Constitution Check

*GATE: aprovado pré-Fase 0; reavaliado pós-Fase 1 — sem violações novas.*

| Princípio | Avaliação |
| --- | --- |
| I. Corte guilhotina é lei física | ✅ Técnicas de posicionamento livre (BL/BLF puro) são classificadas **não aplicáveis** no relatório, nunca implementadas. Candidatos da Fase B operam dentro da árvore guilhotinada existente. |
| II. Motor puro e agnóstico de UI | ✅ Fase A não toca o motor. Fase B só altera `src/lib/engine/**` / `wasm-engine/src/**` mantendo pureza (dados → dados). Harness de benchmark vive em `src/test/`, fora do motor. |
| III. Qualidade do corte é objetivo primário | ✅ É o próprio tema da feature: adoção condicionada a "nenhum cenário piora + ao menos um melhora" (FR-005). Candidatos entram como estratégias adicionais no torneio → monotonicidade por construção. |
| IV. Árvore de corte é a fonte da verdade | ✅ O harness mede aproveitamento/chapas exclusivamente a partir da `TreeNode` (percurso tipo `extractAll`/área posicionada), nunca por set-difference de inventário. |
| V. Determinismo e cobertura de testes | ⚠️→✅ **Achado pré-existente**: o GA de produção usa aleatoriedade sem semente (não introduzido por esta feature). O candidato C1 da priorização corrige isso (PRNG semeado). O baseline da Fase A mede o caminho determinístico (`optimizeV6`); o GA só entra no benchmark após semeado. Nenhuma técnica nova com aleatoriedade é adotada sem semente fixa. |
| VI. Paridade TS↔WASM | ✅ Qualquer mudança de motor na Fase B edita os dois lados no mesmo PR (padrão da spec 005: correspondência posicional de estratégias, teste de paridade como gate). |

## Project Structure

### Documentation (this feature)

```text
specs/007-comparar-heuristicas/
├── spec.md
├── plan.md                    # este arquivo
├── research.md                # Fase 0 — fatos do motor + classificação preliminar + candidatos
├── data-model.md              # Fase 1 — entidades (técnica, classificação, oportunidade, cenário, medição)
├── quickstart.md              # Fase 1 — como rodar benchmark, atualizar baseline, validar
├── contracts/
│   └── benchmark-contract.md  # Fase 1 — formato do baseline JSON + regras de comparação/adoção
├── heuristicas.md             # catálogo de referência (movido da raiz, fonte versionada)
├── relatorio-comparativo.md   # entregável US1 (produzido na implementação)
├── priorizacao.md             # entregável US2 (produzido na implementação)
└── tasks.md                   # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── lib/engine/                # Fase B somente — candidatos aprovados
│   ├── optimizer.ts           # torneio: novas estratégias/variantes entram aqui
│   ├── grouping.ts            # candidato best-fit residual (variante de agrupamento)
│   ├── genetic.ts             # candidato PRNG semeado (substituir Math.random)
│   └── ...                    # demais módulos intocados salvo necessidade medida
├── test/
│   ├── heuristics-benchmark.test.ts   # Fase A — harness: roda cenários, compara com baseline
│   └── fixtures/
│       └── benchmark-baseline.json    # Fase A — baseline persistido (aproveitamento + chapas por cenário)
wasm-engine/src/               # Fase B somente — paridade dos candidatos aprovados
├── optimizer.rs / grouping.rs / genetic.rs
```

**Structure Decision**: mesma partição da spec 006 — artefatos de análise em
`specs/007-comparar-heuristicas/`, harness e baseline em `src/test/` (teste, não
produto), mudanças de motor confinadas a `src/lib/engine/` + `wasm-engine/src/` na
Fase B. `heuristicas.md` sai da raiz para dentro da spec (FR-008: versionado junto aos
artefatos).

## Complexity Tracking

Sem violações constitucionais a justificar. O único ⚠️ (GA sem semente) é dívida
pré-existente que esta feature **reduz** (candidato C1), não complexidade nova.
