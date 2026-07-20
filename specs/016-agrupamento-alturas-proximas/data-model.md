# Phase 1 — Data Model

Nenhuma entidade persistida é criada. As estruturas abaixo são intermediárias, vivas apenas
durante a execução de `consolidateColumnsX`.

## Entidades existentes reusadas

### `TreeNode` (`src/lib/engine/types.ts`)

Nó da árvore de corte guilhotina. Níveis alternam eixo: `X`(largura) → `Y`(altura) →
`Z`(largura) → `W`(altura) → `Q`(largura) → `R`(altura). Folha = peça alocada.

Campos usados aqui: `tipo`, `valor` (medida do corte no eixo do nível), `multi`, `filhos`,
`label` (uid da peça).

### `Piece` — usada apenas no pool de preenchimento (`XFill.pool`), inalterada.

---

## Estruturas intermediárias (novas)

### `ColumnInfo` — candidata a agrupamento

Produzida pela função interna `single(x)` (já existe, `tree-utils.ts:481`), agora também
carregando o índice original.

| Campo | Tipo | Regra |
|-------|------|-------|
| `colW` | number | largura da coluna `X` — usada na SOMA da faixa (conserva a largura da chapa) |
| `w` | number | largura da PEÇA — usada na medida do `Z` da faixa; `w <= colW` |
| `h` | number | altura da PEÇA; obrigatoriamente `h < usableH − EPS` (precisa sobrar topo) |
| `label` | string? | uid da peça |
| `idx` | number | posição original entre os filhos do `ROOT` — desempate determinístico e posição da faixa |

Uma coluna só é candidata se for `X`, `multi === 1`, contiver EXATAMENTE UMA folha-peça, a peça
couber na largura da coluna e houver sobra no topo. (Regras já vigentes; inalteradas.)

### `HeightCluster` — conjunto candidato

| Campo | Tipo | Regra |
|-------|------|-------|
| `members` | `ColumnInfo[]` | ≥ 2 elementos; ordenados pelo `idx` original na hora de montar a faixa |
| `bandH` | number | `max(h)` dos membros — altura da faixa |
| `wSum` | number | `Σ colW` dos membros — largura da faixa |

**Regra de admissão de um membro** (FR-001/FR-009), sendo `diff = bandH − h`:

- `diff === 0` (dentro de `EPS`) → admitido (comportamento de hoje);
- `tol > 0` e `0 < diff < tol` → **REJEITADO** (corte de correção inexecutável);
- `diff >= tol` → admitido, com corte de correção.

**Formação** (determinística, research R5): candidatos ordenados por `h` DESC, desempate `idx`
ASC. Semente = primeiro livre; absorve todo livre admissível. Clusters com < 2 membros são
descartados (as colunas voltam intactas ao `ROOT`).

---

## Transformação da árvore

**Antes** (N colunas independentes):

```text
ROOT
├── X(colW_1) → … → [peça w_1 × h_1]      sobra livre no topo: colW_1 × (usableH − h_1)
├── X(colW_2) → … → [peça w_2 × h_2]      sobra livre no topo: colW_2 × (usableH − h_2)
└── …
```

**Depois** (uma faixa, `bandH = max h_i`):

```text
ROOT
└── X(Σ colW_i)
    ├── Y(bandH)                          ← a faixa
    │   ├── Z(w_i)[peça]                  ← peça com h_i == bandH (sem correção)
    │   └── Z(w_j) → W(h_j)[peça]         ← peça mais baixa: corte de CORREÇÃO,
    │                                        resíduo livre w_j × (bandH − h_j)
    └── Y(usableH − bandH) → …            ← tira do topo, ÚNICA, opcionalmente preenchida
```

## Invariantes (verificáveis por teste)

- **INV-A (conservação)**: o multiset de `(w, h, label)` das folhas é idêntico antes e depois,
  para as colunas agrupadas. Nenhuma peça some, duplica ou muda de medida.
- **INV-B (largura)**: `Σ` das larguras dos filhos do `ROOT` é idêntica antes e depois
  (`wSum = Σ colW`, não `Σ w`).
- **INV-C (área alocada)**: `calcPlacedArea` antes ≤ depois (igual quando não há preenchimento
  da tira; maior quando há).
- **INV-D (bloco livre)**: `largestFreeRect(depois, sem preenchimento) >= largestFreeRect(antes)`
  para todo conjunto aceito — é a própria guarda.
- **INV-E (profundidade)**: nenhuma folha ultrapassa o nível `R`.
- **INV-F (determinismo)**: duas execuções sobre árvores estruturalmente idênticas produzem
  árvores estruturalmente idênticas.
