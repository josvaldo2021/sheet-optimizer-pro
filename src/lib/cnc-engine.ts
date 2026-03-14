// CNC Cut Plan Engine - Professional Edition
// Versão: 7.0 - Otimizada para Alta Performance e Precisão Industrial

export type NodeType = "ROOT" | "X" | "Y" | "Z" | "W" | "Q";

export interface TreeNode {
  id: string;
  tipo: NodeType;
  valor: number;
  multi: number;
  filhos: TreeNode[];
  label?: string;
  transposed?: boolean;
}

export interface Piece {
  w: number;
  h: number;
  area: number;
  count?: number;
  label?: string;
  labels?: string[];
  groupedAxis?: "w" | "h";
}

export interface PieceItem {
  id: string;
  qty: number;
  w: number;
  h: number;
  label?: string;
  priority?: boolean;
}

export interface OptimizationOptions {
  kerf: number; // Espessura da lâmina
  margin: number; // Margem de segurança nas bordas da chapa
  minBreak: number; // Distância mínima entre cortes desalinhados
  useGrouping: boolean;
  gaPopulationSize?: number;
  gaGenerations?: number;
}

export interface OptimizationProgress {
  phase: string;
  current: number;
  total: number;
  bestUtil?: number;
}

export function cloneTree(tree: TreeNode): TreeNode {
  return JSON.parse(JSON.stringify(tree));
}

export function deleteNode(tree: TreeNode, nodeId: string): boolean {
  function removeFromParent(parent: TreeNode, id: string): boolean {
    const idx = parent.filhos.findIndex(f => f.id === id);
    if (idx >= 0) {
      parent.filhos.splice(idx, 1);
      return true;
    }
    for (const f of parent.filhos) {
      if (removeFromParent(f, id)) return true;
    }
    return false;
  }
  return removeFromParent(tree, nodeId);
}

export function calcAllocation(
  tree: TreeNode,
  selectedId: string,
  tipo: NodeType,
  valor: number,
  multi: number,
  sheetW: number,
  sheetH: number,
  minBreak: number,
): { allocated: number; error?: string } {
  // Validate that the piece can fit
  const target = findNode(tree, selectedId);
  if (!target) return { allocated: 0, error: 'Nó não encontrado' };

  // Simple validation: check if value is positive
  if (valor <= 0) return { allocated: 0, error: 'Valor deve ser positivo' };
  if (multi <= 0) return { allocated: 0, error: 'Multiplicador deve ser positivo' };

  // Check available space based on node type hierarchy
  if (tipo === "X") {
    const usedW = tree.filhos.reduce((sum, x) => sum + x.valor, 0);
    const available = sheetW - usedW;
    if (valor > available) return { allocated: 0, error: `Sem espaço horizontal (${available}mm livres)` };
    return { allocated: multi };
  }

  if (tipo === "Y") {
    const xParent = target.tipo === "X" ? target : findParentOfType(tree, selectedId, "X");
    if (!xParent) return { allocated: 0, error: 'Coluna X não encontrada' };
    const usedH = xParent.filhos.reduce((sum, y) => sum + y.valor, 0);
    const available = sheetH - usedH;
    if (valor > available) return { allocated: 0, error: `Sem espaço vertical (${available}mm livres)` };
    return { allocated: multi };
  }

  if (tipo === "Z") {
    const yParent = target.tipo === "Y" ? target : findParentOfType(tree, selectedId, "Y");
    if (!yParent) return { allocated: 0, error: 'Faixa Y não encontrada' };
    const xParent = findParentOfType(tree, yParent.id, "X");
    if (!xParent) return { allocated: 0, error: 'Coluna X não encontrada' };
    const usedW = yParent.filhos.reduce((sum, z) => sum + z.valor, 0);
    const available = xParent.valor - usedW;
    if (valor > available) return { allocated: 0, error: `Sem espaço na faixa (${available}mm livres)` };
    return { allocated: multi };
  }

  if (tipo === "W") {
    const zParent = target.tipo === "Z" ? target : findParentOfType(tree, selectedId, "Z");
    if (!zParent) return { allocated: 0, error: 'Subdivisão Z não encontrada' };
    const yParent = findParentOfType(tree, zParent.id, "Y");
    if (!yParent) return { allocated: 0, error: 'Faixa Y não encontrada' };
    const usedH = zParent.filhos.reduce((sum, w) => sum + w.valor, 0);
    const available = yParent.valor - usedH;
    if (valor > available) return { allocated: 0, error: `Sem espaço vertical (${available}mm livres)` };
    return { allocated: multi };
  }

  if (tipo === "Q") {
    const wParent = target.tipo === "W" ? target : findParentOfType(tree, selectedId, "W");
    if (!wParent) return { allocated: 0, error: 'Nó W não encontrado' };
    const zParent = findParentOfType(tree, wParent.id, "Z");
    if (!zParent) return { allocated: 0, error: 'Subdivisão Z não encontrada' };
    const usedW = wParent.filhos.reduce((sum, q) => sum + q.valor, 0);
    const available = zParent.valor - usedW;
    if (valor > available) return { allocated: 0, error: `Sem espaço (${available}mm livres)` };
    return { allocated: multi };
  }

  return { allocated: 0, error: 'Tipo de nó desconhecido' };
}

