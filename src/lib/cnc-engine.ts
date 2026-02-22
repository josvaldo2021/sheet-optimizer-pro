// CNC Cut Plan Engine - Optimized v7
// Performance + Yield improvements
export type NodeType = 'ROOT' | 'X' | 'Y' | 'Z' | 'W' | 'Q';

export interface TreeNode {
  id: string;
  tipo: NodeType;
  valor: number;
  multi: number;
  filhos: TreeNode[];
  label?: string;
}

export interface Piece {
  w: number;
  h: number;
  area: number;
  count?: number;
  label?: string;
  labels?: string[];
  individualDims?: number[];
  groupedAxis?: 'w' | 'h';
}

export interface PieceItem {
  id: string;
  qty: number;
  w: number;
  h: number;
  label?: string;
}

// Annotate tree leaf nodes with labels from the original pieces inventory
export function annotateTreeLabels(tree: TreeNode, pieces: PieceItem[]): void {
  const pool: Array<{ w: number; h: number; label: string }> = [];
  pieces.forEach(p => {
    if (p.label) {
      for (let i = 0; i < p.qty; i++) {
        pool.push({ w: p.w, h: p.h, label: p.label });
      }
    }
  });

  if (pool.length === 0) return;

  function walk(n: TreeNode, parents: TreeNode[]) {
    const yAncestor = [...parents].reverse().find(p => p.tipo === 'Y');
    const zAncestor = [...parents].reverse().find(p => p.tipo === 'Z');
    const wAncestor = [...parents].reverse().find(p => p.tipo === 'W');

    let pieceW = 0, pieceH = 0;
    let isLeaf = false;

    if (n.tipo === 'Z' && n.filhos.length === 0) {
      pieceW = n.valor;
      pieceH = yAncestor?.valor || 0;
      isLeaf = true;
    } else if (n.tipo === 'W' && n.filhos.length === 0) {
      pieceW = zAncestor?.valor || 0;
      pieceH = n.valor;
      isLeaf = true;
    } else if (n.tipo === 'Q') {
      pieceW = n.valor;
      pieceH = wAncestor?.valor || 0;
      isLeaf = true;
    }

    if (isLeaf && pieceW > 0 && pieceH > 0) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if ((Math.round(p.w) === Math.round(pieceW) && Math.round(p.h) === Math.round(pieceH)) ||
          (Math.round(p.w) === Math.round(pieceH) && Math.round(p.h) === Math.round(pieceW))) {
          n.label = p.label;
          pool.splice(i, 1);
          break;
        }
      }
    }

    n.filhos.forEach(f => walk(f, [...parents, n]));
  }

  walk(tree, []);
}

let _c = 0;
function gid(): string {
  return `n${++_c}_${Math.random().toString(36).substr(2, 4)}`;
}

export function createRoot(w: number, h: number): TreeNode {
  return { id: 'root', tipo: 'ROOT', valor: w, multi: 1, filhos: [] };
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

  if (tipo === 'X') {
    tree.filhos.push(node);
  } else if (tipo === 'Y') {
    const p = target?.tipo === 'X' ? target : findParentOfType(tree, selectedId, 'X');
    if (p) p.filhos.push(node);
  } else if (tipo === 'Z') {
    const p = target?.tipo === 'Y' ? target : findParentOfType(tree, selectedId, 'Y');
    if (p) p.filhos.push(node);
  } else if (tipo === 'W') {
    const p = target?.tipo === 'Z' ? target : findParentOfType(tree, selectedId, 'Z');
    if (p) p.filhos.push(node);
  } else if (tipo === 'Q') {
    const p = target?.tipo === 'W' ? target : findParentOfType(tree, selectedId, 'W');
    if (p) p.filhos.push(node);
  }

  return node.id;
}

