# Sheet Optimizer Pro — Documentação Completa para Recriação

> Objetivo: descrever todo o projeto (interface, engine, heurísticas, modelos de dados) com detalhe suficiente para recriá-lo do zero em Rust (backend) + React/TypeScript (frontend), sem os bugs da versão atual.

---

## 1. Visão Geral do Domínio

**Sheet Optimizer Pro** é um sistema de **otimização de planos de corte CNC** para chapas retangulares (metal, madeira, plástico, etc.). Resolve o problema de *bin-packing / nesting 2D retangular*:

- O usuário informa um inventário de peças (largura × altura × quantidade)
- O sistema gera planos de corte que minimizam o desperdício de material
- Planos são representados como árvores hierárquicas de cortes (X → Y → Z → W → Q → R)
- O resultado é exportado como PDF ou layout SVG imprimível para o chão de fábrica

**Público-alvo**: marcenarias, metalúrgicas, gráficas, corte de vidro — qualquer operação industrial que corta a partir de chapas brutas estocadas.

---

## 2. Stack Tecnológica Atual (a ser migrada)

| Camada | Tecnologia atual | Motivo da migração |
|--------|------------------|--------------------|
| Engine de otimização | TypeScript (single-thread) | Rust (multi-thread via Rayon) |
| Frontend | React 18 + Vite + Tailwind | Manter ou migrar para SolidJS |
| Formulários | React Hook Form + Zod | Manter |
| Export PDF | jsPDF + html2canvas | Manter no frontend ou mover para Rust |
| Import Excel | XLSX 0.18 | Manter no frontend |
| Testes | Vitest | Rust: `cargo test` |

### Stack Nova (proposta)

```
Frontend (React/TypeScript)  ←→  HTTP/JSON  ←→  Backend Rust (Axum/Actix)
         ↕                                              ↕
   PDF/SVG export                              Engine de otimização
   SheetViewer canvas                          Algoritmo genético (Rayon paralelo)
   Command bar                                 Placement greedy
   Import Excel                                Post-processing
```

---

## 3. Estrutura de Pastas Atual

```
sheet-optimizer-pro/
├── src/
│   ├── App.tsx                    # Router + providers
│   ├── main.tsx                   # Entry point React
│   ├── pages/
│   │   └── Index.tsx              # Página principal (~1300 linhas), todo estado global
│   ├── lib/
│   │   ├── cnc-engine.ts          # Re-export barrel dos submódulos
│   │   └── engine/
│   │       ├── types.ts           # Tipos centrais (TreeNode, Piece, PieceItem, Lot)
│   │       ├── tree-utils.ts      # Manipulação de nós (criar, buscar, inserir, deletar)
│   │       ├── optimizer.ts       # V6: busca exaustiva sobre estratégias + variantes
│   │       ├── placement.ts       # Loop principal de placement greedy
│   │       ├── scoring.ts         # Heurística de pontuação + validação minBreak
│   │       ├── normalization.ts   # Canonicalização de árvore transposta
│   │       ├── grouping.ts        # 15+ heurísticas de agrupamento de peças
│   │       ├── genetic.ts         # Algoritmo genético multi-chapa
│   │       ├── post-processing.ts # Consolidação de desperdício, regroup, clamping
│   │       └── void-filling.ts    # Preenchimento de espaços residuais
│   ├── lib/export/
│   │   ├── layout-utils.ts        # Deduplicação de layouts idênticos
│   │   ├── pdf-export.ts          # Geração de PDF via jsPDF
│   │   └── print-layout.ts        # SVG + HTML para impressão
│   ├── features/
│   │   ├── sheet-setup/SheetSetupPanel.tsx
│   │   ├── piece-list/PieceListSection.tsx
│   │   ├── optimization/OptimizationPanel.tsx
│   │   ├── lots/LotsSection.tsx
│   │   └── command-bar/
│   │       ├── CommandBar.tsx
│   │       ├── ReplicationInfoBox.tsx
│   │       └── SuggestionsDropdown.tsx
│   ├── components/
│   │   ├── SheetViewer.tsx        # Canvas principal: desenho, zoom/pan, seleção
│   │   └── ui/                    # shadcn/ui primitives
│   └── hooks/
│       ├── use-mobile.tsx
│       └── use-toast.ts
├── docs/
└── public/
```

---

## 4. Interface Gráfica — Descrição Completa