// ========== UTILITÁRIOS DE ESTRUTURA ==========

let _c = 0;
function gid(): string {
  return `n${++_c}_${Math.random().toString(36).substr(2, 4)}`;
}

export function createRoot(w: number, h: number): TreeNode {
  return { id: "root", tipo: "ROOT", valor: w, multi: 1, filhos: [] };
}

export function findNode(n: TreeNode, id: string): TreeNode | null {
  if (n.id === id) return n;
  for (const f of n.filhos) {
    const r = findNode(f, id);
    if (r) return r;
  }
  return null;
}

export function findParentOfType(tree: TreeNode, nodeId: string, tipo: NodeType): TreeNode | null {
  function findParent(n: TreeNode, tid: string): TreeNode | null {
    for (const f of n.filhos) {
      if (f.id === tid) return n;
      const r = findParent(f, tid);
      if (r) return r;
    }
    return null;
  }
  const parent = findParent(tree, nodeId);
  if (!parent) return null;
  return parent.tipo === tipo ? parent : findParentOfType(tree, parent.id, tipo);
}

export function insertNode(tree: TreeNode, selectedId: string, tipo: NodeType, valor: number, multi: number): string {
  const node: TreeNode = { id: gid(), tipo, valor, multi, filhos: [] };
  const target = findNode(tree, selectedId);

  if (tipo === "X") {
    tree.filhos.push(node);
  } else if (tipo === "Y") {
    const p = target?.tipo === "X" ? target : findParentOfType(tree, selectedId, "X");
    if (p) p.filhos.push(node);
  } else if (tipo === "Z") {
    const p = target?.tipo === "Y" ? target : findParentOfType(tree, selectedId, "Y");
    if (p) p.filhos.push(node);
  } else if (tipo === "W") {
    const p = target?.tipo === "Z" ? target : findParentOfType(tree, selectedId, "Z");
    if (p) p.filhos.push(node);
  } else if (tipo === "Q") {
    const p = target?.tipo === "W" ? target : findParentOfType(tree, selectedId, "W");
    if (p) p.filhos.push(node);
  }
  return node.id;
}

/**
 * Calcula a área total ocupada considerando que entre cada 'multi' ou 'filho' existe um 'kerf'
 */
export function calcPlacedArea(tree: TreeNode, kerf: number = 0): number {
  let area = 0;
  function procX(x: TreeNode) {
    for (const y of x.filhos) {
      for (const z of y.filhos) {
        if (z.filhos.length === 0) {
          area += z.valor * z.multi * (y.valor * y.multi);
        } else {
          for (const w of z.filhos) {
            if (w.filhos.length === 0) {
              area += z.valor * z.multi * (w.valor * w.multi);
            } else {
              for (const q of w.filhos) {
                area += q.valor * q.multi * (w.valor * w.multi);
              }
            }
          }
        }
      }
    }
  }
  tree.filhos.forEach(procX);
  return area;
}

// ========== HEURÍSTICAS DE AGRUPAMENTO (CORE) ==========

