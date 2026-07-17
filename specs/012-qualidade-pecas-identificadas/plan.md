# Implementation Plan: Qualidade de corte para peças identificadas

**Branch**: `012-qualidade-pecas-identificadas` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-qualidade-pecas-identificadas/spec.md`

## Summary

Peças identificadas (rótulo de OF) hoje desligam o agrupamento do otimizador, o que
derruba a qualidade de 100% dos trabalhos reais e produz sobras fragmentadas. O guard
que faz isso (`hasLabels` em `optimizer.ts`) não é gratuito: ele encobre uma falha de
**conservação** — a expansão de peças agrupadas rotuladas produz folhas fantasma
(peças com medida inexistente que engolem as peças vizinhas) e infla a contagem
(385 → 429).

A abordagem, na ordem obrigatória: **(1)** corrigir a expansão para que cada peça
física vire uma folha rotulada com a medida real, e impor isso como invariante
verificado no limite (candidato que viole é descartado, não corrigido); **(2)** só
então remover o guard; **(3)** espelhar em Rust e rebuildar o WASM.

Investigação completa e evidências em [research.md](./research.md). O custo de tempo
(~9×) foi aceito pelo usuário e **reduzir a busca está fora de escopo** (FR-008).

## Technical Context

**Language/Version**: TypeScript 5 (motor de referência) + Rust (ponte WASM)

**Primary Dependencies**: React 18 + Vite (UI); `wasm-pack` (build do motor Rust).
O motor em si não tem dependências — é TypeScript puro (Princípio II).

**Storage**: N/A — estado em memória na SPA; sem persistência no motor.

**Testing**: Vitest (`src/test/`). Gates relevantes já existentes:
`quantity-groups.test.ts` (conservação, 385), `ga-phantom.test.ts` (sem fantasmas),
`heuristics-benchmark.test.ts` (aproveitamento vs baseline), `ga-determinism.test.ts`
(reprodutibilidade).

**Target Platform**: SPA no navegador; motor roda em TS e via WASM.

**Project Type**: Aplicação web de página única com motor de otimização embarcado.

**Performance Goals**: plano de trabalho típico (centenas de peças) em até ~2 min,
com progresso visível (FR-008/SC-008). **Qualidade prevalece sobre tempo** — o custo
de ~9× foi aceito conscientemente.

**Constraints**:
- Corte guilhotina (Princípio I) — nenhuma mudança pode introduzir corte não-guilhotinado.
- Motor puro, sem I/O nem conhecimento de UI (Princípio II).
- Contagem SEMPRE derivada da árvore, nunca de set-difference (Princípio IV).
- Determinismo: mesmo input ⇒ mesmo plano (Princípio V).
- Paridade TS ↔ WASM (Princípio VI).
- Profundidade da árvore limitada a 6 níveis (`X→Y→Z→W→Q→R`), `R` sempre folha.

**Scale/Scope**: inventários de centenas de peças; ~54 variantes de agrupamento × 14
ordenações × 2 orientações por chapa.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Observação |
|---|---|---|
| I. Corte Guilhotina é Lei Física | ✅ PASS | Nada muda na natureza dos cortes. A correção é sobre **rotular e contar** as folhas, não sobre onde a serra passa. |
| II. Motor Puro e Agnóstico de UI | ✅ PASS | Todas as mudanças ficam em `src/lib/engine/**`, recebendo e devolvendo dados. Sem I/O, sem React. |
| III. Qualidade do Corte é o Objetivo Primário | ✅ **CORRIGE VIOLAÇÃO** | O princípio proíbe rodar sem agrupamento em produção; o guard `hasLabels` faz exatamente isso em 100% dos trabalhos reais. Esta feature **restaura a conformidade**. |
| IV. A Árvore de Corte é a Fonte da Verdade | ✅ **CORRIGE VIOLAÇÃO** | Hoje a árvore contém folhas que mentem a medida e escondem peças (research.md, Achado 4). O invariante desta spec é literalmente a reafirmação deste princípio. |
| V. Determinismo e Cobertura de Testes | ✅ PASS | Sem nova aleatoriedade. Gates existentes cobrem; SC-007 exige reprodutibilidade. |
| VI. Paridade entre TypeScript e WASM | ⚠️ OBRIGA TRABALHO | Mudança de comportamento no motor ⇒ espelho em Rust + `npm run build:wasm` fazem parte do escopo, não são opcionais. |

**Veredito**: PASS, sem violações a justificar. Duas violações **existentes** (III e
IV) são corrigidas por esta feature — o que reforça sua prioridade: não é melhoria
opcional, é retorno à conformidade. `Complexity Tracking` fica vazio.

**Re-avaliação pós-Fase 1**: mantido. O desenho (invariante verificado no limite +
descarte de candidato inválido) não adiciona projeto, arquivo ou abstração nova ao
motor — ele **remove** um guard e um remendo. Nenhuma complexidade a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/012-qualidade-pecas-identificadas/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — investigação, evidências e decisão
├── data-model.md        # Fase 1 — Peça vs Grupo, invariantes
├── quickstart.md        # Fase 1 — como validar ponta a ponta
├── contracts/
│   └── grouped-expansion-contract.md   # Fase 1 — o contrato de expansão
├── checklists/
│   └── requirements.md  # Checklist de qualidade da spec
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
src/lib/engine/
├── placement.ts       # Expansão de peça agrupada em folhas (Z/W/Q/R) — ALVO PRINCIPAL
├── optimizer.ts       # Guard `hasLabels` (remover na etapa 2) + lista de variantes
├── grouping.ts        # Produtores de grupo — VERIFICADOS LIMPOS (research.md, Achado 3)
├── genetic.ts         # `capPhantomLeaves` e `labelDims` — remendo e defeito latente
├── post-processing.ts # Suspeito secundário: pode colapsar folhas expandidas
└── normalization.ts   # Suspeito secundário: consolidação de sobras

src/test/
├── quantity-groups.test.ts       # GATE de conservação (385)
├── ga-phantom.test.ts            # GATE de fantasmas
├── heuristics-benchmark.test.ts  # GATE de aproveitamento
└── (novo) grouped-expansion.test.ts  # Invariante + cenário-âncora do usuário

wasm/  # espelho Rust: placement.rs, optimizer.rs (Princípio VI)
```

**Structure Decision**: projeto único (SPA com motor embarcado). Nenhum arquivo ou
módulo novo no motor — a mudança é corretiva e concentrada em `placement.ts`, com um
teste novo em `src/test/`. O espelho Rust acompanha por obrigação constitucional.

## Estratégia de implementação

Ordem **obrigatória por dependência**, não por preferência (research.md):

**Etapa 1 — Conservação (US1, P1).** Corrigir o roteamento e a expansão de grupos em
`placement.ts` para que cada peça física vire uma folha rotulada com medida real.
Inclui o ramo morto do `splitAxis` (Achado 5) e a verificação de quem colapsa folhas
expandidas (`post-processing` / `normalization`). Impor o invariante no limite:
candidato que não expande fielmente é **descartado** (FR-007). Gates
`quantity-groups` e `ga-phantom` passam a rodar **com** agrupamento.

**Etapa 2 — Liberar a busca (US2, P2).** Remover o guard `hasLabels` de
`optimizer.ts`. Uma linha, segura apenas depois da Etapa 1. Medir o cenário-âncora e
o benchmark; se o aproveitamento melhorar, regravar a baseline (`RECORD_BASELINE=1`).

**Etapa 3 — Paridade (Princípio VI).** Espelhar em `placement.rs`/`optimizer.rs` e
`npm run build:wasm`.

**Etapa 4 — Espera suportável (US3, P3).** Confirmar ~2 min com progresso visível.
Sem otimizar (FR-008).

**Já feito no working tree** (fora das etapas, verde e sem regressão no benchmark):
composição de agrupamento em `groupPiecesFillRow` — grupos passam intactos em vez de
serem reempacotados perdendo `labels`/`count`/`individualDims` (research.md, Achado 2).

## Complexity Tracking

> Nenhuma violação constitucional a justificar. Seção intencionalmente vazia.