### 4.1 Layout Geral

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Sidebar 420px escura]         │  [Área principal clara flex-1]      │
│                                  │                                      │
│  ✂ Sheet Optimizer Pro           │  ┌─────────────────────────────┐   │
│  ─────────────────────           │  │   SheetViewer (canvas)      │   │
│  ▼ Configuração de Chapa         │  │   Zoom/pan, peças coloridas │   │
│  ▼ Lista de Peças                │  │   Seleção de nó com mouse   │   │
│  ▼ Otimização                    │  └─────────────────────────────┘   │
│  ▼ Estrutura de Corte            │                                      │
│  ▼ Lotes                         │  ┌─────────────────────────────┐   │
│                                  │  │   CommandBar                │   │
│                                  │  │   Input + autocomplete      │   │
│                                  │  │   Replication info          │   │
│                                  │  └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Sidebar — Painel de Configuração de Chapa (`SheetSetupPanel`)

**Campos de entrada:**

| Campo | Label PT-BR | Tipo | Default | Descrição |
|-------|------------|------|---------|-----------|
| `chapaW` | Largura da Chapa | number | 6000 | mm |
| `chapaH` | Altura da Chapa | number | 3210 | mm |
| `ml` | Margem Esquerda | number | 10 | mm de aparas |
| `mr` | Margem Direita | number | 10 | mm |
| `mt` | Margem Superior | number | 10 | mm |
| `mb` | Margem Inferior | number | 10 | mm |
| `minBreak` | Corte Mínimo | number | 0 | Espessura mínima de corte CNC (0 = desabilitado) |

**Botão**: "APLICAR CONFIGURAÇÃO" → recalcula `usableW = chapaW - ml - mr`, `usableH = chapaH - mt - mb`.

### 4.3 Sidebar — Lista de Peças (`PieceListSection`)

**Funcionalidades:**
- Botão "Importar Excel" → abre file picker `.xlsx/.xls/.csv`
- Detecção automática de colunas: `qtd/quantidade/qty`, `largura/width`, `altura/height`, `id/código/nome`
- Grid editável inline: Qtd | Largura | Altura | ID
- Botão de deletar por linha
- Toggle de prioridade (⭐) por peça — peças prioritárias são colocadas primeiro
- Botão "Limpar lista"
- Contador: "X peças, Y unidades totais"

**Validação:**
- `w > 0`, `h > 0`, `qty > 0`
- `w <= usableW`, `h <= usableH` (aviso se peça maior que chapa útil)

### 4.4 Sidebar — Painel de Otimização (`OptimizationPanel`)

**Controles GA:**
- `gaPopSize`: Tamanho da população (default 10, range 5–100)
- `gaGens`: Gerações (default 10, range 1–200)

**Botão**: "Otimizar todas as chapas" → dispara GA assíncrono

**Progress bar**: Mostra `phase` + `current/total` + `bestSheets` + `bestUtil%`

**Seleção de layout:**
- Lista de grupos deduplicados (layouts idênticos agrupados)
- Cada grupo mostra: miniatura SVG, utilização%, contagem de chapas
- Clique seleciona grupo ativo no SheetViewer

**Ações pós-otimização:**
- "Confirmar Plano" → cria lote, desconta peças do inventário
- "Exportar PDF" → gera arquivo PDF com todos os layouts

### 4.5 Sidebar — Estrutura de Corte

Exibição em árvore indentada dos nós:
```
ROOT
  X 818 ×1
    Y 1450 ×1
      Z 459 ×2
        W 725 ×1  [Peça A]
      Z 359 ×1
        W 900 ×1  [Peça B]
```
- Cada nó é clicável → seleciona nó no SheetViewer
- Nó selecionado fica destacado (borda colorida)

### 4.6 Sidebar — Lotes (`LotsSection`)

Lista de lotes confirmados:
- Número do lote + data/hora
- Contagem de chapas + utilização média
- Expandir: lista peças consumidas (w×h, qty)
- Botões: "Imprimir" | "Devolver ao inventário"

### 4.7 Área Principal — SheetViewer

**Canvas SVG ou Canvas 2D** com:
- Fundo branco = chapa bruta
- Bordas pontilhadas = margens de aparas
- Retângulos coloridos = peças colocadas
- Label dentro do retângulo = `label` da peça (ID, dimensão)
- Cor por tipo de nó ou por peça (paleta automática por index)
- Nó selecionado = borda mais grossa / destaque

**Controles:**
- Scroll do mouse = zoom
- Clique + arrastar = pan
- Clique em peça = seleciona nó correspondente na árvore
- Botão "Encaixar na tela" = reset zoom/pan para caber no viewport

### 4.8 Área Principal — CommandBar

**Input de texto** para criação manual de layouts:

- Comandos: `X<valor>`, `Y<valor>`, `Z<valor>`, `W<valor>`, `Q<valor>`, `R<valor>`
- Modificadores: `M<n><cmd>` = multiplicidade (ex: `M4X818`)
- `DEL` ou `DELETE` = remove nó selecionado
- `UNDO` = desfaz última ação

