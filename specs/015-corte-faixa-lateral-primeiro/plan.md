# Implementation Plan: Corte da faixa lateral primeiro (geração do layout)

**Branch**: `012-qualidade-pecas-identificadas` (working tree) | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-corte-faixa-lateral-primeiro/spec.md`

## Summary

Numa coluna com peças empilhadas + uma **faixa lateral livre de altura cheia**, o motor
hoje corta **horizontal-primeiro** (bandas `W` de altura de cada peça) e a faixa lateral
acaba como um nó `Q` **no nível 5 de 6** da árvore guilhotina — enterrada e fragmentada
(3× `926×413`). Consolidar (spec 013) junta num bloco `926×1233` visual, mas ele
continua no nível 5 ⇒ 28-40 peças cabem mas **nada** preenche (pós-fill provado
impossível: sem profundidade).

**Correção:** gerar o corte **vertical de altura cheia** que separa
`[coluna de peças | faixa lateral]` **antes** dos cortes horizontais das peças. A faixa
nasce como `Z` (nível 3, raso, altura cheia) e a **própria otimização** a preenche com
peças que caibam — sem pós-processamento.

**Onde:** o MOTOR de uma chapa (`src/lib/engine/placement.ts` e/ou `optimizer.ts`/
`grouping.ts`), com **espelho obrigatório** na 2ª implementação (`wasm-engine/src/*.rs`)
+ rebuild wasm (o app roda WASM). A camada de plano, a consolidação (013) e as melhorias
de plano (guloso maior-primeiro + melhor-dos-dois-motores) ficam **fora** do escopo.

**Achado que orienta o plano** (leitura de `placement.ts`): o caminho "combined
pre-seed" do `runPlacement` (L238-290) JÁ é vertical-first — isola a stack num `Z(baseW)`
e faz "lateral fill" em `Z`s irmãos sob o mesmo `Y`. Então o padrão profundo do âncora
NÃO vem daí; vem de OUTRO caminho (agrupamento por altura em `grouping.ts`/`optimizeV6`,
ou o ramo do GA) que produz `Y→Z→W-bandas→Q`. **A 1ª tarefa da Fase 0 é localizar o
caminho exato que gera o `Q` profundo do âncora** — o conserto mora lá.

## Technical Context

**Language/Version**: TypeScript 5.x (motor de referência) + Rust (ponte WASM via wasm-pack)

**Primary Dependencies**: motor `src/lib/engine/` (`placement.ts`, `optimizer.ts`,
`grouping.ts`, `tree-utils.ts`), espelho `wasm-engine/src/` (`placement.rs`,
`optimizer.rs`, `grouping.rs`, `tree_utils.rs`), vitest.

**Storage**: N/A (transformação pura de dados).

**Testing**: vitest — `heuristics-benchmark.test.ts` (não-regressão), `wasm-parity.test.ts`
(paridade + conservação, a ESTENDER), + novo teste de estrutura do corte lateral.
Medição de valor: **app** com `of_geral_parcial (3).xls` (receita Playwright).

**Target Platform**: navegador; o motor roda em TS (fallback) e WASM (padrão,
`localStorage.useWasmEngine !== 'false'`).

**Project Type**: SPA single-project com motor duplo TS/WASM.

**Performance Goals**: sem regressão de tempo perceptível; o plano das 268 peças reais
deve seguir na casa dos segundos (hoje ~8 s).

**Constraints**: corte guilhotina puro; determinístico; paridade TS↔WASM exata;
conservação (INV-1..5); GATED (age só quando há faixa lateral aproveitável — senão
layout bit-a-bit idêntico).

**Scale/Scope**: colunas de até 6 níveis de corte; trabalhos reais ~268 peças / ~30-50
chapas.

**NEEDS CLARIFICATION** (resolver na Fase 0):
1. Qual caminho de código gera a estrutura profunda (`Y→Z→W→Q`) do âncora — `grouping.ts`
   (agrupamento por altura), o ramo do GA, ou um caminho do `optimizeV6` fora do
   pre-seed?
2. O corte lateral deve nascer DENTRO desse caminho (reestruturar a coluna) ou como uma
   estratégia/variante nova de `optimizeV6` que compete pela seleção por área?
3. Como detectar "faixa lateral que vale a pena" (largura ≥ menor peça restante, altura
   cheia) sem inflar as ~54 estratégias de agrupamento nem desligar agrupamento?

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação | Conformidade |
|---|---|---|
| I. Corte guilhotina é lei | O corte vertical de altura cheia é reto de borda a borda = guilhotina VÁLIDA. Só muda a ORDEM dos cortes, não sua natureza. | ✅ |
| II. Motor puro / agnóstico de UI | A mudança é 100% dentro de `engine/**` (dados→dados); nenhuma dependência de UI. | ✅ |
| III. Qualidade do corte é o objetivo | O objetivo DIRETO é aproveitamento (destravar a faixa). Agrupamento NUNCA desligado; a detecção da faixa não pode podar estratégias de agrupamento. Guarda de não-regressão obrigatória. | ✅ |
| IV. Árvore é a fonte da verdade | Conservação/contagem pela árvore; `validatePlacementCandidate` (spec 012) é a rede. | ✅ |
| V. Determinismo + testes | Sem novas fontes de aleatoriedade; ordenações estáveis; cobertura em `src/test/`. | ✅ |
| VI. Paridade TS↔WASM | **Espelho Rust OBRIGATÓRIO** + rebuild wasm; a mudança de geração vale para as DUAS implementações. `wasm-parity.test.ts` estendido. RISCO conhecido (specs 011/012): `normalizeTree` TS/Rust divergem e HashMap Rust é não-determinístico — casar ordem de inserção. | ✅ (com trabalho explícito) |

**Sem violações.** A sensibilidade da mudança (mexer na geração) é tratada por: GATE
(age só quando há faixa aproveitável) + guarda dupla (benchmark + medição no app).
Nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/015-corte-faixa-lateral-primeiro/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — localizar o caminho + decisões (onde/como/paridade)
├── data-model.md        # Fase 1 — Coluna, Faixa lateral, estrutura da árvore antes/depois
├── quickstart.md        # Fase 1 — validação (âncora no app + benchmark + parity)
├── contracts/
│   └── lateral-cut-contract.md   # invariante de corte + paridade + conservação
├── checklists/
│   └── requirements.md  # (criado no /speckit-specify)
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/lib/engine/
├── placement.ts     # runPlacement: "combined pre-seed" já é vertical-first (referência
│                    #   do padrão bom); alvo provável do corte lateral ao montar a coluna
├── grouping.ts      # groupPiecesByHeight & cia — SUSPEITO nº1 do padrão W-banda→Q profundo
├── optimizer.ts     # optimizeV6: seleção por área; talvez uma variante nova que gere o corte lateral
└── tree-utils.ts    # validatePlacementCandidate (rede de conservação); helpers de gap

wasm-engine/src/
├── placement.rs     # ESPELHO obrigatório do que mudar em placement.ts
├── grouping.rs      # ESPELHO de grouping.ts
├── optimizer.rs     # ESPELHO de optimizer.ts
└── tree_utils.rs    # ESPELHO de tree-utils.ts   (rebuild wasm após)

src/test/
├── lateral-cut.test.ts         # NOVO — estrutura: a faixa vira Z raso e recebe peças (âncora)
├── wasm-parity.test.ts         # ESTENDER — mesma estrutura/contagem/medidas nos 2 motores
└── heuristics-benchmark.test.ts # guarda de não-regressão
```

**Structure Decision**: single-project com motor duplo. A feature muda a GERAÇÃO no
motor TS e espelha no Rust; nenhuma alteração na camada de plano (`Index.tsx`) nem na
consolidação (013).

## Complexity Tracking

> Sem violações constitucionais. Seção vazia por design.
