# Implementation Plan: Seleção de layout por lookahead residual

**Branch**: `011-lookahead-residual-sobra` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-lookahead-residual-sobra/spec.md`

## Summary

Adicionar um **critério de desempate por lookahead residual** na seleção de
layout do `optimizeV6`: entre candidatos de **mesma área alocada**, preferir
aquele cujo **maior retângulo livre comporta a maior peça ainda não alocada**
(`result.remaining`). Efeito: menos fragmentação do espaço livre ⇒ mais peças por
chapa / menos chapas ⇒ **mais aproveitamento**. O critério é **estritamente
subordinado** ao aproveitamento (área alocada manda; o lookahead só decide
empates) — não premia sobra.

**Onde**: no ponto de seleção do `optimizeV6`, hoje `area → compactness`
(`optimizer.ts:192` e o espelho Rust `optimizer.rs:164`). Passa a
`area → residual-fit → compactness`. Como é uma **mudança de comportamento do
motor**, exige **paridade TS↔WASM** (Princípio VI): implementar em TS
(referência) **e** em Rust, com rebuild do wasm.

## Technical Context

**Language/Version**: TypeScript 5.x (motor de referência) + Rust (ponte WASM via
wasm-pack).

**Primary Dependencies**: motor próprio `src/lib/engine/**` (TS) e
`wasm-engine/src/**` (Rust). Sem novas dependências.

**Storage**: N/A (função pura do motor; sem estado).

**Testing**: Vitest. Novo teste-âncora (cenário "Chapa 2") + regressão no harness
`heuristics-benchmark.test.ts` (não pode piorar aproveitamento/nº de chapas) +
determinismo (`ga-determinism.test.ts` continua válido). Paridade TS↔WASM
verificada pelos testes existentes que exercitam ambos os motores.

**Target Platform**: Navegador (motor TS + WASM).

**Project Type**: Single-project SPA com motor duplo (TS de referência + WASM).

**Performance Goals**: O cálculo do maior retângulo livre é O(altura da árvore)
por candidato (percorre os "gaps" de nível como o `getLastLeftover`); custo
desprezível frente ao `runPlacement`.

**Constraints**: Corte guilhotina (I); motor puro (II); aproveitamento é o
objetivo primário e o critério é subordinado a ele (III); seleção derivada da
árvore (IV); determinismo (V); **paridade TS↔WASM obrigatória** (VI).

**Scale/Scope**: 1 helper novo em TS (`largestFreeRect`) + 1 mudança de seleção
em `optimizer.ts`; espelho em Rust (`largest_free_rect` + seleção em
`optimizer.rs`); rebuild wasm; testes (âncora + regressão). Sem mudança de UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação | Conformidade |
|-----------|----------|--------------|
| I. Corte Guilhotina | Critério de **seleção entre layouts guilhotinados**, não um novo corte. O "maior retângulo livre" é lido da árvore. | ✅ PASS |
| II. Motor Puro | Mudança dentro do motor puro (`optimizer.ts`/`optimizer.rs`); recebe dados, retorna dados. Sem I/O nem UI. | ✅ PASS |
| III. Qualidade do Corte (NON-NEGOTIABLE) | O critério é **subordinado** à área alocada (só desempate) e **guardado pelo benchmark**: nenhuma regressão de aproveitamento/nº de chapas é aceita (FR-002/FR-003, SC-002/SC-003). Agrupamento permanece ligado. | ✅ PASS (com portão) |
| IV. Árvore = Fonte da Verdade | O maior retângulo livre e a maior peça restante derivam da **árvore**/`remaining` do candidato, não de set-difference com inventário. | ✅ PASS |
| V. Determinismo e Testes | Critério determinístico + desempate final estável; teste-âncora + regressão + determinismo. | ✅ PASS |
| VI. Paridade TS↔WASM | **Exige mudança espelhada em Rust** + rebuild wasm. Tratado como tarefa obrigatória; divergência TS≠WASM seria bug. | ✅ PASS (se a paridade for entregue) |

**Resultado**: PASS, condicionado a: (a) o portão de benchmark não regredir; (b)
a paridade Rust ser entregue junto (não mesclar só o TS). "Complexity Tracking"
não se aplica (sem violação; o custo Rust é inerente ao Princípio VI, não uma
exceção).

## Project Structure