**Autocomplete:**
- Mostra sugestões contextuais baseadas no nó selecionado
- Sugestões calculadas por: espaço residual disponível, peças restantes no inventário
- Dropdown com dimensões sugeridas + label da peça correspondente

**Replication Info Box:**
- Exibe: "Este layout pode ser replicado X vezes com o inventário atual"
- Tabela: peça | necessário por rep | disponível | possível

---

## 5. Modelos de Dados

### 5.1 TreeNode

```typescript
type NodeType = "ROOT" | "X" | "Y" | "Z" | "W" | "Q" | "R";

interface TreeNode {
  id: string;           // UUID único
  tipo: NodeType;
  valor: number;        // Dimensão em mm
  multi: number;        // Multiplicidade (cortes idênticos consecutivos)
  filhos: TreeNode[];   // Filhos recursivos
  label?: string;       // ID da peça
  transposed?: boolean; // Layout foi rotacionado 90°
}
```

**Semântica dos níveis:**

| Nível | Eixo | Significado |
|-------|------|-------------|
| ROOT | — | Raiz da chapa, `valor` = 0 |
| X | Largura | Corte vertical → colunas |
| Y | Altura | Corte horizontal dentro de coluna → faixas |
| Z | Largura | Subdivisão de largura dentro de faixa |
| W | Altura | Subdivisão de altura dentro de Z |
| Q | Largura | Sub-subdivisão de largura dentro de W |
| R | Altura | Sub-subdivisão de altura dentro de Q |

**Regra de interpretação:**
- Filhos de X somam até `usableW`
- Filhos de Y (dentro de um X) somam até `usableH`
- Filhos de Z (dentro de um Y) somam até `valor` do X pai
- E assim por diante alternando largura/altura

### 5.2 Piece (interna ao engine)

```typescript
interface Piece {
  w: number;
  h: number;
  area: number;            // w * h pré-calculado
  count?: number;          // Quantidade quando agrupadas
  label?: string;
  labels?: string[];       // Labels de cada unidade agrupada
  groupedAxis?: "w" | "h"; // Eixo de empilhamento
  individualDims?: number[]; // Dimensões individuais no eixo de empilhamento
}
```

### 5.3 PieceItem (inventário do usuário)

```typescript
interface PieceItem {
  id: string;        // UUID
  qty: number;       // Quantidade em estoque
  w: number;
  h: number;
  label?: string;    // Código/nome da peça
  priority?: boolean;
}
```

### 5.4 Lot (lote confirmado)

```typescript
interface Lot {
  id: string;
  number: number;
  date: string;      // ISO 8601
  chapas: Array<{
    tree: TreeNode;
    usedArea: number;
  }>;
  piecesUsed: Array<{
    w: number;
    h: number;
    label?: string;
    qty: number;
  }>;
  sheetW: number;
  sheetH: number;
  totalSheets: number;
}
```

### 5.5 OptimizationProgress

```typescript
interface OptimizationProgress {
  phase: string;        // "Inicializando" | "Gerando população" | "Evoluindo..." | "Concluído"
  current: number;
  total: number;
  bestSheets?: number;
  bestUtil?: number;    // 0.0–1.0
}
```

### 5.6 LayoutGroup (deduplicação de layouts)

```typescript
interface LayoutGroup {
  tree: TreeNode;
  usedArea: number;
  count: number;        // Quantas chapas usam este layout
  indices: number[];    // Índices no array chapas[]
}
```

---

## 6. Engine de Otimização — Algoritmos Detalhados

### 6.1 Visão Geral da Arquitetura

```
Inventário de peças
       │
       ▼
  [Normalização + Ordenação]
       │
       ▼
  [Agrupamento de peças] ← 15+ heurísticas
       │
       ▼
  [Placement greedy] ← por chapa
       │   ↑
       │   └─ repete para cada chapa até esgotar inventário
       ▼
  [Post-processing]
       │
       ▼
  Árvore de corte final
```

**Coordenação:**
- `optimizer.ts` (V6): testa 12 estratégias de ordenação × 40+ variantes de agrupamento
- `genetic.ts`: evolui permutações de peças para minimizar chapas totais
- `placement.ts`: executa o placement greedy para uma configuração específica

### 6.2 Placement Greedy (`placement.ts`)

**Função principal:** `runPlacement(inventory, usableW, usableH, minBreak, horizontalStrip?)`

**Algoritmo passo a passo:**

