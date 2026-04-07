# Guia de Implementação para IA — Sheet Optimizer Pro

Este documento descreve duas mudanças estruturais no motor de otimização.
Leia **todo o documento** antes de modificar qualquer arquivo.

---

## CONTEXTO DO SISTEMA

O motor usa uma **árvore de cortes** com hierarquia fixa:

```
ROOT → X (colunas verticais)
      → Y (faixas horizontais dentro da coluna)
           → Z (subcortes verticais dentro da faixa)
                → W (altura da peça dentro do Z)
                     → Q (subdivisão horizontal dentro do W)
```

Cada nó tem: `{ id, tipo, valor, multi, filhos[], label?, transposed? }`

- `valor` = dimensão do corte em mm
- `multi` = repetições (geralmente 1)
- `filhos` = nós filhos na hierarquia

Os arquivos do motor ficam em `src/lib/engine/`:
- `types.ts` — definições de tipos
- `tree-utils.ts` — CRUD da árvore (createRoot, insertNode, findNode, calcPlacedArea...)
- `placement.ts` — loop de posicionamento + `createPieceNodes`
- `optimizer.ts` — heurística V6 (testa ~600 combinações)
- `genetic.ts` — algoritmo genético
- `grouping.ts` — estratégias de agrupamento de peças
- `scoring.ts` — scoring de encaixe + helpers de orientação
- `void-filling.ts` — preenchimento de espaços vazios
- `post-processing.ts` — compactação pós-posicionamento
- `normalization.ts` — converte árvore → retângulos absolutos → árvore canônica

`src/lib/cnc-engine.ts` é apenas um barrel que re-exporta tudo.

---

## MUDANÇA 1 — Simplificação de nós durante o posicionamento

### Objetivo

Quando uma peça preenche **exatamente a largura total da coluna** (pieceW === colX.valor),
os nós Z e W são redundantes. O nó Y já carrega toda a informação necessária.

Antes (situação atual):
```
ROOT (3000)
 └── X = 3000
      └── Y = 1000  ← faixa
           └── Z = 3000  ← redundante (igual ao X)
                └── W = 1000  ← redundante (igual ao Y)
```

Depois (objetivo):
```
ROOT (3000)
 └── X = 3000
      └── Y = 1000  ← Y é a peça diretamente (leaf Y)
           (sem filhos)
           label = "nome da peça"
```

Um **leaf Y** é um nó Y sem filhos (`filhos.length === 0`) que representa uma peça
que ocupa a largura total da coluna pai (X).

### Regra de aplicação

Só simplificar quando TODAS as condições forem verdadeiras:
1. `pieceW === colX.valor` (peça preenche 100% da largura da coluna)
2. A peça não é agrupada (`!piece.count || piece.count === 1`)
3. `piece.w === piece.h` é falso ou pieceW é de fato a largura original (não há subcorte Z necessário)

Se qualquer condição falhar, criar Z e W normalmente.

---

### Arquivo 1: `src/lib/engine/placement.ts`

**Função `createPieceNodes`** — adicionar verificação antes de criar Z/W:

```typescript
export function createPieceNodes(
  tree: TreeNode,
  yNode: TreeNode,
  piece: Piece,
  placedW: number,
  placedH: number,
  rotated: boolean,
  zNodeToUse?: TreeNode,
): number {
  // --- NOVO: leaf Y quando peça preenche coluna inteira ---
  // Encontrar o nó X pai do yNode
  const colX = findParentOfType(tree, yNode.id, 'X');
  const isFullWidth = colX && placedW === colX.valor;
  const isSimplePiece = !piece.count || piece.count === 1;

  if (isFullWidth && isSimplePiece && !zNodeToUse) {
    // Y já representa a peça: apenas define o label
    if (piece.label) yNode.label = piece.label;
    return placedW * placedH;
  }
  // --- FIM NOVO ---

  // ... resto da função sem alterações ...
}
```

