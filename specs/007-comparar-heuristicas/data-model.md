# Data Model — Comparar Heurísticas e Evoluir o Otimizador

Entidades da feature. As três primeiras vivem em markdown versionado (artefatos de
análise); as duas últimas têm forma concreta em JSON/TS no harness de benchmark.

## TecnicaReferencia (markdown — `heuristicas.md` + `relatorio-comparativo.md`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | inteiro sequencial (1..N) | estável entre revisões do catálogo |
| `nome` | string | como aparece no catálogo |
| `grupo` | enum: `construtiva` \| `estrutural` \| `metaheuristica` \| `variante` | seções do catálogo |
| `descricao` | string | resumo do catálogo |

## ClassificacaoCobertura (markdown — `relatorio-comparativo.md`)

Uma por técnica; relatório é completo quando todas as técnicas têm exatamente uma.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `tecnicaId` | ref TecnicaReferencia | 1:1, cobertura total (FR-001) |
| `veredito` | enum: `coberta` \| `parcial` \| `ausente` \| `nao-aplicavel` | — |
| `justificativa` | string | baseada em comportamento observável; cita módulo/função quando há equivalência |
| `equivalencia` | string opcional | obrigatória quando `coberta`/`parcial` (o que no motor cumpre o papel) |
| `restricaoExcludente` | string opcional | obrigatória quando `nao-aplicavel` (FR-002) |

## OportunidadeEvolucao (markdown — `priorizacao.md`)

Derivada de classificações `ausente`/`parcial` (e ressalvas de `coberta`, ex.: GA sem
semente). Técnicas `nao-aplicavel` não geram oportunidade.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `codigo` | `C1`, `C2`, ... | ordem = posição no ranking |
| `tecnicaIds` | refs | uma oportunidade pode consolidar técnicas afins |
| `impactoEsperado` | enum `baixo`\|`medio`\|`alto` + texto | em aproveitamento/chapas (C1: determinismo) |
| `compatibilidade` | texto | análise vs guilhotina, rotação, margens, minBreak, determinismo |
| `esforco` | enum `baixo`\|`medio`\|`alto` | relativo, TS+Rust incluídos |
| `status` | enum: `selecionada-fase-b` \| `condicional` \| `futura` \| `descartada` | descartadas exigem motivo (FR-003) |
| `resultadoMedicao` | texto opcional | preenchido na Fase B: aprovada/reprovada + números (FR-007) |

## CenarioBenchmark (JSON — `src/test/fixtures/benchmark-baseline.json`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `nome` | string única | ex.: `pequenas-alto-volume` |
| `perfil` | enum: `pecas-pequenas` \| `pecas-grandes` \| `misto` \| `alto-volume` \| `restricoes-agressivas` | suíte cobre os 5 perfis (FR-004) |
| `chapa` | `{ w, h, ml, mr, mt, mb, minBreak }` | dimensões brutas + margens |
| `pecas` | `{ w, h, qty, label? }[]` | inventário do cenário |
| `permiteRotacao` | boolean | default `true` |

## Medicao (JSON — mesmo arquivo, seção `baseline`; e saída do harness)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `cenario` | ref CenarioBenchmark.nome | — |
| `aproveitamento` | número 0–100, 2 casas | derivado da árvore (área posicionada / área útil), nunca de set-difference |
| `chapas` | inteiro ≥ 1 | nº de chapas do plano multi-chapa |
| `pecasAlocadas` | inteiro | contagem via percurso de folhas ignorando `label` |
| `versaoAlgoritmo` | string | ex.: `baseline-2026-07`, `pos-C2` |

**Regras de comparação** (detalhe no [contrato](./contracts/benchmark-contract.md)):
regressão = `aproveitamento` menor **ou** `chapas` maior que o baseline em qualquer
cenário; melhora mensurável = ≥ 0,5 p.p. de aproveitamento **ou** ≥ 1 chapa a menos
(SC-005). Determinismo = duas execuções produzem árvores idênticas (SC-006).

## Relações

```text
TecnicaReferencia 1—1 ClassificacaoCobertura
ClassificacaoCobertura (ausente|parcial|ressalva) —n:1→ OportunidadeEvolucao
OportunidadeEvolucao (selecionada) —gate→ Medicao (vs baseline) —decide→ adoção/registro
CenarioBenchmark 1—n Medicao (uma por versão do algoritmo)
```
