# Implementation Plan: Peça única por chapa (medida sem repetição)

**Branch**: `009-peca-unica-por-chapa` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-peca-unica-por-chapa/spec.md`

## Summary

Permitir que o usuário marque uma **linha do inventário** como "não repetir na
chapa". Ao gerar o plano multi-chapa, cada linha marcada contribui com **no
máximo 1 peça por chapa** (alocação garantida enquanto houver estoque), enquanto
as linhas não marcadas continuam preenchendo o restante para maximizar o
aproveitamento. Quando o estoque de uma linha marcada excede o número de chapas
que o restante exigiria, o plano gera chapas adicionais (1 peça marcada por
chapa) até esgotar o estoque.

**Abordagem técnica**: a restrição é uma regra de **alocação no nível do plano**,
não um novo tipo de corte. Ela é enforçada onde o inventário por chapa é montado
— o loop `runAllSheets`/`optimizeAllSheets` em `src/pages/Index.tsx` — limitando
a expansão de cada linha marcada a 1 cópia por chapa. A lógica pura de partição e
capping vive num módulo novo `src/lib/unique-per-sheet.ts` (padrão já usado por
`pattern-repetition.ts` e `lots/layout-replication.ts`). O **motor
(`src/lib/engine/**`) e a ponte WASM permanecem intocados** em comportamento: a
única mudança de tipo é um campo opcional `uniquePerSheet?: boolean` em
`PieceItem`, ignorado pela lógica do motor e removido antes da fronteira WASM.

## Technical Context

**Language/Version**: TypeScript 5.x (React 18 SPA, Vite)

**Primary Dependencies**: React, Vite, Tailwind + shadcn/ui; motor próprio em
`src/lib/engine/` (TS puro + ponte WASM). Sem novas dependências.

**Storage**: Estado da sessão em React (`useState` em `Index.tsx`); sem
persistência em disco/rede. A flag de marcação é estado de sessão, análogo a
`priority` (por peça) e `manual`/`saved` (por chapa).

**Testing**: Vitest (`src/test/`). Novo arquivo `src/test/unique-per-sheet.test.ts`
para o módulo puro; regressão no harness de benchmark existente
(`heuristics-benchmark.test.ts`) para garantir que planos SEM marcação não mudam.

**Target Platform**: Navegador (SPA), com motor também compilável para WASM.

**Project Type**: Single-project SPA (web app) — motor puro + UI React.

**Performance Goals**: Nenhuma regressão de tempo perceptível; o capping é O(n)
sobre o inventário por chapa. O cache de layout por assinatura de inventário
(`buildInvKey`) deve passar a refletir a fatia **capada** por chapa.

**Constraints**: Motor permanece puro e guilhotinado (Princípios I, II). Sem
`useGrouping=false` (Princípio III). Contagem de peças marcadas por chapa derivada
da **árvore** via `extractAll` ignorando label, nunca por set-difference
(Princípio IV). Paridade TS↔WASM preservada (Princípio VI) — nenhuma mudança de
comportamento no motor.

**Scale/Scope**: 1 módulo puro novo + 1 arquivo de teste; ~3 pontos de mudança em
`Index.tsx` (montagem do `inv` por chapa no `runAllSheets`, chave do cache de
layout, e propagação da flag ao inventário efetivo/replanejamento); 1 campo novo
opcional em `PieceItem`; 1 controle de UI por linha na lista de peças
(`SidebarSection`). Interação declarada com specs 006 (repetição de padrão) e 008
(save ×N / reservas).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação | Conformidade |
|-----------|----------|--------------|
| I. Corte Guilhotina é Lei Física | A restrição é regra de alocação (quantas peças de uma linha por chapa), não um tipo de corte. Nenhum corte novo/não-guilhotina. | ✅ PASS |
| II. Motor Puro e Agnóstico de UI | Enforcement no nível do plano (`Index.tsx`) + módulo puro `unique-per-sheet.ts`. O motor não conhece a flag; campo `uniquePerSheet` é ignorado pela lógica do motor e não cruza a fronteira WASM. | ✅ PASS |
| III. Qualidade do Corte é o Objetivo Primário | Piora de aproveitamento é **intencional e escopada** às linhas marcadas; planos sem marcação são bit-a-bit inalterados (guardado por regressão no benchmark). Agrupamento permanece ligado. | ✅ PASS |
| IV. A Árvore de Corte é a Fonte da Verdade | Validação/contagem de peças marcadas por chapa deriva da árvore (`extractAll`, ignora label). Dedução por chapa segue o mecanismo existente (extração da árvore). | ✅ PASS |
| V. Determinismo e Cobertura de Testes | Capping é determinístico; GA já é semeado. Novo módulo puro 100% testado; regressão no benchmark. | ✅ PASS |
| VI. Paridade TS↔WASM | Nenhuma mudança de comportamento no motor; a flag é removida antes de montar o `inv` passado ao motor. TS e WASM recebem exatamente o mesmo input capado. | ✅ PASS |

**Resultado**: PASS — sem violações. Seção "Complexity Tracking" não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/009-peca-unica-por-chapa/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1
│   └── unique-per-sheet-contract.md
├── checklists/
│   └── requirements.md  # criado no /speckit-specify
└── tasks.md             # /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── unique-per-sheet.ts        # NOVO — módulo puro: partição marcada/não-marcada,
│   │                              #   capping por chapa (≤1/linha marcada), contagem
│   │                              #   por árvore, chave de cache consistente
│   ├── pattern-repetition.ts      # (spec 006) — interação: repetição não pode
│   │                              #   multiplicar linha marcada além de 1/chapa
│   ├── lots/
│   │   └── layout-replication.ts  # (spec 008) — interação: reservas/effectiveInventory
│   │                              #   respeitam ≤1 marcada por cópia
│   └── engine/
│       └── types.ts               # MODIFICADO — PieceItem.uniquePerSheet?: boolean
├── pages/
│   └── Index.tsx                  # MODIFICADO — runAllSheets: montar `inv` capado por
│                                  #   chapa; chave do cache; effectiveInventory/replan;
│                                  #   preservar flag em selectGroup/replanejamento
└── components/
    └── SidebarSection.tsx         # MODIFICADO — controle por linha "não repetir" + indicador visual

src/test/
├── unique-per-sheet.test.ts       # NOVO — contrato do módulo puro (C1..Cn) + conservação
└── heuristics-benchmark.test.ts   # regressão: planos sem marcação inalterados
```

**Structure Decision**: Single-project SPA. Segue o padrão consolidado das specs
006/008: **um módulo puro novo** contendo toda a lógica testável e **pontos de
integração mínimos** em `Index.tsx`/`SidebarSection.tsx`, sem tocar no motor nem
no WASM. Isso preserva Princípios II e VI e mantém a lógica coberta por testes de
unidade determinísticos (Princípio V).

## Design detalhado

### 1. Modelo de dados

- `PieceItem` ganha `uniquePerSheet?: boolean` (default ausente = false).
  Independente de `priority` (que é um **filtro** de UI, semântica distinta) e das
  flags de chapa `manual`/`saved`.
- Ver `data-model.md` para atributos, invariantes e transições.

### 2. Módulo puro `src/lib/unique-per-sheet.ts`

Funções puras (sem React/DOM/I/O), contrato em
`contracts/unique-per-sheet-contract.md`:

- `splitMarked(pieces)` → `{ marked, unmarked }` — partição por flag.
- `capForSheet(remaining)` → inventário da chapa atual com cada linha marcada
  limitada a `min(qty, 1)` e linhas não marcadas com `qty` integral. Base da
  expansão de `inv` no `runAllSheets`.
- `sheetInvKey(remaining)` → chave de cache **consistente com a fatia capada**
  (evita reusar layout de chapa que não respeita o cap).
- `countMarkedOnSheet(tree, markedLabels)` → contagem derivada da árvore
  (`extractAll`, ignora label) para asserts de teste/validação (Princípio IV).

### 3. Integração em `Index.tsx` (`runAllSheets`/`optimizeAllSheets`)

- Na montagem do `inv` por chapa (hoje `remaining.forEach(... for i<p.qty ...)`,
  ~linhas 481-491): expandir cada linha marcada no máximo 1 vez por chapa,
  via `capForSheet`. Linhas não marcadas permanecem inalteradas.
- Ajustar a **chave do cache de layout** (`buildInvKey`, ~linha 461/507) para usar
  a fatia capada (`sheetInvKey`), evitando reaproveitar uma chapa cujo layout
  violaria o cap.
- A dedução por chapa continua derivando da árvore (mecanismo atual); linhas
  marcadas não colocadas rolam para a próxima chapa (o loop já continua até
  esgotar). Isso entrega a geração de chapas adicionais (FR-006) sem código novo
  de contagem de chapas.
- **Alocação garantida (FR-003)**: como só 1 peça marcada é ofertada por chapa e o
  agrupamento permanece ligado, o motor a coloca na esmagadora maioria dos casos;
  research.md registra a decisão e o teste de regressão que assegura SC-002. Se o
  gate de medição detectar deferimento indevido, o fallback (ordenar a linha
  marcada à frente) está descrito na research.
- `effectiveInventory`/replanejamento (spec 008) e `selectGroup` MUST **preservar**
  a flag `uniquePerSheet` ao reconstruir o inventário (análogo a `manual || saved`).

### 4. Interação com specs 006 e 008 (FR-010)

- **Spec 006 (repetição de padrão)**: um padrão homogêneo replicado ×N representa
  N chapas físicas; cada chapa consome 1 peça marcada do estoque, então a
  repetição de um layout contendo linha marcada é limitada pelo estoque dessa
  linha (o `capForSheet` por chapa já garante ≤1 por chapa replicada). O módulo
  puro expõe a contagem para o cálculo de repetições respeitar o estoque marcado.
- **Spec 008 (save ×N / reservas)**: `maxRepetitions`/`effectiveInventory` MUST
  tratar o estoque de linha marcada como no máximo 1 por cópia salva; nenhuma
  cópia/reserva pode conter 2+ peças de uma linha marcada.

### 5. UI (`SidebarSection.tsx`)

- Controle por linha na lista de peças (checkbox/toggle "não repetir na chapa"),
  com indicador visual do estado marcado (FR-009). Atualiza `pieces` (setPieces)
  preservando as demais propriedades. Sem alteração em `src/components/ui/**`.

## Complexity Tracking

Não aplicável — Constitution Check passou sem violações.