```
1. PRÉ-SEEDING (se horizontalStrip fornecido):
   - Cria nó X = usableW (coluna cheia)
   - Cria nó Y = horizontalStrip (faixa de base)
   → Força corte horizontal-first

2. LOOP PRINCIPAL (para cada peça no inventário):
   a. Para cada coluna X existente:
      - Calcular espaço disponível na coluna
      - Tentar inserir peça em faixa Y existente (melhor encaixe)
      - Tentar inserir em nova faixa Y
      - Calcular score de encaixe
   b. Tentar abrir nova coluna X:
      - Se largura da peça ≤ espaço X restante: criar nova coluna
   c. Se nenhum encaixe: tentar void-filling (espaços Z residuais)
   d. Se ainda não couber: peça é rejeitada (vai para próxima chapa)

3. EMPILHAMENTO VERTICAL:
   - Detectar peças idênticas consecutivas no eixo Y
   - Combinar em faixa Y única com multi > 1

4. PREENCHIMENTO LATERAL:
   - Após inserir peça em Z, verificar Z-residual
   - Tentar preencher Z-residual com peças menores do inventário
```

**Estrutura de colunas:**

```
Chapa usável (usableW × usableH)
├── X[valor=818] (coluna 1)
│   ├── Y[valor=1450] (faixa 1)
│   │   ├── Z[valor=459] (slot esquerdo)
│   │   │   └── W[valor=725] [label="A"]
│   │   └── Z[valor=359] (slot direito = 818-459)
│   │       └── W[valor=725] [label="B"]
│   └── Y[valor=1760] (faixa 2)
│       └── Z[valor=818]
│           └── W[valor=1760] [label="C"]
└── X[valor=818] (coluna 2)
    └── ...
```

**Regra de encaixe Z-lateral:**
- Peça W×H entra em Z se W ≤ Z_width e H ≤ Y_height (espaço livre)
- Após inserção: Z_residual = Z_width - W
- Se Z_residual > 0 e Z_residual < minBreak: **INVÁLIDO** → não inserir
- Se Z_residual ≥ minBreak: criar novo nó Z filho do mesmo Y

**Função `fillVoids()`** (post-placement):

```
Para cada nó Y na árvore:
  calcular altura usada pelos filhos Z-W
  altura_residual = Y.valor - altura_usada
  Se altura_residual ≥ minBreak:
    Para cada peça remanescente no inventário:
      Se peça cabe em (Z_disponível × altura_residual):
        inserir peça como novo nó Z-W
        marcar peça como usada
```

### 6.3 Heurística de Pontuação (`scoring.ts`)

**`scoreFit(spaceW, spaceH, pieceW, pieceH, remaining[])`**

```
wasteW = spaceW - pieceW       (desperdício horizontal)
wasteH = spaceH - pieceH       (desperdício vertical)

score = wasteW * spaceH        (área desperdiçada pela esquerda)
      + wasteH * pieceW        (área desperdiçada em cima)
      - pieceArea * 0.5        (bônus por área colocada)

// Bônus de encaixe exato:
if wasteW == 0: score -= 20 * spaceH
if wasteH == 0: score -= 20 * spaceW

// Lookahead: bônus por peças futuras que caberiam no resíduo:
for each r in remaining:
  if r cabe em (wasteW × spaceH): score -= 0.5
  if r cabe em (pieceW × wasteH): score -= 0.5

return score  // menor = melhor
```

**Validação minBreak (`scoring.ts`):**

```typescript
// Dois cortes não podem estar a distância < minBreak um do outro
// (exceto se forem idênticos — mesmo nível)

siblingViolatesMinBreak(valor1, valor2, minBreak):
  diff = |valor1 - valor2|
  return diff > 0 && diff < minBreak

zResidualViolatesMinBreak(slotW, pieceW, minBreak):
  residual = slotW - pieceW
  return residual > 0 && residual < minBreak

violatesZMinBreak(column, pieceW, slotY, minBreak):
  // Verifica posições de corte Z em todas as faixas Y da coluna
  // que compartilham a mesma posição de corte vertical
  for each Y in column.filhos:
    for each Z in Y.filhos:
      if |Z.posicao - pieceW| < minBreak && Z.posicao != pieceW:
        return true
  return false
```

### 6.4 Heurísticas de Agrupamento (`grouping.ts`)

O agrupamento transforma o inventário de peças individuais em peças "compostas" que podem ser colocadas como uma unidade, melhorando a eficiência do placement.

**15+ estratégias implementadas:**

