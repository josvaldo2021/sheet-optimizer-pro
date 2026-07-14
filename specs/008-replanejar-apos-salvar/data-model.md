# Data Model — Replanejar o plano automático após salvar layout com repetições

**Feature**: `specs/008-replanejar-apos-salvar` | **Date**: 2026-07-14

Nenhuma entidade nova é persistida; a feature opera sobre o estado de sessão já
existente em `src/pages/Index.tsx` e introduz apenas tipos puros no módulo
`src/lib/lots/layout-replication.ts`.

## Entidades existentes (referência)

### PieceItem — item do inventário

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | `string` | identidade estável; chave das `deductions` do plano |
| `qty` | `number` | quantidade necessária restante; invariante: `qty ≥ 0` sempre que visível (itens com `qty ≤ 0` são filtrados) |
| `w`, `h` | `number` | dimensões; peças podem casar em qualquer orientação |
| `label` | `string?` | rótulo do usuário; não participa da identidade do BOM de replicação |
| `priority` | `boolean?` | prioridade na otimização (inalterado) |

### Chapa — layout na área de trabalho

| Campo | Tipo | Notas |
|-------|------|-------|
| `tree` | `TreeNode` | fonte da verdade do layout (Constituição IV) |
| `usedArea` | `number` | área ocupada, derivada da árvore |
| `manual` | `boolean?` | **discriminador de estado**: `true` = confirmada/salva/manual (imutável perante replanejamento); ausente/`false` = automática não confirmada (descartável) |
| `selected` | `boolean?` | marcação para lote (spec 003) |
| `deductions` | `{id, qty}[]?` | consumo exato por `PieceItem.id`, gravado na geração do plano |

### Lote (`Lot`)

Registro imutável de produção (`piecesUsed`, chapas clonadas). O replanejamento
**nunca** toca lotes (FR-005 / SC-005).

### Grupo de otimização (`optimizationGroups`)

Variantes de plano por ordenação (`label` + `chapas[]`). Validade acoplada ao
inventário usado na geração → **obsoleto após qualquer dedução**; descartado e
substituído no replanejamento (D5).

## Tipos novos (módulo puro)

### BomEntry — linha do BOM de um layout

| Campo | Tipo | Notas |
|-------|------|-------|
| `w`, `h` | `number` | dimensão representativa (primeira ocorrência) |
| `count` | `number` | peças dessa dimensão por cópia do layout; `count ≥ 1` |

Identidade da linha: `min(w,h)×max(w,h)` (insensível à orientação, D3).

### DeductionResult — resultado de `deductBomTimes`

| Campo | Tipo | Notas |
|-------|------|-------|
| `pieces` | `PieceItem[]` | cópia do inventário com N×BOM deduzido; nenhum `qty` negativo |
| `shortfall` | `BomEntry[]` | linhas que o inventário não cobriu (vazio = sucesso); qualquer item ⇒ chamador aborta o save sem efeitos |

### Partition — resultado de `partitionByManual`

`{ manuais: Chapa[], autos: Chapa[] }` — partição estável (ordem preservada).

## Transições de estado do salvamento ×N

```text
Estado A (plano ativo)
  chapas = [autos…]  (podem coexistir manuais de saves anteriores)
  inventário = I (completo — plano ainda não deduzido)

  saveLayout(reps):
    bom  = buildLayoutBom(extração da árvore ativa)
    n    = clamp(reps, 1, maxRepetitions(I, bom));  max = 0 → ERRO, sem efeitos
    I'   = deductBomTimes(I, bom, n)                shortfall → ERRO, sem efeitos
    copias = n × clone(árvore ativa) com manual: true

    needsReplan(chapas)?
    ├─ sim (FR-003/004):
    │    chapas = [manuais existentes, …copias]     (autos descartadas)
    │    optimizationGroups = ∅, patternSummary = ∅
    │    I' não vazio → replaneja: optimizeAllSheets(I', base=[manuais, …copias])
    │                   chapas = [manuais, …copias, …novasAutos]
    │                   optimizationGroups = grupos novos
    │    I' vazio     → plano fica só com manuais + cópias
    └─ não (FR-009): comportamento atual (append cópias, reset da árvore)

Invariante global (FR-006 / SC-001), válido em todo estado alcançável:
  Σ peças em chapas manuais+salvas (via lotes/deduções aplicadas)
  + Σ peças no plano automático vigente
  + inventário visível
  = inventário original da sessão   (e nenhum qty < 0)
```

## Regras de validação

1. `n ≥ 1` e `n ≤ maxRepetitions(inventário atual, bom)` no momento do save —
   recalculado, nunca confiado à UI (D6).
2. `deductBomTimes` nunca produz `qty` negativo; falta de peça é sinalizada em
   `shortfall`, e o chamador aborta sem efeitos parciais (dedução é tudo-ou-nada).
3. Árvore ativa deve ter peças rotuladas para extração (pré-condição herdada de
   `extractUsedPiecesWithContext`; armadilha nº 1 do CLAUDE.md).
4. Replanejamento só roda com inventário restante não vazio.
5. Chapas com `manual === true` e lotes nunca são modificados por replanejamento.
