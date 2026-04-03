// CNC Cut Plan Engine with IMPROVED Height Grouping
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
  // number of original pieces combined into this Piece (1 by default)
  count?: number;
  label?: string;
  /** Individual labels when grouping multiple pieces */
  labels?: string[];
  /** Axis along which pieces were grouped */
  groupedAxis?: "w" | "h";
  /** Individual dimensions of each piece in the group (widths if groupedAxis="w", heights if groupedAxis="h") */
  individualDims?: number[];
}

export interface PieceItem {
  id: string;
  qty: number;
  w: number;
  h: number;
  label?: string;
  priority?: boolean;
}

// Annotate tree leaf nodes with labels from the original pieces inventory
export function annotateTreeLabels(tree: TreeNode, pieces: PieceItem[]): void {
  // Build a pool of available labels: for each piece, qty copies
  const pool: Array<{ w: number; h: number; label: string }> = [];
  pieces.forEach((p) => {
    if (p.label) {
      for (let i = 0; i < p.qty; i++) {
        pool.push({ w: p.w, h: p.h, label: p.label });
      }
    }
  });

  if (pool.length === 0) return;

  // Walk tree and assign labels to leaf nodes by matching dimensions
  function walk(n: TreeNode, parents: TreeNode[]) {
    const yAncestor = [...parents].reverse().find((p) => p.tipo === "Y");
    const zAncestor = [...parents].reverse().find((p) => p.tipo === "Z");
    const wAncestor = [...parents].reverse().find((p) => p.tipo === "W");

    let pieceW = 0,
      pieceH = 0;
    let isLeaf = false;

    if (n.tipo === "Z" && n.filhos.length === 0) {
      pieceW = n.valor;
      pieceH = yAncestor?.valor || 0;
      isLeaf = true;
    } else if (n.tipo === "W" && n.filhos.length === 0) {
      pieceW = zAncestor?.valor || 0;
      pieceH = n.valor;
      isLeaf = true;
    } else if (n.tipo === "Q") {
      pieceW = n.valor;
      pieceH = wAncestor?.valor || 0;
      isLeaf = true;
    }

    if (isLeaf && pieceW > 0 && pieceH > 0) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (
          (Math.round(p.w) === Math.round(pieceW) && Math.round(p.h) === Math.round(pieceH)) ||
          (Math.round(p.w) === Math.round(pieceH) && Math.round(p.h) === Math.round(pieceW))
        ) {
          n.label = p.label;
          pool.splice(i, 1);
          break;
        }
      }
    }

    n.filhos.forEach((f) => walk(f, [...parents, n]));
  }

  walk(tree, []);
}

let _c = 0;
function gid(): string {
  return `n${++_c}_${Math.random().toString(36).substr(2, 4)}`;
}

export function createRoot(w: number, h: number): TreeNode {
  return { id: "root", tipo: "ROOT", valor: w, multi: 1, filhos: [] };
}

export function cloneTree(t: TreeNode): TreeNode {
  return JSON.parse(JSON.stringify(t));
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

export function deleteNode(tree: TreeNode, id: string): void {
  const rm = (n: TreeNode) => {
    n.filhos = n.filhos.filter((f) => f.id !== id);
    n.filhos.forEach(rm);
  };
  rm(tree);
}

export function calcAllocation(
  tree: TreeNode,
  selectedId: string,
  tipo: NodeType,
  valor: number,
  multi: number,
  usableW: number,
  usableH: number,
  minBreak: number = 0,
): { allocated: number; error?: string } {
  const target = findNode(tree, selectedId);
  let free = 0;

  if (tipo === "X") {
    free = usableW - tree.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === "Y") {
    const xP = target?.tipo === "X" ? target : findParentOfType(tree, selectedId, "X");
    if (!xP) return { allocated: 0, error: "Selecione X" };
    free = usableH - xP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === "Z") {
    const yP = target?.tipo === "Y" ? target : findParentOfType(tree, selectedId, "Y");
    if (!yP) return { allocated: 0, error: "Selecione Y" };
    const xP = findParentOfType(tree, yP.id, "X");
    if (!xP) return { allocated: 0, error: "Selecione Y" };
    free = xP.valor - yP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === "W") {
    const zP = target?.tipo === "Z" ? target : findParentOfType(tree, selectedId, "Z");
    if (!zP) return { allocated: 0, error: "Selecione Z" };
    const yP = findParentOfType(tree, zP.id, "Y");
    if (!yP) return { allocated: 0, error: "Selecione Z" };
    free = yP.valor - zP.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
  } else if (tipo === "Q") {
    const wP = target?.tipo === "W" ? target : findParentOfType(tree, selectedId, "W");
    if (!wP) return { allocated: 0, error: "Selecione W" };
    const zP = findParentOfType(tree, wP.id, "Z");
    if (!zP) return { allocated: 0, error: "Selecione Z" };
    const occupiedQ = wP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
    free = zP.valor - occupiedQ;
  }

  const alloc = Math.min(multi, Math.floor(free / valor));
  if (alloc <= 0) return { allocated: 0, error: "Sem espaço" };

  // Check minimum break distance constraint
  if (minBreak > 0) {
    let siblings: TreeNode[] = [];
    if (tipo === "X") {
      siblings = tree.filhos;
    } else if (tipo === "Y") {
      const xP = target?.tipo === "X" ? target : findParentOfType(tree, selectedId, "X");
      if (xP) siblings = xP.filhos;
    } else if (tipo === "Z") {
      const yP = target?.tipo === "Y" ? target : findParentOfType(tree, selectedId, "Y");
      if (yP) siblings = yP.filhos;
    } else if (tipo === "W") {
      const zP = target?.tipo === "Z" ? target : findParentOfType(tree, selectedId, "Z");
      if (zP) siblings = zP.filhos;
    } else if (tipo === "Q") {
      const wP = target?.tipo === "W" ? target : findParentOfType(tree, selectedId, "W");
      if (wP) siblings = wP.filhos;
    }
    for (const sib of siblings) {
      const diff = Math.abs(sib.valor - valor);
      if (diff > 0 && diff < minBreak) {
        return { allocated: 0, error: `Distância de quebra insuficiente: ${diff}mm < ${minBreak}mm` };
      }
    }
  }

  return { allocated: alloc };
}

export function calcPlacedArea(tree: TreeNode): number {
  let area = 0;

  function procX(x: TreeNode) {
    for (let ix = 0; ix < x.multi; ix++) {
      for (const y of x.filhos) {
        for (let iy = 0; iy < y.multi; iy++) {
          for (const z of y.filhos) {
            for (let iz = 0; iz < z.multi; iz++) {
              if (z.filhos.length === 0) {
                area += z.valor * y.valor;
              } else {
                for (const w of z.filhos) {
                  for (let iw = 0; iw < w.multi; iw++) {
                    if (w.filhos.length === 0) {
                      area += z.valor * w.valor;
                    } else {
                      for (const q of w.filhos) {
                        for (let iq = 0; iq < q.multi; iq++) {
                          area += q.valor * w.valor;
                        }
                      }
                    }
                  }
                }
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
/**
 * REGRA ABSOLUTA: A peça com maior área INDIVIDUAL sempre inicia o layout (índice 0).
 * Grupos nunca podem ultrapassar uma peça individual grande.
 * Chamada após qualquer ordenação para garantir a regra.
 */
function ensureLargestIndividualFirst(pieces: Piece[]): Piece[] {
  if (pieces.length <= 1) return pieces;

  // Encontra a peça INDIVIDUAL (count === 1 ou undefined) com maior área
  let bestIdx = -1;
  let bestArea = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const isIndividual = !p.count || p.count === 1;
    if (isIndividual) {
      const area = p.w * p.h;
      if (area > bestArea) {
        bestArea = area;
        bestIdx = i;
      }
    }
  }

  // Se encontrou uma peça individual e ela não está no índice 0, move para lá
  if (bestIdx > 0) {
    const largest = pieces[bestIdx];
    pieces.splice(bestIdx, 1);
    pieces.unshift(largest);
  }

  return pieces;
}

// ========== IMPROVED GROUPING ALGORITHMS ==========

/**
 * AGRUPAMENTO POR MESMA LARGURA EM X (Estratégia Principal)
 *
 * Peças com a mesma largura (W) são empilhadas verticalmente numa única coluna X.
 * Cada peça individual vira um Y strip separado dentro dessa coluna.
 * Isso espelha o comportamento do comando manual m4x818 (1 coluna X, N faixas Y).
 *
 * Exemplo:
 * Input:  [818×951, 818×600, 818×400]
 * Output: [818×1951 (count=3, groupedAxis="h")]
 *
 * Na árvore de corte:
 * X(818) -> Y(951) peça1, Y(600) peça2, Y(400) peça3
 *
 * @param maxH - Altura máxima da chapa. Limita a soma das alturas do grupo.
 */
function groupPiecesBySameWidth(pieces: Piece[], maxH: number = Infinity): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
  }));

  const widthGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!widthGroups.has(p.nw)) widthGroups.set(p.nw, []);
    widthGroups.get(p.nw)!.push(p);
  });

  const result: Piece[] = [];

  widthGroups.forEach((group, w) => {
    const sorted = [...group].sort((a, b) => b.nh - a.nh);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const stack: typeof remaining = [];
      let stackHeight = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (stackHeight + remaining[i].nh <= maxH) {
          stack.push(remaining[i]);
          stackHeight += remaining[i].nh;
        }
      }

      if (stack.length >= 2) {
        const groupedLabels: string[] = [];
        stack.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        const individualArea = w * stack[0].nh;
        result.push({
          w,
          h: stackHeight,
          area: individualArea,
          count: stack.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "h",
          individualDims: stack.map(p => p.nh),
        });

        for (const used of stack) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  // Sort by individual area descending — largest pieces always start the layout
  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const wA = a.count && a.count > 1 ? a.w : Math.max(a.w, a.h);
    const wB = b.count && b.count > 1 ? b.w : Math.max(b.w, b.h);
    return wB - wA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * AGRUPAMENTO POR MESMA ALTURA EM Y (Estratégia Complementar)
 * Peças com a mesma altura são colocadas lado a lado, somando larguras.
 */
function groupPiecesBySameHeight(pieces: Piece[], maxW: number = Infinity): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
  }));

  const heightGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!heightGroups.has(p.nh)) heightGroups.set(p.nh, []);
    heightGroups.get(p.nh)!.push(p);
  });

  const result: Piece[] = [];

  heightGroups.forEach((group, h) => {
    const sorted = [...group].sort((a, b) => b.nw - a.nw);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const row: typeof remaining = [];
      let rowWidth = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (rowWidth + remaining[i].nw <= maxW) {
          row.push(remaining[i]);
          rowWidth += remaining[i].nw;
        }
      }

      if (row.length >= 2) {
        const groupedLabels: string[] = [];
        row.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        const individualArea = row[0].nw * h;
        result.push({
          w: rowWidth,
          h,
          area: individualArea,
          count: row.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "w",
          individualDims: row.map(p => p.nw),
        });

        for (const used of row) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  // Sort by individual area descending — largest pieces always start the layout
  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const hA = a.count && a.count > 1 ? a.h : Math.min(a.w, a.h);
    const hB = b.count && b.count > 1 ? b.h : Math.min(b.w, b.h);
    return hB - hA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

// Backward-compatible aliases used by other grouping strategies
function groupPiecesByHeight(pieces: Piece[]): Piece[] {
  return groupPiecesBySameHeight(pieces);
}
function groupPiecesByWidth(pieces: Piece[]): Piece[] {
  return groupPiecesBySameWidth(pieces);
}

/**
 * FILL-ROW: Agrupa peças de mesma altura para preencher a largura total da chapa.
 * Sem limite de quantidade — empacota o máximo possível em cada "fila".
 *
 * @param raw - Se true, usa as dimensões originais (w,h) sem normalizar.
 *              Isso permite descobrir layouts onde a dimensão MAIOR é a altura da fila.
 */
function groupPiecesFillRow(pieces: Piece[], usableW: number, raw: boolean = false): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: raw ? p.w : Math.max(p.w, p.h),
    nh: raw ? p.h : Math.min(p.w, p.h),
  }));

  // Agrupa por altura (nh)
  const heightGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!heightGroups.has(p.nh)) heightGroups.set(p.nh, []);
    heightGroups.get(p.nh)!.push(p);
  });

  const result: Piece[] = [];

  heightGroups.forEach((group, h) => {
    // Ordena por largura decrescente para bin-packing first-fit-decreasing
    const sorted = [...group].sort((a, b) => b.nw - a.nw);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      // Tenta empacotar o máximo de peças possível na largura usableW
      const row: typeof remaining = [];
      let rowWidth = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (rowWidth + remaining[i].nw <= usableW) {
          row.push(remaining[i]);
          rowWidth += remaining[i].nw;
        }
      }

      if (row.length >= 2) {
        // Cria grupo
        const groupedLabels: string[] = [];
        row.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        // area = área da peça INDIVIDUAL (não do grupo) para ordenação correta
        const individualArea = row[0].nw * h;
        result.push({
          w: rowWidth,
          h,
          area: individualArea,
          count: row.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "w",
          individualDims: row.map(p => p.nw),
        });

        // Remove peças usadas
        for (const used of row) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        // Peça individual — não agrupa
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  // Sort by individual area descending — largest pieces always start the layout
  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const hA = a.count && a.count > 1 ? a.h : Math.min(a.w, a.h);
    const hB = b.count && b.count > 1 ? b.h : Math.min(b.w, b.h);
    return hB - hA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * FILL-COL: Agrupa peças de mesma largura para preencher a altura total da chapa.
 * Sem limite de quantidade.
 *
 * @param raw - Se true, usa as dimensões originais (w,h) sem normalizar.
 */
function groupPiecesFillCol(pieces: Piece[], usableH: number, raw: boolean = false): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: raw ? p.w : Math.max(p.w, p.h),
    nh: raw ? p.h : Math.min(p.w, p.h),
  }));

  // Agrupa por largura (nw)
  const widthGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!widthGroups.has(p.nw)) widthGroups.set(p.nw, []);
    widthGroups.get(p.nw)!.push(p);
  });

  const result: Piece[] = [];

  widthGroups.forEach((group, w) => {
    const sorted = [...group].sort((a, b) => b.nh - a.nh);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const col: typeof remaining = [];
      let colHeight = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (colHeight + remaining[i].nh <= usableH) {
          col.push(remaining[i]);
          colHeight += remaining[i].nh;
        }
      }

      if (col.length >= 2) {
        const groupedLabels: string[] = [];
        col.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        const individualArea = w * col[0].nh;
        result.push({
          w,
          h: colHeight,
          area: individualArea,
          count: col.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "h",
          individualDims: col.map(p => p.nh),
        });

        for (const used of col) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  // Sort by individual area descending — largest pieces always start the layout
  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const wA = a.count && a.count > 1 ? a.w : Math.max(a.w, a.h);
    const wB = b.count && b.count > 1 ? b.w : Math.max(b.w, b.h);
    return wB - wA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * COLUMN-WIDTH MAXIMIZING: Groups pieces by height (like groupPiecesByHeight),
 * then sorts results so that grouped pieces with the WIDEST combined width come first.
 * This ensures the X column is wide enough to also accommodate other (possibly wider individual)
 * pieces that are slightly narrower than the grouped sum.
 *
 * Example: 2×(1014×530) → grouped 2028×530 sorted BEFORE 2014×880
 * → X=2028, then 2014×880 fits in that column (2014 ≤ 2028)
 */
function groupPiecesColumnWidth(pieces: Piece[], usableW: number): Piece[] {
  // First, group by height (same as groupPiecesByHeight)
  const grouped = groupPiecesByHeight(pieces);

  // Sort by combined width descending (grouped pieces with wider sums first)
  // This ensures the widest group sets the X column width
  // Sort by individual area descending — largest pieces always start the layout
  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (aIsGrouped && bIsGrouped) return b.w - a.w || b.h - a.h;
    if (aIsGrouped && !bIsGrouped) return -1;
    if (!aIsGrouped && bIsGrouped) return 1;
    return 0;
  });

  // Filter out groups wider than usableW (can't fit)
  const filtered = grouped.filter((p) => p.w <= usableW);
  ensureLargestIndividualFirst(filtered);
  return filtered;
}

/**
 * BAND-FIRST: Groups pieces by height using fill-row, then sorts so that
 * the WIDEST group (highest coverage of sheet width) comes FIRST.
 * This ensures horizontal bands spanning most of the sheet are placed
 * before individual large pieces, preventing them from consuming column space.
 *
 * Example: 3×(1014×530) → group 3042×530 placed FIRST as a full-width band,
 * then 2014×880 uses the remaining height above.
 */
function groupPiecesBandFirst(pieces: Piece[], usableW: number, raw: boolean = false): Piece[] {
  const grouped = groupPiecesFillRow(pieces, usableW, raw);

  // Sort: widest groups first (highest width coverage), then by area for individuals
  // Sort by individual area descending — largest pieces always start the layout
  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (aIsGrouped && bIsGrouped) return b.w - a.w || b.h - a.h;
    if (aIsGrouped && !bIsGrouped) return -1;
    if (!aIsGrouped && bIsGrouped) return 1;
    return 0;
  });

  ensureLargestIndividualFirst(grouped);
  return grouped;
}

/**
 * BAND-LAST: Same as band-first but groups go LAST (placed at the bottom).
 * Individual large pieces consume the top, bands fill the bottom.
 */
function groupPiecesBandLast(pieces: Piece[], usableW: number, raw: boolean = false): Piece[] {
  const grouped = groupPiecesFillRow(pieces, usableW, raw);

  // Sort: individuals first by area, then grouped bands (widest last)
  // Sort by individual area descending — largest pieces always start the layout
  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (!aIsGrouped && bIsGrouped) return -1;
    if (aIsGrouped && !bIsGrouped) return 1;
    if (aIsGrouped && bIsGrouped) return b.w - a.w || b.h - a.h;
    return 0;
  });

  ensureLargestIndividualFirst(grouped);
  return grouped;
}

/**
 * Same as groupPiecesColumnWidth but groups by width (sum heights).
 */
function groupPiecesColumnHeight(pieces: Piece[], usableH: number): Piece[] {
  const grouped = groupPiecesByWidth(pieces);

  // Sort by individual area descending — largest pieces always start the layout
  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (aIsGrouped && bIsGrouped) return b.h - a.h || b.w - a.w;
    if (aIsGrouped && !bIsGrouped) return -1;
    if (!aIsGrouped && bIsGrouped) return 1;
    return 0;
  });

  const filtered = grouped.filter((p) => p.h <= usableH);
  ensureLargestIndividualFirst(filtered);
  return filtered;
}

function oris(p: Piece): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [
    { w: p.w, h: p.h },
    { w: p.h, h: p.w },
  ];
}

// ========== SCORING WITH LOOKAHEAD ==========