**ATENÇÃO no loop principal de `runPlacement`**: o `yNode` é criado com `insertNode(tree, col.id, "Y", bestFit.h, 1)`.
Neste momento `col` é o X pai. Use `col.valor` para a verificação, não `usableW`.

---

### Arquivo 2: `src/lib/engine/tree-utils.ts`

**Função `calcPlacedArea`** — hoje percorre X→Y→Z→W. Adicionar caso para leaf Y:

Localizar a função que calcula área colocada. Ela provavelmente itera sobre Z filhos de Y.
Adicionar antes do loop de Z:

```typescript
// Leaf Y: Y sem filhos representa peça de largura total
if (yNode.filhos.length === 0) {
  area += colX.valor * yNode.valor * yNode.multi;
  continue; // pular para próximo Y
}
```

Fazer o mesmo em qualquer outra função de `tree-utils.ts` que itere
sobre `yNode.filhos` assumindo que sempre existem Z filhos.
Verificar: `isWasteSubtree`, `calculateNodeArea`, `annotateTreeLabels`.

---

### Arquivo 3: `src/lib/engine/void-filling.ts`

**Função `fillVoids`** — o loop interno itera `yNode.filhos` (os Z nodes).
Para um leaf Y, não há Z filhos, então o loop já não entra — OK.

Porém a verificação do espaço livre dentro do Y:
```typescript
const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
const freeZ = colX.valor - usedZ;
```
Para um leaf Y, `usedZ === 0` e `freeZ === colX.valor`, o que faria o void-filler
tentar inserir peças dentro de um Y que já é uma peça completa.

Adicionar guarda:
```typescript
// Não tentar preencher dentro de um leaf Y
if (yNode.filhos.length === 0) continue;
```
Logo no início do loop `for (const yNode of colX.filhos)`.

---

### Arquivo 4: `src/lib/engine/post-processing.ts`

Qualquer função que itere `yNode.filhos` esperando Z nodes deve receber a mesma guarda:
```typescript
if (yNode.filhos.length === 0) continue; // leaf Y, pular
```
Funções a verificar: `unifyColumnWaste`, `collapseTreeWaste`, `regroupAdjacentStrips`.

---

### Arquivo 5: `src/lib/engine/normalization.ts`

**Função `extractAbsoluteRects`** — o loop atual é X → Y → Z → W → Q.
Para leaf Y (sem Z filhos), adicionar caso especial antes do loop de Z:

```typescript
for (const yNode of colX.filhos) {
  for (let iy = 0; iy < yNode.multi; iy++) {
    // NOVO: leaf Y
    if (yNode.filhos.length === 0) {
      if (T) {
        rects.push({ x: yOff, y: xOff, w: yNode.valor, h: colX.valor, label: yNode.label });
      } else {
        rects.push({ x: xOff, y: yOff, w: colX.valor, h: yNode.valor, label: yNode.label });
      }
      yOff += yNode.valor;
      continue;
    }
    // ... loop de Z existente sem alterações ...
  }
}
```

---

### Arquivo 6: `src/components/SheetViewer.tsx`

**Função `renderSheet`** — o loop renderiza X → Y → Z → W → Q.
Localizar onde itera `yNode.filhos` (os Z nodes). Adicionar caso para leaf Y:

```tsx
xNode.filhos.forEach(yNode => {
  for (let iy = 0; iy < yNode.multi; iy++) {

    // NOVO: leaf Y — peça ocupa a coluna inteira
    if (yNode.filhos.length === 0) {
      const realW = T ? yNode.valor : xNode.valor;
      const realH = T ? xNode.valor : yNode.valor;
      const pxW = realW * scale;
      const pxH = realH * scale;
      const isVert = realH > realW;
      const dim = dimLabel(xNode.valor, yNode.valor);
      const fs = dynamicFontSize(pxW, pxH, dim, yNode.label, isVert);
      strips.push(
        <div
          key={`leaf-y-${yNode.id}-${iy}`}
          style={{ width: '100%', height: yNode.valor * scale,
                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                   background: PIECE_BG, border: `0.5px solid ${PIECE_BORDER}`,
                   boxSizing: 'border-box', cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); onSelectNode(yNode.id); }}
        >
          <span className={`sv-piece-label ${isVert ? 'sv-label-vertical' : ''}`}
                style={{ fontSize: fs, lineHeight: 1.15 }}>
            {yNode.label && <span className="sv-piece-id" style={{ fontSize: fs * 0.75 }}>{yNode.label}</span>}
            {dim}
          </span>
        </div>
      );
      yOff += yNode.valor;
      continue; // pular o loop de Z
    }

    // ... resto do loop de Z existente sem alterações ...
  }
});
```

