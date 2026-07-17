# Data Model: Qualidade de corte para peças identificadas

**Fase 1** | **Data**: 2026-07-16 | **Plan**: [plan.md](./plan.md)

Nenhuma estrutura nova é introduzida. Este documento **explicita invariantes que já
deveriam valer** sobre as estruturas existentes — e cuja violação é o bug desta spec.

## Entidades

### `Piece` — sobrecarregada: é peça OU grupo

Uma única estrutura representa dois conceitos distintos. **Essa sobrecarga é a origem
da classe de bug desta spec** e precisa ser lida com atenção.

| Campo | Como PEÇA (`count` ausente ou 1) | Como GRUPO (`count > 1`) |
|---|---|---|
| `w`/`h` | medidas reais da peça | medidas do **agregado inteiro** |
| `label` | identificação da peça | **ausente** |
| `labels` | ausente | identificação de **cada** peça contida |
| `count` | 1 | nº de peças físicas |
| `individualDims` | ausente | medida de cada peça ao longo de `groupedAxis`; **exceto** em `"2d"`, onde é `[cols, rows]` — contagens, não medidas |
| `groupedAxis` | ausente | `"w"` \| `"h"` \| `"2d"` |

**Armadilha central**: em um grupo, `w`/`h` **não são medidas de peça alguma**. Todo
código que lê `p.w`/`p.h` de uma `Piece` sem checar `count` está potencialmente errado.
Exemplo vivo — `genetic.ts:258-262` mapeia cada rótulo de um grupo para `[p.w, p.h]`,
ou seja, associa cada peça à medida do agregado (research.md, Achado 6).

**Armadilha secundária**: `individualDims` muda de significado conforme `groupedAxis`.
Em `"2d"` são contagens (`[cols, rows]`); nos demais, medidas. Consumir sem ramificar
por `groupedAxis` produz lixo silencioso.

### `TreeNode` — o plano de corte

Ver `src/lib/engine/types.ts`. Relevante aqui:

- Tipos alternam direção por nível: `X`(vertical) → `Y`(horizontal) → `Z`(vertical) →
  `W`(horizontal) → `Q`(vertical) → `R`(horizontal). Profundidade máxima 6.
- **`R` é sempre folha.** Um grupo roteado para `R` não tem como expandir em N folhas —
  é a suspeita do Achado 5.
- `multi > 1` = o nó representa N repetições idênticas. Ele **conta como N peças**,
  o que interage com a conservação (uma folha com `multi=4` e 1 rótulo é ambígua).
- Folhas SEMPRE representam peças alocadas; **desperdício nunca é folha** (Princípio IV).

### `PieceItem` — a linha do inventário

Ver `types.ts`. Origem das peças e destino das deduções. Cada peça física recebe um
uid como `label` ao entrar no motor (`Index.tsx`), e é por ele que a dedução volta.

## Invariantes (o contrato desta spec)

Sejam `I` o multiconjunto de peças físicas oferecidas ao motor e `T` a árvore
resultante. Definindo `folhas(T)` como os nós sem filhos, cada um contando `multi`:

- **INV-1 (Conservação)** — `|folhas(T)| + |remaining| == |I|`. Nunca maior. *(FR-001, SC-001)*
- **INV-2 (Fidelidade de medida)** — para toda folha rotulada `f`, as medidas
  renderizadas de `f` correspondem às de uma peça real de `I`, em alguma orientação
  permitida. Nunca as medidas de um agregado. *(FR-003, SC-002)*
- **INV-3 (Rastreabilidade)** — toda folha alocada carrega o rótulo da peça que a
  originou, e cada rótulo aparece **no máximo uma vez** em `T`. *(FR-002, SC-003)*
- **INV-4 (Expansão total)** — um grupo de `count = n` expande em **exatamente `n`**
  folhas rotuladas. Nunca menos (peça sumida), nunca mais (peça fantasma). *(FR-007)*
- **INV-5 (Não-recomposição)** — um grupo nunca é entrada de outro agrupamento. A
  árvore expande **um único nível**; grupo de grupo não é representável. *(research.md, Achado 2)*

### Como os invariantes falham hoje

Evidência do Achado 4 (`ga-phantom`, seed 1, chapa 2), onde `__19` e `__12` são peças
de 250×200:

```
Z250
  W800 [__19]  <<FOLHA   → afirma ser 250×800
  W800 [__12]  <<FOLHA   → afirma ser 250×800
```

- **INV-2 violado**: 250×800 não existe no inventário.
- **INV-4 violado**: onde deveriam existir 8 folhas, existem 2.
- **INV-1 violado** (efeito correlato): `quantity-groups` conta 429 para um inventário de 385.

## Regras de validação

- **Momento**: no limite entre "candidato" e "plano" — onde um resultado de busca é
  aceito como melhor. Validar cedo evita que um candidato inválido **vença** o
  desempate por parecer mais compacto (o bug se disfarçando de qualidade, Achado 2).
- **Ação em violação**: **descartar o candidato**, nunca repará-lo (FR-007). Reparar
  a jusante é impossível — quando a informação chega ao `capPhantomLeaves`, ela já se
  perdeu (Achado 6).
- **Escopo**: vale para o optimizer e para o GA, que compartilham a expansão.

## Transições de estado

N/A — o motor é puro e sem estado (Princípio II). As estruturas são valores
transformados em pipeline: `PieceItem[]` → `Piece[]` (cru) → `Piece[]` (agrupado) →
`TreeNode` → deduções por rótulo.