function scoreFit(spaceW: number, spaceH: number, pieceW: number, pieceH: number, remaining: Piece[]): number {
  const wasteW = spaceW - pieceW;
  const wasteH = spaceH - pieceH;

  // Base score: total wasted area (lower is better)
  let score = wasteW * spaceH + wasteH * pieceW;

  // Piece Size Bonus: prioritize larger pieces to be placed first
  // This helps avoid leaving large "awkward" pieces for the end.
  const pieceArea = pieceW * pieceH;
  score -= pieceArea * 0.5;

  // Lookahead: check if leftover spaces can fit at least one remaining piece
  let wFits = false;
  let hFits = false;

  for (const r of remaining) {
    for (const o of oris(r)) {
      if (!wFits && wasteW >= o.w && spaceH >= o.h) wFits = true;
      if (!hFits && pieceW >= o.w && wasteH >= o.h) hFits = true;
      if (wFits && hFits) break;
    }
    if (wFits && hFits) break;
  }

  // Heavy penalty for "sealed" waste that won't fit any remaining piece
  if (wasteW > 10 && !wFits) score += wasteW * spaceH * 4;
  if (wasteH > 10 && !hFits) score += wasteH * pieceW * 4;

  // Bonus for exact fits (perfect utilization of one dimension)
  if (wasteW === 0) score -= spaceH * 20;
  if (wasteH === 0) score -= pieceW * 20;

  return score;
}

// ========== RESIDUAL DOMINANCE CHECK ==========

/**
 * Verifica se pelo menos uma peça restante cabe no espaço residual,
 * considerando rotações permitidas e distância mínima de quebra.
 * Retorna true se alguma peça cabe, false se a sobra é inútil.
 */
function canResidualFitAnyPiece(
  residualW: number,
  residualH: number,
  remainingPieces: Piece[],
  minBreak: number = 0,
  existingSiblingValues: number[] = [],
  axis: "w" | "h" = "w",
): boolean {
  if (residualW <= 0 || residualH <= 0) return false;
  for (const p of remainingPieces) {
    for (const o of oris(p)) {
      if (o.w <= residualW && o.h <= residualH) {
        // Check minBreak against existing siblings
        if (minBreak > 0 && existingSiblingValues.length > 0) {
          const val = axis === "w" ? o.w : o.h;
          const violates = existingSiblingValues.some((sv) => {
            const diff = Math.abs(sv - val);
            return diff > 0 && diff < minBreak;
          });
          if (violates) continue;
        }
        return true;
      }
    }
  }
  return false;
}

// ========== CUT POSITION HELPERS ==========

/**
 * Retorna as posições acumuladas de corte Z dentro de uma fita Y.
 * Ex: Z valores [1465, 518, 518] → posições [1465, 1983, 2501]
 */
function getZCutPositions(yStrip: TreeNode): number[] {
  const positions: number[] = [];
  let acc = 0;
  for (const z of yStrip.filhos) {
    acc += z.valor * z.multi;
    positions.push(acc);
  }
  return positions;
}

/**
 * Retorna todas as posições de corte Z de todas as fitas Y de uma coluna X.
 * Cada fita retorna seu próprio array de posições acumuladas.
 */
function getAllZCutPositionsInColumn(colX: TreeNode): number[][] {
  return colX.filhos.map((y) => getZCutPositions(y));
}

/**
 * Verifica se uma nova posição de corte Z viola a distância mínima de quebra
 * contra posições existentes em OUTRAS fitas Y da mesma coluna.
 * @param newCutPositions - posições de corte que seriam criadas pela nova peça
 * @param allPositions - posições existentes por fita Y
 * @param excludeYIndex - índice da fita Y atual (para não comparar consigo mesma)
 * @param minBreak - distância mínima de quebra
 */
function violatesZMinBreak(
  newCutPositions: number[],
  allPositions: number[][],
  minBreak: number,
  excludeYIndex: number = -1,
): boolean {
  for (let i = 0; i < allPositions.length; i++) {
    if (i === excludeYIndex) continue;
    for (const existPos of allPositions[i]) {
      for (const newPos of newCutPositions) {
        const diff = Math.abs(existPos - newPos);
        if (diff > 0 && diff < minBreak) return true;
      }
    }
  }
  return false;
}

// ========== VOID FILLING ==========

function fillVoids(tree: TreeNode, remaining: Piece[], usableW: number, usableH: number, minBreak: number = 0): number {
  let filledArea = 0;

  for (const colX of tree.filhos) {
    // Void in Y direction (remaining height in column)
    const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const freeH = usableH - usedH;
    if (freeH > 0) {
      filledArea += fillRect(tree, colX, remaining, colX.valor, freeH, "Y", minBreak);
    }

    // Void in Z direction (remaining width in each Y strip)
    for (const yNode of colX.filhos) {
      const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      const freeZ = colX.valor - usedZ;
      if (freeZ > 0) {
        filledArea += fillRectZ(tree, yNode, remaining, freeZ, yNode.valor, minBreak);
      }

      // Void in W direction (remaining height inside each Z)
      for (const zNode of yNode.filhos) {
        const usedW = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        const freeW = yNode.valor - usedW;
        if (freeW > 0) {
          filledArea += fillRectW(tree, remaining, zNode, zNode.valor, freeW, minBreak);
        }
      }
    }
  }

  return filledArea;
}

function fillRect(
  tree: TreeNode,
  colX: TreeNode,
  remaining: Piece[],
  maxW: number,
  maxH: number,
  _level: string,
  minBreak: number = 0,
): number {
  let filled = 0;

  while (maxH > 0 && remaining.length > 0) {
    // Scan ALL remaining pieces to find the BEST one for this void
    let bestIdx = -1;
    let bestO: { w: number; h: number } | null = null;
    let bestArea = 0;

    for (let i = 0; i < remaining.length; i++) {
      const pc = remaining[i];
      for (const o of oris(pc)) {
        if (o.w <= maxW && o.h <= maxH) {
          // Check minBreak
          if (minBreak > 0) {
            if (o.h < minBreak) continue;
            const allZPositions = getAllZCutPositionsInColumn(colX);
            if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
          }
          // Prefer largest area piece (not first-fit)
          const pieceArea = o.w * o.h;
          if (pieceArea > bestArea) {
            bestArea = pieceArea;
            bestIdx = i;
            bestO = o;
          }
        }
      }
    }

    if (bestIdx < 0 || !bestO) break;

    const pc = remaining[bestIdx];

    // Safety: verify actual column height before inserting
    const actualUsedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    if (actualUsedH + bestO.h > actualUsedH + maxH + 0.5) break;

    // Residual dominance: extend Y container if residual can't fit anything
    let consumed = bestO.h;
    const residualH = maxH - bestO.h;
    if (residualH > 0 && !canResidualFitAnyPiece(maxW, residualH, remaining, minBreak)) {
      consumed = maxH;
    }
    const yId = insertNode(tree, colX.id, "Y", consumed, 1);
    const yNode = findNode(tree, yId)!;

    createPieceNodes(tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);

    filled += bestO.w * bestO.h;
    maxH -= consumed;
    remaining.splice(bestIdx, 1);
  }

  return filled;
}

function fillRectZ(
  _tree: TreeNode,
  yNode: TreeNode,
  remaining: Piece[],
  maxW: number,
  maxH: number,
  minBreak: number = 0,
): number {
  let filled = 0;

  while (maxW > 0 && remaining.length > 0) {
    // Scan ALL remaining pieces to find the BEST one (largest area)
    let bestIdx = -1;
    let bestO: { w: number; h: number } | null = null;
    let bestArea = 0;

    for (let i = 0; i < remaining.length; i++) {
      const pc = remaining[i];
      for (const o of oris(pc)) {
        if (o.w <= maxW && o.h <= maxH) {
          if (minBreak > 0) {
            const parentX = _tree.filhos.find((x) => x.filhos.some((y) => y.id === yNode.id));
            if (parentX) {
              const yIndex = parentX.filhos.indexOf(yNode);
              const allZPositions = getAllZCutPositionsInColumn(parentX);
              const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
              const newCutPos = currentOffset + o.w;
              if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
            }
          }
          const pieceArea = o.w * o.h;
          if (pieceArea > bestArea) {
            bestArea = pieceArea;
            bestIdx = i;
            bestO = o;
          }
        }
      }
    }

    if (bestIdx < 0 || !bestO) break;

    const pc = remaining[bestIdx];
    let consumed = bestO.w;
    const residualW = maxW - bestO.w;
    if (residualW > 0 && !canResidualFitAnyPiece(residualW, maxH, remaining, minBreak)) {
      consumed = maxW;
    }
    createPieceNodes(_tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);
    filled += bestO.w * bestO.h;
    maxW -= consumed;
    remaining.splice(bestIdx, 1);
  }

  return filled;
}

function fillRectW(
  tree: TreeNode,
  remaining: Piece[],
  zNode: TreeNode,
  zWidth: number,
  maxH: number,
  minBreak: number = 0,
): number {
  let filled = 0;

  while (maxH > 0 && remaining.length > 0) {
    // Scan ALL remaining pieces to find the BEST one (largest area)
    let bestIdx = -1;
    let bestO: { w: number; h: number } | null = null;
    let bestArea = 0;

    for (let i = 0; i < remaining.length; i++) {
      const pc = remaining[i];
      for (const o of oris(pc)) {
        if (o.w <= zWidth && o.h <= maxH) {
          if (minBreak > 0) {
            const violates = zNode.filhos.some((w) => {
              const diff = Math.abs(w.valor - o.h);
              return diff > 0 && diff < minBreak;
            });
            if (violates) continue;
          }
          const pieceArea = o.w * o.h;
          if (pieceArea > bestArea) {
            bestArea = pieceArea;
            bestIdx = i;
            bestO = o;
          }
        }
      }
    }

    if (bestIdx < 0 || !bestO) break;

    const pc = remaining[bestIdx];
    let consumed = bestO.h;
    const residualH = maxH - bestO.h;
    if (residualH > 0 && !canResidualFitAnyPiece(zWidth, residualH, remaining, minBreak)) {
      consumed = maxH;
    }

    const actualRotated = bestO.w !== pc.w;
    createPieceNodes(tree, zNode, pc, bestO.w, bestO.h, actualRotated, zNode);

    filled += bestO.w * bestO.h;
    maxH -= consumed;
    remaining.splice(bestIdx, 1);
  }

  return filled;
}

// ========== GROUP BY COMMON DIMENSION ==========

/**
 * AGRUPAMENTO POR DIMENSÃO COMUM (Estratégia para peças de larguras diferentes mas mesma altura)
 *
 * Detecta a dimensão mais frequente entre todas as peças (verificando tanto w quanto h).
 * Orienta todas as peças para que a dimensão comum seja a altura.
 * Empacota peças lado a lado (somando larguras) usando FFD (First Fit Decreasing).
 *
 * Exemplo: peças 818×951, 763×951, 734×951 → todas têm h=951 em comum.
 * Cria faixas de altura 951 com peças de larguras variadas lado a lado.
 *
 * @param threshold - Fração mínima de peças que devem compartilhar a dimensão (default 0.4 = 40%)
 */
function groupByCommonDimension(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  threshold: number = 0.4,
): Piece[] {
  if (pieces.length < 2) return pieces;

  // 1. Count frequency of each dimension value (both w and h)
  const dimCount = new Map<number, number>();
  for (const p of pieces) {
    dimCount.set(p.w, (dimCount.get(p.w) || 0) + 1);
    if (p.h !== p.w) {
      dimCount.set(p.h, (dimCount.get(p.h) || 0) + 1);
    }
  }

  // 2. Find the most common dimension
  let bestDim = 0, bestCount = 0;
  for (const [dim, count] of dimCount) {
    if (count > bestCount) { bestCount = count; bestDim = dim; }
  }

  // Only proceed if enough pieces share this dimension
  if (bestCount < Math.max(2, Math.floor(pieces.length * threshold))) return pieces;

  // 3. Orient pieces so the common dimension is the height
  const oriented: Array<Piece & { origW: number }> = [];
  const others: Piece[] = [];
  for (const p of pieces) {
    if (p.h === bestDim) {
      oriented.push({ ...p, origW: p.w });
    } else if (p.w === bestDim) {
      oriented.push({ ...p, w: p.h, h: p.w, origW: p.h });
    } else {
      others.push(p);
    }
  }

  // 4. Sort by width descending (FFD)
  oriented.sort((a, b) => b.origW - a.origW);

  // 5. Pack into rows using Best Fit Decreasing
  const rows: Array<typeof oriented> = [];
  const rowWidths: number[] = [];

  for (const p of oriented) {
    // Best Fit: find the row with least remaining space that still fits
    let bestRowIdx = -1;
    let bestRemaining = Infinity;
    for (let r = 0; r < rows.length; r++) {
      const remaining = usableW - rowWidths[r];
      if (p.origW <= remaining && remaining < bestRemaining) {
        bestRemaining = remaining;
        bestRowIdx = r;
      }
    }

    if (bestRowIdx >= 0) {
      rows[bestRowIdx].push(p);
      rowWidths[bestRowIdx] += p.origW;
    } else {
      rows.push([p]);
      rowWidths.push(p.origW);
    }
  }

  // 6. Convert rows to grouped pieces
  const result: Piece[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].length >= 2) {
      const groupLabels = rows[r].filter(p => p.label).map(p => p.label!);
      result.push({
        w: rowWidths[r],
        h: bestDim,
        area: rows[r][0].origW * bestDim,
        count: rows[r].length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "w",
        individualDims: rows[r].map(p => p.origW),
      });
    } else {
      const p = rows[r][0];
      result.push({
        w: p.origW,
        h: bestDim,
        area: p.origW * bestDim,
        count: 1,
        label: p.label,
      });
    }
  }

  // Add non-matching pieces
  result.push(...others);
  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * Variante com orientação invertida: a dimensão comum vira a LARGURA (não a altura).
 * Isso permite testar layouts onde a dimensão comum define colunas em vez de faixas.
 */
