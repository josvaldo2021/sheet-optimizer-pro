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

> ⚠️ **Resultado real (2026-07-18)**: o gate "< 17" NÃO se confirmou para este
> fixture. Com o agrupamento efetivamente rodando no TS (após remover o
> `skipExpensiveGrouping`, T036: ~30 s/grupo vs instantâneo), as 6 ordenações
> permanecem em **17 chapas**. Para ESTE input o agrupamento não bate o layout sem
> agrupamento — a meta "< 17" era aspiração, não garantia. O ganho comprovado da
> spec 012 é CONSERVAÇÃO (zero fantasma/peça perdida), verificado; a redução de
> chapas é input-dependente e é o alvo da spec 011 (lookahead residual).

## Resultados finais medidos (2026-07-18, após T008-T013/T022-T035 + T011/T024)

**Estado do código**: guard `hasLabels`/`has_labels` REMOVIDO nos dois motores;
validação no limite (T011/T024) ativa; WASM reconstruído.

| Gate | Resultado |
|---|---|
| T012 — `ga-phantom` + `quantity-groups` | ✅ VERDES (conservação + sem fantasma) |
| T017 — suíte completa | ✅ 221 passaram, 2 pulados; 1 "falha" = flake do vitest-worker (`Timeout onTaskUpdate` no benchmark, que passa isolado). Duração **363 s** (~9× vs 61 s, dentro do esperado por FR-008) |
| T018 — benchmark | ✅ sem regressão, determinístico (baseline não regravado — sem melhora a registrar). Reexecutado após remover o `skipExpensiveGrouping` (T036): 7/7 ainda verdes, sem regressão |
| T019 — `ga-determinism` | ✅ verde |
| T032/T035 — `wasm-parity` | ✅ verde (contagem + conservação + fidelidade de medida) |

### T020/T021 — tempo no app (SC-008), relatório de OF real

Medido com o **motor de produção (WASM/GA, pop 10 × gen 10)** replicando o loop
multi-chapa de `runAllSheets` sobre `of_geral_parcial (3).xls` — **268 peças
físicas** rotuladas (uid por peça), chapa 6000×3210 (útil 5980×3190), agrupamento
LIGADO.

| Métrica | Valor |
|---|---|
| Peças físicas | 268 |
| Chapas geradas | 44 (coerente com ~42 do trabalho real conhecido; ótimo estimado ~30) |
| Conservação | 268/268 alocadas, 0 restantes |
| **Tempo total do plano** | **8,2 s** |
| 1ª chapa (mais cara) | 914 ms |

**Conclusão SC-008**: 8,2 s ≪ ~2 min. Ligar o agrupamento para peças rotuladas
NÃO estourou o tempo. A fragmentação (44 chapas) é o alvo da **spec 011**
(lookahead residual, ainda PLANEJADA) — a 012 corrige conservação/fantasma, não
fragmentação, então o "2º relato" do usuário deve ser re-medido após a 011.
