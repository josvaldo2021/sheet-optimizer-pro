# Phase 1 — Data Model: Otimização de Plano de Corte

Entidades do motor (definidas em `src/lib/engine/types.ts`). Documento retroativo.

## TreeNode — Árvore de Corte (resultado)

Representação hierárquica dos cortes guilhotina e da alocação de peças.

| Campo        | Tipo         | Descrição |
| ------------ | ------------ | --------- |
| `id`         | `string`     | Identificador único do nó. |
| `tipo`       | `NodeType`   | Nível/coordenada do corte: `ROOT \| X \| Y \| Z \| W \| Q \| R`. |
| `valor`      | `number`     | Dimensão do corte (largura para X, altura para Y) ou da peça/sobra. |
| `multi`      | `number`     | Multiplicidade — agrupa peças idênticas cortadas em conjunto. |
| `filhos`     | `TreeNode[]` | Sub-cortes ou peças resultantes. |
| `label?`     | `string`     | Rótulo opcional da peça (ID do item). |
| `transposed?`| `boolean`    | Peça rotacionada 90°. |

**Hierarquia de cortes**: `ROOT → X` (corte vertical) `→ Y` (horizontal) `→ Z`
(vertical) `→ W/Q/R` (cortes finais).

**Invariantes (Princípio IV)**:
- Folhas sempre representam peças alocadas; **desperdício nunca é folha**.
- Tipos folha possíveis: `Y/Z/W/Q` sem filhos e `R` (sempre folha).
- Para contagem interna, percorrer **ignorando `label`**; funções que filtram por
  `label` retornam 0 para peças não rotuladas.

## Piece — Peça a cortar (entrada do motor)

| Campo           | Tipo                    | Descrição |
| --------------- | ----------------------- | --------- |
| `w`, `h`        | `number`                | Largura e altura. |
| `area`          | `number`                | Área (`w*h`). |
| `count?`        | `number`                | Nº de peças originais combinadas neste agrupamento (1 por padrão). |
| `label?`        | `string`                | Rótulo da peça. |
| `labels?`       | `string[]`              | Rótulos individuais ao agrupar várias peças. |
| `groupedAxis?`  | `"w" \| "h" \| "2d"`    | Eixo do agrupamento (`2d` = grade de peças idênticas). |
| `individualDims?`| `number[]`             | Dimensões individuais de cada peça do grupo. |

**Atenção (Princípio IV)**: peças no resultado podem estar agrupadas
(`count>1`, `individualDims`). Não usar set-difference com o inventário original
para apurar restantes — extrair da árvore.

## PieceItem — Item do inventário (entrada da UI)

| Campo       | Tipo      | Descrição |
| ----------- | --------- | --------- |
| `id`        | `string`  | Identificador do item. |
| `qty`       | `number`  | Quantidade necessária. |
| `w`, `h`    | `number`  | Dimensões. |
| `label?`    | `string`  | Rótulo. |
| `priority?` | `boolean` | Se deve ser priorizada na otimização. |

## OptimizationProgress — Progresso (GA)

| Campo         | Tipo     | Descrição |
| ------------- | -------- | --------- |
| `phase`       | `string` | Fase atual (texto). |
| `current`     | `number` | Passo atual. |
| `total`       | `number` | Total de passos. |
| `bestSheets?` | `number` | Melhor nº de chapas até agora. |
| `bestUtil?`   | `number` | Melhor aproveitamento até agora. |

## Lot / LotPieceEntry — Lote (agregação multi-chapa)

`Lot` agrega o resultado de uma execução multi-chapa: `chapas` (cada uma com
`tree` e `usedArea`), `piecesUsed` (entradas `LotPieceEntry`: `w/h/qty/label`),
`sheetW`/`sheetH` e `totalSheets`. Usado por relatórios/exportação (fora do escopo
deste spec).

## Relações

```text
PieceItem (inventário/UI) --expande qty--> Piece[] (entrada do motor)
Piece[] --optimizeV6 / optimizeGeneticAsync--> TreeNode (plano de uma chapa)
TreeNode --runAllSheets (loop)--> Lot { chapas: TreeNode[], ... } (multi-chapa)
```