function groupByCommonDimensionTransposed(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  threshold: number = 0.4,
): Piece[] {
  if (pieces.length < 2) return pieces;

  const dimCount = new Map<number, number>();
  for (const p of pieces) {
    dimCount.set(p.w, (dimCount.get(p.w) || 0) + 1);
    if (p.h !== p.w) dimCount.set(p.h, (dimCount.get(p.h) || 0) + 1);
  }

  let bestDim = 0, bestCount = 0;
  for (const [dim, count] of dimCount) {
    if (count > bestCount) { bestCount = count; bestDim = dim; }
  }

  if (bestCount < Math.max(2, Math.floor(pieces.length * threshold))) return pieces;

  // Orient so common dimension is the WIDTH, pack heights vertically
  const oriented: Array<Piece & { origH: number }> = [];
  const others: Piece[] = [];
  for (const p of pieces) {
    if (p.w === bestDim) {
      oriented.push({ ...p, origH: p.h });
    } else if (p.h === bestDim) {
      oriented.push({ ...p, w: p.h, h: p.w, origH: p.w });
    } else {
      others.push(p);
    }
  }

  oriented.sort((a, b) => b.origH - a.origH);

  // Pack into columns using BFD (stack heights up to usableH)
  const cols: Array<typeof oriented> = [];
  const colHeights: number[] = [];

  for (const p of oriented) {
    let bestColIdx = -1;
    let bestRemaining = Infinity;
    for (let c = 0; c < cols.length; c++) {
      const rem = usableH - colHeights[c];
      if (p.origH <= rem && rem < bestRemaining) {
        bestRemaining = rem;
        bestColIdx = c;
      }
    }
    if (bestColIdx >= 0) {
      cols[bestColIdx].push(p);
      colHeights[bestColIdx] += p.origH;
    } else {
      cols.push([p]);
      colHeights.push(p.origH);
    }
  }

  const result: Piece[] = [];
  for (let c = 0; c < cols.length; c++) {
    if (cols[c].length >= 2) {
      const groupLabels = cols[c].filter(p => p.label).map(p => p.label!);
      result.push({
        w: bestDim,
        h: colHeights[c],
        area: bestDim * cols[c][0].origH,
        count: cols[c].length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "h",
        individualDims: cols[c].map(p => p.origH),
      });
    } else {
      const p = cols[c][0];
      result.push({
        w: bestDim,
        h: p.origH,
        area: bestDim * p.origH,
        count: 1,
        label: p.label,
      });
    }
  }

  result.push(...others);
  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

// ========== KNAPSACK DP UTILITIES ==========

/**
 * 0-1 Knapsack: seleciona subconjunto de itens que maximiza o preenchimento
 * sem exceder a capacidade.
 * @param weights - array de pesos/dimensões dos itens
 * @param capacity - capacidade máxima
 * @returns índices dos itens selecionados
 */
function knapsackSelectItems(weights: number[], capacity: number): number[] {
  const n = weights.length;
  const cap = Math.floor(capacity);
  if (cap <= 0 || n === 0) return [];

  // Scale down for large capacities to keep memory reasonable
  const scale = cap > 10000 ? Math.ceil(cap / 10000) : 1;
  const scaledCap = Math.floor(cap / scale);
  const scaledWeights = weights.map(w => Math.floor(w / scale));

  const dp = new Float64Array(scaledCap + 1);
  const keep = new Uint8Array(n * (scaledCap + 1));

  for (let i = 0; i < n; i++) {
    const w = scaledWeights[i];
    if (w <= 0 || w > scaledCap) continue;
    for (let j = scaledCap; j >= w; j--) {
      const newVal = dp[j - w] + weights[i]; // original weight as value
      if (newVal > dp[j]) {
        dp[j] = newVal;
        keep[i * (scaledCap + 1) + j] = 1;
      }
    }
  }

  const result: number[] = [];
  let j = scaledCap;
  for (let i = n - 1; i >= 0; i--) {
    if (j >= 0 && keep[i * (scaledCap + 1) + j]) {
      result.push(i);
      j -= scaledWeights[i];
    }
  }

  return result;
}

// ========== STRIP PACKING COM DP ==========

/**
 * STRIP PACKING COM PROGRAMAÇÃO DINÂMICA
 *
 * Processo:
 * 1. Agrupa peças por altura similar (tolerância ±tolerance mm)
 * 2. Dentro de cada grupo, usa Knapsack DP para selecionar a combinação
 *    ótima de peças que maximiza o preenchimento da largura da chapa
 * 3. Usa Knapsack DP para selecionar quais faixas colocar na chapa
 *    maximizando o preenchimento da altura
 *
 * @param tolerance - tolerância em mm para agrupar alturas similares (default 5mm)
 * @param orient - "auto" normaliza w>h, "raw" usa dimensões originais
 */
function groupStripPackingDP(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  tolerance: number = 5,
  orient: "auto" | "raw" = "auto",
): Piece[] {
  if (pieces.length < 2) return pieces;

  // 1. Normalize orientation
  const normalized = pieces.map((p, idx) => ({
    ...p,
    nw: orient === "raw" ? p.w : Math.max(p.w, p.h),
    nh: orient === "raw" ? p.h : Math.min(p.w, p.h),
    origIdx: idx,
  }));

  // 2. Sort by height for clustering
  const sorted = [...normalized].sort((a, b) => a.nh - b.nh);

  // 3. Cluster by similar height (within tolerance)
  const heightGroups: (typeof sorted)[] = [];
  let currentGroup: typeof sorted = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].nh - currentGroup[0].nh <= tolerance) {
      currentGroup.push(sorted[i]);
    } else {
      heightGroups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  heightGroups.push(currentGroup);

  // 4. For each height group, use DP to select optimal subset for strip width
  const strips: Array<{
    height: number;
    totalWidth: number;
    pieces: typeof sorted;
  }> = [];

  const unassigned: typeof sorted = [];

  for (const group of heightGroups) {
    if (group.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const stripHeight = Math.max(...group.map(p => p.nh));
    const widths = group.map(p => p.nw);

    // DP to select pieces that maximize fill of usableW
    const selected = knapsackSelectItems(widths, usableW);

    if (selected.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const selectedPieces = selected.map(i => group[i]);
    const totalWidth = selected.reduce((sum, i) => sum + widths[i], 0);

    strips.push({
      height: stripHeight,
      totalWidth,
      pieces: selectedPieces,
    });

    // Remaining pieces from this group
    const selectedSet = new Set(selected);
    for (let i = 0; i < group.length; i++) {
      if (!selectedSet.has(i)) unassigned.push(group[i]);
    }
  }

  if (strips.length === 0) return pieces;

  // 5. DP to select which strips best fill sheet height
  const stripHeights = strips.map(s => s.height);
  const selectedStrips = knapsackSelectItems(stripHeights, usableH);

  // 6. Build result
  const result: Piece[] = [];
  const usedStripSet = new Set(selectedStrips);

  for (const si of selectedStrips) {
    const strip = strips[si];
    if (strip.pieces.length >= 2) {
      const groupLabels = strip.pieces.filter(p => p.label).map(p => p.label!);
      result.push({
        w: strip.totalWidth,
        h: strip.height,
        area: strip.pieces[0].nw * strip.height,
        count: strip.pieces.length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "w",
        individualDims: strip.pieces.map(p => p.nw),
      });
    } else {
      const p = strip.pieces[0];
      result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
    }
  }

  // Add strips not selected by height DP
  for (let i = 0; i < strips.length; i++) {
    if (!usedStripSet.has(i)) {
      for (const p of strips[i].pieces) unassigned.push(p);
    }
  }

  // Add unassigned pieces
  for (const p of unassigned) {
    result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
  }

  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * Variante do Strip Packing DP com orientação invertida (transposed).
 * Agrupa por largura similar e empilha verticalmente.
 */
function groupStripPackingDPTransposed(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  tolerance: number = 5,
): Piece[] {
  if (pieces.length < 2) return pieces;

  // Orient so width is the smaller dimension
  const normalized = pieces.map((p, idx) => ({
    ...p,
    nw: Math.min(p.w, p.h),  // width = smaller
    nh: Math.max(p.w, p.h),  // height = larger
    origIdx: idx,
  }));

  // Sort by width for clustering
  const sorted = [...normalized].sort((a, b) => a.nw - b.nw);

  // Cluster by similar width
  const widthGroups: (typeof sorted)[] = [];
  let currentGroup: typeof sorted = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].nw - currentGroup[0].nw <= tolerance) {
      currentGroup.push(sorted[i]);
    } else {
      widthGroups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  widthGroups.push(currentGroup);

  // For each width group, DP to pack heights into usableH
  const strips: Array<{
    width: number;
    totalHeight: number;
    pieces: typeof sorted;
  }> = [];

  const unassigned: typeof sorted = [];

  for (const group of widthGroups) {
    if (group.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const stripWidth = Math.max(...group.map(p => p.nw));
    const heights = group.map(p => p.nh);

    const selected = knapsackSelectItems(heights, usableH);

    if (selected.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const selectedPieces = selected.map(i => group[i]);
    const totalHeight = selected.reduce((sum, i) => sum + heights[i], 0);

    strips.push({ width: stripWidth, totalHeight, pieces: selectedPieces });

    const selectedSet = new Set(selected);
    for (let i = 0; i < group.length; i++) {
      if (!selectedSet.has(i)) unassigned.push(group[i]);
    }
  }

  if (strips.length === 0) return pieces;

  // DP to select which column-strips fit in usableW
  const stripWidths = strips.map(s => s.width);
  const selectedStrips = knapsackSelectItems(stripWidths, usableW);

  const result: Piece[] = [];
  const usedStripSet = new Set(selectedStrips);

  for (const si of selectedStrips) {
    const strip = strips[si];
    if (strip.pieces.length >= 2) {
      const groupLabels = strip.pieces.filter(p => p.label).map(p => p.label!);
      result.push({
        w: strip.width,
        h: strip.totalHeight,
        area: strip.width * strip.pieces[0].nh,
        count: strip.pieces.length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "h",
        individualDims: strip.pieces.map(p => p.nh),
      });
    } else {
      const p = strip.pieces[0];
      result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
    }
  }

  for (let i = 0; i < strips.length; i++) {
    if (!usedStripSet.has(i)) {
      for (const p of strips[i].pieces) unassigned.push(p);
    }
  }

  for (const p of unassigned) {
    result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
  }

  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * Common Dimension Binding + Knapsack DP
 * Encontra a dimensão mais frequente, orienta peças e usa DP para empacotar.
 */
function groupCommonDimensionDP(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  threshold: number = 0.3,
): Piece[] {
  if (pieces.length < 2) return pieces;

  // Find most common dimension
  const dimCount = new Map<number, number>();
  for (const p of pieces) {
    dimCount.set(p.w, (dimCount.get(p.w) || 0) + 1);
    if (p.h !== p.w) dimCount.set(p.h, (dimCount.get(p.h) || 0) + 1);
  }

  let bestDim = 0, bestCount = 0;
  for (const [dim, count] of dimCount) {
    if (count > bestCount) { bestCount = count; bestDim = dim; }
  }

  if (bestCount < Math.max(2, Math.floor(pieces.length * threshold))) return pieces;

  // Orient so common dimension is height
  const oriented: Array<Piece & { origW: number }> = [];
  const others: Piece[] = [];
  for (const p of pieces) {
    if (p.h === bestDim) {
      oriented.push({ ...p, origW: p.w });
    } else if (p.w === bestDim) {
      oriented.push({ ...p, w: p.h, h: p.w, origW: p.h });
    } else {
      others.push(p);
    }
  }

  // Use DP to select optimal subset that fills usableW
  const widths = oriented.map(p => p.origW);
  const selected = knapsackSelectItems(widths, usableW);

  if (selected.length < 2) return pieces;

  // Build strips from DP result — pack into rows
  const selectedPieces = selected.map(i => oriented[i]);
  const selectedSet = new Set(selected);
  const unselected = oriented.filter((_, i) => !selectedSet.has(i));

  // Multiple rows if total width exceeds usableW
  const rows: Array<typeof selectedPieces> = [];
  const rowWidths: number[] = [];

  // Sort by width descending for better packing
  selectedPieces.sort((a, b) => b.origW - a.origW);

  for (const p of selectedPieces) {
    let placed = false;
    for (let r = 0; r < rows.length; r++) {
      if (rowWidths[r] + p.origW <= usableW) {
        rows[r].push(p);
        rowWidths[r] += p.origW;
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([p]);
      rowWidths.push(p.origW);
    }
  }

  const result: Piece[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].length >= 2) {
      const groupLabels = rows[r].filter(p => p.label).map(p => p.label!);
      result.push({
        w: rowWidths[r],
        h: bestDim,
        area: rows[r][0].origW * bestDim,
        count: rows[r].length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "w",
        individualDims: rows[r].map(p => p.origW),
      });
    } else {
      const p = rows[r][0];
      result.push({ w: p.origW, h: bestDim, area: p.origW * bestDim, count: 1, label: p.label });
    }
  }

  // Add unselected oriented pieces and others
  for (const p of unselected) {
    result.push({ w: p.origW, h: bestDim, area: p.origW * bestDim, count: 1, label: p.label });
  }
  result.push(...others);

  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

// ========== MAIN OPTIMIZER V6 IMPROVED ==========

export function optimizeV6(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  useGrouping?: boolean,
): { tree: TreeNode; remaining: Piece[] } {
  if (pieces.length === 0) return { tree: createRoot(usableW, usableH), remaining: [] };

  const hasLabels = pieces.some((p) => p.label);
  const strategies = getSortStrategies();

  const rotatedPieces = pieces.map((p) => ({ w: p.h, h: p.w, area: p.area, count: p.count, label: p.label }));

  const pieceVariants: Piece[][] = hasLabels
    ? [pieces, rotatedPieces]
    : useGrouping === false
      ? [pieces, rotatedPieces]
      : [
          pieces,
          rotatedPieces,
          // PRIMARY: Agrupamento por mesma largura em X (empilhamento vertical)
          groupPiecesBySameWidth(pieces, usableH),
          groupPiecesBySameWidth(rotatedPieces, usableH),
          groupPiecesBySameWidth(pieces), // sem limite de altura
          groupPiecesBySameWidth(rotatedPieces),
          // COMPLEMENTAR: Agrupamento por mesma altura em Y (lado a lado)
          groupPiecesBySameHeight(pieces, usableW),
          groupPiecesBySameHeight(rotatedPieces, usableW),
          groupPiecesBySameHeight(pieces),
          groupPiecesBySameHeight(rotatedPieces),
          // Fill-row strategies
          groupPiecesFillRow(pieces, usableW),
          groupPiecesFillRow(rotatedPieces, usableW),
          groupPiecesFillRow(pieces, usableW, true),
          groupPiecesFillRow(rotatedPieces, usableW, true),
          // Fill-col strategies
          groupPiecesFillCol(pieces, usableH),
          groupPiecesFillCol(rotatedPieces, usableH),
          groupPiecesFillCol(pieces, usableH, true),
          groupPiecesFillCol(rotatedPieces, usableH, true),
          // Combined: fill-row on width-grouped pieces
          groupPiecesFillRow(groupPiecesBySameWidth(pieces, usableH), usableW),
          groupPiecesFillRow(groupPiecesBySameHeight(pieces, usableW), usableW),
          // Column-width/height maximizing
          groupPiecesColumnWidth(pieces, usableW),
          groupPiecesColumnWidth(rotatedPieces, usableW),
          groupPiecesColumnHeight(pieces, usableH),
          groupPiecesColumnHeight(rotatedPieces, usableH),
          // Band strategies
          groupPiecesBandFirst(pieces, usableW),
          groupPiecesBandFirst(rotatedPieces, usableW),
          groupPiecesBandFirst(pieces, usableW, true),
          groupPiecesBandFirst(rotatedPieces, usableW, true),
          groupPiecesBandLast(pieces, usableW),
          groupPiecesBandLast(rotatedPieces, usableW),
          // NOVO: Agrupamento por dimensão comum (peças de larguras diferentes mas mesma altura)
          groupByCommonDimension(pieces, usableW, usableH),
          groupByCommonDimension(rotatedPieces, usableW, usableH),
          groupByCommonDimension(pieces, usableW, usableH, 0.3),
          groupByCommonDimension(rotatedPieces, usableW, usableH, 0.3),
          groupByCommonDimensionTransposed(pieces, usableW, usableH),
          groupByCommonDimensionTransposed(rotatedPieces, usableW, usableH),
          // NOVO: Strip Packing com DP (tolerâncias variadas)
          groupStripPackingDP(pieces, usableW, usableH, 0),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 0),
          groupStripPackingDP(pieces, usableW, usableH, 5),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 5),
          groupStripPackingDP(pieces, usableW, usableH, 30),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 30),
          groupStripPackingDP(pieces, usableW, usableH, 100),
          groupStripPackingDP(pieces, usableW, usableH, 5, "raw"),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 5, "raw"),
          // Strip Packing DP Transposed (colunas verticais)
          groupStripPackingDPTransposed(pieces, usableW, usableH, 0),
          groupStripPackingDPTransposed(rotatedPieces, usableW, usableH, 0),
          groupStripPackingDPTransposed(pieces, usableW, usableH, 5),
          groupStripPackingDPTransposed(rotatedPieces, usableW, usableH, 5),
          // Common Dimension + DP
          groupCommonDimensionDP(pieces, usableW, usableH),
          groupCommonDimensionDP(rotatedPieces, usableW, usableH),
          groupCommonDimensionDP(pieces, usableW, usableH, 0.2),
          groupCommonDimensionDP(rotatedPieces, usableW, usableH, 0.2),
        ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;
  let bestRemaining: Piece[] = [];
  let bestTransposed = false;

  // Test both normal and transposed orientations
  for (const transposed of [false, true]) {
    const eW = transposed ? usableH : usableW;
    const eH = transposed ? usableW : usableH;

    for (const variant of pieceVariants) {
      for (const sortFn of strategies) {
        const sorted = [...variant].sort(sortFn);
        const result = runPlacement(sorted, eW, eH, minBreak);
        if (result.area > bestArea) {
          bestArea = result.area;
          bestTree = result.tree;
          bestRemaining = result.remaining;
          bestTransposed = transposed;
        }
      }
    }
  }

  let finalTree = bestTree || createRoot(usableW, usableH);
  if (bestTransposed) {
    finalTree.transposed = true;
    // Normalize transposed tree to canonical hierarchy (X,Z,Q=vertical; Y,W=horizontal)
    finalTree = normalizeTree(finalTree, usableW, usableH);
  }

  return {
    tree: finalTree,
    remaining: bestRemaining,
  };
}

// ========== SHARED SORT STRATEGIES ==========

function getSortStrategies(): ((a: Piece, b: Piece) => number)[] {
  return [
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => b.w + b.h - (a.w + a.h),
    (a, b) => b.w / b.h - a.w / a.h,
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    (a, b) => {
      const ra = Math.max(a.w, a.h) / Math.min(a.w, a.h);
      const rb = Math.max(b.w, b.h) / Math.min(b.w, b.h);
      return rb - ra;
    },
    (a, b) => b.area - a.area || b.w - a.w,
    (a, b) => b.area - a.area || b.h - a.h,
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => (b.w * b.h) / (b.w + b.h) - (a.w * a.h) / (a.w + a.h),
  ];
}

// ========== PROGRESS CALLBACK TYPE ==========

export interface OptimizationProgress {
  phase: string;
  current: number;
  total: number;
  bestSheets?: number;
  bestUtil?: number;
}

// ========== GENETIC ALGORITHM V2 (FIXED) ==========

interface GAIndividual {
  genome: number[]; // Permutation of piece indices
  rotations: boolean[]; // Per-piece rotation bitmask
  groupingMode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 0=none, 1=byHeight, 2=byWidth, 3=fillRow, 4=fillRowRaw, 5=fillCol, 6=fillColRaw, 7=colWidth, 8=colHeight, 9=commonDim, 10=commonDimT, 11=stripDP, 12=stripDPT, 13=commonDimDP, 14=stripDP100
  transposed: boolean; // true = swap usableW/usableH (horizontal main cuts)
}

/**
 * Simulates multiple sheets to calculate a global fitness score.
 */
function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  maxSheets: number,
): {
  fitness: number;
  firstTree: TreeNode;
  stat_rejectedByMinBreak: number;
  stat_fragmentCount: number;
  stat_continuity: number;
} {
  let currentRemaining = [...workPieces];
  let totalUtil = 0;
  let firstTree: TreeNode | null = null;
  let sheetsActuallySimulated = 0;
  const sheetArea = usableW * usableH;

  const initialLargeArea = workPieces
    .filter(p => !p.count || p.count === 1)
    .filter(p => (p.w * p.h) > (sheetArea * 0.2))
    .reduce((a, b) => a + b.w * b.h, 0);

  const initialSmallArea = workPieces
    .reduce((a, b) => a + b.area * (b.count || 1), 0) - initialLargeArea;

  let largeAreaPlaced = 0;
  let smallAreaPlaced = 0;
  let rejectedCount = 0;
  let continuityScore = 0;
  let fragmentCount = 0;

  for (let s = 0; s < maxSheets; s++) {
    if (currentRemaining.length === 0) break;

    const countBefore = currentRemaining.length;
    const res = runPlacement(currentRemaining, usableW, usableH, minBreak);
    if (s === 0) firstTree = res.tree;

    const placedArea = res.area;
    totalUtil += placedArea / sheetArea;

    // Track what kind of pieces we placed
    // (This is an approximation based on area change)
    const largeRemaining = res.remaining
      .filter(p => !p.count || p.count === 1)
      .filter(p => (p.w * p.h) > (sheetArea * 0.2))
      .reduce((a, b) => a + b.w * b.h, 0);

    const currentLargePlaced = Math.max(0, (initialLargeArea - largeAreaPlaced) - largeRemaining);
    largeAreaPlaced += currentLargePlaced;
    smallAreaPlaced += Math.max(0, placedArea - currentLargePlaced);

    // Continuity logic: check for large usable spaces (Look at root's children)
    const usedW = res.tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
    const freeW = usableW - usedW;
    if (freeW > 50) continuityScore += freeW / usableW;

    const piecesPlaced = countBefore - res.remaining.length;
    if (piecesPlaced === 0) rejectedCount++;

    currentRemaining = res.remaining;
    sheetsActuallySimulated++;
  }

  // Multiobjective Fitness
  let fitness = sheetsActuallySimulated > 0 ? totalUtil / sheetsActuallySimulated : 0;

  // GLOBAL BALANCE BONUS/PENALTY
  // We want to encourage placing Large Pieces early.
  // If we placed a lot of small area but very little large area, it's a "greedy trap".
  if (initialLargeArea > 0) {
    const largePlacementRatio = largeAreaPlaced / initialLargeArea;
    const smallPlacementRatio = initialSmallArea > 0 ? smallAreaPlaced / initialSmallArea : 1;

    // If small pieces are being consumed much faster than large ones, penalize.
    if (smallPlacementRatio > largePlacementRatio * 1.5) {
      fitness *= 0.8; // Heavy penalty for cherry-picking small pieces
    } else {
      // Bonus for candidates that manage to chip away at the large piece backlog
      fitness += largePlacementRatio * 0.1;
    }
  }

  // Penalties and Bonuses
  fitness -= rejectedCount * 0.05;
  fitness += (continuityScore * 0.01) / (sheetsActuallySimulated || 1);

  return {
    fitness: Math.max(0, fitness),
    firstTree: firstTree || createRoot(usableW, usableH),
    stat_rejectedByMinBreak: rejectedCount,
    stat_fragmentCount: fragmentCount,
    stat_continuity: continuityScore,
  };
}

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  onProgress?: (p: OptimizationProgress) => void,
  priorityLabels?: string[],
  gaPopulationSize: number = 10,
  gaGenerations: number = 10,
): Promise<TreeNode> {
  const populationSize = Math.max(10, gaPopulationSize);
  const generations = Math.max(0, gaGenerations);
  const eliteCount = Math.max(2, Math.floor(populationSize * 0.1));
  const mutationRate = 0.05;

  const numPieces = pieces.length;

  // Find the index of the largest piece by area (fixed at position 0)
  const largestIdx = pieces.reduce((best, p, i) => {
    const area = p.w * p.h;
    const bestArea = pieces[best].w * pieces[best].h;
    return area > bestArea ? i : best;
  }, 0);

  function randomIndividual(): GAIndividual {
    // Largest piece always first; shuffle the rest
    const rest = Array.from({ length: numPieces }, (_, i) => i).filter((i) => i !== largestIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const genome = [largestIdx, ...rest];
    return {
      genome,
      rotations: Array.from({ length: numPieces }, () => Math.random() > 0.5),
      groupingMode: ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const)[Math.floor(Math.random() * 15)] as GAIndividual['groupingMode'],
      transposed: Math.random() > 0.5,
    };
  }

  function buildPieces(ind: GAIndividual): Piece[] {
    // 1. Map piece sequence based on genome
    let work = ind.genome.map((idx) => ({ ...pieces[idx] }));

    // 2. Apply per-piece rotation based on rotations bitmask
    work = work.map((p, i) => {
      if (ind.rotations[i]) {
        return { ...p, w: p.h, h: p.w };
      }
      return p;
    });

    // 3. Optional Global Grouping (secondary layer)
    if (ind.groupingMode === 1) {
      work = groupPiecesByHeight(work);
    } else if (ind.groupingMode === 2) {
      work = groupPiecesByWidth(work);
    } else if (ind.groupingMode === 3) {
      work = groupPiecesFillRow(work, usableW);
    } else if (ind.groupingMode === 4) {
      work = groupPiecesFillRow(work, usableW, true);
    } else if (ind.groupingMode === 5) {
      work = groupPiecesFillCol(work, usableH);
    } else if (ind.groupingMode === 6) {
      work = groupPiecesFillCol(work, usableH, true);
    } else if (ind.groupingMode === 7) {
      work = groupPiecesColumnWidth(work, usableW);
    } else if (ind.groupingMode === 8) {
      work = groupPiecesColumnHeight(work, usableH);
    } else if (ind.groupingMode === 9) {
      work = groupByCommonDimension(work, usableW, usableH);
    } else if (ind.groupingMode === 10) {
      work = groupByCommonDimensionTransposed(work, usableW, usableH);
    } else if (ind.groupingMode === 11) {
      work = groupStripPackingDP(work, usableW, usableH, 5);
    } else if (ind.groupingMode === 12) {
      work = groupStripPackingDPTransposed(work, usableW, usableH, 5);
    } else if (ind.groupingMode === 13) {
      work = groupCommonDimensionDP(work, usableW, usableH);
    } else if (ind.groupingMode === 14) {
      work = groupStripPackingDP(work, usableW, usableH, 100);
    }

    return work;
  }

  function evaluate(ind: GAIndividual): { tree: TreeNode; fitness: number; transposed: boolean } {
    const work = buildPieces(ind);
    const lookahead = Math.min(3, Math.ceil(work.length / 5));
    const eW = ind.transposed ? usableH : usableW;
    const eH = ind.transposed ? usableW : usableH;
    const result = simulateSheets(work, eW, eH, minBreak, lookahead || 1);
    return { tree: result.firstTree, fitness: result.fitness, transposed: ind.transposed };
  }

  function tournament(pop: { ind: GAIndividual; fitness: number }[]): GAIndividual {
    const k = 4;
    let best = pop[Math.floor(Math.random() * pop.length)];
    for (let i = 1; i < k; i++) {
      const c = pop[Math.floor(Math.random() * pop.length)];
      if (c.fitness > best.fitness) best = c;
    }
    return best.ind;
  }

  function crossover(pA: GAIndividual, pB: GAIndividual): GAIndividual {
    // 1. Ordered Crossover (OX) for genome (permutation)
    const size = pA.genome.length;
    const start = Math.floor(Math.random() * size);
    const end = Math.floor(Math.random() * (size - start)) + start;

    const childGenome = new Array(size).fill(-1);
    for (let i = start; i <= end; i++) {
      childGenome[i] = pA.genome[i];
    }

    let current = 0;
    for (let i = 0; i < size; i++) {
      const parentGene = pB.genome[i];
      if (!childGenome.includes(parentGene)) {
        while (childGenome[current] !== -1) current++;
        childGenome[current] = parentGene;
      }
    }

    // 2. Uniform crossover for rotations and grouping
    const childRotations = pA.rotations.map((r, i) => (Math.random() > 0.5 ? r : pB.rotations[i]));
    const childGrouping = (Math.random() > 0.5 ? pA.groupingMode : pB.groupingMode) as GAIndividual['groupingMode'];

    // Enforce largest piece at position 0
    const lIdx = childGenome.indexOf(largestIdx);
    if (lIdx > 0) {
      [childGenome[0], childGenome[lIdx]] = [childGenome[lIdx], childGenome[0]];
    }

    return {
      genome: childGenome,
      rotations: childRotations,
      groupingMode: childGrouping,
      transposed: Math.random() > 0.5 ? pA.transposed : pB.transposed,
    };
  }

  function mutate(ind: GAIndividual): GAIndividual {
    const c = {
      genome: [...ind.genome],
      rotations: [...ind.rotations],
      groupingMode: ind.groupingMode,
      transposed: ind.transposed,
    };

    const r = Math.random();
    if (r < 0.25) {
      // Swap Mutation — only swap among positions 1+
      if (c.genome.length > 2) {
        const a = 1 + Math.floor(Math.random() * (c.genome.length - 1));
        const b = 1 + Math.floor(Math.random() * (c.genome.length - 1));
        [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
      }
    } else if (r < 0.5) {
      // Block Mutation (Move a segment) — only among positions 1+
      if (c.genome.length > 4) {
        const tail = c.genome.splice(1); // keep pos 0 fixed
        const blockSize = Math.floor(Math.random() * Math.min(5, tail.length / 2)) + 2;
        const start = Math.floor(Math.random() * Math.max(1, tail.length - blockSize));
        const segment = tail.splice(start, blockSize);
        const target = Math.floor(Math.random() * tail.length);
        tail.splice(target, 0, ...segment);
        c.genome = [c.genome[0], ...tail];
      }
    } else if (r < 0.7) {
      // Rotation Mutation (Flip 10% of bits)
      const count = Math.max(1, Math.floor(c.rotations.length * 0.1));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * c.rotations.length);
        c.rotations[idx] = !c.rotations[idx];
      }
    } else if (r < 0.85) {
      // Grouping Mutation
      c.groupingMode = ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const)[Math.floor(Math.random() * 15)] as GAIndividual['groupingMode'];
    } else {
      // Transposition Mutation
      c.transposed = !c.transposed;
    }

    return c;
  }

  // --- Seeding ---
  const initialPop: GAIndividual[] = [];
  const strategies = getSortStrategies();
  strategies.forEach((sortFn) => {
    const sortedIndices = Array.from({ length: numPieces }, (_, i) => i).sort((a, b) => {
      const pA = pieces[a];
      const pB = pieces[b];
      return sortFn(pA, pB);
    });

    // REGRA ABSOLUTA: peça de maior área individual sempre no índice 0
    let bestIdx = 0;
    let bestArea = 0;
    for (let i = 0; i < sortedIndices.length; i++) {
      const p = pieces[sortedIndices[i]];
      const area = p.w * p.h;
      if (area > bestArea) {
        bestArea = area;
        bestIdx = i;
      }
    }
    if (bestIdx > 0) {
      const tmp = sortedIndices[bestIdx];
      sortedIndices.splice(bestIdx, 1);
      sortedIndices.unshift(tmp);
    }

    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: 0,
      transposed: false,
    });
    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: 0,
      transposed: true,
    });
  });

  // Trim if seeds exceed population size, or fill with random
  if (initialPop.length > populationSize) {
    initialPop.length = populationSize;
  }
  while (initialPop.length < populationSize) {
    initialPop.push(randomIndividual());
  }

  let population = initialPop;
  let bestTree: TreeNode | null = null;
  let bestFitness = -1;
  let bestTransposed = false;

  // --- Run V6 heuristic as baseline (always) ---
  if (onProgress) {
    onProgress({ phase: "Rodando heurísticas V6...", current: 0, total: Math.max(1, generations) });
  }
  const v6Result = optimizeV6(pieces, usableW, usableH, minBreak);
  const v6Util = calcPlacedArea(v6Result.tree) / (usableW * usableH);
  if (v6Util > bestFitness) {
    bestFitness = v6Util;
    bestTree = JSON.parse(JSON.stringify(v6Result.tree));
    bestTransposed = false;
  }
  // Also test transposed V6
  const v6T = optimizeV6(pieces, usableH, usableW, minBreak);
  const v6TUtil = calcPlacedArea(v6T.tree) / (usableW * usableH);
  if (v6TUtil > bestFitness) {
    bestFitness = v6TUtil;
    bestTree = JSON.parse(JSON.stringify(v6T.tree));
    bestTransposed = true;
  }

  if (onProgress && generations > 0) {
    onProgress({ phase: "Semeando População...", current: 0, total: generations, bestUtil: bestFitness * 100 });
  }

  // If generations=0, skip GA entirely (heuristics only)
  if (generations === 0) {
    if (onProgress) {
      onProgress({ phase: "Apenas Heurísticas (sem evolução)", current: 1, total: 1, bestUtil: bestFitness * 100 });
    }
    let finalTree = bestTree || createRoot(usableW, usableH);
    if (bestTransposed) {
      finalTree.transposed = true;
      finalTree = normalizeTree(finalTree, usableW, usableH);
    }

    // Pós-análise automática
    if (onProgress)
      onProgress({ phase: "Pós-análise de reagrupamento...", current: 1, total: 1, bestUtil: bestFitness * 100 });
    const postResult = postOptimizeRegroup(
      finalTree,
      bestFitness * usableW * usableH,
      pieces,
      usableW,
      usableH,
      minBreak,
    );
    if (postResult.improved) {
      finalTree = postResult.tree;
      if (onProgress)
        onProgress({
          phase: "Pós-análise: layout melhorado!",
          current: 1,
          total: 1,
          bestUtil: (postResult.area / (usableW * usableH)) * 100,
        });
    }

    return finalTree;
  }

  for (let g = 0; g < generations; g++) {
    // Dynamic settings
    const currentLookahead = Math.min(8, 3 + Math.floor(g / 20));

    const evaluated = population.map((ind) => {
      const work = buildPieces(ind);
      const eW = ind.transposed ? usableH : usableW;
      const eH = ind.transposed ? usableW : usableH;
      const res = simulateSheets(work, eW, eH, minBreak, currentLookahead);
      return { ind, tree: res.firstTree, fitness: res.fitness };
    });

    evaluated.sort((a, b) => b.fitness - a.fitness);

    // Elitism and Best Update
    if (evaluated[0].fitness > bestFitness) {
      bestFitness = evaluated[0].fitness;
      bestTree = JSON.parse(JSON.stringify(evaluated[0].tree));
      bestTransposed = evaluated[0].ind.transposed;
    }

    if (onProgress) {
      onProgress({
        phase: "Otimização Evolutiva Global",
        current: g + 1,
        total: generations,
        bestUtil: bestFitness * 100,
      });
    }

    if (g % 5 === 0) await new Promise((r) => setTimeout(r, 0));

    // Next Gen with basic Diversity check
    const nextPop: GAIndividual[] = evaluated.slice(0, eliteCount).map((e) => e.ind);
    const seenGenomes = new Set(nextPop.map((i) => i.genome.join(",") + (i.transposed ? "T" : "N")));

    while (nextPop.length < populationSize) {
      const pA = tournament(evaluated);
      const pB = tournament(evaluated);
      let child = crossover(pA, pB);
      if (Math.random() < mutationRate) child = mutate(child);

      const key = child.genome.join(",") + (child.transposed ? "T" : "N");
      if (!seenGenomes.has(key)) {
        nextPop.push(child);
        seenGenomes.add(key);
      } else if (Math.random() < 0.2) {
        // Allow some duplicates or push random for diversity
        nextPop.push(randomIndividual());
      }
    }
    population = nextPop;
  }

  let finalTree = bestTree || createRoot(usableW, usableH);
  if (bestTransposed) {
    finalTree.transposed = true;
    finalTree = normalizeTree(finalTree, usableW, usableH);
  }

  // Pós-análise automática de reagrupamento
  if (onProgress)
    onProgress({
      phase: "Pós-análise de reagrupamento...",
      current: generations,
      total: generations,
      bestUtil: bestFitness * 100,
    });
  const postResult = postOptimizeRegroup(
    finalTree,
    bestFitness * usableW * usableH,
    pieces,
    usableW,
    usableH,
    minBreak,
  );
  if (postResult.improved) {
    finalTree = postResult.tree;
    if (onProgress)
      onProgress({
        phase: "Pós-análise: layout melhorado!",
        current: generations,
        total: generations,
        bestUtil: (postResult.area / (usableW * usableH)) * 100,
      });
  }

  return finalTree;
}