| # | Nome | Descrição |
|---|------|-----------|
| 0 | `none` | Sem agrupamento (peças individuais) |
| 1 | `groupBySameWidth` | Empilha peças de mesma largura no eixo H |
| 2 | `groupBySameHeight` | Empilha peças de mesma altura no eixo W |
| 3 | `fillRow` | Preenche linhas horizontais com peças de altura similar |
| 4 | `fillCol` | Preenche colunas verticais com peças de largura similar |
| 5 | `columnWidth` | Faixas verticais de larguras similares |
| 6 | `columnHeight` | Faixas horizontais de alturas similares |
| 7 | `commonDimension` | Dimensões dominantes (≥30% share) |
| 8 | `stripDP_0` | DP strip packing, tolerância 0mm |
| 9 | `stripDP_5` | DP strip packing, tolerância 5mm |
| 10 | `stripDP_30` | DP strip packing, tolerância 30mm |
| 11 | `stripDP_100` | DP strip packing, tolerância 100mm |
| 12 | `commonDimDP_W` | DP por dimensão comum no eixo W |
| 13 | `commonDimDP_H` | DP por dimensão comum no eixo H |
| 14 | `hybrid` | Combinação: stripDP_30 + commonDimension |

**`groupStripPackingDP(pieces, axis, tolerance)`:**

```
1. Extrair dimensões únicas no eixo especificado
2. Para cada dimensão D:
   a. Selecionar peças com dim ≤ D + tolerance
   b. Usar DP para maximizar preenchimento de faixa de largura D
   c. Agrupar peças selecionadas em uma peça composta
3. Retornar lista de peças compostas + restantes
```

### 6.5 Estratégias de Ordenação (Optimizer V6)

**12 estratégias testadas para cada variante de agrupamento:**

| # | Estratégia | Critério |
|---|-----------|---------|
| 0 | `byArea_desc` | Maior área primeiro |
| 1 | `byArea_asc` | Menor área primeiro |
| 2 | `byWidth_desc` | Maior largura primeiro |
| 3 | `byWidth_asc` | Menor largura primeiro |
| 4 | `byHeight_desc` | Maior altura primeiro |
| 5 | `byHeight_asc` | Menor altura primeiro |
| 6 | `byPerimeter_desc` | Maior perímetro primeiro |
| 7 | `byPerimeter_asc` | Menor perímetro primeiro |
| 8 | `byAspect_desc` | Maior razão W/H primeiro |
| 9 | `byAspect_asc` | Menor razão W/H primeiro |
| 10 | `byCount_desc` | Maior quantidade primeiro |
| 11 | `shuffle` | Aleatório (seed fixo para reprodutibilidade) |

**Cada combinação (estratégia × agrupamento) é testada em:**
- Orientação normal da chapa (W × H)
- Chapa transposta (H × W)

**Score de layout:**

```
score = totalAreaPlaced / (usableW * usableH * numColunas)
```

Melhor score → menos colunas, mais preenchimento.

**Otimização de performance (skip de variantes caras):**

```
if maxRepetition < 3 && numPieceTypes > 50:
  skip grouping variants 8-14 (DP-based)
```

### 6.6 Algoritmo Genético (`genetic.ts`)

**Genoma de um indivíduo:**

```typescript
interface GAIndividual {
  genome: number[];         // Permutação de índices de peças [0..n-1]
  rotations: boolean[];     // true = rotacionar peça 90° (trocar W↔H)
  groupingMode: number;     // 0–14: qual heurística de agrupamento usar
  transposed: boolean;      // true = transpor chapa (H×W em vez de W×H)
  stripMode: 'V' | 'H';    // 'V' = colunas verticais first, 'H' = faixas horizontais first
}
```

**Função de fitness:**

```
fitness(individual):
  1. Aplicar rotations[] às peças
  2. Aplicar groupingMode às peças (re-ordem por agrupamento)
  3. Simular placement em chapas consecutivas:
     for each chapa:
       remaining = peças não colocadas
       tree = runPlacement(remaining, usableW, usableH, minBreak, stripH?)
       placed += peças colocadas nesta chapa
       numSheets++
  4. utilization = totalAreaPlaced / (numSheets * sheetArea)
  5. penalty = rejectedPieces * 0.1 + fragmentation * 0.05
  return utilization - penalty
```

**Inicialização da população:**

```
Para cada combinação (estratégia_sort × stripMode):
  criar indivíduo com genome ordenado por estratégia
  adicionar à população inicial
Completar até popSize com indivíduos aleatórios
```

**Operadores de mutação (probabilidades):**

| Operador | Prob | Descrição |
|---------|------|-----------|
| swap | 20% | Trocar duas posições aleatórias no genome |
| blockMove | 20% | Mover bloco de peças para posição aleatória |
| flipRotation | 15% | Inverter rotação de peça aleatória |
| changeGrouping | 15% | Mudar groupingMode aleatoriamente |
| toggleTransposed | 12% | Inverter flag transposed |
| toggleStripMode | 18% | Alternar V↔H stripMode |

**Crossover (PMX — Partially Mapped Crossover):**

```
parent1: [A B C D E F]
parent2: [D B E A F C]

segmento: índices 2–4

filho1: pega posições 2–4 de parent1 (C D E)
        preenche resto preservando ordem de parent2
resultado: [B A C D E F]  (sem duplicatas, respeitando permutação)
```