### Documentation (this feature)

```text
specs/011-lookahead-residual-sobra/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/residual-lookahead-contract.md
├── checklists/requirements.md
└── tasks.md   # /speckit-tasks
```

### Source Code (repository root)

```text
src/lib/engine/
├── tree-utils.ts     # MODIFICADO — + largestFreeRect(tree, usableW, usableH)
│                     #   (generaliza o gap-walk de getLastLeftover: coleta os
│                     #   retângulos livres de cada nível e retorna o de maior área)
└── optimizer.ts      # MODIFICADO — seleção: area → residual-fit → compactness (~L192)

wasm-engine/src/
├── tree_utils.rs (ou onde vive o gap-walk)  # MODIFICADO — largest_free_rect (espelho)
└── optimizer.rs      # MODIFICADO — mesma hierarquia de seleção (~L164)

src/test/
├── residual-lookahead.test.ts        # NOVO — cenário-âncora "Chapa 2" + unit do helper
├── heuristics-benchmark.test.ts      # regressão (pode exigir re-gravar baseline se MELHORAR)
└── fixtures/benchmark-baseline.json  # eventualmente atualizado (só se métricas melhorarem)
```

**Structure Decision**: mudança no **núcleo do motor** (TS de referência + espelho
Rust), mantendo a pureza (II) e a paridade (VI). Diferente das specs 009/010
(que ficaram no nível do plano), esta precisa alterar a **heurística de seleção**,
que vive no motor.

## Design detalhado

### 1. `largestFreeRect(tree, usableW, usableH)` (TS + Rust)

Retorna o maior retângulo de espaço livre da chapa (`{w, h}` ou `null`).
Generaliza o `getLastLeftover` (que já percorre os "gaps" por nível — faixa à
direita das colunas X, fundo da última coluna, etc.): em vez de retornar só o
gap **final**, **coleta os gaps de cada nível** e retorna o de **maior área**.
Puro; derivado da árvore (Princípio IV).

### 2. Critério de seleção (`optimizer.ts` e `optimizer.rs`)

Nova hierarquia no laço de seleção (hoje `area > best || (area==best && compact<best)`):

1. **Maior `area` alocada** vence (inalterado — objetivo primário).
2. **Empate em área → maior "residual-fit"**: preferir o candidato cujo
   `largestFreeRect` **comporta a maior peça de `result.remaining`** (em qualquer
   orientação permitida, respeitando margens/`minBreak`). Boolean: cabe (1) > não
   cabe (0). (FR-001/FR-005)
3. **Empate em área e residual-fit → menor `compactness`** (desempate atual;
   FR-004: quando nada muda, comportamento idêntico ao de hoje).
4. **Desempate final estável** para garantir determinismo (FR-006).

"Maior peça restante" = a de maior área em `result.remaining` do candidato (a mais
difícil de reencaixar; se ela cabe, as menores também).

### 3. Guardas contra regressão (Princípio III)

- O critério **nunca** compara entre áreas diferentes (só empates) → não rebaixa
  preenchimento (FR-002).
- **Portão de benchmark**: `heuristics-benchmark.test.ts` falha se aproveitamento
  ou nº de chapas piorar em qualquer cenário (SC-002/SC-003). Se as métricas
  **melhorarem**, regravar baseline (`RECORD_BASELINE=1`) e documentar o ganho.

### 4. Paridade TS↔WASM (Princípio VI)

- Implementar em TS (referência) primeiro, com testes.
- Espelhar `largest_free_rect` + a hierarquia de seleção em Rust
  (`optimizer.rs`), `npm run build:wasm`, e confirmar que TS e WASM produzem o
  mesmo plano nos cenários de teste. Não mesclar sem a paridade.

### 5. Cenário-âncora (Chapa 2)

Fixture do estudo: chapa 6000×3210; peças 2× 3748×646, 1× 5766×1618, 1× 3388×189,
mais uma "próxima peça" que **cabe** no bloco consolidado `~2252×1592` mas **não**
nos retalhos `2018×646`. Assert (SC-001/SC-004): o layout escolhido deixa o maior
retângulo livre comportando essa próxima peça (o fragmentado atual não comporta).

## Complexity Tracking

Não aplicável — Constitution Check passou sem violações. O trabalho Rust é
requisito do Princípio VI (paridade), não uma exceção a justificar.