// Synchronous wrapper for backward compatibility - Fast Mini-GA Burst
export function optimizeGeneticV1(pieces: Piece[], usableW: number, usableH: number, minBreak: number = 0): TreeNode {
  // Use a tiny population/gen for sync results that beat pure V6
  const numPieces = pieces.length;
  const popSize = 20;
  const gens = 5;
  const eliteCount = 2;

  // Reusing build logic internally or just calling Async with restricted params is hard sync.
  // We'll keep it simple: fallback to best V6 for sync to avoid blocking the thread too long.
  return optimizeV6(pieces, usableW, usableH, minBreak).tree;
}

/**
 * Internal helper to create the necessary nodes (Z, W, Q) for a piece placement.
 * Handles both grouped pieces (multi-part) and individual pieces (with potential narrowing Q cuts).
 */
function createPieceNodes(
  tree: TreeNode,
  yNode: TreeNode,
  piece: Piece,
  placedW: number,
  placedH: number,
  rotated: boolean,
  zNodeToUse?: TreeNode,
): number {
  const isGrouped = piece.count && piece.count > 1;
  let addedArea = 0;

  if (isGrouped) {
    const originalAxis = piece.groupedAxis || "w";
    let splitAxis: "Z" | "W" | "Q";

    if (originalAxis === "w" && !rotated) {
      splitAxis = "Z";
    } else if ((originalAxis === "h" && !rotated) || (originalAxis === "w" && rotated)) {
      splitAxis = "W";
    } else {
      splitAxis = "Q";
    }

    // Special case: if we are provided a zNodeToUse, we CANNOT splitAxis: 'Z'.
    // We must treat it as a 'W' or 'Q' split inside that Z.
    if (zNodeToUse && splitAxis === "Z") splitAxis = "W";

    if (splitAxis === "Z") {
      for (let i = 0; i < piece.count!; i++) {
        const dimW = piece.individualDims ? piece.individualDims[i] : Math.round(placedW / piece.count!);
        const zId = insertNode(tree, yNode.id, "Z", dimW, 1);
        const zNode = findNode(tree, zId)!;
        if (piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
        const wId = insertNode(tree, zId, "W", placedH, 1);
        const wNode = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode.label = piece.labels[i];
      }
    } else if (splitAxis === "W") {
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
      for (let i = 0; i < piece.count!; i++) {
        const dimH = piece.individualDims ? piece.individualDims[i] : Math.round(placedH / piece.count!);
        const wId = insertNode(tree, zNode.id, "W", dimH, 1);
        const wNode_f = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode_f.label = piece.labels[i];
        if (i === 0 && piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
      }
    } else {
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
      const wId = insertNode(tree, zNode.id, "W", placedH, 1);
      const wNode = findNode(tree, wId)!;
      for (let i = 0; i < piece.count!; i++) {
        const dimW = piece.individualDims ? piece.individualDims[i] : Math.round(placedW / piece.count!);
        const qId = insertNode(tree, wId, "Q", dimW, 1);
        const qNode = findNode(tree, qId)!;
        if (piece.labels && piece.labels[i]) {
          qNode.label = piece.labels[i];
          if (i === 0) {
            wNode.label = piece.labels[i];
            zNode.label = piece.labels[i];
          }
        }
      }
    }
  } else {
    // Individual piece
    const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
    if (piece.label) zNode.label = piece.label;

    const wId = insertNode(tree, zNode.id, "W", placedH, 1);
    const wNode = findNode(tree, wId)!;
    if (piece.label) wNode.label = piece.label;

    // Narrowing Q cut if piece is narrower than its assigned Z width
    const actualPieceW = rotated ? piece.h : piece.w;
    if (actualPieceW < placedW) {
      const qId = insertNode(tree, wId, "Q", actualPieceW, 1);
      const qNode = findNode(tree, qId)!;
      if (piece.label) qNode.label = piece.label;
    }
  }

  addedArea = placedW * placedH;
  return addedArea;
}

/**
 * MODIFICAÇÃO: Detecção de peças agrupadas
 *
 * Quando uma peça tem count > 1, significa que é resultado de agrupamento.
 * Neste caso, criamos múltiplos nós Z em vez de um único Z com largura somada.
 */
function runPlacement(
  inventory: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
): { tree: TreeNode; area: number; remaining: Piece[] } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  while (remaining.length > 0) {
    const piece = remaining[0];
    let bestFit: {
      type: "EXISTING" | "NEW";
      col?: TreeNode;
      w: number;
      h: number;
      pieceW: number;
      pieceH: number;
      score: number;
      rotated: boolean;
    } | null = null;

    // 1. Try existing columns
    for (const colX of tree.filhos) {
      const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      const freeH = usableH - usedH;

      for (const o of oris(piece)) {
        // Check min break distance for Y values in this column
        if (minBreak > 0) {
          if (o.h < minBreak) continue;
          // Check Z cut positions across ALL Y strips in this column
          const allZPositions = getAllZCutPositionsInColumn(colX);
          // New piece creates cut at position o.w (starts at offset 0 in new Y strip)
          if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
        }
        if (o.w <= colX.valor && o.h <= freeH) {
          // Residual dominance: if leftover height can't fit any piece, extend to full freeH
          let effectiveH = o.h;
          const residualH = freeH - o.h;
          if (residualH > 0) {
            const ySibValues = colX.filhos.map((y) => y.valor);
            if (!canResidualFitAnyPiece(colX.valor, residualH, remaining.slice(1), minBreak, ySibValues, "h")) {
              effectiveH = freeH;
            }
          }
          const widthRatio = o.w / colX.valor;
          const baseScore = (1 - widthRatio) * 3 + (1 - o.h / freeH) * 0.5;

          // Light lookahead
          let lookBonus = 0;
          const remH = freeH - o.h;
          const remW = colX.valor - o.w;

          for (const r of remaining.slice(1)) {
            for (const ro of oris(r)) {
              if (ro.w <= colX.valor && ro.h <= remH) {
                lookBonus -= 0.5;
                break;
              }
              if (ro.w <= remW && ro.h <= o.h) {
                lookBonus -= 0.3;
                break;
              }
            }
            if (lookBonus < -1) break;
          }

          const score = baseScore + lookBonus;
          if (!bestFit || score < bestFit.score) {
            bestFit = {
              type: "EXISTING",
              col: colX,
              w: o.w,
              h: effectiveH,
              pieceW: o.w,
              pieceH: o.h,
              score,
              rotated: o.w !== piece.w,
            };
          }
        }
      }
    }

    // 2. Try new column
    const usedW = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
    const freeW = usableW - usedW;

    if (freeW > 0) {
      for (const o of oris(piece)) {
        // Check min break distance for X values
        if (minBreak > 0) {
          const violatesX = tree.filhos.some((x) => {
            const diff = Math.abs(x.valor - o.w);
            return diff > 0 && diff < minBreak;
          });
          if (violatesX) continue;
        }
        if (o.w <= freeW && o.h <= usableH) {
          // Residual dominance: if leftover width can't fit any piece, extend to full freeW
          let effectiveW = o.w;
          const residualW = freeW - o.w;
          if (residualW > 0) {
            const xSibValues = tree.filhos.map((x) => x.valor);
            if (!canResidualFitAnyPiece(residualW, usableH, remaining.slice(1), minBreak, xSibValues, "w")) {
              effectiveW = freeW;
            }
          }
          const score = ((freeW - effectiveW) / usableW) * 0.5;
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: "NEW", w: effectiveW, h: o.h, pieceW: o.w, pieceH: o.h, score, rotated: o.w !== piece.w };
          }
        }
      }
    }

    if (!bestFit) {
      remaining.shift();
      continue;
    }

    let col: TreeNode;
    if (bestFit.type === "NEW") {
      insertNode(tree, "root", "X", bestFit.w, 1);
      col = tree.filhos[tree.filhos.length - 1];
    } else {
      col = bestFit.col!;
    }

    // Safety: verify column height before inserting Y strip
    {
      const currentUsedH = col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      if (currentUsedH + bestFit.h > usableH + 0.5) {
        console.warn(
          `[CNC-ENGINE] Main loop: Y insertion would overflow column. usedH=${currentUsedH}, newY=${bestFit.h}, usableH=${usableH}. Skipping piece.`,
        );
        remaining.shift();
        continue;
      }
    }
    const yId = insertNode(tree, col.id, "Y", bestFit.h, 1);
    const yNode = findNode(tree, yId)!;

    placedArea += createPieceNodes(tree, yNode, piece, bestFit.pieceW, bestFit.pieceH, bestFit.rotated);

    remaining.shift();

    // Lateral Z filling - TWO PASSES:
    // Pass 1: same-height pieces first (consolidates waste above the Y strip)
    // Pass 2: shorter pieces with W subdivision
    let freeZW = col.valor - bestFit.pieceW;

    // Pass 1: exact height matches (these create clean Z nodes with no W waste)
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (o.h !== bestFit.pieceH) continue; // Only exact height matches
        if (minBreak > 0) {
          const allZPositions = getAllZCutPositionsInColumn(col);
          const yIndex = col.filhos.indexOf(yNode);
          const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
          const newCutPos = currentOffset + o.w;
          if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
        }
        if (o.w <= freeZW) {
          const score = freeZW - o.w; // prefer pieces that fill the width best
          if (score < bestScore) {
            bestScore = score;
            bestOri = o;
          }
        }
      }

      if (bestOri) {
        placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);
        freeZW -= bestOri.w;
        remaining.splice(i, 1);
        i--;
      }
    }

    // Pass 2: shorter pieces (with W subdivision for remaining width)
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (minBreak > 0) {
          const allZPositions = getAllZCutPositionsInColumn(col);
          const yIndex = col.filhos.indexOf(yNode);
          const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
          const newCutPos = currentOffset + o.w;
          if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
        }
        if (o.w <= freeZW && o.h <= bestFit.h) {
          const score = (bestFit.h - o.h) * 2 + (freeZW - o.w);
          if (score < bestScore) {
            bestScore = score;
            bestOri = o;
          }
        }
      }

      if (bestOri) {
        // Create the container Z for this lateral piece
        const zId = insertNode(tree, yNode.id, "Z", bestOri.w, 1);
        const zNode2 = findNode(tree, zId)!;

        // Sub-fill vertically within this Z width
        let freeWH = bestFit.h;

        // This is a nested loop to fill vertically inside the Z strip and we should use createPieceNodes inside it.
        // But first, we need a way to pass a Z node to createPieceNodes as a parent or refactor createPieceNodes to handle Z parents.
        // Actually, createPieceNodes creates the Z if we pass it a Y.
        // If we have a Z, we might need a variant.
        // Looking at createPieceNodes: it creates Z then W.
        // For Pass 2, we want to stack multiple pieces vertically in the SAME Z.
        // So we might need to manually handle the W/Q creation inside the vertical fill.

        // Actually, let's refactor createPieceNodes to take a generic parent and a target type?
        // No, let's keep it simple: createPieceNodes handles the "create a piece at this location" logic.

        // Refactoring createPieceNodes to take parent and optionally skip Z creation?
        // Or just use it as is for the FIRST piece and then manually for subsequent?

        // Let's use it as is for the Pass 2 main piece:
        placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);
        // Wait, Pass 2 needs to fill the FULL height bestFit.h.
        // createPieceNodes will create a Z of bestOri.w and a W of bestOri.h.
        // The remaining height is bestFit.h - bestOri.h.

        const zNodeCurrent = yNode.filhos[yNode.filhos.length - 1]; // The Z created by createPieceNodes
        let freeWH_remaining = bestFit.h - bestOri.h;

        for (let j = 0; j < remaining.length && freeWH_remaining > 0; j++) {
          if (j === i) continue;
          const pw = remaining[j];
          for (const wo of oris(pw)) {
            if (minBreak > 0) {
              const violatesW = zNodeCurrent.filhos.some((w) => {
                const diff = Math.abs(w.valor - wo.h);
                return diff > 0 && diff < minBreak;
              });
              if (violatesW) continue;
            }
            if (wo.w <= zNodeCurrent.valor && wo.h <= freeWH_remaining) {
              const actualRotated = wo.w !== pw.w;
              createPieceNodes(tree, yNode, pw, wo.w, wo.h, actualRotated, zNodeCurrent);

              placedArea += zNodeCurrent.valor * wo.h;
              freeWH_remaining -= wo.h;
              remaining.splice(j, 1);
              if (j < i) i--;
              j--;
              break;
            }
          }
        }

        freeZW -= bestOri.w;
        remaining.splice(i, 1);
        i--;
      }
    }

    // --- Vertical continuation: repeat Y strips with same height in same column ---
    // After lateral filling, check if we can create more Y strips with the same piece pattern
    {
      const usedHAfter = col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      let freeHRemain = usableH - usedHAfter;

      while (freeHRemain >= bestFit.pieceH && remaining.length > 0) {
        // Find pieces that match the original piece dimensions (same w and h)
        const candidates: number[] = [];
        for (let i = 0; i < remaining.length; i++) {
          const pc = remaining[i];
          const matchesOriginal = oris(pc).some((o) => o.w === bestFit.pieceW && o.h === bestFit.pieceH);
          if (matchesOriginal) candidates.push(i);
        }

        if (candidates.length === 0) break;

        // Check minBreak for new Y strip
        if (minBreak > 0) {
          const ySibValues = col.filhos.map((y) => y.valor);
          const violatesY = ySibValues.some((yv) => {
            const diff = Math.abs(yv - bestFit.pieceH);
            return diff > 0 && diff < minBreak;
          });
          if (violatesY) break;

          // Check Z positions
          const allZPositions = getAllZCutPositionsInColumn(col);
          if (violatesZMinBreak([bestFit.pieceW], allZPositions, minBreak, col.filhos.length)) break;
        }

        // Create new Y strip
        const newYId = insertNode(tree, col.id, "Y", bestFit.pieceH, 1);
        const newYNode = findNode(tree, newYId)!;

        // Place first piece and stack vertically (W multi)
        const firstIdx = candidates[0];
        const firstPc = remaining[firstIdx];

        placedArea += createPieceNodes(
          tree,
          newYNode,
          firstPc,
          bestFit.pieceW,
          bestFit.pieceH,
          bestFit.pieceW !== firstPc.w,
        );
        remaining.splice(firstIdx, 1);

        // Lateral fill with same-height pieces (like Pass 1)
        let newFreeZW = col.valor - bestFit.pieceW;
        for (let i = 0; i < remaining.length && newFreeZW > 0; i++) {
          const pc = remaining[i];
          let matchOri: { w: number; h: number } | null = null;

          for (const o of oris(pc)) {
            if (o.h !== bestFit.pieceH) continue;
            if (o.w > newFreeZW) continue;
            if (minBreak > 0) {
              const allZPos = getAllZCutPositionsInColumn(col);
              const yIdx = col.filhos.indexOf(newYNode);
              const curOff = newYNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
              if (violatesZMinBreak([curOff + o.w], allZPos, minBreak, yIdx)) continue;
            }
            if (!matchOri || newFreeZW - o.w < newFreeZW - matchOri.w) {
              matchOri = o;
            }
          }

          if (matchOri) {
            placedArea += createPieceNodes(tree, newYNode, pc, matchOri.w, matchOri.h, matchOri.w !== pc.w);
            newFreeZW -= matchOri.w;
            remaining.splice(i, 1);
            i--;
          }
        }

        // Recalculate freeHRemain from actual tree state (safer than decrementing)
        const actualUsedH = col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
        freeHRemain = usableH - actualUsedH;
      }
    }

    // Void filling
    if (remaining.length > 0) {
      placedArea += fillVoids(tree, remaining, usableW, usableH, minBreak);
    }
  }

  // --- UNIFY COLUMN WASTE: merge fragmented Z-waste across Y strips ---
  if (remaining.length > 0) {
    placedArea += unifyColumnWaste(tree, remaining, usableW, usableH, minBreak);
  }

  // --- COLLAPSE TREE WASTE: merge consecutive waste siblings into unified blocks ---
  if (remaining.length > 0) {
    placedArea += collapseTreeWaste(tree, remaining, usableW, usableH, minBreak);
  }

  // --- REGROUP ADJACENT STRIPS: merge Y/Z strips to consolidate waste and fit more pieces ---
  if (remaining.length > 0) {
    placedArea += regroupAdjacentStrips(tree, remaining, usableW, usableH, minBreak);
  }

  // --- VALIDATION: clamp columns that exceed usableH ---
  placedArea = clampTreeHeights(tree, usableW, usableH, placedArea);

  return { tree, area: placedArea, remaining };
}

