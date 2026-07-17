# Linha de base — antes da spec 012

**Medido em**: 2026-07-16 | **Branch**: `012-qualidade-pecas-identificadas` (a partir de `main`)
**Estado do código**: guard `hasLabels` ATIVO; correção de composição do `groupPiecesFillRow` já aplicada.

Registrado por T002 para comparação em T017 (suíte), T018 (benchmark) e T021 (tempo no app).

## Suíte completa (`npm test`)

| Métrica | Valor |
|---|---|
| Arquivos de teste | 19 passaram, 1 pulado (20) |
| Testes | 140 passaram, 2 pulados (142) |
| Duração | **61,68 s** |

> Os 5 testes de `replication-info-box.test.tsx` não estão aqui: pertencem ao branch
> `fix/replication-count-stale-input`, independente desta spec.

## Qualidade — cenário de 385 peças (`quantity-groups.test.ts`)

**A métrica que importa.** Inventário rotulado (uid por peça) ⇒ hoje cai no ramo SEM
agrupamento (2 variantes em vez de ~54).

| Grupo | Peças alocadas | Chapas |
|---|---|---|
| 1 — ordem original | 385 | **17** |
| 2 — área desc | 385 | **17** |
| 3 — área asc | 385 | **17** |
| 4 — maior dim desc | 385 | **17** |
| 5 — perímetro desc | 385 | **17** |
| 6 — altura desc | 385 | **17** |

**17 chapas em todas as 6 ordenações.** É o alvo: se a spec 012 entregar o que promete,
este número deve **cair**. Conservação já correta hoje (385 = 385) porque o guard impede
o agrupamento de encontrar o rótulo.

## Comportamento conhecido com o guard DESLIGADO (o bug)

Medido durante a investigação (research.md). É o que a US1 precisa eliminar:

| Gate | Resultado |
|---|---|
| `ga-phantom.test.ts` | **FALHA** — `["chapa 2: 250x800 (label __19)", "chapa 2: 250x800 (label __12)"]` |
| `quantity-groups.test.ts` | **FALHA** — `expected 429 to be 385` (44 peças materializadas) |
| Suíte completa | ~**510 s** (~9× mais lenta) |

## Critérios de comparação

| Depois de | Esperado |
|---|---|
| T012 (US1) | `ga-phantom` e `quantity-groups` VERDES com o guard desligado |
| T017 (US2) | Suíte verde; ~510 s aceito (FR-008) |
| T018 (US2) | Benchmark sem regressão; se melhorar ⇒ regravar baseline |
| T021 (US3) | Plano típico em ~2 min com progresso |
| **Chapas (385 peças)** | **< 17** ⇒ ganho material comprovado |