---

### Arquivo 7: `src/lib/pdf-export.ts` e `src/lib/excel-export.ts`

Verificar se esses arquivos iteram a árvore diretamente ou usam `extractAbsoluteRects`.
Se usam `extractAbsoluteRects`, já estão cobertos pela mudança em `normalization.ts`.
Se iteram a árvore diretamente, aplicar a mesma guarda de leaf Y.

---

### Ordem de implementação da Mudança 1

1. `tree-utils.ts` — `calcPlacedArea` e funções auxiliares
2. `placement.ts` — `createPieceNodes`
3. `void-filling.ts` — guarda no loop de Y
4. `post-processing.ts` — guardas nos loops de Y
5. `normalization.ts` — `extractAbsoluteRects`
6. `SheetViewer.tsx` — renderização de leaf Y
7. `pdf-export.ts` / `excel-export.ts` — verificar e corrigir se necessário

### Como testar a Mudança 1

Cenário mínimo: chapa 3000×2000, uma peça 3000×1000.
Após otimização, a árvore deve ser:
```
ROOT → X=3000 → Y=1000 (sem filhos)
```
E NÃO:
```
ROOT → X=3000 → Y=1000 → Z=3000 → W=1000
```
A visualização deve mostrar a peça corretamente ocupando toda a largura.

---

## MUDANÇA 2 — Direção de corte primário no genoma do Algoritmo Genético

### Conceito fundamental

**A regra X-first é sagrada e não deve ser quebrada.**

Um corte horizontal na chapa é simplesmente um **X de largura total** (X.valor = usableW)
seguido de faixas Y internas. Não existe uma hierarquia alternativa Y→X.
A estrutura ROOT→X→Y→Z→W permanece imutável.

Layout vertical (comportamento atual — múltiplas colunas X de larguras variadas):
```
ROOT (3000)
 ├── X = 1500
 │    ├── Y = 1000 → Z → W  (peça A)
 │    └── Y = 1000 → Z → W  (peça B)
 └── X = 1500
      ├── Y = 800  → Z → W  (peça C)
      └── Y = 1200 → Z → W  (peça D)
```

Layout horizontal (novo — um único X de largura total, Y são as bandas horizontais):
```
ROOT (3000)
 └── X = 3000          ← largura total da chapa
      ├── Y = 1000 → Z=1500 → W   (peça A, metade esquerda)
      │             Z=1500 → W   (peça B, metade direita)
      └── Y = 1000 → Z=3000 → W  (peça C, largura total = leaf Y da Mudança 1)
```

A diferença entre os dois modos é **como o algoritmo de posicionamento aloca espaço**:
- `cutDirection: "X"` → abre múltiplas colunas X de larguras otimizadas
- `cutDirection: "H"` → abre um único X de largura total e empilha faixas Y horizontais;
  dentro de cada Y, Z subdivide a largura entre peças menores

### Por que isso gera layouts diferentes

No modo H, todas as peças de uma mesma "linha" horizontal compartilham a largura
total da chapa e são separadas apenas por cortes Z. Isso é mais eficiente quando
o conjunto tem peças de **alturas semelhantes mas larguras variadas** — ao invés de
abrir uma coluna estreita por peça, encaixam-se várias peças na mesma faixa Y.

---

### Arquivo 1: `src/lib/engine/placement.ts`

Criar nova função `runPlacementHorizontal` ao lado da `runPlacement` existente.

**Estrutura da função:**