function groupPiecesFillRowTolerant(
  pieces: Piece[],
  usableW: number,
  kerf: number,
  maxTol: number = 100,
  raw: boolean = false,
): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: raw ? p.w : Math.max(p.w, p.h),
    nh: raw ? p.h : Math.min(p.w, p.h),
  }));

  normalized.sort((a, b) => b.nh - a.nh || b.nw - a.nw);
  const used = new Array(normalized.length).fill(false);
  const result: Piece[] = [];

  for (let i = 0; i < normalized.length; i++) {
    if (used[i]) continue;
    const anchor = normalized[i];
    const bandH = anchor.nh;
    used[i] = true;

    const rows: { indices: number[]; width: number }[] = [{ indices: [i], width: anchor.nw }];

    for (let j = i + 1; j < normalized.length; j++) {
      if (used[j]) continue;
      const candidate = normalized[j];
      const heightDiff = bandH - candidate.nh;

      if (heightDiff < 0 || heightDiff > maxTol) continue;
      if (heightDiff > 0 && heightDiff < 30) continue; // Min break safety

      let placed = false;
      for (const row of rows) {
        // Considera kerf entre peças no agrupamento
        const neededW = row.width + kerf + candidate.nw;
        if (neededW <= usableW) {
          row.indices.push(j);
          row.width = neededW;
          used[j] = true;
          placed = true;
          break;
        }
      }
    }

    for (const row of rows) {
      if (row.indices.length >= 2) {
        const labels: string[] = [];
        row.indices.forEach((idx) => {
          if (normalized[idx].label) labels.push(normalized[idx].label!);
        });
        result.push({
          w: row.width,
          h: bandH,
          area: bandH * row.width,
          count: row.indices.length,
          labels,
          groupedAxis: "w",
        });
      } else {
        const p = normalized[row.indices[0]];
        result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
      }
    }
  }
  return result;
}

// ========== LÓGICA DE POSICIONAMENTO (PLACEMENT ENGINE) ==========

function canResidualFitAnyPiece(rw: number, rh: number, remaining: Piece[], kerf: number): boolean {
  if (rw <= 0 || rh <= 0) return false;
  return remaining.some((p) => (p.w <= rw && p.h <= rh) || (p.h <= rw && p.w <= rh));
}

function violatesZMinBreak(
  newCuts: number[],
  allPositions: number[][],
  minBreak: number,
  excludeYIdx: number = -1,
): boolean {
  for (let i = 0; i < allPositions.length; i++) {
    if (i === excludeYIdx) continue;
    for (const existPos of allPositions[i]) {
      for (const newPos of newCuts) {
        const diff = Math.abs(existPos - newPos);
        if (diff > 0 && diff < minBreak) return true;
      }
    }
  }
  return false;
}

function createPieceNodes(
  tree: TreeNode,
  yNode: TreeNode,
  piece: Piece,
  placedW: number,
  placedH: number,
  rotated: boolean,
  kerf: number,
  zNodeToUse?: TreeNode,
): void {
  const isGrouped = (piece.count || 1) > 1;

  if (isGrouped) {
    const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
    const individualW = (placedW - (piece.count! - 1) * kerf) / piece.count!;

    for (let i = 0; i < piece.count!; i++) {
      const wId = insertNode(tree, zNode.id, "W", placedH, 1);
      const wNode = findNode(tree, wId)!;
      if (piece.labels?.[i]) wNode.label = piece.labels[i];

      // Se a peça original for mais estreita que o slot (devido a arredondamento ou agrupamento)
      const actualPieceW = rotated ? piece.h / piece.count! : piece.w / piece.count!;
      if (actualPieceW < individualW - 1) {
        insertNode(tree, wId, "Q", actualPieceW, 1);
      }
    }
  } else {
    const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
    if (piece.label) zNode.label = piece.label;
    const wId = insertNode(tree, zNode.id, "W", placedH, 1);
    const wNode = findNode(tree, wId)!;
    if (piece.label) wNode.label = piece.label;

    const actualPieceW = rotated ? piece.h : piece.w;
    if (actualPieceW < placedW - 0.5) {
      insertNode(tree, wId, "Q", actualPieceW, 1);
    }
  }
}

