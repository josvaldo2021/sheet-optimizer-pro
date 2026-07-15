# Data Model: Medida marcada exclusiva por chapa e prioritária

Fase 1. Sem novo dado persistido: reusa `PieceItem.uniquePerSheet` da spec 009.
Esta feature muda **regras de alocação**, não o modelo de dados.

## Entidade: `PieceItem` (inalterada em relação à 009)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `uniquePerSheet` | `boolean?` | Linha marcada. **Semântica 010**: além de não repetir a mesma medida, marcadas **diferentes** também não convivem numa chapa (≤1 marcada total) e têm **prioridade** nas primeiras chapas. |

Nenhum campo novo. A mudança é comportamental.

## Invariante global (novo, mais forte que a 009)

> Para toda chapa produzida (plano automático, repetição, cópia salva) a
> **contagem total de peças marcadas** (somando todas as medidas marcadas),
> derivada da árvore (`extractLeafPieces`, ignora label), é **≤ 1**.

## Fatia de inventário por chapa (dado transiente) — regra 010

Derivada de `remaining` a cada iteração do `runAllSheets`:

- `pickMarkedForSheet(remaining)` → a primeira linha marcada com `qty>0` (ordem do
  inventário) ou `null`.
- `buildSheetInvExclusive(remaining)` → **1 unidade** dessa linha marcada (se
  houver) **no início**, seguida de todas as linhas **não marcadas** (`qty`
  integral). Nenhuma outra linha marcada entra na chapa.

## Transições / ordem do plano

```
Enquanto houver estoque marcado:
  cada chapa recebe 1 peça marcada (linha corrente) + preenchimento não marcado
  → as primeiras chapas concentram as marcadas (1 por chapa)
Após esgotar marcadas:
  chapas seguintes = apenas peças não marcadas (comportamento normal)
```

- Marcar/desmarcar preserva a flag em replanejamentos (herdado da 009:
  `effectiveInventory`/`restorePiecesToInventory` usam spread).
- Desmarcar → linha volta a `qty` integral por chapa, sem prioridade (comum).

## Relação com estoque e nº de chapas

- Total de marcadas = soma dos `qty` das linhas marcadas. Ocupam as primeiras
  `totalMarcadas` chapas (1 cada). Se exceder as chapas que o restante exigiria,
  chapas adicionais são geradas (FR-006, herdado da 009 — o loop roda até esgotar
  `remaining`).