/**
 * UNIFY WASTE AT ALL LEVELS: Post-processing that detects fragmented waste across
 * sibling nodes at every hierarchy level and merges them into unified areas.
 *
 * Level 1 (X→Y): Z-waste across Y strips → split X column, create unified waste column
 * Level 2 (Y→Z): W-waste across Z nodes → split Y strip height, create unified waste strip  
 * Level 3 (Z→W): Q-waste across W nodes → split Z width, create unified waste sub-column
 *
 * Example Level 1: X column with Y1(waste 439×725) + Y2(waste 439×676) → unified 439×1401
 * Example Level 2: Y strip with Z1(waste 917×125) + Z2(waste 917×225) → unified strip 1834×125
 */
function unifyColumnWaste(
  tree: TreeNode,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
): number {
  let addedArea = 0;
  if (remaining.length === 0) return 0;

  // Helper: try to fill pieces into a new column/strip area
  const fillArea = (
    parentNode: TreeNode,
    parentType: "X" | "Y" | "Z",
    areaW: number,
    areaH: number,
  ): number => {
    let filled = 0;
    let freeH = areaH;

    for (let i = 0; i < remaining.length && freeH > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (o.w <= areaW && o.h <= freeH) {
          const score = (areaW - o.w) + (freeH - o.h) * 0.1;
          if (score < bestScore) {
            bestScore = score;
            bestOri = o;
          }
        }
      }

      if (bestOri) {
        let effectiveH = bestOri.h;
        const residualH = freeH - bestOri.h;
        if (residualH > 0) {
          const canFitMore = remaining.slice(i + 1).some(p =>
            oris(p).some(o => o.w <= areaW && o.h <= residualH)
          );
          if (!canFitMore) effectiveH = freeH;
        }

        if (parentType === "X") {
          // Parent is X column, create Y strip
          const yId = insertNode(tree, parentNode.id, "Y", effectiveH, 1);
          const yNode = findNode(tree, yId)!;
          filled += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);

          // Lateral Z filling
          let freeZW = areaW - bestOri.w;
          for (let j = 0; j < remaining.length && freeZW > 0; j++) {
            if (j === i) continue;
            const lpc = remaining[j];
            for (const o of oris(lpc)) {
              if (o.w <= freeZW && o.h <= effectiveH) {
                filled += createPieceNodes(tree, yNode, lpc, o.w, o.h, o.w !== lpc.w);
                freeZW -= o.w;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }
        } else if (parentType === "Y") {
          // Parent is Y strip, create Z sub-column
          const zId = insertNode(tree, parentNode.id, "Z", bestOri.w, 1);
          const zNode = findNode(tree, zId)!;
          const wId = insertNode(tree, zId, "W", bestOri.h, 1);
          const wNode = findNode(tree, wId)!;
          if (pc.label) { zNode.label = pc.label; wNode.label = pc.label; }
          filled += bestOri.w * bestOri.h;

          // Vertical W filling in this Z
          let freeWH = effectiveH - bestOri.h;
          for (let j = 0; j < remaining.length && freeWH > 0; j++) {
            if (j === i) continue;
            const lpc = remaining[j];
            for (const o of oris(lpc)) {
              if (o.w <= bestOri.w && o.h <= freeWH) {
                const wId2 = insertNode(tree, zNode.id, "W", o.h, 1);
                const wNode2 = findNode(tree, wId2)!;
                if (lpc.label) wNode2.label = lpc.label;
                filled += bestOri.w * o.h;
                freeWH -= o.h;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }
        } else {
          // parentType === "Z", create W sub-row
          const wId = insertNode(tree, parentNode.id, "W", bestOri.h, 1);
          const wNode = findNode(tree, wId)!;
          if (pc.label) wNode.label = pc.label;

          if (bestOri.w < areaW) {
            const qId = insertNode(tree, wId, "Q", bestOri.w, 1);
            const qNode = findNode(tree, qId)!;
            if (pc.label) qNode.label = pc.label;
          }
          filled += areaW * bestOri.h;
        }

        freeH -= effectiveH;
        remaining.splice(i, 1);
        i--;
      }
    }
    return filled;
  };

  // === LEVEL 1: X→Y level (Z-waste unification across Y strips) ===
  const columnsToProcess = [...tree.filhos];
  for (const colX of columnsToProcess) {
    if (remaining.length === 0) break;
    if (colX.filhos.length < 2) continue;

    const yWastes = colX.filhos.map(yNode => {
      const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      return colX.valor - usedZ;
    });
    const minWaste = Math.min(...yWastes);
    if (minWaste < 50) continue;

    const totalH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const canFit = remaining.some(p =>
      (p.w <= minWaste && p.h <= totalH) || (p.h <= minWaste && p.w <= totalH)
    );
    if (!canFit) continue;

    colX.valor -= minWaste;
    const newColId = insertNode(tree, "root", "X", minWaste, 1);
    const newCol = findNode(tree, newColId)!;

    const filled = fillArea(newCol, "X", minWaste, usableH);
    addedArea += filled;

    if (newCol.filhos.length === 0) {
      colX.valor += minWaste;
      tree.filhos = tree.filhos.filter(x => x.id !== newCol.id);
    }
  }

  // === LEVEL 2: Y→Z level (W-waste unification across Z nodes in each Y strip) ===
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of [...colX.filhos]) {
      if (remaining.length === 0) break;
      if (yNode.filhos.length < 2) continue;

      const zWastes = yNode.filhos.map(zNode => {
        const usedW = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        return yNode.valor - usedW;
      });
      const minWaste = Math.min(...zWastes);
      if (minWaste < 50) continue;

      const totalW = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      const canFit = remaining.some(p =>
        (p.w <= totalW && p.h <= minWaste) || (p.h <= totalW && p.w <= minWaste)
      );
      if (!canFit) continue;

      // Reduce Y strip height by minWaste
      yNode.valor -= minWaste;

      // Create a new Y strip with unified waste height
      const newYId = insertNode(tree, colX.id, "Y", minWaste, 1);
      const newYNode = findNode(tree, newYId)!;

      const filled = fillArea(newYNode, "Y", colX.valor, minWaste);
      addedArea += filled;

      if (newYNode.filhos.length === 0) {
        yNode.valor += minWaste;
        colX.filhos = colX.filhos.filter(y => y.id !== newYNode.id);
      }
    }
  }

  // === LEVEL 3: Z→W level (Q-waste unification across W nodes in each Z) ===
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of colX.filhos) {
      if (remaining.length === 0) break;
      for (const zNode of [...yNode.filhos]) {
        if (remaining.length === 0) break;
        if (zNode.filhos.length < 2) continue;

        const wWastes = zNode.filhos.map(wNode => {
          const usedQ = wNode.filhos.reduce((a, q) => a + q.valor * q.multi, 0);
          // If W has no Q children, the piece fills the full Z width
          return usedQ > 0 ? zNode.valor - usedQ : 0;
        });
        const minWaste = Math.min(...wWastes);
        if (minWaste < 50) continue;

        const totalH = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        const canFit = remaining.some(p =>
          (p.w <= minWaste && p.h <= totalH) || (p.h <= minWaste && p.w <= totalH)
        );
        if (!canFit) continue;

        // Reduce Z width by minWaste
        zNode.valor -= minWaste;

        // Create a new Z node for unified waste
        const newZId = insertNode(tree, yNode.id, "Z", minWaste, 1);
        const newZNode = findNode(tree, newZId)!;

        const filled = fillArea(newZNode, "Z", minWaste, yNode.valor);
        addedArea += filled;

        if (newZNode.filhos.length === 0) {
          zNode.valor += minWaste;
          yNode.filhos = yNode.filhos.filter(z => z.id !== newZNode.id);
        }
      }
    }
  }

  return addedArea;
}


/**
 * Validates that no column (X node) has Y strips whose total height exceeds usableH.
 * If overflow is detected, removes excess Y strips from the end and adjusts placedArea.
 */
// ========== STRUCTURAL WASTE COLLAPSE ==========

/**
 * COLAPSO ESTRUTURAL DE SOBRAS
 *
 * Percorre a árvore identificando nós irmãos consecutivos que representam
 * sobras (sem peças alocadas). Colapsa-os em um único nó com a soma das
 * dimensões, criando um espaço unificado onde peças restantes podem caber.
 *
 * Regras (do documento de especificação):
 * - Mesmo eixo (tipo do nó)
 * - Mesmo contexto (mesmo nó pai)
 * - Cortes consecutivos
 * - Regiões contíguas
 * - Mesma largura → colapso Y/W (horizontal)
 * - Mesma altura → colapso X/Z/Q (vertical)
 *
 * Exemplo: Y(200) + Y(150) + Y(100) todos sem peças → Y(450)
 */