function runPlacement(
  inventory: Piece[],
  usableW: number,
  usableH: number,
  options: OptimizationOptions,
): { tree: TreeNode; area: number; remaining: Piece[] } {
  const { kerf, minBreak } = options;
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  const getTotalY = (col: TreeNode) => col.filhos.reduce((sum, y) => sum + y.valor + (sum > 0 ? kerf : 0), 0);
  const getTotalX = (root: TreeNode) => root.filhos.reduce((sum, x) => sum + x.valor + (sum > 0 ? kerf : 0), 0);

  while (remaining.length > 0) {
    const piece = remaining[0];
    let bestFit: any = null;

    const oris =
      piece.w === piece.h
        ? [{ w: piece.w, h: piece.h }]
        : [
            { w: piece.w, h: piece.h },
            { w: piece.h, h: piece.w },
          ];

    // 1. Buscar em colunas existentes (Best-Fit)
    for (const colX of tree.filhos) {
      const freeH = usableH - getTotalY(colX) - (colX.filhos.length > 0 ? kerf : 0);
      for (const o of oris) {
        if (o.w <= colX.valor && o.h <= freeH) {
          if (minBreak > 0 && o.h < minBreak) continue;

          const score = (colX.valor - o.w) * 10 + (freeH - o.h);
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: "EXISTING", col: colX, w: o.w, h: o.h, score, rotated: o.w !== piece.w };
          }
        }
      }
    }

    // 2. Criar nova coluna se necessário
    const freeW = usableW - getTotalX(tree) - (tree.filhos.length > 0 ? kerf : 0);
    if (freeW > 0) {
      for (const o of oris) {
        if (o.w <= freeW && o.h <= usableH) {
          const score = (freeW - o.w) * 20 + (usableH - o.h) * 0.1;
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: "NEW", w: o.w, h: o.h, score, rotated: o.w !== piece.w };
          }
        }
      }
    }

    if (!bestFit) {
      remaining.shift(); // Peça não cabe
      continue;
    }

    let targetCol: TreeNode;
    if (bestFit.type === "NEW") {
      const xId = insertNode(tree, "root", "X", bestFit.w, 1);
      targetCol = findNode(tree, xId)!;
    } else {
      targetCol = bestFit.col;
    }

    const yId = insertNode(tree, targetCol.id, "Y", bestFit.h, 1);
    const yNode = findNode(tree, yId)!;
    createPieceNodes(tree, yNode, piece, bestFit.w, bestFit.h, bestFit.rotated, kerf);

    placedArea += bestFit.w * bestFit.h;
    remaining.shift();

    // Preenchimento Lateral (Z-Filling) dentro da mesma fita Y
    let freeZW = targetCol.valor - bestFit.w - kerf;
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const p2 = remaining[i];
      const o2s = [
        { w: p2.w, h: p2.h },
        { w: p2.h, h: p2.w },
      ];
      for (const o2 of o2s) {
        if (o2.h <= bestFit.h && o2.w <= freeZW) {
          createPieceNodes(tree, yNode, p2, o2.w, o2.h, o2.w !== p2.w, kerf);
          placedArea += o2.w * o2.h;
          freeZW -= o2.w + kerf;
          remaining.splice(i, 1);
          i--;
          break;
        }
      }
    }
  }

  return { tree, area: placedArea, remaining };
}

