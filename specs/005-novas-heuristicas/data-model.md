# Data Model — Duas novas heurísticas de otimização

Esta feature **não introduz novas estruturas de dados persistidas**. Reutiliza os
tipos existentes do motor. O "modelo" aqui é o conceito de estratégia de ordenação
e as invariantes que as novas estratégias devem preservar.

## Entidade: Estratégia de ordenação (Sort Strategy)

Representa uma regra determinística de ordenação de peças aplicada antes do
posicionamento. É uma função pura, sem estado.

| Aspecto | TS | Rust |
| --- | --- | --- |
| Forma | `(a: Piece, b: Piece) => number` | `cmp_by_strategy(a, b, idx) -> Ordering` (arm por `idx`) |
| Registro | elemento do array `getSortStrategies()` | `idx` no `match` + `NUM_SORT_STRATEGIES` |
| Identidade | posição no array (índice) | valor de `idx` |
| Cardinalidade | 12 → **14** | 12 → **14** |

**Correspondência posicional obrigatória**: o índice `i` do array TS DEVE ter a
mesma semântica do `match idx == i` no Rust. As novas entram como índices **12** e
**13** em ambos, sem reordenar 0–11.

**Estratégias implementadas** (ver `contracts/sort-strategy.md` e `research.md`):
idx 12 = **altura ascendente** (`a.h - b.h || a.w - b.w`); idx 13 = **largura
ascendente** (`a.w - b.w || a.h - b.h`). Preenchem a ausência de ordenações
ascendentes no conjunto.

### Campos de `Piece` usados pelas novas estratégias

Somente campos já existentes (nenhum novo):

- `w: number` — largura
- `h: number` — altura
- `area: number` — área (== w·h para peça simples)

### Regras de validação / invariantes

- **INV-1 (Pureza)**: a estratégia só lê `w`, `h`, `area`; não muta `a`/`b` nem
  qualquer estado externo.
- **INV-2 (Determinismo)**: para os mesmos `a`, `b`, retorna sempre o mesmo sinal.
  Sem `Math.random`, sem dependência de ordem de inserção além do desempate
  explícito.
- **INV-3 (Total/estável o suficiente)**: o comparador deve dar um desempate
  definido para pares com chave primária igual (H1/H2 usam `area` como segundo
  critério) para não depender da estabilidade do `sort` da plataforma.
- **INV-4 (Paridade)**: a fórmula TS e a fórmula Rust produzem a mesma ordem para
  qualquer conjunto de peças (mesma aritmética de ponto flutuante f64/number).
- **INV-5 (Não altera existentes)**: as 12 estratégias 0–11 permanecem byte-a-byte
  idênticas; apenas se **acrescenta** ao fim.

## Entidade: Plano de corte (TreeNode) — inalterada

Produzido por `runPlacement`, que **não é modificado**. As novas estratégias apenas
alteram a ordem da lista de entrada; a construção da árvore, a extração de peças e a
métrica de seleção (área + compacidade) permanecem as mesmas. Ver
`docs/AI_CONTEXT.md` §4 e a constituição (Princípio IV).

## Fluxo de seleção (inalterado)

```
para cada transposed × variante_agrupamento × estratégia (agora 14):
    plano = runPlacement(peças_ordenadas)
    se plano.area > melhor.area  OU  (área igual E compacidade menor):
        melhor = plano        # empate estrito mantém incumbente → determinismo
```

Consequência de modelo: **monotonicidade** — aumentar o número de estratégias só
pode manter ou aumentar `melhor.area` / reduzir compacidade. Nunca piora.
