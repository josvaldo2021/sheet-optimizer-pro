# Phase 1 — Data Model: Corte da faixa lateral primeiro

Entidades = nós da árvore de corte guilhotina (`TreeNode`) e conceitos geométricos da
geração. Sem persistência nova. Dimensões em mm; `usableW/usableH` = área útil.

## Níveis da guilhotina (referência)

`ROOT`(0) → `X`(1, vertical) → `Y`(2, horizontal) → `Z`(3, vertical) → `W`(4, horizontal)
→ `Q`(5, vertical) → `R`(6, horizontal). Vertical = corta largura; horizontal = corta
altura. Máx. 6 níveis; `R` sempre folha.

## Entidade: Coluna com peças empilhadas

Uma região (largura `cw` × altura `H`) contendo uma peça-base e/ou peças empilhadas na
vertical, com uma faixa livre ao lado.

| Campo | Tipo | Descrição |
|---|---|---|
| `regionW`, `regionH` | number | dimensões da região (a linha `Y` ou coluna `X`) |
| `stackW` | number | largura ocupada pelas peças empilhadas (ex.: 2634) |
| `pieces` | Piece[] | as peças empilhadas (ex.: 3× 2634×413) |
| `lateralW` | number | `regionW − stackW` (ex.: 926) — largura da faixa lateral |
| `lateralH` | number | `regionH` (altura CHEIA, ex.: 1233) |

## Entidade: Faixa lateral (o alvo)

A região livre de **altura cheia** ao lado das peças empilhadas. É a entidade central.

| Campo | Tipo | Descrição |
|---|---|---|
| `w` | number | `lateralW` (ex.: 926) |
| `h` | number | `lateralH` = altura cheia da região (ex.: 1233) |
| `nível (hoje)` | `Q` (5) | ENTERRADA: hoje nasce como resíduo `Q` sob cada banda `W` |
| `nível (alvo)` | `Z` (3) | RASA: passa a nascer como `Z` de altura cheia, irmã da coluna de peças |

**Regra de elegibilidade (gate, R3)**: a faixa é "aproveitável" quando `w ≥ menor lado`
de alguma peça restante **e** `h ≥ menor altura` de alguma peça restante (há o que
colocar), respeitando `minBreak`. Caso contrário, a variante não gera candidato.

## Transformação estrutural (antes → depois)

**Hoje (horizontal-first, faixa enterrada):**
```
Y(regionH)
└─ Z(regionW)
   ├─ W(413) → Q(2634)=peça  + Q(926)=faixa   ← faixa no nível 5 (×3 bandas)
   ├─ W(413) → Q(2634)=peça  + Q(926)=faixa
   └─ W(407) → Q(2634)=peça  + Q(926)=faixa
```

**Alvo (lateral-first, faixa rasa e preenchível):**
```
Y(regionH)
├─ Z(2634)  → W(413)=peça / W(413)=peça / W(407)=peça   ← coluna das peças empilhadas
└─ Z(926)   → [subárvore otimizada da FAIXA 926×1233]   ← faixa no nível 3, altura cheia
              (recebe peças com menor lado ≤926 e altura ≤1233)
```

As peças empilhadas NÃO mudam de posição/medida; muda a ORDEM do corte (vertical
`Z(2634)|Z(926)` antes das bandas `W`).

## Entidade: Candidato de layout (seleção)

A variante "coluna com faixa lateral isolada" produz um candidato que entra no leque do
`optimizeV6`, selecionado pela fronteira existente (spec 011): `área → maior retângulo
livre → compactação`.

**Invariantes (contrato do motor):**
- **INV-CORTE**: todo corte introduzido é guilhotina (reto, borda a borda). O `Z(926)`
  atravessa a altura cheia da região.
- **INV-CONSERVA (spec 012)**: `folhas(árvore) + remaining = inventário`; nenhuma folha
  afirma medida inexistente; rótulo único. Validado por `validatePlacementCandidate`.
- **INV-GATE**: sem faixa aproveitável, a variante não gera candidato ⇒ o leque e a
  seleção ficam idênticos ao atual (layout bit-a-bit igual).
- **INV-DET/PARIDADE**: mesmo input ⇒ mesma árvore; TS e WASM equivalentes (mesma
  estrutura no ponto do corte lateral).

## Relação com módulos existentes

- `grouping.ts` (`groupStripPackingDP` & cia): SUSPEITO gerador do padrão profundo — a
  variante nova nasce perto dele (R1 confirma o ponto exato).
- `optimizer.ts` (`optimizeV6`): registra a nova variante no leque; a seleção por área
  a escolhe só quando ganha (gate natural).
- `tree-utils.ts` (`validatePlacementCandidate`): rede de conservação no limite.
- `wasm-engine/src/*.rs`: espelho obrigatório (Princípio VI).
