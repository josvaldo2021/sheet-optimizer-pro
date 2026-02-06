// CNC Cut Plan Engine with Improved V6 Optimizer

export type NodeType = 'ROOT' | 'X' | 'Y' | 'Z' | 'W' | 'Q';

export interface TreeNode {
  id: string;
  tipo: NodeType;
  valor: number;
  multi: number;
  filhos: TreeNode[];
}

export interface Piece {
  w: number;
  h: number;
  area: number;
  // number of original pieces combined into this Piece (1 by default)
  count?: number;
}

export interface PieceItem {
  id: string;
  qty: number;
  w: number;
  h: number;
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
    // Sort by width descending for better packing
    const sorted = group.map(p => ({ ...p, nw: Math.max(p.w, p.h), nh: Math.min(p.w, p.h) }))
      .sort((a, b) => b.nw - a.nw);

    let i = 0;
    while (i < sorted.length) {
      const h = sorted[i].nh;
      // Try to group 3, then 2
      let groupSize = 0;
      let sumW = 0;
      const candidates: number[] = [];
      for (let j = i; j < sorted.length && candidates.length < 3; j++) {
        candidates.push(j);
        sumW += sorted[j].nw;
      }
      // Accept group of 3 or 2
      if (candidates.length >= 2) {
        // Try 3 first, then 2
        const trySize = candidates.length >= 3 ? 3 : 2;
        let bestGroupW = 0;
        let bestCount = 0;
        for (let gs = trySize; gs >= 2; gs--) {
          let gw = 0;
          for (let k = 0; k < gs; k++) gw += sorted[candidates[k]].nw;
          bestGroupW = gw;
          bestCount = gs;
          break;
        }
        if (bestCount >= 2) {
          result.push({ w: bestGroupW, h, area: bestGroupW * h, count: bestCount });
          // Remove grouped items (reverse order)
          for (let k = bestCount - 1; k >= 1; k--) sorted.splice(candidates[k], 1);
          sorted.splice(i, 1);
          continue;
        }
      }
      // Single piece
      result.push({ w: sorted[i].nw, h: sorted[i].nh, area: sorted[i].nw * sorted[i].nh, count: 1 });
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
        result.push({ w, h: sumH, area: w * sumH, count: 2 });
        sorted.splice(i + 1, 1);
        sorted.splice(i, 1);
        continue;
      }
      result.push({ w: sorted[i].nw, h: sorted[i].nh, area: sorted[i].nw * sorted[i].nh, count: 1 });
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
        insertNode({ id: 'root', tipo: 'ROOT', valor: 0, multi: 1, filhos: [] }, zNode.id, 'W', o.h, 1);
        // Direct insert into zNode
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

  // 12 sorting strategies
  const strategies: ((a: Piece, b: Piece) => number)[] = [
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => (b.w + b.h) - (a.w + a.h),
    // New strategies
    (a, b) => (b.w / b.h) - (a.w / a.h), // w/h ratio
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h), // smallest dimension first
    (a, b) => {
      // "problematic" pieces first (very elongated)
      const ra = Math.max(a.w, a.h) / Math.min(a.w, a.h);
      const rb = Math.max(b.w, b.h) / Math.min(b.w, b.h);
      return rb - ra;
    },
    (a, b) => b.area - a.area || b.w - a.w, // area then width
    (a, b) => b.area - a.area || b.h - a.h, // area then height
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h), // longest dimension
    (a, b) => (b.w * b.h) / (b.w + b.h) - (a.w * a.h) / (a.w + a.h), // area/perimeter ratio
  ];

  // Piece variants: original, all rotated, grouped by height, grouped by width
  const pieceVariants: Piece[][] = [
    pieces,
    pieces.map(p => ({ w: p.h, h: p.w, area: p.area, count: p.count })), // global rotation
    groupPiecesByHeight(pieces),
    groupPiecesByWidth(pieces),
    groupPiecesByHeight(pieces.map(p => ({ w: p.h, h: p.w, area: p.area, count: p.count }))),
  ];

  let bestTree: TreeNode | null = null;
  let bestSheets = Infinity;
  let bestArea = 0;

  for (const variant of pieceVariants) {
    for (const sortFn of strategies) {
      const sorted = [...variant].sort(sortFn);
      const result = runPlacement(sorted, usableW, usableH);

      // Count sheets used (number of X columns that fill width = number of sheets)
      const sheetCount = Math.max(1, tree_filhos_count(result.tree, usableW));

      if (sheetCount < bestSheets || (sheetCount === bestSheets && result.area > bestArea)) {
        bestSheets = sheetCount;
        bestArea = result.area;
        bestTree = JSON.parse(JSON.stringify(result.tree));
      }
    }
  }

  return bestTree || createRoot(usableW, usableH);
}

// Estimate number of sheets from tree
function tree_filhos_count(tree: TreeNode, _usableW: number): number {
  // Each X node is a column; sheets = total width / usableW (ceiled)
  const totalW = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
  return totalW > 0 ? Math.ceil(totalW / _usableW) : 0;
}