**Seleção:** Tournament com k=4 (seleciona melhor de 4 aleatórios)

**Elitismo:** Top 10% da população sobrevive sem mutação/crossover

**Terminação:** `gaGens` gerações completas

### 6.7 Post-Processing Pipeline (`post-processing.ts`)

Executado após placement para melhorar o resultado:

**Passo 1: `unifyColumnWaste()`**

```
Se existem colunas de "desperdício" (sem peças ou com menos de minBreak):
  Expandir coluna adjacente para absorver espaço
  Re-tentar placement de peças rejeitadas no espaço criado
```

**Passo 2: `collapseTreeWaste()`**

```
Para pares de nós Y adjacentes com mesma altura:
  Se podem ser mesclados sem violar minBreak:
    Criar nó Y único com multi = 2 (ou mais)
```

**Passo 3: `regroupAdjacentStrips()`**

```
Para cada par de faixas Y consecutivas:
  Se heights são compatíveis (diferença < tolerance):
    Tentar re-agrupar peças das duas faixas em layout unificado
    Se novo layout é melhor (menos colunas Z): aceitar
```

**Passo 4: `clampTreeHeights()`**

```
Para cada nó Y na árvore:
  Se soma dos filhos > usableH:
    truncar último filho para caber em usableH
```

### 6.8 Normalização (`normalization.ts`)

Converte uma árvore transposta (chapa rotacionada) de volta à forma canônica.

**Algoritmo:**

```
1. EXTRAÇÃO DE RETÂNGULOS ABSOLUTOS:
   traverseTree(node, xOffset, yOffset, parentW, parentH):
     calcular posição absoluta de cada folha
     output: [(x, y, w, h, label), ...]

2. RECONSTRUÇÃO CANÔNICA:
   Ordenar retângulos por x, depois y
   Para cada x único → criar nó X
     Para cada y único dentro desse x → criar nó Y
       Para cada peça nesse Y → criar nó Z-W

3. VALIDAÇÃO minBreak:
   Percorrer árvore reconstruída
   Ajustar posições de corte se gap < minBreak
```

---

## 7. Export e Output

### 7.1 Export PDF (`pdf-export.ts`)

**Estrutura do PDF:**
- Página 1: Capa com título, data, estatísticas gerais
- Páginas seguintes: Uma página por layout único
  - Miniatura SVG da chapa (proporção real)
  - Tabela de peças: ID, dimensões, quantidade
  - Utilização da chapa %
  - Número de replicações deste layout

**Renderização:** jsPDF + `doc.addSvgAsImage()` para miniaturas

### 7.2 Print Layout (`print-layout.ts`)

**Geração de HTML+SVG:**
- SVG proporcional ao papel (A4 ou A3)
- Cada peça como `<rect>` com `<text>` interno mostrando label + dimensões
- Fontes adaptadas: `fontSize = Math.min(pieceW, pieceH) / 8`
- Cores alternadas para distinguir peças adjacentes
- JavaScript inline: `window.onload = () => window.print()`

### 7.3 Import Excel

**Colunas detectadas (case-insensitive, português + inglês):**
- Quantidade: `qtd`, `quantidade`, `qty`, `quant`
- Largura: `largura`, `larg`, `width`, `w`
- Altura: `altura`, `alt`, `height`, `h`
- ID: `id`, `código`, `codigo`, `nome`, `name`, `ref`

---

## 8. Estado Global e Fluxo de Dados

### 8.1 Estado no Index.tsx

```typescript
// Configuração da chapa
[chapaW, chapaH]: number           // Dimensões da chapa
[ml, mr, mt, mb]: number           // Margens
[minBreak]: number

// Inventário
[pieces]: PieceItem[]

// Layout atual
[tree]: TreeNode | undefined       // Árvore sendo editada
[selectedId]: string               // Nó selecionado na árvore

// Chapas geradas
[chapas]: Array<{tree, usedArea, manual?}>
[activeChapa]: number              // Índice da chapa ativa no viewer

// Otimização
[isOptimizing]: boolean
[progress]: OptimizationProgress | null

// Lotes
[lots]: Lot[]

// UI
[status]: {msg: string, type: 'success'|'error'|'info'}
[cmdInput]: string
[showSuggestions]: boolean
```

### 8.2 Fluxo Principal