```typescript
export function runPlacementHorizontal(
  inventory: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
): { tree: TreeNode; area: number; remaining: Piece[] } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  // Cria um único X de largura total logo no início
  insertNode(tree, 'root', 'X', usableW, 1);
  const colX = tree.filhos[0]; // o único X

  // A partir daqui, o loop posiciona peças abrindo faixas Y dentro desse X.
  // Cada Y representa uma banda horizontal.
  // Dentro de cada Y, as peças são encaixadas abrindo nós Z (subcortes verticais).
  //
  // Lógica do loop:
  // 1. Para cada peça, tenta encaixar em uma faixa Y existente (procura Y com
  //    espaço Z livre suficiente para a largura da peça).
  // 2. Se não couber em nenhuma Y existente, abre nova faixa Y com a altura da peça.
  // 3. Dentro da Y escolhida, cria Z com a largura da peça e W com a altura.
  // 4. Se a peça ocupa largura total (pieceW === usableW), aplica a regra de leaf Y
  //    da Mudança 1: Y sem Z filhos, label direto no Y.
  //
  // Score para escolha de Y existente: preferir Y onde a altura da peça se encaixa
  // melhor (menos desperdício de altura) e onde o espaço Z restante é menor
  // (evitar fragmentos pequenos).
  //
  // O post-processing pipeline (unifyColumnWaste, collapseTreeWaste,
  // regroupAdjacentStrips, fillVoids, clampTreeHeights) deve ser chamado ao final,
  // identicamente ao runPlacement. Esses módulos operam sobre a estrutura X→Y→Z→W
  // e funcionam sem modificação, pois a hierarquia é a mesma.

  // ... implementação ...

  return { tree, area: placedArea, remaining };
}
```

**Ponto de atenção:** `runPlacementHorizontal` cria apenas **um** nó X. O post-processing
pode tentar abrir mais colunas X (via `unifyColumnWaste` / `collapseTreeWaste`)?
Não — esses módulos só inserem Y dentro de X existentes e Z/W dentro de Y existentes.
Não abrem novos X. Portanto são seguros de chamar sem modificação.

---

### Arquivo 2: `src/lib/engine/genetic.ts`

**Tipo `GAIndividual`** — renomear o gene para `cutMode` para maior clareza:

```typescript
interface GAIndividual {
  genome: number[];
  rotations: boolean[];
  groupingMode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
  transposed: boolean;
  cutMode: "vertical" | "horizontal";  // NOVO
}
```

- `cutMode: "vertical"` → usa `runPlacement` (múltiplas colunas X)
- `cutMode: "horizontal"` → usa `runPlacementHorizontal` (único X, múltiplas Y)
- `transposed` continua independente: troca usableW ↔ usableH antes de chamar qualquer função

As 4 combinações válidas que o GA explora:

| cutMode | transposed | Comportamento |
|---|---|---|
| vertical | false | Colunas verticais, dimensões normais |
| vertical | true | Colunas verticais, chapa "deitada" |
| horizontal | false | Bandas horizontais, dimensões normais |
| horizontal | true | Bandas horizontais, chapa "deitada" |

**`randomIndividual`** — inicializar o novo gene:

```typescript
cutMode: Math.random() > 0.5 ? "vertical" : "horizontal",
```

**`simulateSheets`** — adicionar parâmetro `placeFn`:

```typescript
function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  maxSheets: number,
  placeFn: typeof runPlacement = runPlacement,  // NOVO
): { fitness: number; firstTree: TreeNode; ... } {
  // Substituir toda chamada a runPlacement por placeFn
  const res = placeFn(currentRemaining, usableW, usableH, minBreak);
  // resto sem alterações
}
```

**`evaluate`** — selecionar a função pelo cutMode:

```typescript
function evaluate(ind: GAIndividual) {
  const work = buildPieces(ind);
  const eW = ind.transposed ? usableH : usableW;
  const eH = ind.transposed ? usableW : usableH;
  const placeFn = ind.cutMode === "horizontal" ? runPlacementHorizontal : runPlacement;
  const lookahead = Math.min(3, Math.ceil(work.length / 5));
  const result = simulateSheets(work, eW, eH, minBreak, lookahead, placeFn);
  return { tree: result.firstTree, fitness: result.fitness, transposed: ind.transposed };
}
```

**`crossover`** — herdar cutMode de um dos pais:

```typescript
return {
  genome: childGenome,
  rotations: childRotations,
  groupingMode: childGrouping,
  transposed: Math.random() > 0.5 ? pA.transposed : pB.transposed,
  cutMode: Math.random() > 0.5 ? pA.cutMode : pB.cutMode,  // NOVO
};
```

**`mutate`** — redistribuir probabilidades para incluir o novo gene.
A soma deve ser 1.0. Sugestão:

```typescript
const r = Math.random();
if      (r < 0.22) { /* swap de peças */       }
else if (r < 0.44) { /* reordenação de bloco */ }
else if (r < 0.62) { /* flip de rotações */     }
else if (r < 0.76) { /* mudar groupingMode */   }
else if (r < 0.88) { /* flip transposed */      }
else               { /* flip cutMode — NOVO */
  c.cutMode = c.cutMode === "vertical" ? "horizontal" : "vertical";
}
```

**Seeding** — criar 4 indivíduos por estratégia de ordenação (era 2):

```typescript
for (const sortFn of strategies) {
  // ... calcular sortedIndices como hoje ...

  initialPop.push({ genome: [...sortedIndices], rotations: falseArr, groupingMode: 0, transposed: false, cutMode: "vertical"    });
  initialPop.push({ genome: [...sortedIndices], rotations: falseArr, groupingMode: 0, transposed: false, cutMode: "horizontal"  });
  initialPop.push({ genome: [...sortedIndices], rotations: falseArr, groupingMode: 0, transposed: true,  cutMode: "vertical"    });
  initialPop.push({ genome: [...sortedIndices], rotations: falseArr, groupingMode: 0, transposed: true,  cutMode: "horizontal"  });
}
```

Isso aumenta o tamanho inicial da população. Ajustar `if (initialPop.length > populationSize)`
que já existe para truncar corretamente.

**Baseline V6** — adicionar variante horizontal ao baseline antes do loop evolutivo:

```typescript
// Hoje:
const v6Result = optimizeV6(pieces, usableW, usableH, minBreak);

// Adicionar:
const v6H = runPlacementHorizontal(
  [...pieces].sort(strategies[0]),
  usableW, usableH, minBreak
);
const v6HUtil = calcPlacedArea(v6H.tree) / (usableW * usableH);
if (v6HUtil > bestFitness) {
  bestFitness = v6HUtil;
  bestTree = JSON.parse(JSON.stringify(v6H.tree));
}
```

---

### Arquivo 3: `src/lib/engine/optimizer.ts`

**`optimizeV6`** — adicionar variante horizontal ao loop:

```typescript
// Loop atual itera [false, true] para transposed.
// Adicionar cutMode ao loop externo:
for (const cutMode of ["vertical", "horizontal"] as const) {
  for (const transposed of [false, true]) {
    const eW = transposed ? usableH : usableW;
    const eH = transposed ? usableW : usableH;
    const placeFn = cutMode === "horizontal" ? runPlacementHorizontal : runPlacement;

    for (const variant of pieceVariants) {
      for (const sortFn of strategies) {
        const sorted = [...variant].sort(sortFn);
        const result = placeFn(sorted, eW, eH, minBreak);
        if (result.area > bestArea) {
          bestArea = result.area;
          bestTree = result.tree;
          bestRemaining = result.remaining;
          bestTransposed = transposed;
        }
      }
    }
  }
}
```

Importar `runPlacementHorizontal` de `./placement` no topo do arquivo.

---

### Arquivos NÃO modificados pela Mudança 2

Como a estrutura da árvore permanece ROOT→X→Y→Z→W, os seguintes arquivos
**não precisam de nenhuma alteração** para suportar `cutMode: "horizontal"`:

- `normalization.ts` — já lê X→Y→Z→W corretamente
- `SheetViewer.tsx` — já renderiza X→Y→Z→W corretamente
- `void-filling.ts` — opera sobre X→Y→Z→W sem assumir quantos X existem
- `post-processing.ts` — idem
- `tree-utils.ts` — idem
- `pdf-export.ts` / `excel-export.ts` — idem (via extractAbsoluteRects)

A única exceção é se `runPlacementHorizontal` produzir **leaf Y** (Mudança 1):
nesse caso os arquivos que precisam tratar leaf Y (conforme Mudança 1) já estarão
cobertos pelas mudanças daquela seção.

---

### Ordem de implementação da Mudança 2

1. `placement.ts` — criar `runPlacementHorizontal`
2. `optimizer.ts` — adicionar ao loop de `optimizeV6`
3. `genetic.ts` — adicionar gene `cutMode` ao genoma completo

### Como testar a Mudança 2

**Cenário 1 — horizontal puro:**
Chapa 3000×2000, peças: 1500×800, 1500×800, 1500×600, 1500×600.
Com `cutMode: "horizontal"`, a árvore deve ter:
```
ROOT → X=3000 → Y=800 → Z=1500 + Z=1500 (2 peças lado a lado)
              → Y=600 → Z=1500 + Z=1500
```
Aproveitamento: 100% (sem desperdício).

**Cenário 2 — horizontal com leaf Y (Mudanças 1+2 combinadas):**
Chapa 3000×2000, peça 3000×1000.
Árvore esperada: `ROOT → X=3000 → Y=1000 (sem filhos, leaf Y)`

**Cenário 3 — GA escolhe horizontal:**
Executar otimização genética e verificar via console/log que pelo menos
alguns indivíduos da população têm `cutMode: "horizontal"` e que o melhor
resultado entre eles compite com o melhor X-first.

---

## INVARIANTES QUE NÃO DEVEM SER QUEBRADAS

1. **A hierarquia ROOT→X→Y→Z→W é imutável** — nenhuma mudança deve criar árvores com Y como filho direto de ROOT.
2. **`calcPlacedArea(tree)` deve sempre retornar a área correta** — usada para calcular utilização e comparar soluções.
3. **`extractAbsoluteRects` deve cobrir todos os tipos de nó** — é o tradutor usado por PDF, Excel e normalização.
4. **O GA deve explorar as 4 combinações** — `cutMode × transposed` são genes independentes.
5. **Peças com `label` não devem perder o label** — propagado em toda criação de nós.
6. **`minBreak` deve ser respeitado em `runPlacementHorizontal`** — aplicar a mesma lógica de `violatesZMinBreak` e `canResidualFitAnyPiece`.
7. **Post-processing é chamado ao final de `runPlacementHorizontal`** — mesmo pipeline de `runPlacement`.

---

## RESUMO DAS MUDANÇAS POR ARQUIVO

| Arquivo | Mudança 1 (leaf Y) | Mudança 2 (cutMode) |
|---|---|---|
| `types.ts` | — | Sem alterações |
| `tree-utils.ts` | Guarda leaf Y em `calcPlacedArea` e afins | Sem alterações |
| `placement.ts` | Simplificar `createPieceNodes` | Criar `runPlacementHorizontal` |
| `optimizer.ts` | — | Loop com `cutMode` |
| `genetic.ts` | — | Gene `cutMode` no genoma |
| `grouping.ts` | — | Sem alterações |
| `scoring.ts` | — | Sem alterações |
| `void-filling.ts` | Guarda leaf Y | Sem alterações |
| `post-processing.ts` | Guardas leaf Y | Sem alterações |
| `normalization.ts` | Leaf Y em `extractAbsoluteRects` | Sem alterações |
| `SheetViewer.tsx` | Render leaf Y | Sem alterações |
| `pdf-export.ts` | Verificar | Sem alterações |
| `excel-export.ts` | Verificar | Sem alterações |
