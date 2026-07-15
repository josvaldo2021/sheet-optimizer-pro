# Implementation Plan: Medida marcada exclusiva por chapa e prioritária no primeiro layout

**Branch**: `010-medida-exclusiva-prioridade` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-medida-exclusiva-prioridade/spec.md`

## Summary

Refina a spec 009. Duas mudanças de comportamento para as linhas marcadas
(`PieceItem.uniquePerSheet`):

1. **Exclusividade total por chapa**: no máximo **1 peça marcada por chapa no
   total** (somando todas as medidas marcadas). Substitui a coexistência de
   marcadas distintas permitida pela 009.
2. **Prioridade / primeiras chapas**: as peças marcadas são ofertadas primeiro e
   ocupam as primeiras chapas (1 por chapa) até esgotar o estoque marcado.

**Abordagem técnica**: continua sendo uma regra de **alocação no nível do plano**
(motor e WASM intocados). O único ponto de mudança de comportamento é a montagem
do `inv` por chapa em `runAllSheets` (`src/pages/Index.tsx`): em vez de "capar
cada linha marcada a 1" (009, `perSheetQty`), passa a **ofertar no máximo 1 peça
marcada no total por chapa** (uma única linha marcada com estoque, colocada no
início do `inv` por prioridade). A lógica pura vai para
`src/lib/unique-per-sheet.ts` (novas funções `pickMarkedForSheet` /
`buildSheetInvExclusive` / `exclusiveSheetInvKey`), preservando o padrão de
módulo puro + integração fina.

## Technical Context

**Language/Version**: TypeScript 5.x (React 18 SPA, Vite)

**Primary Dependencies**: React, Vite, Tailwind + shadcn/ui; motor próprio em
`src/lib/engine/` (TS puro + ponte WASM). Sem novas dependências.

**Storage**: Estado de sessão em React; a flag `uniquePerSheet` já existe (009).
Nenhum novo campo de dados.

**Testing**: Vitest. Estende `src/test/unique-per-sheet.test.ts` (novos casos de
exclusividade + prioridade; **atualiza** o caso US2 da 009 que assertava
coexistência, agora substituído por exclusividade). Regressão no benchmark
(`heuristics-benchmark.test.ts`) para planos sem marcação.

**Target Platform**: Navegador (SPA); motor também compilável para WASM.

**Project Type**: Single-project SPA (motor puro + UI React).

**Performance Goals**: Sem regressão perceptível; a seleção da peça marcada por
chapa é O(n) sobre o inventário.

**Constraints**: Motor puro e guilhotinado (I, II). Sem `useGrouping=false` (III).
Contagem de marcadas por chapa derivada da árvore (IV). Paridade TS↔WASM (VI) —
nenhuma mudança de comportamento no motor; a flag não cruza a fronteira WASM.

**Scale/Scope**: 0 campo novo de dados; ~1 ponto de mudança em `Index.tsx`
(montagem do `inv` + chave de cache); +2/3 funções no módulo puro existente;
atualização de testes. UI da 009 (checkbox "1×") inalterada.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação | Conformidade |
|-----------|----------|--------------|
| I. Corte Guilhotina é Lei Física | Regra de alocação (quantas marcadas por chapa e em que ordem), não um tipo de corte. | ✅ PASS |
| II. Motor Puro e Agnóstico de UI | Enforcement no plano (`Index.tsx`) + módulo puro; motor não conhece a flag. | ✅ PASS |
| III. Qualidade do Corte é o Objetivo Primário | Piora de aproveitamento é intencional e escopada às marcadas; planos sem marcação **bit-a-bit iguais** (regressão no benchmark). Agrupamento permanece ligado. | ✅ PASS |
| IV. A Árvore de Corte é a Fonte da Verdade | Contagem de marcadas por chapa via `extractLeafPieces` (ignora label). Dedução por árvore (mecanismo existente). | ✅ PASS |
| V. Determinismo e Cobertura de Testes | Seleção determinística; GA semeado. Módulo puro 100% testado; testes de exclusividade/prioridade + regressão. | ✅ PASS |
| VI. Paridade TS↔WASM | Nenhuma mudança de comportamento no motor; TS e WASM recebem o mesmo `inv`. | ✅ PASS |

**Resultado**: PASS — sem violações. "Complexity Tracking" não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/010-medida-exclusiva-prioridade/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── exclusive-priority-contract.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── unique-per-sheet.ts   # MODIFICADO — + pickMarkedForSheet, buildSheetInvExclusive,
│                             #   exclusiveSheetInvKey (exclusividade total + prioridade).
│                             #   `capForSheet`/`sheetInvKey`/`countMarkedOnSheet` mantidos.
└── pages/
    └── Index.tsx             # MODIFICADO — runAllSheets: montagem do `inv` exclusiva +
                              #   marcada primeiro; chave de cache exclusiva

src/test/
├── unique-per-sheet.test.ts  # MODIFICADO — novos casos (exclusividade/prioridade),
│                             #   atualiza o caso US2 (coexistência → exclusividade)
└── heuristics-benchmark.test.ts  # regressão: planos sem marcação inalterados
```

