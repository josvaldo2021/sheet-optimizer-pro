# Contract: `src/lib/unique-per-sheet.ts` (módulo puro)

Módulo **puro** (sem React/DOM/rede/I/O). Toda a lógica testável da restrição
"peça única por chapa" vive aqui; `Index.tsx` apenas orquestra. Segue o padrão de
`pattern-repetition.ts` (spec 006) e `lots/layout-replication.ts` (spec 008).

## Tipos

```ts
// Reusa PieceItem de src/lib/engine/types.ts (com uniquePerSheet?: boolean).
type Remaining = Pick<PieceItem, "id" | "w" | "h" | "qty" | "label"> & {
  uniquePerSheet?: boolean;
};
```

## Funções

### `splitMarked(pieces: Remaining[]): { marked: Remaining[]; unmarked: Remaining[] }`

Particiona por `uniquePerSheet === true`. Não muta a entrada.

### `capForSheet(remaining: Remaining[]): Remaining[]`

Retorna a fatia de inventário da chapa atual:
- Linha com `uniquePerSheet === true` ⇒ `qty = min(qty, 1)`.
- Linha não marcada ⇒ `qty` inalterado.
- Descarta linhas com `qty <= 0`. Não muta a entrada (retorna cópias).

### `sheetInvKey(remaining: Remaining[]): string`

Assinatura de cache **consistente com `capForSheet`**: mesma normalização de
dimensões usada hoje em `buildInvKey` (`min×max:qty`, ordenada), porém aplicada à
fatia **capada**. Duas chapas com fatias capadas iguais ⇒ mesma chave.

### `countMarkedOnSheet(tree: TreeNode, markedLabels: Set<string>): number`

Conta, **derivando da árvore** (percorre folhas via `extractAll`, ignorando
`label` para navegação e comparando o label original restaurado contra
`markedLabels`), quantas peças de linhas marcadas há na chapa. Fonte da verdade
para asserts (Princípio IV). Não usa set-difference com inventário.

## Invariantes garantidos (casos de teste C1..C7)

- **C1** `capForSheet`: linha marcada com `qty=5` → fatia com `qty=1`; linha não
  marcada com `qty=5` → `qty=5`.
- **C2** `capForSheet`: sem nenhuma linha marcada → saída idêntica à entrada
  (planos sem marcação inalterados).
- **C3** `capForSheet`: linha marcada com `qty=1` → `qty=1` (aparece em 1 chapa);
  `qty=0` → descartada.
- **C4** `splitMarked`: partição correta e sem mutação da entrada.
- **C5** `sheetInvKey`: duas fatias capadas equivalentes → mesma chave; fatia
  capada ≠ fatia integral quando há linha marcada com `qty>1`.
- **C6** `countMarkedOnSheet`: numa árvore com 1 peça marcada + N não marcadas →
  retorna 1; com 0 marcadas → 0.
- **C7 (conservação / integração)**: simulando o loop `runAllSheets` com capping,
  ao longo de todas as chapas: (a) nenhuma chapa tem >1 de uma linha marcada
  (SC-001); (b) a soma de peças marcadas colocadas = estoque marcado (nada some,
  FR-006); (c) quando estoque marcado ≥ nº de chapas, cada chapa tem exatamente 1
  (SC-002).

## Propriedades de pureza

- Nenhuma função lê estado de UI, relógio, `Math.random` ou I/O.
- Entradas nunca mutadas; saídas são novas estruturas.
- Determinístico: mesma entrada → mesma saída.

## Consumidores

- `Index.tsx` › `runAllSheets`: `capForSheet` na montagem do `inv`; `sheetInvKey`
  na chave do cache; preservação da flag em `effectiveInventory`/`selectGroup`.
- Testes: `src/test/unique-per-sheet.test.ts`.
