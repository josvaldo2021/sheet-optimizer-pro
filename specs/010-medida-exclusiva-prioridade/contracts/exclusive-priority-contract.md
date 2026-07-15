# Contract: exclusividade + prioridade (extensão de `src/lib/unique-per-sheet.ts`)

Módulo **puro**. Estende o módulo da spec 009 com a regra 010: no máximo 1 peça
marcada **no total** por chapa, marcada **primeiro** (prioridade / primeiras
chapas). Reusa tipos e helpers da 009 (`MarkedInvItem`, `isMarked`, `splitMarked`,
`countMarkedOnSheet`).

## Funções novas

### `pickMarkedForSheet(remaining: Remaining[]): Remaining | null`

Retorna a **primeira** linha com `uniquePerSheet === true` e `qty > 0`, na ordem
do array; `null` se não houver marcada com estoque. Determinística. Não muta.

### `buildSheetInvExclusive(remaining: Remaining[]): Remaining[]`

Fatia de inventário da chapa atual, na ordem de saída:
1. **1 unidade** da linha de `pickMarkedForSheet(remaining)` (se houver) —
   primeiro elemento (prioridade de colocação).
2. Todas as linhas **não marcadas** com `qty > 0` (qty integral).
Nenhuma outra linha marcada entra. Retorna cópias (`{...p, qty}`); não muta.

### `exclusiveSheetInvKey(remaining: Remaining[]): string`

Assinatura de cache consistente com `buildSheetInvExclusive`: `min×max:qty` de
cada item da fatia exclusiva, com a marcada escolhida incluída; ordenada e
estável. Sem marcadas → igual à chave só das não marcadas.

## Invariantes garantidos (casos de teste)

- **E1** `pickMarkedForSheet`: com marcadas A(qty2) e B(qty3) → retorna A; após
  A esgotar → retorna B; sem marcadas → `null`.
- **E2** `buildSheetInvExclusive`: com A e B marcadas + não marcadas U → a fatia
  contém **exatamente 1** peça marcada (de A), U integral, e **nenhuma** de B.
- **E3** `buildSheetInvExclusive`: a peça marcada é o **primeiro** elemento da
  fatia (prioridade).
- **E4** `buildSheetInvExclusive`: sem linhas marcadas → identidade sobre as não
  marcadas (planos sem marcação inalterados).
- **E5** `exclusiveSheetInvKey`: duas fatias exclusivas equivalentes → mesma
  chave; muda quando a marcada corrente muda.
- **E6 (simulação/conservação)**: simulando o loop com `buildSheetInvExclusive` +
  dedução: (a) **toda** chapa tem ≤1 marcada total (SC-001); (b) as primeiras
  `N` chapas (N = total de marcadas) têm exatamente 1 marcada cada (SC-002);
  (c) nenhuma marcada vira sobra (FR-005/SC-003); (d) as não marcadas colocadas =
  estoque não marcado (conservação).

## Atualização de teste da spec 009

O caso comportamental US2 da 009 em `unique-per-sheet.test.ts` (que assertava A e
B **coexistindo** na mesma chapa) é **substituído** por um caso que asserta
exclusividade (A e B nunca juntas). As funções `capForSheet`/`sheetInvKey`/
`perSheetQty` permanecem e seus unit tests (C1–C5) continuam válidos — apenas
deixam de ser usadas pelo `runAllSheets`.

## Pureza / consumidores

- Sem I/O, sem `Math.random`, sem estado de UI; entradas não mutadas.
- Consumidores: `Index.tsx` › `runAllSheets` (montagem do `inv` + chave de cache);
  testes em `src/test/unique-per-sheet.test.ts`.
