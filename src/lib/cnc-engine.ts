// CNC Cut Plan Engine with Improved V6 Optimizer

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
  // number of original pieces combined into this Piece (1 by default)
  count?: number;
  label?: string;
  /** Individual labels when grouping multiple pieces */
  labels?: string[];
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
  // Build a pool of available labels: for each piece, qty copies
  const pool: Array<{ w: number; h: number; label: string }> = [];
  pieces.forEach(p => {
    if (p.label) {
      for (let i = 0; i < p.qty; i++) {
        pool.push({ w: p.w, h: p.h, label: p.label });
      }
    }
  });
  if (pool.length === 0) return;

  // Walk tree and assign labels to leaf nodes by matching dimensions
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
function gid(): string { return `n${++_c}_${Math.random().toString(36).substr(2, 4)}`; }

export function createRoot(w: number, h: number): TreeNode {
  return { id: 'root', tipo: 'ROOT', valor: w, multi: 1, filhos: [] };
}

export function cloneTree(t: TreeNode): TreeNode {
  return JSON.parse(JSON.stringify(t));
}

export function findNode(n: TreeNode, id: string): TreeNode | null {
  if (n.id === id) return n;
  for (const f of n.filhos) { const r = findNode(f, id); if (r) return r; }
  return null;
}

export function findParentOfType(tree: TreeNode, nodeId: string, tipo: NodeType): TreeNode | null {
  function findParent(n: TreeNode, tid: string): TreeNode | null {
    for (const f of n.filhos) {
      if (f.id === tid) return n;
      const r = findParent(f, tid); if (r) return r;
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
  if (tipo === 'X') { tree.filhos.push(node); }
  else if (tipo === 'Y') { const p = target?.tipo === 'X' ? target : findParentOfType(tree, selectedId, 'X'); if (p) p.filhos.push(node); }
  else if (tipo === 'Z') { const p = target?.tipo === 'Y' ? target : findParentOfType(tree, selectedId, 'Y'); if (p) p.filhos.push(node); }
  else if (tipo === 'W') { const p = target?.tipo === 'Z' ? target : findParentOfType(tree, selectedId, 'Z'); if (p) p.filhos.push(node); }
  else if (tipo === 'Q') { const p = target?.tipo === 'W' ? target : findParentOfType(tree, selectedId, 'W'); if (p) p.filhos.push(node); }
  return node.id;
}

export function deleteNode(tree: TreeNode, id: string): void {
  const rm = (n: TreeNode) => { n.filhos = n.filhos.filter(f => f.id !== id); n.filhos.forEach(rm); };
  rm(tree);
}

export function calcAllocation(
  tree: TreeNode, selectedId: string, tipo: NodeType, valor: number, multi: number,
  usableW: number, usableH: number
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
    // W deve caber na altura de Y, considerando os W's já adicionados
    free = yP.valor - zP.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
  } else if (tipo === 'Q') {
    const wP = target?.tipo === 'W' ? target : findParentOfType(tree, selectedId, 'W');
    if (!wP) return { allocated: 0, error: 'Selecione W' };
    // Q ocupa largura dentro do Z pai de W
    const zP = findParentOfType(tree, wP.id, 'Z');
    if (!zP) return { allocated: 0, error: 'Selecione Z' };
    const occupiedQ = wP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
    free = zP.valor - occupiedQ;
  }

  const alloc = Math.min(multi, Math.floor(free / valor));
  return alloc <= 0 ? { allocated: 0, error: 'Sem espaço' } : { allocated: alloc };
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
                          area += z.valor * q.valor; 
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

// ========== OPTIMIZER V6 ULTRA ==========

// --- Grouping helpers ---

function groupPiecesByHeight(pieces: Piece[]): Piece[] {
  const heightGroups = new Map<number, Piece[]>();
  pieces.forEach(p => {
    const h = Math.min(p.w, p.h);
    if (!heightGroups.has(h)) heightGroups.set(h, []);
    heightGroups.get(h)!.push(p);
  });

  const result: Piece[] = [];
  heightGroups.forEach(group => {
    const sorted = group.map(p => ({ ...p, nw: Math.max(p.w, p.h), nh: Math.min(p.w, p.h) }))
      .sort((a, b) => b.nw - a.nw);

    let i = 0;
    while (i < sorted.length) {
      const h = sorted[i].nh;
      const candidates: number[] = [];
      for (let j = i; j < sorted.length && candidates.length < 3; j++) {
        candidates.push(j);
      }
      if (candidates.length >= 2) {
        const trySize = candidates.length >= 3 ? 3 : 2;
        for (let gs = trySize; gs >= 2; gs--) {
          let gw = 0;
          const groupLabels: string[] = [];
          for (let k = 0; k < gs; k++) {
            gw += sorted[candidates[k]].nw;
            if (sorted[candidates[k]].label) groupLabels.push(sorted[candidates[k]].label!);
          }
          result.push({ w: gw, h, area: gw * h, count: gs, labels: groupLabels.length > 0 ? groupLabels : undefined });
          for (let k = gs - 1; k >= 1; k--) sorted.splice(candidates[k], 1);
          sorted.splice(i, 1);
          break;
        }
        continue;
      }
      result.push({ w: sorted[i].nw, h: sorted[i].nh, area: sorted[i].nw * sorted[i].nh, count: 1, label: sorted[i].label });
      i++;
    }
  });
  return result;
}

function groupPiecesByWidth(pieces: Piece[]): Piece[] {
  const widthGroups = new Map<number, Piece[]>();
  pieces.forEach(p => {
    const w = Math.max(p.w, p.h);
    if (!widthGroups.has(w)) widthGroups.set(w, []);
    widthGroups.get(w)!.push(p);
  });

  const result: Piece[] = [];
  widthGroups.forEach(group => {
    const sorted = group.map(p => ({ ...p, nw: Math.max(p.w, p.h), nh: Math.min(p.w, p.h) }))
      .sort((a, b) => b.nh - a.nh);

    let i = 0;
    while (i < sorted.length) {
      if (i + 1 < sorted.length) {
        const w = sorted[i].nw;
        const sumH = sorted[i].nh + sorted[i + 1].nh;
        const groupLabels: string[] = [];
        if (sorted[i].label) groupLabels.push(sorted[i].label!);
        if (sorted[i + 1].label) groupLabels.push(sorted[i + 1].label!);
        result.push({ w, h: sumH, area: w * sumH, count: 2, labels: groupLabels.length > 0 ? groupLabels : undefined });
        sorted.splice(i + 1, 1);
        sorted.splice(i, 1);
        continue;
      }
      result.push({ w: sorted[i].nw, h: sorted[i].nh, area: sorted[i].nw * sorted[i].nh, count: 1, label: sorted[i].label });
      i++;
    }
  });
  return result;
}

function oris(p: Piece): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [{ w: p.w, h: p.h }, { w: p.h, h: p.w }];
}

// --- Scoring with lookahead ---

function scoreFit(
  spaceW: number, spaceH: number,
  pieceW: number, pieceH: number,
  remaining: Piece[]
): number {
  const wasteW = spaceW - pieceW;
  const wasteH = spaceH - pieceH;

  // Base score: prefer less total waste
  let score = wasteW * spaceH + wasteH * pieceW;

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

  // Penalize unusable waste
  if (wasteW > 0 && !wFits) score += wasteW * spaceH * 2;
  if (wasteH > 0 && !hFits) score += wasteH * pieceW * 2;

  // Bonus for exact fits
  if (wasteW === 0) score -= spaceH * 10;
  if (wasteH === 0) score -= pieceW * 10;

  return score;
}

// --- Void filling ---

function fillVoids(tree: TreeNode, remaining: Piece[], usableW: number, usableH: number): number {
  let filledArea = 0;

  for (const colX of tree.filhos) {
    // Void in Y direction (remaining height in column)
    const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const freeH = usableH - usedH;
    if (freeH > 0) {
      filledArea += fillRect(tree, colX, remaining, colX.valor, freeH, 'Y');
    }

    // Void in Z direction (remaining width in each Y strip)
    for (const yNode of colX.filhos) {
      const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      const freeZ = colX.valor - usedZ;
      if (freeZ > 0) {
        filledArea += fillRectZ(tree, yNode, remaining, freeZ, yNode.valor);
      }

      // Void in W direction (remaining height inside each Z)
      for (const zNode of yNode.filhos) {
        const usedW = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        const freeW = yNode.valor - usedW;
        if (freeW > 0) {
          filledArea += fillRectW(remaining, zNode, zNode.valor, freeW);
        }
      }
    }
  }

  return filledArea;
}

function fillRect(tree: TreeNode, colX: TreeNode, remaining: Piece[], maxW: number, maxH: number, _level: string): number {
  let filled = 0;
  for (let i = 0; i < remaining.length; i++) {
    if (maxH <= 0) break;
    const pc = remaining[i];
    let bestO: { w: number; h: number } | null = null;
    let bestScore = Infinity;
    for (const o of oris(pc)) {
      if (o.w <= maxW && o.h <= maxH) {
        const s = scoreFit(maxW, maxH, o.w, o.h, remaining);
        if (s < bestScore) { bestScore = s; bestO = o; }
      }
    }
    if (bestO) {
      const yId = insertNode(tree, colX.id, 'Y', bestO.h, 1);
      const yNode = findNode(tree, yId)!;
      const zId = insertNode(tree, yNode.id, 'Z', bestO.w, 1);
      insertNode(tree, zId, 'W', bestO.h, 1);
      filled += bestO.w * bestO.h;
      maxH -= bestO.h;
      remaining.splice(i, 1);
      i--;
    }
  }
  return filled;
}

function fillRectZ(_tree: TreeNode, yNode: TreeNode, remaining: Piece[], maxW: number, maxH: number): number {
  let filled = 0;
  for (let i = 0; i < remaining.length; i++) {
    if (maxW <= 0) break;
    const pc = remaining[i];
    let bestO: { w: number; h: number } | null = null;
    let bestScore = Infinity;
    for (const o of oris(pc)) {
      if (o.w <= maxW && o.h <= maxH) {
        const s = scoreFit(maxW, maxH, o.w, o.h, remaining);
        if (s < bestScore) { bestScore = s; bestO = o; }
      }
    }
    if (bestO) {
      const zId = insertNode(_tree, yNode.id, 'Z', bestO.w, 1);
      insertNode(_tree, zId, 'W', bestO.h, 1);
      filled += bestO.w * bestO.h;
      maxW -= bestO.w;
      remaining.splice(i, 1);
      i--;
    }
  }
  return filled;
}

function fillRectW(remaining: Piece[], zNode: TreeNode, zWidth: number, maxH: number): number {
  let filled = 0;
  for (let i = 0; i < remaining.length; i++) {
    if (maxH <= 0) break;
    const pc = remaining[i];
    for (const o of oris(pc)) {
      if (o.w <= zWidth && o.h <= maxH) {
        const wNode: TreeNode = { id: gid(), tipo: 'W', valor: o.h, multi: 1, filhos: [] };
        zNode.filhos.push(wNode);
        filled += o.w * o.h;
        maxH -= o.h;
        remaining.splice(i, 1);
        i--;
        break;
      }
    }
  }
  return filled;
}

// --- Main optimizer ---

export function optimizeV6(pieces: Piece[], usableW: number, usableH: number): TreeNode {
  if (pieces.length === 0) return createRoot(usableW, usableH);

  const hasLabels = pieces.some(p => p.label);

  const strategies: ((a: Piece, b: Piece) => number)[] = [
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => (b.w + b.h) - (a.w + a.h),
    (a, b) => (b.w / b.h) - (a.w / a.h),
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

  const pieceVariants: Piece[][] = [
    pieces,
    pieces.map(p => ({ ...p, w: p.h, h: p.w })),
    groupPiecesByHeight(pieces),
    groupPiecesByWidth(pieces),
    groupPiecesByHeight(pieces.map(p => ({ ...p, w: p.h, h: p.w }))),
  ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;

  for (const variant of pieceVariants) {
    for (const sortFn of strategies) {
      const sorted = [...variant].sort(sortFn);
      const result = runPlacement(sorted, usableW, usableH);
      if (result.area > bestArea) {
        bestArea = result.area;
        bestTree = JSON.parse(JSON.stringify(result.tree));
      }
    }
  }

  return bestTree || createRoot(usableW, usableH);
}

function runPlacement(inventory: Piece[], usableW: number, usableH: number): { tree: TreeNode; area: number } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  while (remaining.length > 0) {
    const piece = remaining[0];
    let bestFit: { type: 'EXISTING' | 'NEW'; col?: TreeNode; w: number; h: number; score: number } | null = null;

    // 1. Try existing columns (original scoring + light lookahead)
    for (const colX of tree.filhos) {
      const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      const freeH = usableH - usedH;
      for (const o of oris(piece)) {
        if (o.w <= colX.valor && o.h <= freeH) {
          const widthRatio = o.w / colX.valor;
          const baseScore = (1 - widthRatio) * 3 + (1 - o.h / freeH) * 0.5;
          // Light lookahead: bonus if remaining space fits another piece
          let lookBonus = 0;
          const remH = freeH - o.h;
          const remW = colX.valor - o.w;
          for (const r of remaining.slice(1)) {
            for (const ro of oris(r)) {
              if (ro.w <= colX.valor && ro.h <= remH) { lookBonus -= 0.5; break; }
              if (ro.w <= remW && ro.h <= o.h) { lookBonus -= 0.3; break; }
            }
            if (lookBonus < -1) break;
          }
          const score = baseScore + lookBonus;
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: 'EXISTING', col: colX, w: o.w, h: o.h, score };
          }
        }
      }
    }

    // 2. Try new column with piece's own width
    const usedW = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
    const freeW = usableW - usedW;
    if (freeW > 0) {
      for (const o of oris(piece)) {
        if (o.w <= freeW && o.h <= usableH) {
          const score = ((freeW - o.w) / usableW) * 0.5;
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: 'NEW', w: o.w, h: o.h, score };
          }
        }
      }
    }

    if (!bestFit) { remaining.shift(); continue; }

    let col: TreeNode;
    if (bestFit.type === 'NEW') {
      insertNode(tree, 'root', 'X', bestFit.w, 1);
      col = tree.filhos[tree.filhos.length - 1];
    } else {
      col = bestFit.col!;
    }

    const yId = insertNode(tree, col.id, 'Y', bestFit.h, 1);
    const yNode = findNode(tree, yId)!;

    const grouped = piece.count && piece.count > 1;

    if (grouped) {
      const partW = Math.round(bestFit.w / (piece.count || 2));
      const zId = insertNode(tree, yNode.id, 'Z', bestFit.w, 1);
      const wId = insertNode(tree, zId, 'W', bestFit.h, 1);
      // Assign individual labels to Q nodes when available
      if (piece.labels && piece.labels.length > 0) {
        const cnt = piece.count || 2;
        for (let qi = 0; qi < cnt; qi++) {
          const qId = insertNode(tree, wId, 'Q', partW, 1);
          const qNode = findNode(tree, qId)!;
          if (qi < piece.labels.length) qNode.label = piece.labels[qi];
        }
      } else {
        insertNode(tree, wId, 'Q', partW, piece.count || 2);
      }
      placedArea += bestFit.w * bestFit.h;
    } else {
      const zId = insertNode(tree, yNode.id, 'Z', bestFit.w, 1);
      const zNode = findNode(tree, zId)!;
      if (piece.label) zNode.label = piece.label;
      const wId = insertNode(tree, zId, 'W', bestFit.h, 1);
      const wNode = findNode(tree, wId)!;
      if (piece.label) wNode.label = piece.label;
      placedArea += bestFit.w * bestFit.h;
    }

    remaining.shift();

    // Lateral Z filling (flexible height)
    let freeZW = col.valor - bestFit.w;
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (o.w <= freeZW && o.h <= bestFit.h) {
          const score = (bestFit.h - o.h) * 2 + (freeZW - o.w);
          if (score < bestScore) { bestScore = score; bestOri = o; }
        }
      }

      if (bestOri) {
        if (bestOri.h < bestFit.h) {
          const zId = insertNode(tree, yNode.id, 'Z', bestOri.w, 1);
          const zNode2 = findNode(tree, zId)!;
          if (pc.label) zNode2.label = pc.label;
          const wId2 = insertNode(tree, zId, 'W', bestOri.h, 1);
          const wNode2 = findNode(tree, wId2)!;
          if (pc.label) wNode2.label = pc.label;
          placedArea += bestOri.w * bestOri.h;

          // Flexible W filling: accept w <= Z width
          let freeWH = bestFit.h - bestOri.h;
          for (let j = 0; j < remaining.length && freeWH > 0; j++) {
            if (j === i) continue;
            const pw = remaining[j];
            for (const wo of oris(pw)) {
              if (wo.w <= zNode2.valor && wo.h <= freeWH) {
                const wId3 = insertNode(tree, zId, 'W', wo.h, 1);
                const wNode3 = findNode(tree, wId3)!;
                if (pw.label) wNode3.label = pw.label;
                placedArea += zNode2.valor * wo.h;
                freeWH -= wo.h;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }
        } else {
          const zId = insertNode(tree, yNode.id, 'Z', bestOri.w, 1);
          const zNode2 = findNode(tree, zId)!;
          if (pc.label) zNode2.label = pc.label;
          placedArea += bestOri.w * bestFit.h;
        }
        freeZW -= bestOri.w;
        remaining.splice(i, 1);
        i--;
      }
    }
  }

  // Void filling: try to fill remaining spaces in existing columns
  if (remaining.length > 0) {
    placedArea += fillVoids(tree, remaining, usableW, usableH);
  }

  return { tree, area: placedArea };
}