```
Import Excel
    │
    ▼
setPieces() → renderiza lista de peças na sidebar
    │
    ▼
User clica "Otimizar"
    │
    ▼
optimizeAllSheets() {
  setIsOptimizing(true)
  for gen in 0..gaGens:
    evaluatePopulation()    // GA fitness
    setProgress({...})
    await yield()           // Libera event loop React
  setChapas(bestPlan)
  setIsOptimizing(false)
}
    │
    ▼
User seleciona layout → setActiveChapa(i) → setTree(chapas[i].tree)
    │
    ▼
User clica "Confirmar Plano"
    │
    ▼
confirmAutoPlan() {
  novos_lotes = criarLote(chapas, pieces)
  setPieces(pieces - usados)
  setLots([...lots, novos_lotes])
  setChapas([])
}
```

### 8.3 Command Bar — Fluxo de Edição Manual

```
User digita "X818" + Enter
    │
    ▼
processCommand("X818")
    │
    ▼
parseCommand() → {tipo: "X", valor: 818, multi: 1}
    │
    ▼
insertNode(tree, selectedId, newNode)
    │
    ▼
validateTreeMinBreak(tree, minBreak) → OK ou erro
    │
    ▼
setTree(newTree) → SheetViewer re-renderiza
setSelectedId(newNode.id) → foco no novo nó
```

---

## 9. Bugs Conhecidos na Versão Atual

### 9.1 Bug: Dimensões Fantasma (Phantom Pieces)

**Descrição:** No stacking lateral combinado de Y (empilhamento vertical de peças idênticas), nós W podiam acumular dimensões infladas se o multi do nó Y pai fosse aplicado duas vezes.

**Localização:** `placement.ts:350-380` (área de empilhamento vertical)

**Causa raiz:** Ao combinar Y-strips idênticos, o multiplicador era aplicado ao nó filho W em vez de ao nó Y, causando `valor * multi` no lugar de `valor`.

**Fix:** Rastrear multiplicador explicitamente; aplicar `multi` apenas ao nó Y, não propagar para W.

### 9.2 Bug: Violação minBreak em Y-siblings

**Descrição:** Duas faixas Y adjacentes podiam ter alturas com diferença < minBreak, gerando cortes inválidos para CNC.

**Fix:** Adicionar check `siblingViolatesMinBreak(yExistente.valor, novaPeça.h, minBreak)` antes de inserir nova faixa Y.

### 9.3 Bug: Z-residual < minBreak

**Descrição:** Após inserir peça em Z, o resíduo `Z_width - pieceW` podia ser positivo mas menor que minBreak, tornando o corte CNC impossível.

**Fix:** `zResidualViolatesMinBreak()` em `scoring.ts` rejeita encaixe neste caso.

### 9.4 Bug: Overflow de altura no void-filling

**Descrição:** `fillVoids()` podia inserir peças que causavam `soma_filhos_Z > usableH`.

**Fix:** Clamp em `post-processing.ts:147-150`.

### 9.5 Bug: Replicação superestimada

**Descrição:** O cálculo de replicação não normalizava orientação das peças (W×H vs H×W), contando a mesma peça duas vezes em inventários com peças quadradas ou rotacionadas.

**Fix:** Normalizar chave de peça como `min(w,h)×max(w,h)` antes de calcular BOM.

---

## 10. Plano de Recriação em Rust + React

### 10.1 Arquitetura Proposta

```
Frontend (React + TypeScript + Vite)
    │  HTTP POST /optimize  (JSON)
    │  HTTP POST /placement (JSON)
    │  HTTP GET  /health
    ▼
Backend Rust (Axum ou Actix-Web)
    ├── engine/
    │   ├── types.rs          → TreeNode, Piece, PieceItem
    │   ├── placement.rs      → runPlacement()
    │   ├── scoring.rs        → scoreFit(), minBreak validators
    │   ├── grouping.rs       → 15 heurísticas
    │   ├── optimizer.rs      → V6: busca exaustiva
    │   ├── genetic.rs        → GA com Rayon paralelo
    │   ├── post_processing.rs→ pipeline pós-placement
    │   ├── void_filling.rs
    │   └── normalization.rs
    └── api/
        ├── handlers.rs       → POST /optimize, GET /health
        └── models.rs         → structs de request/response JSON
```

### 10.2 Melhorias com Rust

**Performance:**
- `rayon::par_iter()` para avaliar população GA em paralelo (speedup ~8–16× em 8 cores)
- Placement greedy em microsegundos (vs milissegundos em JS)
- 200 gerações em <2 segundos (vs 30+ segundos em JS)

**Confiabilidade:**
- Sistema de tipos estrito elimina erros de undefined/null
- Sem erros de arredondamento float: usar `i32` (valores em décimos de mm) ou `Decimal`
- Testes de propriedade com `proptest` ou `quickcheck`

**Estrutura de dados em Rust:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeType { Root, X, Y, Z, W, Q, R }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub id: String,
    pub tipo: NodeType,
    pub valor: i32,          // mm × 10 para evitar float
    pub multi: u32,
    pub filhos: Vec<TreeNode>,
    pub label: Option<String>,
    pub transposed: bool,
}