function collapseTreeWaste(
  tree: TreeNode,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
): number {
  if (remaining.length === 0) return 0;
  let addedArea = 0;

  /**
   * Verifica se um nó é "sobra pura" — sem peças alocadas.
   * Um nó folha sem label é sobra. Um nó com filhos é sobra se TODOS os filhos são sobra.
   */
  function isWasteNode(node: TreeNode): boolean {
    if (node.filhos.length === 0) return !node.label;
    return node.filhos.every(c => isWasteNode(c));
  }

  /**
   * Tenta colapsar nós irmãos consecutivos que são sobra pura dentro de um pai.
   * Retorna a área preenchida com peças nos espaços colapsados.
   */
  function collapseLevel(
    parent: TreeNode,
    getSpaceW: (totalVal: number) => number,
    getSpaceH: (totalVal: number) => number,
    childType: NodeType,
    fillFn: (collapsedNode: TreeNode, spaceW: number, spaceH: number) => number,
  ): number {
    let levelArea = 0;
    let modified = true;

    while (modified && remaining.length > 0) {
      modified = false;

      for (let i = 0; i < parent.filhos.length && remaining.length > 0; i++) {
        // Find run of consecutive waste nodes
        if (!isWasteNode(parent.filhos[i])) continue;

        let j = i;
        let totalVal = 0;
        while (j < parent.filhos.length && isWasteNode(parent.filhos[j])) {
          totalVal += parent.filhos[j].valor * parent.filhos[j].multi;
          j++;
        }

        const runLength = j - i;
        if (runLength < 2 || totalVal < 50) {
          i = j - 1;
          continue;
        }

        const spaceW = getSpaceW(totalVal);
        const spaceH = getSpaceH(totalVal);

        // Check if any remaining piece fits in the collapsed space
        const canFit = remaining.some(p =>
          oris(p).some(o => o.w <= spaceW && o.h <= spaceH)
        );

        if (!canFit) {
          i = j - 1;
          continue;
        }

        console.log(
          `[COLLAPSE] ${childType} level: merging ${runLength} waste nodes (total=${totalVal}mm) → space ${spaceW}×${spaceH}mm`
        );

        // Remove individual waste nodes
        const removed = parent.filhos.splice(i, runLength);

        // Create one collapsed node with the summed dimension
        const collapsedId = gid();
        const collapsed: TreeNode = {
          id: collapsedId,
          tipo: childType,
          valor: totalVal,
          multi: 1,
          filhos: [],
        };
        parent.filhos.splice(i, 0, collapsed);

        // Fill the collapsed space
        const filled = fillFn(collapsed, spaceW, spaceH);
        levelArea += filled;

        if (filled > 0) {
          modified = true;
          console.log(
            `[COLLAPSE] Filled ${filled.toFixed(0)}mm² in collapsed ${childType} node`
          );
        } else {
          // Nothing fit — restore original waste nodes
          parent.filhos.splice(i, 1);
          parent.filhos.splice(i, 0, ...removed);
        }

        break; // restart scan after modification
      }
    }

    return levelArea;
  }

  // === LEVEL Y: Collapse consecutive waste Y nodes in each X column ===
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;

    addedArea += collapseLevel(
      colX,
      (_totalVal) => colX.valor,        // spaceW = column width
      (totalVal) => totalVal,            // spaceH = summed Y heights
      'Y',
      (collapsedY, spaceW, spaceH) => {
        let filled = 0;
        let freeH = spaceH;

        while (freeH > 0 && remaining.length > 0) {
          let bestIdx = -1;
          let bestO: { w: number; h: number } | null = null;
          let bestArea = 0;

          for (let i = 0; i < remaining.length; i++) {
            for (const o of oris(remaining[i])) {
              if (o.w <= spaceW && o.h <= freeH && o.w * o.h > bestArea) {
                bestArea = o.w * o.h;
                bestIdx = i;
                bestO = o;
              }
            }
          }

          if (bestIdx < 0 || !bestO) break;

          const pc = remaining[bestIdx];
          let consumed = bestO.h;
          const residualH = freeH - bestO.h;
          if (residualH > 0 && !canResidualFitAnyPiece(spaceW, residualH, remaining, minBreak)) {
            consumed = freeH;
          }

          // Adjust collapsed Y node's valor to match consumed height if needed
          // Create a sub-Y strip inside the collapsed node isn't valid — 
          // instead we directly create Z children
          const zId = gid();
          const zNode: TreeNode = {
            id: zId,
            tipo: 'Z',
            valor: bestO.w,
            multi: 1,
            filhos: [],
            label: pc.label,
          };
          collapsedY.filhos.push(zNode);

          // If piece is narrower than column, add W subdivision
          if (bestO.w < spaceW) {
            // Lateral fill in same Y strip
            let freeZW = spaceW - bestO.w;
            for (let k = 0; k < remaining.length && freeZW > 0; k++) {
              if (k === bestIdx) continue;
              const lpc = remaining[k];
              for (const o of oris(lpc)) {
                if (o.w <= freeZW && o.h <= consumed) {
                  const lateralZ: TreeNode = {
                    id: gid(),
                    tipo: 'Z',
                    valor: o.w,
                    multi: 1,
                    filhos: [],
                    label: lpc.label,
                  };
                  collapsedY.filhos.push(lateralZ);
                  freeZW -= o.w;
                  filled += o.w * o.h;
                  remaining.splice(k, 1);
                  if (k < bestIdx) bestIdx--;
                  k--;
                  break;
                }
              }
            }
          }

          filled += bestO.w * bestO.h;
          freeH -= consumed;
          remaining.splice(bestIdx, 1);
        }

        // Adjust the collapsed Y valor to actual used height if partially filled
        if (freeH > 0 && collapsedY.filhos.length > 0) {
          collapsedY.valor = spaceH - freeH;
        }

        return filled;
      },
    );
  }

  // === LEVEL Z: Collapse consecutive waste Z nodes in each Y strip ===
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of colX.filhos) {
      if (remaining.length === 0) break;

      addedArea += collapseLevel(
        yNode,
        (totalVal) => totalVal,            // spaceW = summed Z widths
        (_totalVal) => yNode.valor,         // spaceH = Y strip height
        'Z',
        (collapsedZ, spaceW, spaceH) => {
          let filled = 0;
          let freeW = spaceW;

          while (freeW > 0 && remaining.length > 0) {
            let bestIdx = -1;
            let bestO: { w: number; h: number } | null = null;
            let bestArea = 0;

            for (let i = 0; i < remaining.length; i++) {
              for (const o of oris(remaining[i])) {
                if (o.w <= freeW && o.h <= spaceH && o.w * o.h > bestArea) {
                  bestArea = o.w * o.h;
                  bestIdx = i;
                  bestO = o;
                }
              }
            }

            if (bestIdx < 0 || !bestO) break;

            const pc = remaining[bestIdx];
            // Create W children inside the collapsed Z
            const wNode: TreeNode = {
              id: gid(),
              tipo: 'W',
              valor: bestO.h,
              multi: 1,
              filhos: [],
              label: pc.label,
            };
            collapsedZ.filhos.push(wNode);

            // If piece doesn't fill full height, add Q subdivision
            if (bestO.w < freeW) {
              // Mark width via Q node
              const qNode: TreeNode = {
                id: gid(),
                tipo: 'Q',
                valor: bestO.w,
                multi: 1,
                filhos: [],
                label: pc.label,
              };
              wNode.filhos.push(qNode);
            }

            // Vertical W fill within the same Z column
            let freeWH = spaceH - bestO.h;
            for (let k = 0; k < remaining.length && freeWH > 0; k++) {
              if (k === bestIdx) continue;
              const lpc = remaining[k];
              for (const o of oris(lpc)) {
                if (o.w <= bestO.w && o.h <= freeWH) {
                  const wNode2: TreeNode = {
                    id: gid(),
                    tipo: 'W',
                    valor: o.h,
                    multi: 1,
                    filhos: [],
                    label: lpc.label,
                  };
                  collapsedZ.filhos.push(wNode2);
                  filled += o.w * o.h;
                  freeWH -= o.h;
                  remaining.splice(k, 1);
                  if (k < bestIdx) bestIdx--;
                  k--;
                  break;
                }
              }
            }

            filled += bestO.w * bestO.h;
            freeW -= bestO.w;
            remaining.splice(bestIdx, 1);
          }

          // Adjust collapsed Z valor if partially used
          if (freeW > 0 && collapsedZ.filhos.length > 0) {
            collapsedZ.valor = spaceW - freeW;
          }

          return filled;
        },
      );
    }
  }

  // === LEVEL W: Collapse consecutive waste W nodes in each Z node ===
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of colX.filhos) {
      if (remaining.length === 0) break;
      for (const zNode of yNode.filhos) {
        if (remaining.length === 0) break;

        addedArea += collapseLevel(
          zNode,
          (_totalVal) => zNode.valor,        // spaceW = Z width
          (totalVal) => totalVal,             // spaceH = summed W heights
          'W',
          (collapsedW, spaceW, spaceH) => {
            let filled = 0;

            // Try to fit the best piece
            let bestIdx = -1;
            let bestO: { w: number; h: number } | null = null;
            let bestArea = 0;

            for (let i = 0; i < remaining.length; i++) {
              for (const o of oris(remaining[i])) {
                if (o.w <= spaceW && o.h <= spaceH && o.w * o.h > bestArea) {
                  bestArea = o.w * o.h;
                  bestIdx = i;
                  bestO = o;
                }
              }
            }

            if (bestIdx >= 0 && bestO) {
              const pc = remaining[bestIdx];
              collapsedW.label = pc.label;

              // If piece is narrower than Z, add Q node
              if (bestO.w < spaceW) {
                const qNode: TreeNode = {
                  id: gid(),
                  tipo: 'Q',
                  valor: bestO.w,
                  multi: 1,
                  filhos: [],
                  label: pc.label,
                };
                collapsedW.filhos.push(qNode);
              }

              filled += bestO.w * bestO.h;
              remaining.splice(bestIdx, 1);
            }

            return filled;
          },
        );
      }
    }
  }

  if (addedArea > 0) {
    console.log(`[COLLAPSE] Total area recovered: ${addedArea.toFixed(0)}mm²`);
  }

  return addedArea;
}

/**
 * AGRUPAMENTO INTELIGENTE DE SOBRAS
 *
 * Estratégia: detectar faixas Y adjacentes dentro de uma coluna X onde a combinação
 * das alturas permite um layout mais compacto. Extrai as peças das faixas adjacentes,
 * reconstrói a sub-árvore com a altura combinada, e tenta encaixar peças restantes
 * no espaço consolidado.
 *
 * Regras do documento:
 * - Mesmo eixo, mesmo contexto, cortes consecutivos, regiões contíguas
 * - Respeita hierarquia de cortes guilhotinados (X→Y→Z→W→Q)
 * - Trabalha com relações geométricas (sem depender de dimensões fixas)
 */