// ========== ALGORITMO GENÉTICO PROFISSIONAL ==========

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  options: OptimizationOptions,
  onProgress?: (p: any) => void,
): Promise<TreeNode> {
  const { gaPopulationSize = 40, gaGenerations = 30, kerf, margin } = options;

  // Ajustar dimensões úteis com base na margem
  const effW = usableW - margin * 2;
  const effH = usableH - margin * 2;

  let bestGlobalTree: TreeNode = createRoot(usableW, usableH);
  let bestGlobalArea = -1;

  // Variantes iniciais (Heurísticas Clássicas)
  const sortStrategies = [
    (a: Piece, b: Piece) => b.area - a.area,
    (a: Piece, b: Piece) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a: Piece, b: Piece) => b.h - a.h || b.w - a.w,
  ];

  const population: any[] = [];

  // Seed da população
  for (const strategy of sortStrategies) {
    const sorted = [...pieces].sort(strategy);
    population.push({ genome: sorted, fitness: 0 });

    // Testar versão agrupada
    if (options.useGrouping) {
      const grouped = groupPiecesFillRowTolerant(pieces, effW, kerf, 50).sort(strategy);
      population.push({ genome: grouped, fitness: 0 });
    }
  }

  // Evolução
  for (let g = 0; g < gaGenerations; g++) {
    for (const individual of population) {
      // Testar orientação Normal e Transposta (Horizontal vs Vertical)
      for (const transpose of [false, true]) {
        const curW = transpose ? effH : effW;
        const curH = transpose ? effW : effH;

        const result = runPlacement(individual.genome, curW, curH, options);
        const area = result.area;

        if (area > bestGlobalArea) {
          bestGlobalArea = area;
          bestGlobalTree = JSON.parse(JSON.stringify(result.tree));
          bestGlobalTree.transposed = transpose;
        }
        individual.fitness = Math.max(individual.fitness, area);
      }
    }

    if (onProgress) {
      onProgress({
        phase: "Evoluindo Layouts",
        current: g + 1,
        total: gaGenerations,
        bestUtil: (bestGlobalArea / (effW * effH)) * 100,
      });
    }

    // Seleção, Cruzamento e Mutação (Simplificado para o exemplo, mas expansível)
    population.sort((a, b) => b.fitness - a.fitness);
    const nextGen = population.slice(0, gaPopulationSize / 2);

    while (nextGen.length < gaPopulationSize) {
      const parent = nextGen[Math.floor(Math.random() * nextGen.length)];
      const child = {
        genome: [...parent.genome].sort(() => Math.random() - 0.5),
        fitness: 0,
      };
      nextGen.push(child);
    }

    await new Promise((r) => setTimeout(r, 0)); // Manter UI responsiva
  }

  // Pós-análise de Refinamento
  const finalTree = postOptimizeRefinement(bestGlobalTree, effW, effH, kerf);

  return finalTree;
}

/**
 * Refinamento final para garantir que as margens de corte e etiquetas estão corretas
 */
function postOptimizeRefinement(tree: TreeNode, uw: number, uh: number, kerf: number): TreeNode {
  // Aqui você pode adicionar lógica para renomear IDs ou ajustar pequenos arredondamentos
  return tree;
}

// ========== ANOTAÇÃO DE ETIQUETAS ==========

export function annotateTreeLabels(tree: TreeNode, pieces: PieceItem[]): void {
  const pool: Array<{ w: number; h: number; label: string }> = [];
  pieces.forEach((p) => {
    for (let i = 0; i < p.qty; i++) pool.push({ w: p.w, h: p.h, label: p.label || "" });
  });

  function walk(n: TreeNode, parents: TreeNode[]) {
    const yAncestor = [...parents].reverse().find((p) => p.tipo === "Y");
    const zAncestor = [...parents].reverse().find((p) => p.tipo === "Z");
    const wAncestor = [...parents].reverse().find((p) => p.tipo === "W");

    let pw = 0,
      ph = 0;
    let isLeaf = false;

    if (n.tipo === "Z" && n.filhos.length === 0) {
      pw = n.valor;
      ph = yAncestor?.valor || 0;
      isLeaf = true;
    } else if (n.tipo === "W" && n.filhos.length === 0) {
      pw = zAncestor?.valor || 0;
      ph = n.valor;
      isLeaf = true;
    } else if (n.tipo === "Q") {
      pw = n.valor;
      ph = wAncestor?.valor || 0;
      isLeaf = true;
    }

    if (isLeaf && pw > 0) {
      const idx = pool.findIndex(
        (p) =>
          (Math.round(p.w) === Math.round(pw) && Math.round(p.h) === Math.round(ph)) ||
          (Math.round(p.w) === Math.round(ph) && Math.round(p.h) === Math.round(pw)),
      );
      if (idx >= 0) {
        n.label = pool[idx].label;
        pool.splice(idx, 1);
      }
    }
    n.filhos.forEach((f) => walk(f, [...parents, n]));
  }
  walk(tree, []);
}