#[derive(Debug, Clone)]
pub struct Piece {
    pub w: i32,
    pub h: i32,
    pub area: i64,
    pub count: u32,
    pub labels: Vec<String>,
    pub grouped_axis: Option<GroupedAxis>,
    pub individual_dims: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizeRequest {
    pub pieces: Vec<PieceItem>,
    pub sheet_w: i32,
    pub sheet_h: i32,
    pub margins: Margins,
    pub min_break: i32,
    pub ga_pop_size: usize,
    pub ga_gens: usize,
}

#[derive(Debug, Serialize)]
pub struct OptimizeResponse {
    pub chapas: Vec<ChapaPlan>,
    pub total_util: f64,
    pub duration_ms: u64,
}
```

### 10.3 API Endpoints

```
POST /optimize
  Body: OptimizeRequest (JSON)
  Response: OptimizeResponse (JSON)
  Streaming: Server-Sent Events para progresso GA

POST /placement
  Body: { pieces, sheet_w, sheet_h, margins, min_break }
  Response: { tree, used_area, rejected }

POST /normalize
  Body: { tree, sheet_w, sheet_h, min_break }
  Response: { tree }

GET /health
  Response: { status: "ok", version: "..." }
```

### 10.4 Ordem de Implementação Recomendada

1. **Fase 1 — Tipos e utilitários** (1–2 dias)
   - `types.rs`: TreeNode, Piece, PieceItem, Lot
   - `tree_utils.rs`: criar, buscar, inserir, deletar nós

2. **Fase 2 — Scoring e validação** (1 dia)
   - `scoring.rs`: scoreFit, minBreak validators
   - Testes unitários para todos os casos de borda

3. **Fase 3 — Placement greedy** (2–3 dias)
   - `placement.rs`: loop principal sem grouping
   - `void_filling.rs`
   - Testes com inventários conhecidos

4. **Fase 4 — Grouping e Optimizer V6** (2–3 dias)
   - `grouping.rs`: implementar as 15 heurísticas
   - `optimizer.rs`: busca exaustiva das 12 × 40 variantes

5. **Fase 5 — Genético** (2 dias)
   - `genetic.rs` com `rayon::par_iter()` para fitness
   - Benchmarks vs versão JS

6. **Fase 6 — Post-processing e normalização** (1–2 dias)
   - `post_processing.rs`
   - `normalization.rs`

7. **Fase 7 — API HTTP** (1 dia)
   - Handlers Axum
   - SSE para progresso
   - CORS para frontend

8. **Fase 8 — Integração Frontend** (2–3 dias)
   - Adaptar React para chamar API Rust
   - Substituir imports de engine TS por chamadas HTTP
   - Testes de integração end-to-end

---

## 11. Casos de Teste Críticos

Para garantir paridade com a versão TS, implementar testes para:

```rust
// 1. Placement básico — 2 peças cabem em 1 chapa
test_placement_basic_fit()

// 2. minBreak — peça rejeitada se resíduo Z < minBreak
test_minbreak_z_residual()

// 3. Stacking vertical — 3 peças idênticas em Y com multi=3
test_vertical_stacking()

// 4. Rotação — peça 1000×400 rotacionada a 400×1000 cabe onde original não cabe
test_rotation_fit()

// 5. Regressão phantom pieces — multi no Y não propaga para W
test_no_phantom_pieces()

// 6. Normalização — árvore transposta gera layout canonicamente idêntico
test_normalization_identity()

// 7. GA convergência — N gerações produzem solução melhor que greedy
test_ga_improves_over_greedy()

// 8. minBreak Y-siblings — duas faixas Y com diff < minBreak são rejeitadas
test_minbreak_y_siblings()
```

---

## 12. Glossário

| Termo | Significado |
|-------|-------------|
| Chapa | Folha bruta de material (sheet) |
| Peça | Retângulo a ser cortado |
| Margem / Apara | Borda descartada da chapa |
| minBreak | Espessura mínima de corte CNC (blade width) |
| usableW/H | Dimensões da chapa menos as margens |
| Faixa (strip) | Subdivisão horizontal da chapa (nó Y) |
| Coluna | Subdivisão vertical da chapa (nó X) |
| Placement | Algoritmo de alocação de peças em espaços |
| Nesting | Encaixe de formas para minimizar desperdício |
| Utilização | (área de peças / área da chapa) × 100% |
| Lote | Conjunto de chapas confirmadas como plano de corte |
| Replicação | Quantas vezes o mesmo layout pode ser repetido |
| Transposed | Chapa rotacionada 90° (W↔H trocados) |
| Multi | Multiplicidade: N cortes idênticos consecutivos |
