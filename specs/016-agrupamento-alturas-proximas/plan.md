# Implementation Plan: Agrupamento de colunas com alturas próximas

**Branch**: `011-lookahead-residual-sobra` (working tree) | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-agrupamento-alturas-proximas/spec.md`

## Summary

Generalizar `consolidateColumnsX` (pós-processo puro da camada de plano, spec 015) para agrupar
colunas cujas peças tenham alturas DIFERENTES, e não só idênticas. A faixa passa a ter a altura
da MAIOR peça do conjunto; cada peça mais baixa recebe um corte de correção (`Z(w) → W(h)`) que
preserva a sua altura original e deixa o resíduo livre acima dela. Duas guardas: uma FÍSICA
(a diferença precisa ser nula ou ≥ "Quebra Mínima", senão o corte de correção é inexecutável) e
uma ECONÔMICA (o maior bloco livre da chapa não pode encolher com a fusão, medido com
`largestFreeRect` antes do preenchimento da tira).

Mudança confinada a `src/lib/engine/tree-utils.ts` + o call-site em `src/pages/Index.tsx`.
Sem mudança de motor, sem espelho Rust, sem rebuild WASM, sem campo novo de UI.

## Technical Context

**Language/Version**: TypeScript 5 (React 18, Vite)

**Primary Dependencies**: motor puro em `src/lib/engine/**`; nenhuma dependência nova

**Storage**: N/A (estado em memória / `localStorage` para preferências existentes)

**Testing**: `vitest` (`npm test`); benchmark de regressão em
`src/test/heuristics-benchmark.test.ts`; validação final no app com o relatório-âncora

**Target Platform**: SPA no navegador (motor também compilado para WASM — **não afetado aqui**)

**Project Type**: aplicação web single-project com motor de otimização puro

**Performance Goals**: plano completo do relatório-âncora (268 peças) abaixo de 2 min; hoje ~8-9 s.
O custo adicional é o clone + `largestFreeRect` por conjunto candidato — O(nós) por conjunto,
com poucos conjuntos por chapa.

**Constraints**: cortes estritamente guilhotinados; conservação exata de peças e medidas;
determinismo; profundidade máxima da árvore de 6 níveis (`X→Y→Z→W→Q→R`)

**Scale/Scope**: ~30 colunas por chapa, ~30-45 chapas por plano; 2 arquivos de produção tocados

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|-----------|-----------|
| **I. Corte Guilhotina é Lei Física** | ✅ PASSA. O corte de correção é um nó `W` sob um `Z`: reto, de borda a borda da sub-coluna. Nenhum recorte em L. |
| **II. Motor Puro e Agnóstico de UI** | ✅ PASSA. `consolidateColumnsX` continua puro (dados → dados, muta só a árvore recebida). O valor de `minBreak` é passado como argumento pelo call-site; a função não lê estado de UI. |
| **III. Qualidade do Corte é o Objetivo Primário** | ✅ PASSA. É o objetivo da feature. Guarda explícita (FR-004) impede piora; `useGrouping` não é tocado; `heuristics-benchmark` barra regressão. |
| **IV. A Árvore de Corte é a Fonte da Verdade** | ✅ PASSA. Guarda e área medidas por `largestFreeRect`/`calcPlacedArea`, derivados da árvore. Nenhum set-difference com inventário. |
| **V. Determinismo e Cobertura de Testes** | ✅ PASSA. Formação de conjuntos gulosa com ordenação total (R5). Testes novos em `consolidate-columns-x.test.ts`, incluindo um caso de idempotência/determinismo. |
| **VI. Paridade TypeScript ↔ WASM** | ✅ PASSA (não aplicável). `consolidateColumnsX` só existe em TS, na camada de plano, e não é chamada pelo motor nem pelo binding WASM (ver research R1). Nada a espelhar, nada a reconstruir. |

**Violações a justificar**: nenhuma. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/016-agrupamento-alturas-proximas/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── column-grouping-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── engine/
│       └── tree-utils.ts        # ALTERADO: consolidateColumnsX (agrupamento por altura
│                                #   próxima + corte de correção + guarda de bloco livre).
│                                #   Reusa largestFreeRect (já existe, linha 392).
├── pages/
│   └── Index.tsx                # ALTERADO: call-site (~L668) passa `minBreak` como
│                                #   limiar de agrupamento
└── test/
    └── consolidate-columns-x.test.ts   # ESTENDIDO: casos de altura próxima, guarda,
                                        #   conservação, determinismo
```

**Não tocados** (e por quê):
- `src/lib/engine/optimizer.ts`, `genetic.ts`, `placement.ts` — a feature não muda seleção de
  layout nem construção; é pós-processo.
- `wasm-engine/**` (Rust) — a função não tem espelho e não é chamada pelo motor (research R1).
- `src/features/sheet-setup/SheetSetupPanel.tsx` — o campo "Quebra Mínima" já existe e já é
  propagado; nenhuma mudança de UI.

**Structure Decision**: single-project. A mudança vive inteira na camada de plano
(`tree-utils.ts` como biblioteca pura + `Index.tsx` como orquestrador), preservando o motor e a
paridade WASM.

## Implementation Outline

1. **Assinatura**: `consolidateColumnsX(tree, usableW, usableH, fill?, tol?)` com TRÊS estados
   (ver contrato): `tol` omitido = feature DESLIGADA (só alturas idênticas, bit-a-bit igual à
   spec 015 — preserva os testes e call-sites existentes); `tol === 0` explícito = sem piso
   físico; `tol > 0` = gate `diff === 0 || diff >= tol`.
2. **Formação de conjuntos** (substitui o `byHeight` por `Math.round(h)`): guloso por altura
   DESC, desempate por índice ASC (research R5).
3. **Construção da faixa**: `bandH = max(h)` do conjunto; peça com `h === bandH` continua folha
   `Z`; peça com `h < bandH` vira `Z(w) → W(h)[peça]`.
4. **Guarda**: para cada conjunto candidato com alturas não uniformes, medir
   `largestFreeRect` num clone da árvore com e sem a fusão (sem `fillStrip`); rejeitar a fusão
   se o maior bloco livre encolher.
5. **Preenchimento**: `fillStrip` inalterado, chamado só nos conjuntos aceitos, com
   `stripH = usableH − bandH`.
6. **Call-site** (`Index.tsx:668`): passar `minBreak` como `tol`.
7. **Testes** e, por último, **medição no app** com o âncora (SC-002).

## Complexity Tracking

Sem violações constitucionais — seção não aplicável.