function regroupAdjacentStrips(
  tree: TreeNode,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
): number {
  // Note: we proceed even when remaining.length === 0 to consolidate fragmented waste
  let totalAdded = 0;

  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    if (colX.filhos.length < 2) continue;

    let modified = true;
    while (modified) {
      modified = false;

      // Try merging consecutive Y strips (groups of 2, 3, ...)
      for (let i = 0; i < colX.filhos.length - 1; i++) {
        // Try progressively larger groups starting from 2
        for (let groupSize = Math.min(colX.filhos.length - i, 5); groupSize >= 2; groupSize--) {
          const yGroup = colX.filhos.slice(i, i + groupSize);
          const combinedH = yGroup.reduce((s, y) => s + y.valor * y.multi, 0);

          // Skip if combined height exceeds usable height
          if (combinedH > usableH) continue;

          // Extract all pieces from the Y group
          const extractedPieces: Piece[] = [];
          const extractedRects: AbsRect[] = [];

          let yOff = 0;
          for (const yNode of yGroup) {
            for (let iy = 0; iy < yNode.multi; iy++) {
              let zOff = 0;
              for (const zNode of yNode.filhos) {
                for (let iz = 0; iz < zNode.multi; iz++) {
                  if (zNode.filhos.length === 0) {
                    if (zNode.label) {
                      extractedPieces.push({ w: zNode.valor, h: yNode.valor, area: zNode.valor * yNode.valor, label: zNode.label });
                      extractedRects.push({ x: zOff, y: yOff, w: zNode.valor, h: yNode.valor, label: zNode.label });
                    }
                  } else {
                    let wOff = 0;
                    for (const wNode of zNode.filhos) {
                      for (let iw = 0; iw < wNode.multi; iw++) {
                        if (wNode.filhos.length === 0) {
                          if (wNode.label) {
                            extractedPieces.push({ w: zNode.valor, h: wNode.valor, area: zNode.valor * wNode.valor, label: wNode.label });
                            extractedRects.push({ x: zOff, y: yOff + wOff, w: zNode.valor, h: wNode.valor, label: wNode.label });
                          }
                        } else {
                          for (const qNode of wNode.filhos) {
                            for (let iq = 0; iq < qNode.multi; iq++) {
                              if (qNode.label) {
                                extractedPieces.push({ w: qNode.valor, h: wNode.valor, area: qNode.valor * wNode.valor, label: qNode.label });
                                extractedRects.push({ x: zOff + (iq > 0 ? qNode.valor * iq : 0), y: yOff + wOff, w: qNode.valor, h: wNode.valor, label: qNode.label });
                              }
                            }
                          }
                        }
                        wOff += wNode.valor;
                      }
                    }
                  }
                  zOff += zNode.valor;
                }
              }
              yOff += yNode.valor;
            }
          }

          if (extractedPieces.length === 0) continue;

          const colW = colX.valor;
          const oldArea = extractedPieces.reduce((s, p) => s + p.area, 0);

          // Check if consolidation is worthwhile:
          // Either remaining pieces could fit, or waste is fragmented across strips
          const wasteArea = colW * combinedH - oldArea;
          const hasWasteToConsolidate = yGroup.length >= 2 && yGroup.some(y => {
            const yPieceW = y.filhos.reduce((s, z) => s + z.valor * z.multi, 0);
            return yPieceW < colW; // has Z-waste on the side
          });
          const canFitNew = remaining.length > 0 && remaining.some(p =>
            oris(p).some(o => o.w * o.h <= wasteArea && o.w <= colW && o.h <= combinedH)
          );

          if (!canFitNew && !hasWasteToConsolidate) continue;

          // Build a mini-inventory: extracted pieces + candidates from remaining
          const candidateRemaining = [...remaining];
          const allPieces: Piece[] = [...extractedPieces];

          // Greedy placement in the combined Y space
          const newYNode: TreeNode = { id: gid(), tipo: 'Y', valor: combinedH, multi: 1, filhos: [] };
          let freeH = combinedH;
          const placed: Piece[] = [];
          const usedFromRemaining: number[] = [];

          // Sort all available pieces (extracted + remaining) by area desc for greedy placement
          const allCandidates = [
            ...allPieces.map((p, idx) => ({ piece: p, source: 'extracted' as const, idx })),
            ...candidateRemaining.map((p, idx) => ({ piece: p, source: 'remaining' as const, idx })),
          ];

          // Place column by column (Z nodes) within the combined Y
          let usedW = 0;

          while (usedW < colW && (placed.length < allPieces.length || usedFromRemaining.length > 0 || allCandidates.length > 0)) {
            // Find best piece for a new Z column
            let bestCandidate: typeof allCandidates[0] | null = null;
            let bestOri: { w: number; h: number } | null = null;
            let bestScore = Infinity;

            for (const c of allCandidates) {
              if (c.source === 'remaining' && usedFromRemaining.includes(c.idx)) continue;
              if (c.source === 'extracted' && placed.some(pp => pp === c.piece)) continue;

              for (const o of oris(c.piece)) {
                if (o.w <= colW - usedW && o.h <= combinedH) {
                  const score = scoreFit(colW - usedW, combinedH, o.w, o.h, []);
                  if (score < bestScore) {
                    bestScore = score;
                    bestCandidate = c;
                    bestOri = o;
                  }
                }
              }
            }

            if (!bestCandidate || !bestOri) break;

            // Create Z node for this piece
            const zNode: TreeNode = { id: gid(), tipo: 'Z', valor: bestOri.w, multi: 1, filhos: [] };

            // Stack W nodes vertically in this Z column
            let usedH = 0;
            const wNode: TreeNode = { id: gid(), tipo: 'W', valor: bestOri.h, multi: 1, filhos: [], label: bestCandidate.piece.label };

            if (bestOri.w < colW - usedW || bestOri.h < combinedH) {
              // Not a perfect Z leaf - need W subdivision
              zNode.filhos.push(wNode);
            } else {
              zNode.label = bestCandidate.piece.label;
            }

            if (bestCandidate.source === 'remaining') {
              usedFromRemaining.push(bestCandidate.idx);
            }
            placed.push(bestCandidate.piece);
            usedH += bestOri.h;

            // Fill remaining height in this Z column with more pieces
            const zWidth = bestOri.w;
            while (usedH < combinedH) {
              let bestFill: typeof allCandidates[0] | null = null;
              let bestFillOri: { w: number; h: number } | null = null;
              let bestFillArea = 0;

              for (const c of allCandidates) {
                if (c === bestCandidate) continue;
                if (c.source === 'remaining' && usedFromRemaining.includes(c.idx)) continue;
                if (c.source === 'extracted' && placed.some(pp => pp === c.piece)) continue;

                for (const o of oris(c.piece)) {
                  if (o.w <= zWidth && o.h <= combinedH - usedH && o.w * o.h > bestFillArea) {
                    bestFillArea = o.w * o.h;
                    bestFill = c;
                    bestFillOri = o;
                  }
                }
              }

              if (!bestFill || !bestFillOri) break;

              const fillW: TreeNode = { id: gid(), tipo: 'W', valor: bestFillOri.h, multi: 1, filhos: [], label: bestFill.piece.label };

              if (bestFillOri.w < zWidth) {
                // Need Q subdivision
                const qNode: TreeNode = { id: gid(), tipo: 'Q', valor: bestFillOri.w, multi: 1, filhos: [], label: bestFill.piece.label };
                fillW.filhos.push(qNode);
                fillW.label = undefined;
              }

              zNode.filhos.push(fillW);

              if (bestFill.source === 'remaining') {
                usedFromRemaining.push(bestFill.idx);
              }
              placed.push(bestFill.piece);
              usedH += bestFillOri.h;
            }

            newYNode.filhos.push(zNode);
            usedW += zWidth;

            // Check if all extracted pieces are placed
            const allExtractedPlaced = allPieces.every(ep => placed.includes(ep));
            if (allExtractedPlaced && usedFromRemaining.length === 0) {
              // No improvement - all original pieces placed but no new ones
              // Keep going to try to fit remaining pieces
            }
          }

          // Validate: all extracted pieces must be placed
          const allExtractedPlaced = allPieces.every(ep => placed.includes(ep));
          if (!allExtractedPlaced) continue; // regrouping failed, skip

          // Allow merge if: new pieces were fitted OR waste was consolidated (fewer Y-strips)
          const wasteConsolidated = groupSize > 1; // merging multiple Y-strips into one consolidates waste
          if (usedFromRemaining.length === 0 && !wasteConsolidated) continue;

          // Success! Replace the Y group with the new merged Y node
          console.log(
            `[REGROUP] Merged ${groupSize} Y strips (${yGroup.map(y => `Y${y.valor}`).join('+')} = Y${combinedH}) in X${colX.valor}, ` +
            `fitted ${usedFromRemaining.length} new piece(s)`
          );

          // Adjust newYNode.valor to actual used height if we didn't fill everything
          // Remove the old Y nodes and insert the new one
          colX.filhos.splice(i, groupSize, newYNode);

          // Add remaining waste as a separate Y node if there's leftover height
          const actualUsedH = newYNode.filhos.reduce((s, z) => {
            // The height is defined by W children if present, else by the Y parent
            return combinedH; // The Y node already has the combined height
          }, 0);

          // Remove placed remaining pieces from the remaining array
          // Sort indices descending to avoid index shifting
          const sortedIndices = [...usedFromRemaining].sort((a, b) => b - a);
          let addedArea = 0;
          for (const idx of sortedIndices) {
            addedArea += remaining[idx].area;
            remaining.splice(idx, 1);
          }

          totalAdded += addedArea;
          modified = true;
          break; // restart scan for this column
        }

        if (modified) break;
      }
    }
  }

  // Also try regrouping Z nodes within each Y strip (horizontal consolidation)
  for (const colX of tree.filhos) {
    for (const yNode of colX.filhos) {
      if (yNode.filhos.length < 2) continue;

      let modified = true;
      while (modified) {
        modified = false;

        for (let i = 0; i < yNode.filhos.length - 1; i++) {
          for (let groupSize = Math.min(yNode.filhos.length - i, 4); groupSize >= 2; groupSize--) {
            const zGroup = yNode.filhos.slice(i, i + groupSize);

            // Only merge if at least some are waste
            const hasWaste = zGroup.some(z => isWasteSubtree(z));
            if (!hasWaste) continue;

            const combinedW = zGroup.reduce((s, z) => s + z.valor * z.multi, 0);
            if (combinedW > colX.valor) continue;

            const stripH = yNode.valor;

            // Check if any remaining piece fits
            const canFit = remaining.some(p =>
              oris(p).some(o => o.w <= combinedW && o.h <= stripH)
            );
            if (!canFit) continue;

            // Extract pieces from the Z group
            const piecesInGroup: Piece[] = [];
            for (const zNode of zGroup) {
              if (zNode.filhos.length === 0 && zNode.label) {
                piecesInGroup.push({ w: zNode.valor, h: stripH, area: zNode.valor * stripH, label: zNode.label });
              } else {
                for (const wNode of zNode.filhos) {
                  if (wNode.filhos.length === 0 && wNode.label) {
                    piecesInGroup.push({ w: zNode.valor, h: wNode.valor, area: zNode.valor * wNode.valor, label: wNode.label });
                  } else {
                    for (const qNode of wNode.filhos) {
                      if (qNode.label) {
                        piecesInGroup.push({ w: qNode.valor, h: wNode.valor, area: qNode.valor * wNode.valor, label: qNode.label });
                      }
                    }
                  }
                }
              }
            }

            // Create merged Z node and try to place everything
            const mergedZ: TreeNode = { id: gid(), tipo: 'Z', valor: combinedW, multi: 1, filhos: [] };
            let usedH = 0;
            const allToPlace = [...piecesInGroup];
            const newFromRemaining: number[] = [];

            // Add candidates from remaining
            for (let ri = 0; ri < remaining.length; ri++) {
              for (const o of oris(remaining[ri])) {
                if (o.w <= combinedW && o.h <= stripH) {
                  allToPlace.push(remaining[ri]);
                  break;
                }
              }
            }

            // Greedy W-stacking
            const placedHere: Piece[] = [];
            while (usedH < stripH) {
              let bestIdx = -1;
              let bestO: { w: number; h: number } | null = null;
              let bestArea = 0;

              for (let k = 0; k < allToPlace.length; k++) {
                if (placedHere.includes(allToPlace[k])) continue;
                for (const o of oris(allToPlace[k])) {
                  if (o.w <= combinedW && o.h <= stripH - usedH && o.w * o.h > bestArea) {
                    bestArea = o.w * o.h;
                    bestIdx = k;
                    bestO = o;
                  }
                }
              }

              if (bestIdx < 0 || !bestO) break;

              const wNode: TreeNode = { id: gid(), tipo: 'W', valor: bestO.h, multi: 1, filhos: [], label: allToPlace[bestIdx].label };
              if (bestO.w < combinedW) {
                const qNode: TreeNode = { id: gid(), tipo: 'Q', valor: bestO.w, multi: 1, filhos: [], label: allToPlace[bestIdx].label };
                wNode.filhos.push(qNode);
                wNode.label = undefined;
              }
              mergedZ.filhos.push(wNode);
              placedHere.push(allToPlace[bestIdx]);

              // Track if this came from remaining
              const remIdx = remaining.indexOf(allToPlace[bestIdx]);
              if (remIdx >= 0) {
                newFromRemaining.push(remIdx);
              }
              usedH += bestO.h;
            }

            // Validate: all original pieces must be placed
            const allOrigPlaced = piecesInGroup.every(p => placedHere.includes(p));
            if (!allOrigPlaced) continue;
            // Allow merge for waste consolidation even without new pieces
            const zWasteConsolidated = groupSize > 1 && hasWaste;
            if (newFromRemaining.length === 0 && !zWasteConsolidated) continue;

            console.log(
              `[REGROUP-Z] Merged ${groupSize} Z nodes (${zGroup.map(z => `Z${z.valor}`).join('+')} = Z${combinedW}) in Y${yNode.valor}, ` +
              `fitted ${newFromRemaining.length} new piece(s)`
            );

            yNode.filhos.splice(i, groupSize, mergedZ);

            const sortedIndices = [...newFromRemaining].sort((a, b) => b - a);
            let addedArea = 0;
            for (const idx of sortedIndices) {
              addedArea += remaining[idx].area;
              remaining.splice(idx, 1);
            }
            totalAdded += addedArea;
            modified = true;
            break;
          }
          if (modified) break;
        }
      }
    }
  }

  // Also try regrouping W nodes within each Z node (vertical consolidation)
  for (const colX of tree.filhos) {
    for (const yNode of colX.filhos) {
      for (const zNode of yNode.filhos) {
        if (zNode.filhos.length < 2) continue;

        let wModified = true;
        while (wModified) {
          wModified = false;

          for (let i = 0; i < zNode.filhos.length - 1; i++) {
            for (let groupSize = Math.min(zNode.filhos.length - i, 4); groupSize >= 2; groupSize--) {
              const wGroup = zNode.filhos.slice(i, i + groupSize);

              const hasWaste = wGroup.some(w => isWasteSubtree(w));
              if (!hasWaste) continue;

              const combinedH = wGroup.reduce((s, w) => s + w.valor * w.multi, 0);
              if (combinedH > yNode.valor) continue;

              const zWidth = zNode.valor;

              const canFit = remaining.some(p =>
                oris(p).some(o => o.w <= zWidth && o.h <= combinedH)
              );
              if (!canFit) continue;

              // Extract pieces from W group
              const piecesInGroup: Piece[] = [];
              for (const wNode of wGroup) {
                if (wNode.filhos.length === 0 && wNode.label) {
                  piecesInGroup.push({ w: zWidth, h: wNode.valor, area: zWidth * wNode.valor, label: wNode.label });
                } else {
                  for (const qNode of wNode.filhos) {
                    if (qNode.label) {
                      piecesInGroup.push({ w: qNode.valor, h: wNode.valor, area: qNode.valor * wNode.valor, label: qNode.label });
                    }
                  }
                }
              }

              // Create merged W node and greedy Q-stacking
              const mergedW: TreeNode = { id: gid(), tipo: 'W', valor: combinedH, multi: 1, filhos: [] };
              const placedHere: Piece[] = [];
              const newFromRemaining: number[] = [];
              let usedW = 0;

              // All candidates
              const allToPlace = [...piecesInGroup];
              for (let ri = 0; ri < remaining.length; ri++) {
                for (const o of oris(remaining[ri])) {
                  if (o.w <= zWidth && o.h <= combinedH) {
                    allToPlace.push(remaining[ri]);
                    break;
                  }
                }
              }

              // Greedy Q-stacking (horizontal within W)
              while (usedW < zWidth) {
                let bestIdx = -1;
                let bestO: { w: number; h: number } | null = null;
                let bestArea = 0;

                for (let k = 0; k < allToPlace.length; k++) {
                  if (placedHere.includes(allToPlace[k])) continue;
                  for (const o of oris(allToPlace[k])) {
                    if (o.w <= zWidth - usedW && o.h <= combinedH && o.w * o.h > bestArea) {
                      bestArea = o.w * o.h;
                      bestIdx = k;
                      bestO = o;
                    }
                  }
                }

                if (bestIdx < 0 || !bestO) break;

                const qNode: TreeNode = { id: gid(), tipo: 'Q', valor: bestO.w, multi: 1, filhos: [], label: allToPlace[bestIdx].label };
                mergedW.filhos.push(qNode);
                placedHere.push(allToPlace[bestIdx]);

                const remIdx = remaining.indexOf(allToPlace[bestIdx]);
                if (remIdx >= 0) {
                  newFromRemaining.push(remIdx);
                }
                usedW += bestO.w;
              }

              const allOrigPlaced = piecesInGroup.every(p => placedHere.includes(p));
              if (!allOrigPlaced || newFromRemaining.length === 0) continue;

              console.log(
                `[REGROUP-W] Merged ${groupSize} W nodes (${wGroup.map(w => `W${w.valor}`).join('+')} = W${combinedH}) in Z${zNode.valor}, ` +
                `fitted ${newFromRemaining.length} new piece(s)`
              );

              zNode.filhos.splice(i, groupSize, mergedW);

              const sortedIndices = [...newFromRemaining].sort((a, b) => b - a);
              let addedArea = 0;
              for (const idx of sortedIndices) {
                addedArea += remaining[idx].area;
                remaining.splice(idx, 1);
              }
              totalAdded += addedArea;
              wModified = true;
              break;
            }
            if (wModified) break;
          }
        }
      }
    }
  }

  if (totalAdded > 0) {
    console.log(`[REGROUP] Total area recovered: ${totalAdded.toFixed(0)}mm²`);
  }

  return totalAdded;
}

/** Check if a subtree is pure waste (no labels anywhere) */
function isWasteSubtree(node: TreeNode): boolean {
  if (node.label) return false;
  if (node.filhos.length === 0) return !node.label;
  return node.filhos.every(c => isWasteSubtree(c));
}

function clampTreeHeights(tree: TreeNode, usableW: number, usableH: number, placedArea: number): number {
  for (const colX of tree.filhos) {
    let totalH = 0;
    const validChildren: TreeNode[] = [];

    for (const yNode of colX.filhos) {
      const yHeight = yNode.valor * yNode.multi;
      if (totalH + yHeight <= usableH + 0.5) {
        validChildren.push(yNode);
        totalH += yHeight;
      } else {
        if (yNode.multi > 1) {
          const canFit = Math.floor((usableH - totalH) / yNode.valor);
          if (canFit > 0) {
            yNode.multi = canFit;
            validChildren.push(yNode);
            totalH += yNode.valor * canFit;
          }
        } else if (totalH + yNode.valor <= usableH + 0.5) {
          validChildren.push(yNode);
          totalH += yNode.valor;
        }
        if (validChildren.length < colX.filhos.length) {
          const originalTotal = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
          console.warn(
            `[CNC-ENGINE] Column overflow detected: ${originalTotal.toFixed(0)}mm > ${usableH}mm usableH. Clamped to ${totalH.toFixed(0)}mm.`,
          );
        }
      }
    }

    if (validChildren.length < colX.filhos.length) {
      const removedYNodes = colX.filhos.filter((y) => !validChildren.includes(y));
      for (const ry of removedYNodes) {
        placedArea -= calculateNodeArea(ry);
      }
      colX.filhos = validChildren;
    }

    // --- CLAMP Z widths: ensure sum of Z values doesn't exceed X column width ---
    for (const yNode of colX.filhos) {
      let totalZ = 0;
      const validZ: TreeNode[] = [];
      for (const zNode of yNode.filhos) {
        const zWidth = zNode.valor * zNode.multi;
        if (totalZ + zWidth <= colX.valor + 0.5) {
          validZ.push(zNode);
          totalZ += zWidth;
        } else {
          // Try to partially fit
          if (zNode.multi > 1) {
            const canFit = Math.floor((colX.valor - totalZ) / zNode.valor);
            if (canFit > 0) {
              zNode.multi = canFit;
              validZ.push(zNode);
              totalZ += zNode.valor * canFit;
            }
          } else if (totalZ + zNode.valor <= colX.valor + 0.5) {
            validZ.push(zNode);
            totalZ += zNode.valor;
          }
        }
      }
      if (validZ.length < yNode.filhos.length) {
        const removedZ = yNode.filhos.filter((z) => !validZ.includes(z));
        for (const rz of removedZ) {
          placedArea -= calculateZArea(rz, yNode.valor);
        }
        yNode.filhos = validZ;
        console.warn(`[CNC-ENGINE] Z overflow in Y strip: clamped to ${totalZ.toFixed(0)}mm / ${colX.valor}mm`);
      }

      // --- CLAMP W heights: ensure sum of W values doesn't exceed Y strip height ---
      for (const zNode of yNode.filhos) {
        let totalW = 0;
        const validW: TreeNode[] = [];
        for (const wNode of zNode.filhos) {
          const wHeight = wNode.valor * wNode.multi;
          if (totalW + wHeight <= yNode.valor + 0.5) {
            validW.push(wNode);
            totalW += wHeight;
          } else {
            if (wNode.multi > 1) {
              const canFit = Math.floor((yNode.valor - totalW) / wNode.valor);
              if (canFit > 0) {
                wNode.multi = canFit;
                validW.push(wNode);
                totalW += wNode.valor * canFit;
              }
            } else if (totalW + wNode.valor <= yNode.valor + 0.5) {
              validW.push(wNode);
              totalW += wNode.valor;
            }
          }
        }
        if (validW.length < zNode.filhos.length) {
          const removedW = zNode.filhos.filter((w) => !validW.includes(w));
          for (const rw of removedW) {
            placedArea -= calculateWArea(rw, zNode.valor);
          }
          zNode.filhos = validW;
          console.warn(`[CNC-ENGINE] W overflow in Z node: clamped to ${totalW.toFixed(0)}mm / ${yNode.valor}mm`);
        }

        // --- CLAMP Q widths: ensure sum of Q values doesn't exceed Z width ---
        for (const wNode of zNode.filhos) {
          let totalQ = 0;
          const validQ: TreeNode[] = [];
          for (const qNode of wNode.filhos) {
            const qWidth = qNode.valor * qNode.multi;
            if (totalQ + qWidth <= zNode.valor + 0.5) {
              validQ.push(qNode);
              totalQ += qWidth;
            } else {
              if (qNode.multi > 1) {
                const canFit = Math.floor((zNode.valor - totalQ) / qNode.valor);
                if (canFit > 0) {
                  qNode.multi = canFit;
                  validQ.push(qNode);
                  totalQ += qNode.valor * canFit;
                }
              } else if (totalQ + qNode.valor <= zNode.valor + 0.5) {
                validQ.push(qNode);
                totalQ += qNode.valor;
              }
            }
          }
          if (validQ.length < wNode.filhos.length) {
            const removedQ = wNode.filhos.filter((q) => !validQ.includes(q));
            for (const rq of removedQ) {
              placedArea -= rq.valor * wNode.valor * rq.multi;
            }
            wNode.filhos = validQ;
            console.warn(`[CNC-ENGINE] Q overflow in W node: clamped to ${totalQ.toFixed(0)}mm / ${zNode.valor}mm`);
          }
        }
      }
    }
  }

  return placedArea;
}

/** Calculate area of a Z subtree (Z.valor × parent Y height for leaves, or sum of W children) */
function calculateZArea(zNode: TreeNode, yHeight: number): number {
  if (zNode.filhos.length === 0) return zNode.valor * yHeight * zNode.multi;
  let area = 0;
  for (const w of zNode.filhos) {
    if (w.filhos.length === 0) {
      area += zNode.valor * w.valor * w.multi;
    } else {
      for (const q of w.filhos) {
        area += q.valor * w.valor * q.multi;
      }
    }
  }
  return area * zNode.multi;
}

/** Calculate area of a W subtree */
function calculateWArea(wNode: TreeNode, zWidth: number): number {
  if (wNode.filhos.length === 0) return zWidth * wNode.valor * wNode.multi;
  let area = 0;
  for (const q of wNode.filhos) {
    area += q.valor * wNode.valor * q.multi;
  }
  return area * wNode.multi;
}

/**
 * Recursively calculate the area of pieces in a subtree.
 */
function calculateNodeArea(node: TreeNode): number {
  if (node.filhos.length === 0) {
    // Leaf node - this is a piece
    return node.valor * node.multi;
  }
  let area = 0;
  for (const child of node.filhos) {
    area += calculateNodeArea(child) * node.multi;
  }
  return area;
}

// ========== POST-OPTIMIZATION REGROUPING ANALYSIS ==========

/**
 * Extrai todas as peças posicionadas de uma árvore de corte,
 * retornando suas dimensões reais (considerando transposição).
 */
function extractPlacedPieces(
  tree: TreeNode,
): Array<{ w: number; h: number; label?: string; colIndex: number; yIndex: number }> {
  const pieces: Array<{ w: number; h: number; label?: string; colIndex: number; yIndex: number }> = [];
  const T = tree.transposed || false;

  tree.filhos.forEach((colX, ci) => {
    colX.filhos.forEach((yNode, yi) => {
      for (const zNode of yNode.filhos) {
        if (zNode.filhos.length === 0) {
          // Z leaf: piece is zNode.valor × yNode.valor
          const pw = T ? yNode.valor : zNode.valor;
          const ph = T ? zNode.valor : yNode.valor;
          pieces.push({ w: pw, h: ph, label: zNode.label, colIndex: ci, yIndex: yi });
        } else {
          for (const wNode of zNode.filhos) {
            if (wNode.filhos.length === 0) {
              const pw = T ? wNode.valor : zNode.valor;
              const ph = T ? zNode.valor : wNode.valor;
              pieces.push({ w: pw, h: ph, label: wNode.label, colIndex: ci, yIndex: yi });
            } else {
              for (const qNode of wNode.filhos) {
                const pw = T ? wNode.valor : qNode.valor;
                const ph = T ? qNode.valor : wNode.valor;
                pieces.push({ w: pw, h: ph, label: qNode.label, colIndex: ci, yIndex: yi });
              }
            }
          }
        }
      }
    });
  });

  return pieces;
}