export function deleteNode(tree: TreeNode, id: string): void {
  const rm = (n: TreeNode) => {
    n.filhos = n.filhos.filter(f => f.id !== id);
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
  minBreak: number = 0
): { allocated: number; error?: string } {
  const target = findNode(tree, selectedId);
  let free = 0;

  if (tipo === 'X') {
    free = usableW - tree.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === 'Y') {
    const xP = target?.tipo === 'X' ? target : findParentOfType(tree, selectedId, 'X');
    if (!xP) return { allocated: 0, error: 'Selecione X' };
    free = usableH - xP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === 'Z') {
    const yP = target?.tipo === 'Y' ? target : findParentOfType(tree, selectedId, 'Y');
    if (!yP) return { allocated: 0, error: 'Selecione Y' };
    const xP = findParentOfType(tree, yP.id, 'X');
    if (!xP) return { allocated: 0, error: 'Selecione Y' };
    free = xP.valor - yP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  } else if (tipo === 'W') {
    const zP = target?.tipo === 'Z' ? target : findParentOfType(tree, selectedId, 'Z');
    if (!zP) return { allocated: 0, error: 'Selecione Z' };
    const yP = findParentOfType(tree, zP.id, 'Y');
    if (!yP) return { allocated: 0, error: 'Selecione Z' };
    free = yP.valor - zP.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
  } else if (tipo === 'Q') {
    const wP = target?.tipo === 'W' ? target : findParentOfType(tree, selectedId, 'W');
    if (!wP) return { allocated: 0, error: 'Selecione W' };
    const zP = findParentOfType(tree, wP.id, 'Z');
    if (!zP) return { allocated: 0, error: 'Selecione Z' };
    const occupiedQ = wP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
    free = zP.valor - occupiedQ;
  }

  const alloc = Math.min(multi, Math.floor(free / valor));
  if (alloc <= 0) return { allocated: 0, error: 'Sem espaço' };

  if (minBreak > 0) {
    let siblings: TreeNode[] = [];
    if (tipo === 'X') {
      siblings = tree.filhos;
    } else if (tipo === 'Y') {
      const xP = target?.tipo === 'X' ? target : findParentOfType(tree, selectedId, 'X');
      if (xP) siblings = xP.filhos;
    } else if (tipo === 'Z') {
      const yP = target?.tipo === 'Y' ? target : findParentOfType(tree, selectedId, 'Y');
      if (yP) siblings = yP.filhos;
    } else if (tipo === 'W') {
      const zP = target?.tipo === 'Z' ? target : findParentOfType(tree, selectedId, 'Z');
      if (zP) siblings = zP.filhos;
    } else if (tipo === 'Q') {
      const wP = target?.tipo === 'W' ? target : findParentOfType(tree, selectedId, 'W');
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

// ========== GROUPING ALGORITHMS ==========

function groupPiecesByHeightFuzzy(pieces: Piece[], tolerance: number, maxWidth: number): Piece[] {
  if (pieces.length === 0) return [];

  const items = pieces.map((p, idx) => ({
    idx,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
    label: p.label,
  })).sort((a, b) => a.nh - b.nh);

  const used = new Set<number>();
  const result: Piece[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const baseH = items[i].nh;
    const compatible: number[] = [];
    for (let j = i; j < items.length; j++) {
      if (used.has(j)) continue;
      if (items[j].nh - baseH <= tolerance) {
        compatible.push(j);
      } else {
        break;
      }
    }

    if (compatible.length < 2) {
      used.add(i);
      result.push({ w: items[i].nw, h: items[i].nh, area: items[i].nw * items[i].nh, count: 1, label: items[i].label });
      continue;
    }

    const sorted = [...compatible].sort((a, b) => items[b].nw - items[a].nw);

    while (sorted.length >= 2) {
      const group: number[] = [];
      let totalW = 0;

      for (let k = 0; k < sorted.length; k++) {
        const idx = sorted[k];
        if (totalW + items[idx].nw <= maxWidth) {
          group.push(idx);
          totalW += items[idx].nw;
        }
      }

      if (group.length >= 2) {
        const maxH = Math.max(...group.map(idx => items[idx].nh));
        const individualDims = group.map(idx => items[idx].nw);
        const groupedLabels = group.map(idx => items[idx].label).filter(Boolean) as string[];

        group.forEach(idx => {
          used.add(idx);
          const si = sorted.indexOf(idx);
          if (si >= 0) sorted.splice(si, 1);
        });

        result.push({
          w: totalW, h: maxH, area: totalW * maxH, count: group.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: 'w', individualDims,
        });
      } else {
        break;
      }
    }

    for (const idx of sorted) {
      if (!used.has(idx)) {
        used.add(idx);
        result.push({ w: items[idx].nw, h: items[idx].nh, area: items[idx].nw * items[idx].nh, count: 1, label: items[idx].label });
      }
    }
  }

  return result;
}

function groupPiecesByWidthFuzzy(pieces: Piece[], tolerance: number, maxHeight: number): Piece[] {
  if (pieces.length === 0) return [];

  const items = pieces.map((p, idx) => ({
    idx,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
    label: p.label,
  })).sort((a, b) => a.nw - b.nw);

  const used = new Set<number>();
  const result: Piece[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const baseW = items[i].nw;
    const compatible: number[] = [];
    for (let j = i; j < items.length; j++) {
      if (used.has(j)) continue;
      if (items[j].nw - baseW <= tolerance) {
        compatible.push(j);
      } else {
        break;
      }
    }

    if (compatible.length < 2) {
      used.add(i);
      result.push({ w: items[i].nw, h: items[i].nh, area: items[i].nw * items[i].nh, count: 1, label: items[i].label });
      continue;
    }

    const sorted = [...compatible].sort((a, b) => items[b].nh - items[a].nh);

    while (sorted.length >= 2) {
      const group: number[] = [];
      let totalH = 0;

      for (let k = 0; k < sorted.length; k++) {
        const idx = sorted[k];
        if (totalH + items[idx].nh <= maxHeight) {
          group.push(idx);
          totalH += items[idx].nh;
        }
      }

      if (group.length >= 2) {
        const maxW = Math.max(...group.map(idx => items[idx].nw));
        const individualDims = group.map(idx => items[idx].nh);
        const groupedLabels = group.map(idx => items[idx].label).filter(Boolean) as string[];

        group.forEach(idx => {
          used.add(idx);
          const si = sorted.indexOf(idx);
          if (si >= 0) sorted.splice(si, 1);
        });

        result.push({
          w: maxW, h: totalH, area: maxW * totalH, count: group.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: 'h', individualDims,
        });
      } else {
        break;
      }
    }

    for (const idx of sorted) {
      if (!used.has(idx)) {
        used.add(idx);
        result.push({ w: items[idx].nw, h: items[idx].nh, area: items[idx].nw * items[idx].nh, count: 1, label: items[idx].label });
      }
    }
  }

  return result;
}

// Backward-compatible wrappers
function groupPiecesByHeight(pieces: Piece[]): Piece[] {
  return groupPiecesByHeightFuzzy(pieces, 0, Infinity);
}

function groupPiecesByWidth(pieces: Piece[]): Piece[] {
  return groupPiecesByWidthFuzzy(pieces, 0, Infinity);
}

function groupFillRow(pieces: Piece[], targetWidth: number, tolerance: number = 30): Piece[] {
  if (pieces.length === 0) return [];

  const items = pieces.map((p, idx) => ({
    idx,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
    label: p.label,
  })).sort((a, b) => a.nh - b.nh);

  const used = new Set<number>();
  const result: Piece[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const baseH = items[i].nh;
    const compatible: number[] = [];
    for (let j = i; j < items.length; j++) {
      if (used.has(j)) continue;
      if (items[j].nh - baseH <= tolerance) {
        compatible.push(j);
      }
    }

    if (compatible.length < 2) {
      used.add(i);
      result.push({ w: items[i].nw, h: items[i].nh, area: items[i].nw * items[i].nh, count: 1, label: items[i].label });
      continue;
    }

    const byWidth = [...compatible].sort((a, b) => items[b].nw - items[a].nw);

    while (byWidth.length >= 2) {
      const row: number[] = [];
      let rowW = 0;

      for (let k = 0; k < byWidth.length; k++) {
        const idx = byWidth[k];
        if (rowW + items[idx].nw <= targetWidth) {
          row.push(idx);
          rowW += items[idx].nw;
        }
      }

      if (row.length >= 2) {
        const maxH = Math.max(...row.map(idx => items[idx].nh));
        const individualDims = row.map(idx => items[idx].nw);
        const groupedLabels = row.map(idx => items[idx].label).filter(Boolean) as string[];

        row.forEach(idx => {
          used.add(idx);
          const si = byWidth.indexOf(idx);
          if (si >= 0) byWidth.splice(si, 1);
        });

        result.push({
          w: rowW, h: maxH, area: rowW * maxH, count: row.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: 'w', individualDims,
        });
      } else {
        break;
      }
    }

    for (const idx of byWidth) {
      if (!used.has(idx)) {
        used.add(idx);
        result.push({ w: items[idx].nw, h: items[idx].nh, area: items[idx].nw * items[idx].nh, count: 1, label: items[idx].label });
      }
    }
  }

  return result;
}

function groupFillCol(pieces: Piece[], targetHeight: number, tolerance: number = 30): Piece[] {
  if (pieces.length === 0) return [];

  const items = pieces.map((p, idx) => ({
    idx,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
    label: p.label,
  })).sort((a, b) => a.nw - b.nw);

  const used = new Set<number>();
  const result: Piece[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const baseW = items[i].nw;
    const compatible: number[] = [];
    for (let j = i; j < items.length; j++) {
      if (used.has(j)) continue;
      if (items[j].nw - baseW <= tolerance) {
        compatible.push(j);
      }
    }

    if (compatible.length < 2) {
      used.add(i);
      result.push({ w: items[i].nw, h: items[i].nh, area: items[i].nw * items[i].nh, count: 1, label: items[i].label });
      continue;
    }

    const byHeight = [...compatible].sort((a, b) => items[b].nh - items[a].nh);

    while (byHeight.length >= 2) {
      const col: number[] = [];
      let colH = 0;

      for (let k = 0; k < byHeight.length; k++) {
        const idx = byHeight[k];
        if (colH + items[idx].nh <= targetHeight) {
          col.push(idx);
          colH += items[idx].nh;
        }
      }

      if (col.length >= 2) {
        const maxW = Math.max(...col.map(idx => items[idx].nw));
        const individualDims = col.map(idx => items[idx].nh);
        const groupedLabels = col.map(idx => items[idx].label).filter(Boolean) as string[];

        col.forEach(idx => {
          used.add(idx);
          const si = byHeight.indexOf(idx);
          if (si >= 0) byHeight.splice(si, 1);
        });

        result.push({
          w: maxW, h: colH, area: maxW * colH, count: col.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: 'h', individualDims,
        });
      } else {
        break;
      }
    }

    for (const idx of byHeight) {
      if (!used.has(idx)) {
        used.add(idx);
        result.push({ w: items[idx].nw, h: items[idx].nh, area: items[idx].nw * items[idx].nh, count: 1, label: items[idx].label });
      }
    }
  }

  return result;
}

function oris(p: Piece): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [{ w: p.w, h: p.h }, { w: p.h, h: p.w }];
}

// ========== SCORING - BEST AREA FIT ==========

/** Lightweight score: penalizes unusable waste, checks only top-3 remaining pieces */
function scoreFit(
  spaceW: number,
  spaceH: number,
  pieceW: number,
  pieceH: number,
  remaining: Piece[],
  _startIdx: number = 0
): number {
  const wasteW = spaceW - pieceW;
  const wasteH = spaceH - pieceH;

  // Perfect fit shortcut - score of -Infinity handled at call site
  if (wasteW === 0 && wasteH === 0) return -1e9;

  // Base: total wasted area
  let score = wasteW * spaceH + wasteH * pieceW;

  // Shortest-axis split heuristic: prefer splits that keep remainder "squarer"
  // Penalize long thin strips heavily
  if (wasteW > 0 && wasteH > 0) {
    const r1 = wasteW * spaceH; // right remainder
    const r2 = pieceW * wasteH; // top remainder
    // Prefer larger remainder to be more square
    const maxR = Math.max(r1, r2);
    const minR = Math.min(r1, r2);
    if (minR > 0) {
      const ratio = maxR / minR;
      score += ratio * 50; // penalize unbalanced splits
    }
  }

  // Lookahead: only check top 3 remaining pieces (O(1) instead of O(N))
  const lookLimit = Math.min(3, remaining.length);
  let wFits = false;
  let hFits = false;

  for (let i = 0; i < lookLimit; i++) {
    const r = remaining[i];
    for (const o of oris(r)) {
      if (!wFits && wasteW >= o.w && spaceH >= o.h) wFits = true;
      if (!hFits && pieceW >= o.w && wasteH >= o.h) hFits = true;
      if (wFits && hFits) break;
    }
    if (wFits && hFits) break;
  }

  // Penalize unusable waste
  if (wasteW > 0 && !wFits) score += wasteW * spaceH * 2;
  if (wasteH > 0 && !hFits) score += wasteH * pieceW * 2;

  // Bonus for exact fits on one axis
  if (wasteW === 0) score -= spaceH * 10;
  if (wasteH === 0) score -= pieceW * 10;

  return score;
}

// ========== RESIDUAL DOMINANCE CHECK (limited lookahead) ==========

function canResidualFitAnyPiece(
  residualW: number,
  residualH: number,
  remainingPieces: Piece[],
  minBreak: number = 0,
  existingSiblingValues: number[] = [],
  axis: 'w' | 'h' = 'w'
): boolean {
  if (residualW <= 0 || residualH <= 0) return false;
  // Only check top 5 remaining pieces for performance
  const limit = Math.min(5, remainingPieces.length);
  for (let i = 0; i < limit; i++) {
    const p = remainingPieces[i];
    for (const o of oris(p)) {
      if (o.w <= residualW && o.h <= residualH) {
        if (minBreak > 0 && existingSiblingValues.length > 0) {
          const val = axis === 'w' ? o.w : o.h;
          const violates = existingSiblingValues.some(sv => {
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

function getZCutPositions(yStrip: TreeNode): number[] {
  const positions: number[] = [];
  let acc = 0;
  for (const z of yStrip.filhos) {
    acc += z.valor * z.multi;
    positions.push(acc);
  }
  return positions;
}

function getAllZCutPositionsInColumn(colX: TreeNode): number[][] {
  return colX.filhos.map(y => getZCutPositions(y));
}

function violatesZMinBreak(
  newCutPositions: number[],
  allPositions: number[][],
  minBreak: number,
  excludeYIndex: number = -1
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

// ========== VOID FILLING (Flat cache approach) ==========

interface VoidRect {
  parentType: 'Y' | 'Z' | 'W';
  parentNode: TreeNode;
  colX: TreeNode;
  yNode?: TreeNode;
  zNode?: TreeNode;
  maxW: number;
  maxH: number;
}

function collectVoids(tree: TreeNode, usableW: number, usableH: number): VoidRect[] {
  const voids: VoidRect[] = [];

  for (const colX of tree.filhos) {
    const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const freeH = usableH - usedH;
    if (freeH > 0) {
      voids.push({ parentType: 'Y', parentNode: colX, colX, maxW: colX.valor, maxH: freeH });
    }

    for (const yNode of colX.filhos) {
      const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      const freeZ = colX.valor - usedZ;
      if (freeZ > 0) {
        voids.push({ parentType: 'Z', parentNode: yNode, colX, yNode, maxW: freeZ, maxH: yNode.valor });
      }

      for (const zNode of yNode.filhos) {
        const usedW = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        const freeW = yNode.valor - usedW;
        if (freeW > 0) {
          voids.push({ parentType: 'W', parentNode: zNode, colX, yNode, zNode, maxW: zNode.valor, maxH: freeW });
        }
      }
    }
  }

  // Sort voids by area descending - try biggest voids first
  voids.sort((a, b) => (b.maxW * b.maxH) - (a.maxW * a.maxH));
  return voids;
}

function fillVoids(tree: TreeNode, remaining: Piece[], usableW: number, usableH: number, minBreak: number = 0): number {
  let filledArea = 0;
  // Sort remaining by area descending for best packing
  remaining.sort((a, b) => b.area - a.area);

  const voids = collectVoids(tree, usableW, usableH);

  for (const v of voids) {
    if (remaining.length === 0) break;

    for (let i = 0; i < remaining.length; i++) {
      if (v.maxW <= 0 || v.maxH <= 0) break;
      const pc = remaining[i];

      let bestO: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        let fitW: boolean, fitH: boolean;
        if (v.parentType === 'W') {
          // For W voids: o.w fits in zNode width, o.h fits in remaining height
          fitW = o.w <= v.maxW;
          fitH = o.h <= v.maxH;
        } else if (v.parentType === 'Z') {
          fitW = o.w <= v.maxW;
          fitH = o.h <= v.maxH;
        } else {
          fitW = o.w <= v.maxW;
          fitH = o.h <= v.maxH;
        }

        if (!fitW || !fitH) continue;

        if (minBreak > 0) {
          if (v.parentType === 'Y') {
            if (o.h < minBreak) continue;
            const allZPositions = getAllZCutPositionsInColumn(v.colX);
            if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
          } else if (v.parentType === 'Z') {
            const yIndex = v.colX.filhos.indexOf(v.yNode!);
            const allZPositions = getAllZCutPositionsInColumn(v.colX);
            const currentOffset = v.yNode!.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
            if (violatesZMinBreak([currentOffset + o.w], allZPositions, minBreak, yIndex)) continue;
          } else if (v.parentType === 'W') {
            const violates = v.zNode!.filhos.some(w => {
              const diff = Math.abs(w.valor - o.h);
              return diff > 0 && diff < minBreak;
            });
            if (violates) continue;
          }
        }

        // Perfect fit early return
        if (o.w === v.maxW && o.h === v.maxH) {
          bestO = o;
          bestScore = -1e9;
          break;
        }

        const s = scoreFit(v.maxW, v.maxH, o.w, o.h, remaining);
        if (s < bestScore) {
          bestScore = s;
          bestO = o;
        }
      }

      if (bestO) {
        if (v.parentType === 'Y') {
          let consumed = bestO.h;
          const residualH = v.maxH - bestO.h;
          if (residualH > 0 && !canResidualFitAnyPiece(v.maxW, residualH, remaining, minBreak)) {
            consumed = v.maxH;
          }
          const yId = insertNode(tree, v.colX.id, 'Y', consumed, 1);
          const yNode = findNode(tree, yId)!;
          createPieceNodes(tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);
          filledArea += bestO.w * bestO.h;
          v.maxH -= consumed;
        } else if (v.parentType === 'Z') {
          createPieceNodes(tree, v.yNode!, pc, bestO.w, bestO.h, bestO.w !== pc.w);
          filledArea += bestO.w * bestO.h;
          v.maxW -= bestO.w;
        } else if (v.parentType === 'W') {
          let consumed = bestO.h;
          const residualH = v.maxH - bestO.h;
          if (residualH > 0 && !canResidualFitAnyPiece(v.maxW, residualH, remaining, minBreak)) {
            consumed = v.maxH;
          }
          createPieceNodes(tree, v.yNode!, pc, bestO.w, bestO.h, bestO.w !== pc.w, v.zNode!);
          filledArea += bestO.w * bestO.h;
          v.maxH -= consumed;
        }

        remaining.splice(i, 1);
        i--;
      }
    }
  }

  return filledArea;
}

// ========== REDUCED SORT STRATEGIES (4 only) ==========

function getSortStrategies(): ((a: Piece, b: Piece) => number)[] {
  return [
    // 1. Area descending
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    // 2. Longest dimension descending
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    // 3. Perimeter descending
    (a, b) => (b.w + b.h) - (a.w + a.h) || b.area - a.area,
    // 4. Homogeneous blocks (group identical dimensions together, then by area)
    (a, b) => {
      const ka = `${Math.round(a.w)}_${Math.round(a.h)}`;
      const kb = `${Math.round(b.w)}_${Math.round(b.h)}`;
      if (ka !== kb) return ka < kb ? -1 : 1;
      return b.area - a.area;
    },
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

// ========== MAIN OPTIMIZER V6 (PRUNED) ==========

export function optimizeV6(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  useGrouping?: boolean
): { tree: TreeNode; remaining: Piece[] } {
  if (pieces.length === 0) return { tree: createRoot(usableW, usableH), remaining: [] };

  const hasLabels = pieces.some(p => p.label);
  const strategies = getSortStrategies();

  const rotated = pieces.map(p => ({ w: p.h, h: p.w, area: p.area, count: p.count, label: p.label }));

  // PRUNED: max 5 variants (down from 17)
  const pieceVariants: Piece[][] = hasLabels ? [
    pieces,
    rotated,
  ] : useGrouping === false ? [
    pieces,
    rotated,
  ] : [
    pieces,
    rotated,
    groupPiecesByHeightFuzzy(pieces, 30, usableW),
    groupFillRow(pieces, usableW, 30),
    groupFillCol(pieces, usableH, 30),
  ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;
  let bestRemaining: Piece[] = [];

  // Total combos: 5 variants × 4 strategies = 20 (down from 204)
  for (const variant of pieceVariants) {
    for (const sortFn of strategies) {
      const sorted = [...variant].sort(sortFn);
      const result = runPlacement(sorted, usableW, usableH, minBreak);
      if (result.area > bestArea) {
        bestArea = result.area;
        bestTree = result.tree;
        bestRemaining = result.remaining;
      }
    }
  }

  return {
    tree: bestTree || createRoot(usableW, usableH),
    remaining: bestRemaining
  };
}

// ========== GENETIC ALGORITHM (PRUNED) ==========

interface GAIndividual {
  genome: number[];
  rotations: boolean[];
  groupingMode: number; // 0-5
}

function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  maxSheets: number
): {
  fitness: number;
  firstTree: TreeNode;
} {
  let currentRemaining = [...workPieces];
  let totalUtil = 0;
  let firstTree: TreeNode | null = null;
  let sheetsActuallySimulated = 0;
  const sheetArea = usableW * usableH;

  let rejectedCount = 0;

  for (let s = 0; s < maxSheets; s++) {
    if (currentRemaining.length === 0) break;

    const countBefore = currentRemaining.length;
    const res = runPlacement(currentRemaining, usableW, usableH, minBreak);
    if (s === 0) firstTree = res.tree;

    totalUtil += (res.area / sheetArea);
    const piecesPlaced = countBefore - res.remaining.length;
    if (piecesPlaced === 0) rejectedCount++;

    currentRemaining = res.remaining;
    sheetsActuallySimulated++;
  }

  let fitness = sheetsActuallySimulated > 0 ? (totalUtil / sheetsActuallySimulated) : 0;
  fitness -= (rejectedCount * 0.05);

  return {
    fitness: Math.max(0, fitness),
    firstTree: firstTree || createRoot(usableW, usableH),
  };
}

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  onProgress?: (p: OptimizationProgress) => void
): Promise<TreeNode> {
  const populationSize = 30;
  const generations = 20;
  const eliteCount = 2;
  const mutationRate = 0.02;

  const numPieces = pieces.length;

  function randomIndividual(): GAIndividual {
    const genome = Array.from({ length: numPieces }, (_, i) => i);
    for (let i = genome.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [genome[i], genome[j]] = [genome[j], genome[i]];
    }
    return {
      genome,
      rotations: Array.from({ length: numPieces }, () => Math.random() > 0.5),
      groupingMode: Math.floor(Math.random() * 6),
    };
  }

  function buildPieces(ind: GAIndividual): Piece[] {
    let work = ind.genome.map(idx => ({ ...pieces[idx] }));

    work = work.map((p, i) => {
      if (ind.rotations[i]) {
        return { ...p, w: p.h, h: p.w };
      }
      return p;
    });

    // PRUNED: 6 modes instead of 10
    switch (ind.groupingMode) {
      case 1: work = groupPiecesByHeight(work); break;
      case 2: work = groupPiecesByWidth(work); break;
      case 3: work = groupPiecesByHeightFuzzy(work, 30, usableW); break;
      case 4: work = groupFillRow(work, usableW, 30); break;
      case 5: work = groupFillCol(work, usableH, 30); break;
    }

    return work;
  }

  function evaluate(ind: GAIndividual): { tree: TreeNode; fitness: number } {
    const work = buildPieces(ind);
    const lookahead = Math.min(3, Math.ceil(work.length / 5));
    const result = simulateSheets(work, usableW, usableH, minBreak, lookahead || 1);
    return { tree: result.firstTree, fitness: result.fitness };
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

    const childRotations = pA.rotations.map((r, i) => Math.random() > 0.5 ? r : pB.rotations[i]);
    const childGrouping = Math.random() > 0.5 ? pA.groupingMode : pB.groupingMode;

    return {
      genome: childGenome,
      rotations: childRotations,
      groupingMode: childGrouping,
    };
  }

  function mutate(ind: GAIndividual): GAIndividual {
    const c = {
      genome: [...ind.genome],
      rotations: [...ind.rotations],
      groupingMode: ind.groupingMode
    };

    const r = Math.random();
    if (r < 0.3) {
      const a = Math.floor(Math.random() * c.genome.length);
      const b = Math.floor(Math.random() * c.genome.length);
      [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
    } else if (r < 0.6) {
      if (c.genome.length > 3) {
        const blockSize = Math.floor(Math.random() * Math.min(5, c.genome.length / 2)) + 2;
        const start = Math.floor(Math.random() * (c.genome.length - blockSize));
        const [segment] = [c.genome.splice(start, blockSize)];
        const target = Math.floor(Math.random() * c.genome.length);
        c.genome.splice(target, 0, ...segment);
      }
    } else if (r < 0.8) {
      const count = Math.max(1, Math.floor(c.rotations.length * 0.1));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * c.rotations.length);
        c.rotations[idx] = !c.rotations[idx];
      }
    } else {
      c.groupingMode = Math.floor(Math.random() * 6);
    }

    return c;
  }

  // --- Seeding ---
  const initialPop: GAIndividual[] = [];
  const strategies = getSortStrategies();
  strategies.forEach((sortFn, sIdx) => {
    const sortedIndices = Array.from({ length: numPieces }, (_, i) => i)
      .sort((a, b) => sortFn(pieces[a], pieces[b]));

    initialPop.push({
      genome: sortedIndices,
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: sIdx % 6
    });
  });

  while (initialPop.length < populationSize) {
    initialPop.push(randomIndividual());
  }

  let population = initialPop;
  let bestTree: TreeNode | null = null;
  let bestFitness = -1;

  if (onProgress) {
    onProgress({ phase: 'Semeando População e V6...', current: 0, total: generations });
  }

  for (let g = 0; g < generations; g++) {
    const currentLookahead = Math.min(8, 3 + Math.floor(g / 20));

    const evaluated = population.map(ind => {
      const work = buildPieces(ind);
      const res = simulateSheets(work, usableW, usableH, minBreak, currentLookahead);
      return { ind, tree: res.firstTree, fitness: res.fitness };
    });

    evaluated.sort((a, b) => b.fitness - a.fitness);

    if (evaluated[0].fitness > bestFitness) {
      bestFitness = evaluated[0].fitness;
      bestTree = JSON.parse(JSON.stringify(evaluated[0].tree));
    }

    if (onProgress) {
      onProgress({
        phase: 'Otimização Evolutiva Global',
        current: g + 1,
        total: generations,
        bestUtil: bestFitness * 100,
      });
    }

    if (g % 5 === 0) await new Promise(r => setTimeout(r, 0));

    const nextPop: GAIndividual[] = evaluated.slice(0, eliteCount).map(e => e.ind);
    const seenGenomes = new Set(nextPop.map(i => i.genome.join(',')));

    while (nextPop.length < populationSize) {
      const pA = tournament(evaluated);
      const pB = tournament(evaluated);
      let child = crossover(pA, pB);
      if (Math.random() < mutationRate) child = mutate(child);

      const key = child.genome.join(',');
      if (!seenGenomes.has(key)) {
        nextPop.push(child);
        seenGenomes.add(key);
      } else if (Math.random() < 0.2) {
        nextPop.push(randomIndividual());
      }
    }
    population = nextPop;
  }

  return bestTree || createRoot(usableW, usableH);
}

// Synchronous wrapper
export function optimizeGeneticV1(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0
): TreeNode {
  return optimizeV6(pieces, usableW, usableH, minBreak).tree;
}

/**
 * Internal helper to create the necessary nodes (Z, W, Q) for a piece placement.
 */
function createPieceNodes(
  tree: TreeNode,
  yNode: TreeNode,
  piece: Piece,
  placedW: number,
  placedH: number,
  rotated: boolean,
  zNodeToUse?: TreeNode
): number {
  const isGrouped = piece.count && piece.count > 1;
  let addedArea = 0;

  if (isGrouped) {
    const originalAxis = piece.groupedAxis || 'w';
    let splitAxis: 'Z' | 'W' | 'Q';

    if (originalAxis === 'w' && !rotated) {
      splitAxis = 'Z';
    } else if ((originalAxis === 'h' && !rotated) || (originalAxis === 'w' && rotated)) {
      splitAxis = 'W';
    } else {
      splitAxis = 'Q';
    }

    if (zNodeToUse && splitAxis === 'Z') splitAxis = 'W';

    if (splitAxis === 'Z') {
      for (let i = 0; i < piece.count!; i++) {
        const iw = piece.individualDims ? piece.individualDims[i] : Math.round(placedW / piece.count!);
        const zId = insertNode(tree, yNode.id, 'Z', iw, 1);
        const zNode = findNode(tree, zId)!;
        if (piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
        const wId = insertNode(tree, zId, 'W', placedH, 1);
        const wNode = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode.label = piece.labels[i];
      }
    } else if (splitAxis === 'W') {
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, 'Z', placedW, 1))!;
      for (let i = 0; i < piece.count!; i++) {
        const ih = piece.individualDims ? piece.individualDims[i] : Math.round(placedH / piece.count!);
        const wId = insertNode(tree, zNode.id, 'W', ih, 1);
        const wNode_f = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode_f.label = piece.labels[i];
        if (i === 0 && piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
      }
    } else {
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, 'Z', placedW, 1))!;
      const wId = insertNode(tree, zNode.id, 'W', placedH, 1);
      const wNode = findNode(tree, wId)!;
      for (let i = 0; i < piece.count!; i++) {
        const iw = piece.individualDims ? piece.individualDims[i] : Math.round(placedW / piece.count!);
        const qId = insertNode(tree, wId, 'Q', iw, 1);
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
    const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, 'Z', placedW, 1))!;
    if (piece.label) zNode.label = piece.label;

    const wId = insertNode(tree, zNode.id, 'W', placedH, 1);
    const wNode = findNode(tree, wId)!;
    if (piece.label) wNode.label = piece.label;

    const actualPieceW = rotated ? piece.h : piece.w;
    if (actualPieceW < placedW) {
      const qId = insertNode(tree, wId, 'Q', actualPieceW, 1);
      const qNode = findNode(tree, qId)!;
      if (piece.label) qNode.label = piece.label;
    }
  }

  addedArea = placedW * placedH;
  return addedArea;
}

// ========== MAIN PLACEMENT (Best Area Fit + Perfect Fit) ==========

function runPlacement(inventory: Piece[], usableW: number, usableH: number, minBreak: number = 0): { tree: TreeNode; area: number; remaining: Piece[] } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  while (remaining.length > 0) {
    const piece = remaining[0];
    let bestFit: { type: 'EXISTING' | 'NEW'; col?: TreeNode; w: number; h: number; pieceW: number; pieceH: number; score: number; rotated: boolean } | null = null;

    // === PERFECT FIT EARLY RETURN ===
    // Check if piece fits exactly in any existing void before computing scores
    let perfectFound = false;
    for (const colX of tree.filhos) {
      if (perfectFound) break;
      const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      const freeH = usableH - usedH;

      for (const o of oris(piece)) {
        // Perfect width + height match in column
        if (o.w === colX.valor && o.h === freeH) {
          if (minBreak > 0) {
            const allZPositions = getAllZCutPositionsInColumn(colX);
            if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
          }
          bestFit = { type: 'EXISTING', col: colX, w: o.w, h: o.h, pieceW: o.w, pieceH: o.h, score: -1e9, rotated: o.w !== piece.w };
          perfectFound = true;
          break;
        }
        // Perfect width match (height fits)
        if (o.w === colX.valor && o.h <= freeH) {
          if (minBreak > 0) {
            const allZPositions = getAllZCutPositionsInColumn(colX);
            if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
          }
          const score = -1e6 + (freeH - o.h); // nearly perfect
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: 'EXISTING', col: colX, w: o.w, h: o.h, pieceW: o.w, pieceH: o.h, score, rotated: o.w !== piece.w };
          }
        }
      }
    }

    // If no perfect fit, compute full scoring
    if (!perfectFound) {
      // 1. Try existing columns
      for (const colX of tree.filhos) {
        const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
        const freeH = usableH - usedH;

        for (const o of oris(piece)) {
          if (minBreak > 0) {
            if (o.h < minBreak) continue;
            const allZPositions = getAllZCutPositionsInColumn(colX);
            if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
          }
          if (o.w <= colX.valor && o.h <= freeH) {
            let effectiveH = o.h;
            const residualH = freeH - o.h;
            if (residualH > 0) {
              const ySibValues = colX.filhos.map(y => y.valor);
              if (!canResidualFitAnyPiece(colX.valor, residualH, remaining.slice(1, 6), minBreak, ySibValues, 'h')) {
                effectiveH = freeH;
              }
            }

            // Best Area Fit score
            const wasteArea = (colX.valor * freeH) - (o.w * o.h);
            const widthRatio = o.w / colX.valor;

            // Shortest axis split preference
            const remRight = colX.valor - o.w;
            const remTop = freeH - o.h;
            let splitPenalty = 0;
            if (remRight > 0 && remTop > 0) {
              // Prefer splitting along shorter axis to keep remainder usable
              const rightArea = remRight * freeH;
              const topArea = o.w * remTop;
              const ratio = Math.max(rightArea, topArea) / Math.min(rightArea, topArea);
              splitPenalty = ratio * 20;
            }

            const score = wasteArea + splitPenalty - (widthRatio * 1000);

            // Lightweight lookahead (max 3 pieces)
            let lookBonus = 0;
            const lookLimit = Math.min(3, remaining.length - 1);
            for (let li = 0; li < lookLimit; li++) {
              const r = remaining[li + 1];
              for (const ro of oris(r)) {
                if (ro.w <= colX.valor && ro.h <= (freeH - o.h)) {
                  lookBonus -= 200;
                  break;
                }
                if (ro.w <= (colX.valor - o.w) && ro.h <= o.h) {
                  lookBonus -= 100;
                  break;
                }
              }
            }

            const finalScore = score + lookBonus;
            if (!bestFit || finalScore < bestFit.score) {
              bestFit = { type: 'EXISTING', col: colX, w: o.w, h: effectiveH, pieceW: o.w, pieceH: o.h, score: finalScore, rotated: o.w !== piece.w };
            }
          }
        }
      }

      // 2. Try new column
      const usedW = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
      const freeW = usableW - usedW;

      if (freeW > 0) {
        for (const o of oris(piece)) {
          if (o.w <= freeW && o.h <= usableH) {
            if (minBreak > 0 && o.w < minBreak) continue;

            let effectiveW = o.w;
            const residualW = freeW - o.w;
            if (residualW > 0) {
              const xSibValues = tree.filhos.map(x => x.valor);
              if (!canResidualFitAnyPiece(residualW, usableH, remaining.slice(1, 6), minBreak, xSibValues, 'w')) {
                effectiveW = freeW;
              }
            }
            const score = ((freeW - effectiveW) / usableW) * 0.5;
            if (!bestFit || score < bestFit.score) {
              bestFit = { type: 'NEW', w: effectiveW, h: o.h, pieceW: o.w, pieceH: o.h, score, rotated: o.w !== piece.w };
            }
          }
        }
      }
    }

    if (!bestFit) {
      remaining.shift();
      continue;
    }

    let col: TreeNode;
    if (bestFit.type === 'NEW') {
      insertNode(tree, 'root', 'X', bestFit.w, 1);
      col = tree.filhos[tree.filhos.length - 1];
    } else {
      col = bestFit.col!;
    }

    const yId = insertNode(tree, col.id, 'Y', bestFit.h, 1);
    const yNode = findNode(tree, yId)!;

    placedArea += createPieceNodes(tree, yNode, piece, bestFit.pieceW, bestFit.pieceH, bestFit.rotated);

    remaining.shift();

    // Lateral Z filling - TWO PASSES
    let freeZW = col.valor - bestFit.pieceW;

    // Pass 1: exact height matches
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (o.h !== bestFit.pieceH) continue;
        if (minBreak > 0) {
          const allZPositions = getAllZCutPositionsInColumn(col);
          const yIndex = col.filhos.indexOf(yNode);
          const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
          const newCutPos = currentOffset + o.w;
          if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
        }
        if (o.w <= freeZW) {
          // Perfect fit early return for lateral
          if (o.w === freeZW) {
            bestOri = o;
            bestScore = -1e9;
            break;
          }
          const score = freeZW - o.w;
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

    // Pass 2: shorter pieces (with W subdivision)
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
          // Perfect fit
          if (o.w === freeZW && o.h === bestFit.h) {
            bestOri = o;
            bestScore = -1e9;
            break;
          }
          const score = (bestFit.h - o.h) * 2 + (freeZW - o.w);
          if (score < bestScore) {
            bestScore = score;
            bestOri = o;
          }
        }
      }

      if (bestOri) {
        placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);

        const zNodeCurrent = yNode.filhos[yNode.filhos.length - 1];
        let freeWH_remaining = bestFit.h - bestOri.h;

        for (let j = 0; j < remaining.length && freeWH_remaining > 0; j++) {
          if (j === i) continue;
          const pw = remaining[j];
          for (const wo of oris(pw)) {
            if (minBreak > 0) {
              const violatesW = zNodeCurrent.filhos.some(w => {
                const diff = Math.abs(w.valor - wo.h);
                return diff > 0 && diff < minBreak;
              });
              if (violatesW) continue;
            }
            if (wo.w <= zNodeCurrent.valor && wo.h <= freeWH_remaining) {
              // Perfect fit in W
              const actualRotated = (wo.w !== pw.w);
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

    // --- Vertical continuation ---
    {
      const usedHAfter = col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      let freeHRemain = usableH - usedHAfter;

      while (freeHRemain >= bestFit.pieceH && remaining.length > 0) {
        const candidates: number[] = [];
        for (let i = 0; i < remaining.length; i++) {
          const pc = remaining[i];
          const matchesOriginal = oris(pc).some(o =>
            o.w === bestFit.pieceW && o.h === bestFit.pieceH
          );
          if (matchesOriginal) candidates.push(i);
        }

        if (candidates.length === 0) break;

        if (minBreak > 0) {
          const ySibValues = col.filhos.map(y => y.valor);
          const violatesY = ySibValues.some(yv => {
            const diff = Math.abs(yv - bestFit.pieceH);
            return diff > 0 && diff < minBreak;
          });
          if (violatesY) break;

          const allZPositions = getAllZCutPositionsInColumn(col);
          if (violatesZMinBreak([bestFit.pieceW], allZPositions, minBreak, col.filhos.length)) break;
        }

        const newYId = insertNode(tree, col.id, 'Y', bestFit.pieceH, 1);
        const newYNode = findNode(tree, newYId)!;

        const firstIdx = candidates[0];
        const firstPc = remaining[firstIdx];

        placedArea += createPieceNodes(tree, newYNode, firstPc, bestFit.pieceW, bestFit.pieceH, bestFit.pieceW !== firstPc.w);
        remaining.splice(firstIdx, 1);

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
            if (!matchOri || (newFreeZW - o.w) < (newFreeZW - matchOri.w)) {
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

        freeHRemain -= bestFit.pieceH;
      }
    }

    // Void filling
    if (remaining.length > 0) {
      placedArea += fillVoids(tree, remaining, usableW, usableH, minBreak);
    }
  }

  return { tree, area: placedArea, remaining };
}
