# Data Model: Peça única por chapa

Fase 1 do plano. Entidades, atributos, invariantes e transições. Nenhuma
persistência: tudo é estado de sessão (React) ou dado puro passado ao módulo.

## Entidade: `PieceItem` (estendida)

Item do inventário de peças. Estende o tipo existente em
`src/lib/engine/types.ts` com **um** campo novo.

| Campo | Tipo | Novo? | Descrição |
|-------|------|-------|-----------|
| `id` | `string` | — | Identificador da linha do inventário |
| `qty` | `number` | — | Quantidade necessária (estoque da linha) |
| `w` | `number` | — | Largura |
| `h` | `number` | — | Altura |
| `label` | `string?` | — | Rótulo opcional exibido/exportado |
| `priority` | `boolean?` | — | **Filtro** de otimização existente (semântica distinta; NÃO reutilizar) |
| `uniquePerSheet` | `boolean?` | **SIM** | Quando `true`, esta linha é limitada a **no máximo 1 peça por chapa** |

**Regras de validação / invariantes**:
- `uniquePerSheet` ausente ou `false` ⇒ comportamento atual (linha pode repetir na
  mesma chapa).
- `uniquePerSheet` é **por linha**: duas linhas de mesma dimensão têm flags
  independentes (decisão de clarificação). Apenas as peças da linha marcada são
  capadas.
- O campo é **ignorado pela lógica do motor** e removido antes de montar o `inv`
  passado a `optimizeGeneticAsync`/WASM (só o `qty` já capado atravessa).

## Entidade: Chapa / Layout (inalterada)

Unidade sobre a qual a restrição incide. Já existe como
`{ tree: TreeNode; usedArea: number; manual?; saved?; selected?; deductions? }`
em `Index.tsx`. **Invariante novo (global)**:

> Para toda chapa produzida (plano automático, repetição de padrão, ou cópia
> salva) e para toda linha marcada `L`: a contagem de peças de `L` na árvore da
> chapa (derivada por `extractAll`, ignorando label) é **≤ 1**.

## Fatia de inventário por chapa (dado transiente)

Derivada de `remaining` a cada iteração do `runAllSheets`, pelo módulo puro:

- `capForSheet(remaining)` → lista onde cada linha marcada tem `qty = min(qty, 1)`
  e cada linha não marcada mantém `qty` integral (todas com `qty > 0`).
- É a base da expansão de `inv` (uma entrada por peça) passada ao otimizador.

## Transições de estado da flag

```
[linha não marcada] --usuário marca--> [linha marcada: uniquePerSheet=true]
[linha marcada]     --usuário desmarca--> [linha não marcada]
[qualquer]          --replanejamento/selectGroup/effectiveInventory--> preserva a flag
```

- Marcar/desmarcar dispara (ou habilita) o replanejamento do plano automático.
- Replanejar, `selectGroup` e o cálculo de `effectiveInventory` (spec 008) MUST
  **preservar** `uniquePerSheet` ao reconstruir `PieceItem[]` (análogo a como
  `manual || saved` é preservado).

## Relação com estoque e nº de chapas

- Estoque da linha marcada = `qty`. Com o cap de 1/chapa, a linha ocupa até `qty`
  chapas distintas (1 peça cada).
- Se `qty` > nº de chapas que o restante exigiria, o loop `runAllSheets` gera
  chapas adicionais até esgotar `qty` (FR-006) — sem lógica de contagem nova, pois
  o loop já roda enquanto houver `remaining`.
- Se `qty` < nº de chapas, chapas excedentes ficam sem a linha marcada (limite é
  "≤1", não "exatamente 1 em toda chapa").