/**
 * PÓS-ANÁLISE AUTOMÁTICA: Analisa o layout gerado e identifica oportunidades
 * de reagrupamento que o pré-agrupamento não conseguiu detectar.
 *
 * Processo:
 * 1. Extrai todas as peças posicionadas da árvore
 * 2. Identifica peças em colunas DIFERENTES que compartilham a mesma altura
 * 3. Cria agrupamentos forçados juntando essas peças
 * 4. Re-executa a otimização com os agrupamentos forçados
 * 5. Retorna o melhor resultado (original ou reagrupado)
 *
 * Exemplo da imagem do usuário:
 * - Coluna 1: peça 1014×530
 * - Coluna 2: peça com mesma altura 530
 * → Agrupa em 1014+X × 530, liberando espaço vertical para peças maiores
 */
function postOptimizeRegroup(
  originalTree: TreeNode,
  originalArea: number,
  allPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
): { tree: TreeNode; area: number; improved: boolean } {
  const placedPieces = extractPlacedPieces(originalTree);

  // Identifica peças em colunas diferentes com mesma altura
  // Agrupa por altura (menor dimensão)
  const heightMap = new Map<number, typeof placedPieces>();
  for (const p of placedPieces) {
    const h = Math.min(p.w, p.h);
    if (!heightMap.has(h)) heightMap.set(h, []);
    heightMap.get(h)!.push(p);
  }

  // Encontra oportunidades: peças de mesma altura em colunas diferentes
  const regroupOpportunities: Array<{ height: number; pieces: typeof placedPieces }> = [];
  for (const [h, group] of heightMap) {
    // Verifica se há peças em colunas diferentes
    const cols = new Set(group.map((p) => p.colIndex));
    if (cols.size > 1 && group.length >= 2) {
      // Verifica se a soma das larguras caberia na chapa
      const totalW = group.reduce((sum, p) => sum + Math.max(p.w, p.h), 0);
      if (totalW <= usableW) {
        regroupOpportunities.push({ height: h, pieces: group });
      }
    }
  }

  if (regroupOpportunities.length === 0) {
    return { tree: originalTree, area: originalArea, improved: false };
  }

  console.log(
    `[CNC-ENGINE] Pós-análise: ${regroupOpportunities.length} oportunidade(s) de reagrupamento encontrada(s)`,
  );
  for (const opp of regroupOpportunities) {
    console.log(
      `  → Altura ${opp.height}mm: ${opp.pieces.length} peças em ${new Set(opp.pieces.map((p) => p.colIndex)).size} colunas diferentes`,
    );
  }

  // Para cada oportunidade, cria um agrupamento forçado e re-otimiza
  let bestTree = originalTree;
  let bestArea = originalArea;
  let improved = false;

  // Estratégia: criar variantes de peças com agrupamentos forçados
  for (const opp of regroupOpportunities) {
    // Cria uma cópia das peças originais
    const forcedPieces: Piece[] = [];
    const usedLabels = new Set<string>();

    // Cria o grupo forçado
    const groupLabels: string[] = [];
    let sumW = 0;
    for (const p of opp.pieces) {
      const w = Math.max(p.w, p.h);
      sumW += w;
      if (p.label) {
        groupLabels.push(p.label);
        usedLabels.add(p.label);
      }
    }

    // Adiciona o grupo forçado como primeira peça (prioridade)
    forcedPieces.unshift({
      w: sumW,
      h: opp.height,
      area: sumW * opp.height,
      count: opp.pieces.length,
      labels: groupLabels.length > 0 ? groupLabels : undefined,
      groupedAxis: "w",
    });

    // Adiciona as demais peças (não agrupadas)
    for (const p of allPieces) {
      if (p.label && usedLabels.has(p.label)) continue;
      forcedPieces.push({ ...p });
    }

    // Re-otimiza com as peças reagrupadas
    const strategies = getSortStrategies();
    for (const transposed of [false, true]) {
      const eW = transposed ? usableH : usableW;
      const eH = transposed ? usableW : usableH;

      for (const sortFn of strategies) {
        // Mantém o grupo forçado no início, ordena o resto
        const grouped = forcedPieces.slice(0, 1);
        const rest = [...forcedPieces.slice(1)].sort(sortFn);
        const sorted = [...grouped, ...rest];

        const result = runPlacement(sorted, eW, eH, minBreak);
        if (result.area > bestArea) {
          bestArea = result.area;
          bestTree = result.tree;
          if (transposed) {
            bestTree.transposed = true;
            bestTree = normalizeTree(bestTree, usableW, usableH);
          }
          improved = true;
          console.log(
            `[CNC-ENGINE] Pós-análise: Reagrupamento melhorou! ${((originalArea / (usableW * usableH)) * 100).toFixed(1)}% → ${((bestArea / (usableW * usableH)) * 100).toFixed(1)}%`,
          );
        }
      }
    }
  }

  // Tenta também combinar MÚLTIPLAS oportunidades simultaneamente
  if (regroupOpportunities.length >= 2) {
    const forcedPieces: Piece[] = [];
    const usedLabels = new Set<string>();

    for (const opp of regroupOpportunities) {
      const groupLabels: string[] = [];
      let sumW = 0;
      for (const p of opp.pieces) {
        sumW += Math.max(p.w, p.h);
        if (p.label) {
          groupLabels.push(p.label);
          usedLabels.add(p.label);
        }
      }
      if (sumW <= usableW) {
        forcedPieces.push({
          w: sumW,
          h: opp.height,
          area: sumW * opp.height,
          count: opp.pieces.length,
          labels: groupLabels.length > 0 ? groupLabels : undefined,
          groupedAxis: "w",
        });
      }
    }

    for (const p of allPieces) {
      if (p.label && usedLabels.has(p.label)) continue;
      forcedPieces.push({ ...p });
    }

    const strategies = getSortStrategies();
    for (const transposed of [false, true]) {
      const eW = transposed ? usableH : usableW;
      const eH = transposed ? usableW : usableH;
      for (const sortFn of strategies) {
        const grouped = forcedPieces.filter((p) => (p.count || 1) > 1);
        const rest = forcedPieces.filter((p) => (p.count || 1) <= 1).sort(sortFn);
        const sorted = [...grouped, ...rest];
        const result = runPlacement(sorted, eW, eH, minBreak);
        if (result.area > bestArea) {
          bestArea = result.area;
          bestTree = result.tree;
          if (transposed) {
            bestTree.transposed = true;
            bestTree = normalizeTree(bestTree, usableW, usableH);
          }
          improved = true;
          console.log(
            `[CNC-ENGINE] Pós-análise combinada melhorou! → ${((bestArea / (usableW * usableH)) * 100).toFixed(1)}%`,
          );
        }
      }
    }
  }

  return { tree: bestTree, area: bestArea, improved };
}

// ========== CANONICAL TREE NORMALIZATION ==========

/**
 * Rect in absolute physical coordinates (origin at bottom-left of usable area).
 */
interface AbsRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

/**
 * Extract absolute rectangles from a tree, converting transposed coordinates
 * back to physical space.
 */
function extractAbsoluteRects(tree: TreeNode, usableW: number, usableH: number): AbsRect[] {
  const rects: AbsRect[] = [];
  const T = tree.transposed || false;

  let xOff = 0;
  for (const colX of tree.filhos) {
    for (let ix = 0; ix < colX.multi; ix++) {
      let yOff = 0;
      for (const yNode of colX.filhos) {
        for (let iy = 0; iy < yNode.multi; iy++) {
          let zOff = 0;
          for (const zNode of yNode.filhos) {
            for (let iz = 0; iz < zNode.multi; iz++) {
              if (zNode.filhos.length === 0) {
                // Z leaf: piece occupies zNode.valor × yNode.valor
                if (T) {
                  rects.push({ x: yOff, y: xOff, w: yNode.valor, h: zNode.valor, label: zNode.label });
                } else {
                  rects.push({ x: xOff + zOff, y: yOff, w: zNode.valor, h: yNode.valor, label: zNode.label });
                }
              } else {
                let wOff = 0;
                for (const wNode of zNode.filhos) {
                  for (let iw = 0; iw < wNode.multi; iw++) {
                    if (wNode.filhos.length === 0) {
                      if (T) {
                        rects.push({ x: yOff + wOff, y: xOff + zOff, w: wNode.valor, h: zNode.valor, label: wNode.label });
                      } else {
                        rects.push({ x: xOff + zOff, y: yOff + wOff, w: zNode.valor, h: wNode.valor, label: wNode.label });
                      }
                    } else {
                      let qOff = 0;
                      for (const qNode of wNode.filhos) {
                        for (let iq = 0; iq < qNode.multi; iq++) {
                          if (T) {
                            rects.push({ x: yOff + wOff, y: xOff + zOff + qOff, w: wNode.valor, h: qNode.valor, label: qNode.label });
                          } else {
                            rects.push({ x: xOff + zOff + qOff, y: yOff + wOff, w: qNode.valor, h: wNode.valor, label: qNode.label });
                          }
                          qOff += qNode.valor;
                        }
                      }
                    }
                    wOff += wNode.valor;
                  }
                }
              }
              zOff += zNode.valor;
            }
          }
          yOff += yNode.valor;
        }
      }
      xOff += colX.valor;
    }
  }

  return rects;
}

/**
 * Find vertical guillotine cuts in a set of rectangles within a bounding box.
 * Returns sorted unique x-coordinates where cuts can be made, splitting all rects cleanly.
 */
function findVerticalCuts(rects: AbsRect[], bx: number, by: number, bw: number, bh: number): number[] {
  // Collect all unique x-edges (relative to bx)
  const edges = new Set<number>();
  for (const r of rects) {
    const left = r.x - bx;
    const right = r.x + r.w - bx;
    if (left > 0.5 && left < bw - 0.5) edges.add(Math.round(left));
    if (right > 0.5 && right < bw - 0.5) edges.add(Math.round(right));
  }

  // A valid cut at position cx means no rectangle straddles it
  const validCuts: number[] = [];
  for (const cx of [...edges].sort((a, b) => a - b)) {
    const absCx = bx + cx;
    const straddles = rects.some(r => r.x < absCx - 0.5 && r.x + r.w > absCx + 0.5);
    if (!straddles) validCuts.push(cx);
  }

  return validCuts;
}

/**
 * Find horizontal guillotine cuts in a set of rectangles within a bounding box.
 */
function findHorizontalCuts(rects: AbsRect[], bx: number, by: number, bw: number, bh: number): number[] {
  const edges = new Set<number>();
  for (const r of rects) {
    const bottom = r.y - by;
    const top = r.y + r.h - by;
    if (bottom > 0.5 && bottom < bh - 0.5) edges.add(Math.round(bottom));
    if (top > 0.5 && top < bh - 0.5) edges.add(Math.round(top));
  }

  const validCuts: number[] = [];
  for (const cy of [...edges].sort((a, b) => a - b)) {
    const absCy = by + cy;
    const straddles = rects.some(r => r.y < absCy - 0.5 && r.y + r.h > absCy + 0.5);
    if (!straddles) validCuts.push(cy);
  }

  return validCuts;
}

/**
 * Filter rects that intersect a bounding box.
 */
function rectsInBounds(rects: AbsRect[], bx: number, by: number, bw: number, bh: number): AbsRect[] {
  return rects.filter(r =>
    r.x >= bx - 0.5 && r.x + r.w <= bx + bw + 0.5 &&
    r.y >= by - 0.5 && r.y + r.h <= by + bh + 0.5
  );
}

/**
 * Build canonical tree from absolute rectangles following strict cut hierarchy:
 * - Level 0 (ROOT→X): vertical cuts → X children (width segments)
 * - Level 1 (X→Y): horizontal cuts → Y children (height segments)
 * - Level 2 (Y→Z): vertical cuts → Z children (width segments)
 * - Level 3 (Z→W): horizontal cuts → W children (height segments)
 * - Level 4 (W→Q): vertical cuts → Q children (width segments)
 */
function buildCanonicalTree(rects: AbsRect[], usableW: number, usableH: number): TreeNode {
  const root: TreeNode = { id: 'root', tipo: 'ROOT', valor: usableW, multi: 1, filhos: [] };

  if (rects.length === 0) return root;

  // Recursive subdivision following the hierarchy
  type Level = 'X' | 'Y' | 'Z' | 'W' | 'Q';
  const levelSequence: Level[] = ['X', 'Y', 'Z', 'W', 'Q'];
  // X=vertical, Y=horizontal, Z=vertical, W=horizontal, Q=vertical
  const isVertical = (level: Level) => level === 'X' || level === 'Z' || level === 'Q';

  function subdivide(
    parentNode: TreeNode,
    levelIdx: number,
    subRects: AbsRect[],
    bx: number, by: number, bw: number, bh: number,
  ): void {
    if (subRects.length === 0 || levelIdx >= levelSequence.length) return;

    const level = levelSequence[levelIdx];
    const vertical = isVertical(level);

    // Find cuts at this level
    const cuts = vertical
      ? findVerticalCuts(subRects, bx, by, bw, bh)
      : findHorizontalCuts(subRects, bx, by, bw, bh);

    if (cuts.length === 0) {
      // No cuts at this level — either it's a single piece or we need to go deeper
      if (subRects.length === 1) {
        // Single piece — create leaf node
        const r = subRects[0];
        if (vertical) {
          // This level is vertical → node.valor = width
          const node: TreeNode = { id: gid(), tipo: level, valor: Math.round(r.w), multi: 1, filhos: [], label: r.label };
          parentNode.filhos.push(node);
          // If there are more levels, the next level handles height
          if (levelIdx + 1 < levelSequence.length) {
            const nextLevel = levelSequence[levelIdx + 1];
            const hNode: TreeNode = { id: gid(), tipo: nextLevel, valor: Math.round(r.h), multi: 1, filhos: [], label: r.label };
            node.filhos.push(hNode);
          }
        } else {
          // This level is horizontal → node.valor = height
          const node: TreeNode = { id: gid(), tipo: level, valor: Math.round(r.h), multi: 1, filhos: [], label: r.label };
          parentNode.filhos.push(node);
          if (levelIdx + 1 < levelSequence.length) {
            const nextLevel = levelSequence[levelIdx + 1];
            const wNode: TreeNode = { id: gid(), tipo: nextLevel, valor: Math.round(r.w), multi: 1, filhos: [], label: r.label };
            node.filhos.push(wNode);
          }
        }
        return;
      }

      // Multiple rects but no valid cut at this level — try next level
      subdivide(parentNode, levelIdx + 1, subRects, bx, by, bw, bh);
      return;
    }

    // Split into segments using cuts
    const boundaries = vertical
      ? [0, ...cuts, Math.round(bw)]
      : [0, ...cuts, Math.round(bh)];

    // Deduplicate and sort boundaries
    const uniqueBounds = [...new Set(boundaries)].sort((a, b) => a - b);

    for (let i = 0; i < uniqueBounds.length - 1; i++) {
      const segStart = uniqueBounds[i];
      const segEnd = uniqueBounds[i + 1];
      const segSize = segEnd - segStart;
      if (segSize < 1) continue;

      let segBx: number, segBy: number, segBw: number, segBh: number;
      if (vertical) {
        segBx = bx + segStart;
        segBy = by;
        segBw = segSize;
        segBh = bh;
      } else {
        segBx = bx;
        segBy = by + segStart;
        segBw = bw;
        segBh = segSize;
      }

      const segRects = rectsInBounds(subRects, segBx, segBy, segBw, segBh);

      if (segRects.length === 0) continue; // waste area, skip

      // Create node for this segment
      const nodeValor = vertical ? segBw : segBh;
      const node: TreeNode = { id: gid(), tipo: level, valor: Math.round(nodeValor), multi: 1, filhos: [] };

      // If single rect filling the whole segment, it's a leaf
      if (segRects.length === 1) {
        const r = segRects[0];
        const fillsW = Math.abs(r.w - segBw) < 1;
        const fillsH = Math.abs(r.h - segBh) < 1;

        if (fillsW && fillsH) {
          // Perfect fit — leaf
          node.label = r.label;
          // Still need to create the child for the other dimension
          if (levelIdx + 1 < levelSequence.length) {
            const nextLevel = levelSequence[levelIdx + 1];
            const childValor = vertical ? Math.round(segBh) : Math.round(segBw);
            const child: TreeNode = { id: gid(), tipo: nextLevel, valor: childValor, multi: 1, filhos: [], label: r.label };
            node.filhos.push(child);
          }
          parentNode.filhos.push(node);
          continue;
        }
      }

      // Recurse into next level
      subdivide(node, levelIdx + 1, segRects, segBx, segBy, segBw, segBh);
      parentNode.filhos.push(node);
    }
  }

  subdivide(root, 0, rects, 0, 0, usableW, usableH);
  return root;
}

/**
 * Bottom-up compression: merge adjacent siblings with identical structure into multi.
 */
function compressMulti(node: TreeNode): void {
  // First, recurse into children
  for (const child of node.filhos) {
    compressMulti(child);
  }

  // Then merge identical adjacent siblings
  if (node.filhos.length < 2) return;

  const compressed: TreeNode[] = [];
  for (const child of node.filhos) {
    if (compressed.length > 0) {
      const last = compressed[compressed.length - 1];
      if (nodesStructurallyEqual(last, child)) {
        last.multi += child.multi;
        continue;
      }
    }
    compressed.push(child);
  }
  node.filhos = compressed;
}

/**
 * Check if two nodes have the same structure (ignoring id and multi).
 */
function nodesStructurallyEqual(a: TreeNode, b: TreeNode): boolean {
  if (a.tipo !== b.tipo || Math.abs(a.valor - b.valor) > 0.5) return false;
  if (a.filhos.length !== b.filhos.length) return false;
  for (let i = 0; i < a.filhos.length; i++) {
    if (!nodesStructurallyEqual(a.filhos[i], b.filhos[i])) return false;
  }
  return true;
}

/**
 * MAIN NORMALIZATION ENTRY POINT
 *
 * Takes any tree (potentially transposed) and rebuilds it from scratch
 * following the canonical cut hierarchy:
 * - X, Z, Q = vertical cuts (valor = width)
 * - Y, W = horizontal cuts (valor = height)
 *
 * Steps:
 * 1. Extract absolute physical rectangles from the tree
 * 2. Rebuild the tree using guillotine cut detection
 * 3. Compress identical siblings into multi
 * 4. Remove transposed flag (tree is now canonical)
 */
export function normalizeTree(tree: TreeNode, usableW: number, usableH: number): TreeNode {
  // Extract physical rectangles
  const rects = extractAbsoluteRects(tree, usableW, usableH);

  if (rects.length === 0) return tree;

  // Rebuild canonical tree
  const canonical = buildCanonicalTree(rects, usableW, usableH);

  // Compress multi
  compressMulti(canonical);

  // Transfer labels from original rects
  // (already done during buildCanonicalTree)

  // Remove transposed flag — tree is now in canonical form
  canonical.transposed = false;

  return canonical;
}