**Structure Decision**: Single-project SPA. Estende o módulo puro da 009 e um
único ponto de integração no `runAllSheets`. Sem tocar motor/WASM/UI (Princípios
II/VI).

## Design detalhado

### 1. Módulo puro (`src/lib/unique-per-sheet.ts`) — novas funções

Contrato em `contracts/exclusive-priority-contract.md`:

- `pickMarkedForSheet(remaining)` → a **primeira linha marcada com `qty>0`** (em
  ordem do inventário) ou `null`. Determinística. É a única peça marcada ofertada
  à chapa atual.
- `buildSheetInvExclusive(remaining)` → a fatia da chapa: **1 unidade** da linha
  retornada por `pickMarkedForSheet` (se houver) **no início** (prioridade), mais
  todas as linhas **não marcadas** com `qty` integral. Nenhuma outra linha marcada
  entra. (Modelo puro para testes; a integração real reusa a mesma lógica com o
  mapeamento uid→ref.)
- `exclusiveSheetInvKey(remaining)` → chave de cache consistente com
  `buildSheetInvExclusive` (dims da marcada escolhida + dims/qty das não marcadas).
- Mantidos da 009: `countMarkedOnSheet` (agora valida ≤1 **total**), `isMarked`,
  `splitMarked`. `capForSheet`/`perSheetQty`/`sheetInvKey` permanecem no módulo
  (unit-tested), mas **não** são mais usados pelo `runAllSheets`.

### 2. Integração em `Index.tsx` (`runAllSheets`)

- Montagem do `inv` (~L480-493): substituir o `perSheetQty(p)` por lógica
  exclusiva —
  - `const markedPick = pickMarkedForSheet(remaining);`
  - por linha `p`: se `p.uniquePerSheet` → contribui `p === markedPick ? 1 : 0`;
    senão → `p.qty`.
  - **Ordem**: empurrar a peça marcada escolhida para o **início** do `inv`
    (prioridade de colocação). As demais (não marcadas) seguem.
- Chave do cache (~L507): usar `exclusiveSheetInvKey(remaining)`.
- Dedução por árvore (mecanismo atual) inalterada: a peça marcada colocada
  decrementa sua linha; a próxima chapa escolhe a próxima linha marcada com
  estoque (ou a mesma, se `qty>1`), espalhando 1 marcada por chapa nas primeiras
  chapas (FR-002/FR-003). Marcada não colocada rola para a próxima chapa
  (self-healing; validado por teste — ver research R3).

### 3. Prioridade / garantia de colocação

Como só **1** peça marcada é ofertada por chapa, colocada no início do `inv`, e o
agrupamento permanece ligado, o motor a aloca na esmagadora maioria dos casos —
entregando "peças marcadas nas primeiras chapas". Detalhes e fallback em
`research.md` (R3). Nenhuma mudança de motor.

### 4. Interação com specs 006 e 008 (FR-009)

Igual à 009: como o `inv` passa a conter **no máximo 1 marcada total**, os
construtores derivados (`homoBuild` da 006, clones da replicação de layout, save
×N da 008) herdam ≤1 marcada por chapa. A replicação de uma chapa-base com 1
marcada gera cópias com 1 marcada cada (espalha a mesma linha marcada 1/chapa nas
primeiras chapas) — compatível com a exclusividade e a prioridade.

### 5. Relação com a spec 009 (substituição)

A 010 **substitui** a regra de coexistência da 009 (US2: marcadas distintas
juntas). O `runAllSheets` deixa de usar `capForSheet` (per-linha) e passa a usar a
seleção exclusiva. O teste US2 da 009 em `unique-per-sheet.test.ts` (que assertava
A e B juntas) é **atualizado** para exclusividade. Sem toggle: é o novo
comportamento padrão da flag (conforme Assumptions do spec).

## Complexity Tracking

Não aplicável — Constitution Check passou sem violações.