function runPlacement(inventory: Piece[], usableW: number, usableH: number): { tree: TreeNode; area: number } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  while (remaining.length > 0) {
    const piece = remaining[0];
    let bestFit: { type: 'EXISTING' | 'NEW'; col?: TreeNode; w: number; h: number; score: number } | null = null;

    // 1. Try existing columns with lookahead scoring
    for (const colX of tree.filhos) {
      const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      const freeH = usableH - usedH;
      for (const o of oris(piece)) {
        if (o.w <= colX.valor && o.h <= freeH) {
          const score = scoreFit(colX.valor, freeH, o.w, o.h, remaining.slice(1));
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: 'EXISTING', col: colX, w: o.w, h: o.h, score };
          }
        }
      }
    }

    // 2. Try new column - use width of best fitting piece, not just current
    const usedW = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
    const freeW = usableW - usedW;
    if (freeW > 0) {
      for (const o of oris(piece)) {
        if (o.w <= freeW && o.h <= usableH) {
          // Find optimal column width: largest piece width that fits
          let colWidth = o.w;
          for (const r of remaining.slice(1)) {
            for (const ro of oris(r)) {
              if (ro.w <= freeW && ro.w > colWidth) colWidth = ro.w;
            }
          }
          colWidth = Math.min(colWidth, freeW);

          const score = scoreFit(colWidth, usableH, o.w, o.h, remaining.slice(1));
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: 'NEW', w: colWidth, h: o.h, score };
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

    // Insert Y strip + Z piece(s)
    const pieceW = bestFit.type === 'NEW' ? (oris(piece).find(o => o.w <= bestFit!.w && o.h <= usableH) || oris(piece)[0]).w : bestFit.w;
    const actualW = bestFit.type === 'EXISTING' ? bestFit.w : pieceW;

    const yId = insertNode(tree, col.id, 'Y', bestFit.h, 1);
    const yNode = findNode(tree, yId)!;

    const grouped = piece.count && piece.count > 1;

    if (grouped) {
      const partW = Math.round(actualW / (piece.count || 2));
      const zId = insertNode(tree, yNode.id, 'Z', actualW, 1);
      const wId = insertNode(tree, zId, 'W', bestFit.h, 1);
      insertNode(tree, wId, 'Q', partW, piece.count || 2);
      placedArea += actualW * bestFit.h;
    } else {
      const zId = insertNode(tree, yNode.id, 'Z', actualW, 1);
      insertNode(tree, zId, 'W', bestFit.h, 1);
      placedArea += actualW * bestFit.h;
    }

    remaining.shift();

    // Flexible lateral Z filling
    let freeZW = col.valor - actualW;
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (o.w <= freeZW && o.h <= bestFit.h) {
          const score = scoreFit(freeZW, bestFit.h, o.w, o.h, remaining.slice(i + 1));
          if (score < bestScore) { bestScore = score; bestOri = o; }
        }
      }

      if (bestOri) {
        if (bestOri.h < bestFit.h) {
          const zId = insertNode(tree, yNode.id, 'Z', bestOri.w, 1);
          insertNode(tree, zId, 'W', bestOri.h, 1);
          placedArea += bestOri.w * bestOri.h;

          // FLEXIBLE W filling: accept pieces with w <= zNode width (not exact match)
          const zNode = findNode(tree, zId)!;
          let freeWH = bestFit.h - bestOri.h;
          for (let j = 0; j < remaining.length && freeWH > 0; j++) {
            if (j === i) continue;
            const pw = remaining[j];
            for (const wo of oris(pw)) {
              if (wo.w <= zNode.valor && wo.h <= freeWH) {
                insertNode(tree, zId, 'W', wo.h, 1);
                placedArea += zNode.valor * wo.h;
                freeWH -= wo.h;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }
        } else {
          insertNode(tree, yNode.id, 'Z', bestOri.w, 1);
          placedArea += bestOri.w * bestFit.h;
        }
        freeZW -= bestOri.w;
        remaining.splice(i, 1);
        i--;
      }
    }
  }

  // Recursive void filling pass
  const voidRemaining = [...inventory].filter(p => {
    // Find pieces not yet placed (simple area check)
    return true; // We'll use a copy approach instead
  });

  // Second pass: try to fill remaining voids with unplaced pieces
  // We track unplaced by rebuilding from inventory minus placed
  const placedPieces = calcPlacedPiecesFromTree(tree);
  const unplaced = getUnplacedPieces(inventory, placedPieces);
  if (unplaced.length > 0) {
    placedArea += fillVoids(tree, unplaced, usableW, usableH);
  }

  return { tree, area: placedArea };
}

function calcPlacedPiecesFromTree(tree: TreeNode): { w: number; h: number }[] {
  const placed: { w: number; h: number }[] = [];
  function walk(n: TreeNode, parentW?: number, parentH?: number) {
    if (n.tipo === 'W' && n.filhos.length === 0 && parentW !== undefined) {
      for (let i = 0; i < n.multi; i++) placed.push({ w: parentW, h: n.valor });
    }
    if (n.tipo === 'Q') {
      for (let i = 0; i < n.multi; i++) placed.push({ w: n.valor, h: parentH || 0 });
    }
    const zW = n.tipo === 'Z' ? n.valor : parentW;
    const wH = n.tipo === 'W' ? n.valor : parentH;
    n.filhos.forEach(c => walk(c, zW, wH));
  }
  tree.filhos.forEach(x => x.filhos.forEach(y => y.filhos.forEach(z => walk(z, z.valor))));
  return placed;
}

function getUnplacedPieces(inventory: Piece[], placed: { w: number; h: number }[]): Piece[] {
  const remaining = [...inventory];
  const usedPlaced = [...placed];

  for (let i = remaining.length - 1; i >= 0; i--) {
    const p = remaining[i];
    const count = p.count || 1;
    let matched = 0;
    for (let c = 0; c < count; c++) {
      const idx = usedPlaced.findIndex(pp =>
        (pp.w === p.w && pp.h === p.h) || (pp.w === p.h && pp.h === p.w) ||
        (p.count && p.count > 1) // grouped pieces are always considered placed
      );
      if (idx !== -1) { usedPlaced.splice(idx, 1); matched++; }
    }
    if (matched > 0) remaining.splice(i, 1);
  }
  return remaining;
}
