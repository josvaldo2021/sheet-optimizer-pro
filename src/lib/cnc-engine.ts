// CNC Cut Plan Engine v3 — Pure Heuristic Guillotine Bin-Packing (build trigger)
// No genetic algorithm. Deterministic: tries N sort orders × 2 rotations × 2 column modes.
// Architecture: Free-rectangle guillotine. Pieces placed into best-fit free rect, then
// rect is split (guillotine) into residuals. Final free-rect list converted to tree.

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
  groupedAxis?: 'w' | 'h';
}

export interface PieceItem {
  id: string;
  qty: number;
  w: number;
  h: number;
  label?: string;
}

export interface OptimizationProgress {
  phase: string;
  current: number;
  total: number;
  bestSheets?: number;
  bestUtil?: number;
}

// ===== ID Generator =====
let _c = 0;
function gid(): string { return `n${++_c}_${Math.random().toString(36).substr(2, 4)}`; }

// ===== Tree Utilities (unchanged public API) =====

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
  if (tipo === 'X') tree.filhos.push(node);
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
  usableW: number, usableH: number, minBreak: number = 0
): { allocated: number; error?: string } {
  const target = findNode(tree, selectedId);
  let free = 0;
  if (tipo === 'X') free = usableW - tree.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  else if (tipo === 'Y') {
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
    free = zP.valor - wP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
  }
  const alloc = Math.min(multi, Math.floor(free / valor));
  if (alloc <= 0) return { allocated: 0, error: 'Sem espaço' };
  if (minBreak > 0) {
    let siblings: TreeNode[] = [];
    if (tipo === 'X') siblings = tree.filhos;
    else if (tipo === 'Y') { const xP = target?.tipo === 'X' ? target : findParentOfType(tree, selectedId, 'X'); if (xP) siblings = xP.filhos; }
    else if (tipo === 'Z') { const yP = target?.tipo === 'Y' ? target : findParentOfType(tree, selectedId, 'Y'); if (yP) siblings = yP.filhos; }
    else if (tipo === 'W') { const zP = target?.tipo === 'Z' ? target : findParentOfType(tree, selectedId, 'Z'); if (zP) siblings = zP.filhos; }
    else if (tipo === 'Q') { const wP = target?.tipo === 'W' ? target : findParentOfType(tree, selectedId, 'W'); if (wP) siblings = wP.filhos; }
    for (const sib of siblings) {
      const diff = Math.abs(sib.valor - valor);
      if (diff > 0 && diff < minBreak) return { allocated: 0, error: `Distância de quebra insuficiente: ${diff}mm < ${minBreak}mm` };
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

export function annotateTreeLabels(tree: TreeNode, pieces: PieceItem[]): void {
  const pool: Array<{ w: number; h: number; label: string }> = [];
  pieces.forEach(p => { if (p.label) { for (let i = 0; i < p.qty; i++) pool.push({ w: p.w, h: p.h, label: p.label }); } });
  if (pool.length === 0) return;
  function walk(n: TreeNode, parents: TreeNode[]) {
    const yA = [...parents].reverse().find(p => p.tipo === 'Y');
    const zA = [...parents].reverse().find(p => p.tipo === 'Z');
    const wA = [...parents].reverse().find(p => p.tipo === 'W');
    let pw = 0, ph = 0, leaf = false;
    if (n.tipo === 'Z' && n.filhos.length === 0) { pw = n.valor; ph = yA?.valor || 0; leaf = true; }
    else if (n.tipo === 'W' && n.filhos.length === 0) { pw = zA?.valor || 0; ph = n.valor; leaf = true; }
    else if (n.tipo === 'Q') { pw = n.valor; ph = wA?.valor || 0; leaf = true; }
    if (leaf && pw > 0 && ph > 0) {
      for (let i = 0; i < pool.length; i++) {
        if ((Math.round(pool[i].w) === Math.round(pw) && Math.round(pool[i].h) === Math.round(ph)) ||
          (Math.round(pool[i].w) === Math.round(ph) && Math.round(pool[i].h) === Math.round(pw))) {
          n.label = pool[i].label; pool.splice(i, 1); break;
        }
      }
    }
    n.filhos.forEach(f => walk(f, [...parents, n]));
  }
  walk(tree, []);
}

// =====================================================================
// FREE-RECTANGLE GUILLOTINE BIN-PACKING
// =====================================================================
// Each placed piece produces a coordinate-based record.
// After all pieces are placed, records are converted to the tree structure.

interface FreeRect {
  x: number;  // left edge
  y: number;  // bottom edge
  w: number;  // width
  h: number;  // height
}

interface PlacedPiece {
  x: number;
  y: number;
  w: number;   // placed width
  h: number;   // placed height
  label?: string;
}

// Score a placement: lower is better
function scorePlacement(
  rect: FreeRect,
  pw: number, ph: number,
  remaining: Array<{ w: number; h: number }>,
): number {
  // Best Short Side Fit: minimize leftover on the shorter side
  const leftW = rect.w - pw;
  const leftH = rect.h - ph;
  const shortSide = Math.min(leftW, leftH);
  const longSide = Math.max(leftW, leftH);

  // Exact fit bonus
  let bonus = 0;
  if (leftW === 0) bonus -= 1000;
  if (leftH === 0) bonus -= 1000;

  // Lookahead: can residuals host any remaining piece?
  let residualPenalty = 0;
  if (leftW > 0) {
    const canUseW = remaining.some(r =>
      (r.w <= leftW && r.h <= rect.h) || (r.h <= leftW && r.w <= rect.h)
    );
    if (!canUseW) residualPenalty += leftW * rect.h * 0.001;
  }
  if (leftH > 0) {
    const canUseH = remaining.some(r =>
      (r.w <= rect.w && r.h <= leftH) || (r.h <= rect.w && r.w <= leftH)
    );
    if (!canUseH) residualPenalty += rect.w * leftH * 0.001;
  }

  return shortSide * 10 + longSide + bonus + residualPenalty;
}

// Guillotine split: after placing pw×ph in rect, produce 0-2 new free rects
function guillotineSplit(rect: FreeRect, pw: number, ph: number): FreeRect[] {
  const result: FreeRect[] = [];
  const rightW = rect.w - pw;
  const topH = rect.h - ph;

  if (rightW <= 0 && topH <= 0) return result;

  // Choose split direction: maximize largest residual area
  // Horizontal split: right rect gets full height, top rect gets piece width
  // Vertical split: top rect gets full width, right rect gets piece height
  const horizArea = (rightW > 0 ? rightW * rect.h : 0) + (topH > 0 ? pw * topH : 0);
  const vertArea = (topH > 0 ? rect.w * topH : 0) + (rightW > 0 ? rightW * ph : 0);

  if (horizArea >= vertArea) {
    // Horizontal split
    if (rightW > 0) result.push({ x: rect.x + pw, y: rect.y, w: rightW, h: rect.h });
    if (topH > 0) result.push({ x: rect.x, y: rect.y + ph, w: pw, h: topH });
  } else {
    // Vertical split
    if (topH > 0) result.push({ x: rect.x, y: rect.y + ph, w: rect.w, h: topH });
    if (rightW > 0) result.push({ x: rect.x + pw, y: rect.y, w: rightW, h: ph });
  }

  return result;
}

// Place pieces into free rectangles using Best Short Side Fit
function placePieces(
  pieces: Array<{ w: number; h: number; label?: string }>,
  sheetW: number,
  sheetH: number,
): { placed: PlacedPiece[]; remaining: Array<{ w: number; h: number; label?: string }> } {
  const freeRects: FreeRect[] = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
  const placed: PlacedPiece[] = [];
  const remaining: Array<{ w: number; h: number; label?: string }> = [];

  for (let pi = 0; pi < pieces.length; pi++) {
    const piece = pieces[pi];
    const rest = pieces.slice(pi + 1);

    let bestScore = Infinity;
    let bestRectIdx = -1;
    let bestPW = 0, bestPH = 0;

    // Try both orientations in every free rect
    for (let ri = 0; ri < freeRects.length; ri++) {
      const rect = freeRects[ri];
      const orientations: [number, number][] = [];
      if (piece.w <= rect.w && piece.h <= rect.h) orientations.push([piece.w, piece.h]);
      if (piece.h <= rect.w && piece.w <= rect.h && piece.w !== piece.h) orientations.push([piece.h, piece.w]);

      for (const [pw, ph] of orientations) {
        const s = scorePlacement(rect, pw, ph, rest);
        if (s < bestScore) {
          bestScore = s;
          bestRectIdx = ri;
          bestPW = pw;
          bestPH = ph;
        }
      }
    }

    if (bestRectIdx >= 0) {
      const rect = freeRects[bestRectIdx];
      placed.push({ x: rect.x, y: rect.y, w: bestPW, h: bestPH, label: piece.label });

      // Split the used rect
      const newRects = guillotineSplit(rect, bestPW, bestPH);
      freeRects.splice(bestRectIdx, 1, ...newRects);

      // Merge adjacent free rects where possible
      mergeRects(freeRects);
    } else {
      remaining.push(piece);
    }
  }

  // Second pass: retry remaining pieces
  let progress = true;
  while (progress && remaining.length > 0) {
    progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const piece = remaining[i];
      let bestScore = Infinity;
      let bestRectIdx = -1;
      let bestPW = 0, bestPH = 0;

      for (let ri = 0; ri < freeRects.length; ri++) {
        const rect = freeRects[ri];
        const orientations: [number, number][] = [];
        if (piece.w <= rect.w && piece.h <= rect.h) orientations.push([piece.w, piece.h]);
        if (piece.h <= rect.w && piece.w <= rect.h && piece.w !== piece.h) orientations.push([piece.h, piece.w]);

        for (const [pw, ph] of orientations) {
          const s = scorePlacement(rect, pw, ph, remaining);
          if (s < bestScore) { bestScore = s; bestRectIdx = ri; bestPW = pw; bestPH = ph; }
        }
      }

      if (bestRectIdx >= 0) {
        const rect = freeRects[bestRectIdx];
        placed.push({ x: rect.x, y: rect.y, w: bestPW, h: bestPH, label: piece.label });
        const newRects = guillotineSplit(rect, bestPW, bestPH);
        freeRects.splice(bestRectIdx, 1, ...newRects);
        mergeRects(freeRects);
        remaining.splice(i, 1);
        i--;
        progress = true;
      }
    }
  }

  return { placed, remaining };
}

// Merge adjacent free rects that form a larger rectangle
function mergeRects(rects: FreeRect[]): void {
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < rects.length && !merged; i++) {
      for (let j = i + 1; j < rects.length && !merged; j++) {
        const a = rects[i], b = rects[j];
        // Same width, vertically adjacent
        if (a.x === b.x && a.w === b.w) {
          if (Math.abs(a.y + a.h - b.y) < 0.5) {
            rects[i] = { x: a.x, y: a.y, w: a.w, h: a.h + b.h };
            rects.splice(j, 1); merged = true;
          } else if (Math.abs(b.y + b.h - a.y) < 0.5) {
            rects[i] = { x: a.x, y: b.y, w: a.w, h: a.h + b.h };
            rects.splice(j, 1); merged = true;
          }
        }
        // Same height, horizontally adjacent
        if (a.y === b.y && a.h === b.h) {
          if (Math.abs(a.x + a.w - b.x) < 0.5) {
            rects[i] = { x: a.x, y: a.y, w: a.w + b.w, h: a.h };
            rects.splice(j, 1); merged = true;
          } else if (Math.abs(b.x + b.w - a.x) < 0.5) {
            rects[i] = { x: b.x, y: a.y, w: a.w + b.w, h: a.h };
            rects.splice(j, 1); merged = true;
          }
        }
      }
    }
  }
}

// =====================================================================
// COORDINATE-BASED PLACED PIECES → TREE CONVERSION
// =====================================================================
// The tree must follow: ROOT → X (columns) → Y (strips) → Z (segments) → W (stacks) → Q (sub-pieces)
// Columns are defined by unique X coordinates. Within a column, strips by Y height groups.

function placedToTree(
  placed: PlacedPiece[],
  usableW: number,
  usableH: number,
): TreeNode {
  const tree = createRoot(usableW, usableH);
  if (placed.length === 0) return tree;

  // 1. Group by columns (pieces sharing the same x-start)
  // Sort placed pieces by x, then by y
  const sorted = [...placed].sort((a, b) => a.x - b.x || a.y - b.y);

  // Identify column boundaries: unique x positions where columns start
  // A column is a vertical strip from x to x+columnWidth containing pieces
  // We build columns greedily: pieces with same x belong to same column-start group
  const columns = groupIntoColumns(sorted, usableW);

  for (const col of columns) {
    const colX: TreeNode = { id: gid(), tipo: 'X', valor: col.width, multi: 1, filhos: [] };
    tree.filhos.push(colX);

    // 2. Within each column, group pieces into horizontal strips (Y nodes)
    const strips = groupIntoStrips(col.pieces, col.width);

    for (const strip of strips) {
      const yNode: TreeNode = { id: gid(), tipo: 'Y', valor: strip.height, multi: 1, filhos: [] };
      colX.filhos.push(yNode);

      // 3. Within each strip, pieces become Z nodes (width segments)
      // Sort by x within the strip
      const stripPieces = [...strip.pieces].sort((a, b) => a.x - b.x);

      for (const sp of stripPieces) {
        const zNode: TreeNode = { id: gid(), tipo: 'Z', valor: sp.w, multi: 1, filhos: [], label: sp.label };

        if (sp.h < strip.height) {
          // Piece doesn't fill the full strip height → needs W node
          const wNode: TreeNode = { id: gid(), tipo: 'W', valor: sp.h, multi: 1, filhos: [], label: sp.label };
          zNode.filhos.push(wNode);
        }

        yNode.filhos.push(zNode);
      }
    }
  }

  return tree;
}

interface Column {
  x: number;
  width: number;
  pieces: PlacedPiece[];
}

function groupIntoColumns(sorted: PlacedPiece[], usableW: number): Column[] {
  if (sorted.length === 0) return [];

  const columns: Column[] = [];
  let currentX = sorted[0].x;
  let currentPieces: PlacedPiece[] = [];

  for (const p of sorted) {
    if (Math.abs(p.x - currentX) > 0.5 && currentPieces.length > 0) {
      // New column
      const maxRight = Math.max(...currentPieces.map(pp => pp.x + pp.w));
      columns.push({ x: currentX, width: maxRight - currentX, pieces: currentPieces });
      currentX = p.x;
      currentPieces = [p];
    } else {
      currentPieces.push(p);
    }
  }
  if (currentPieces.length > 0) {
    const maxRight = Math.max(...currentPieces.map(pp => pp.x + pp.w));
    columns.push({ x: currentX, width: maxRight - currentX, pieces: currentPieces });
  }

  return columns;
}

interface Strip {
  y: number;
  height: number;
  pieces: PlacedPiece[];
}

function groupIntoStrips(pieces: PlacedPiece[], colWidth: number): Strip[] {
  if (pieces.length === 0) return [];

  // Sort by y
  const sorted = [...pieces].sort((a, b) => a.y - b.y);
  const strips: Strip[] = [];
  let currentY = sorted[0].y;
  let currentPieces: PlacedPiece[] = [];

  for (const p of sorted) {
    if (Math.abs(p.y - currentY) > 0.5 && currentPieces.length > 0) {
      const maxTop = Math.max(...currentPieces.map(pp => pp.y + pp.h));
      strips.push({ y: currentY, height: maxTop - currentY, pieces: currentPieces });
      currentY = p.y;
      currentPieces = [p];
    } else {
      currentPieces.push(p);
    }
  }
  if (currentPieces.length > 0) {
    const maxTop = Math.max(...currentPieces.map(pp => pp.y + pp.h));
    strips.push({ y: currentY, height: maxTop - currentY, pieces: currentPieces });
  }

  return strips;
}

// =====================================================================
// SORT STRATEGIES
// =====================================================================

function getSortStrategies(): Array<(a: { w: number; h: number; area: number }, b: { w: number; h: number; area: number }) => number> {
  return [
    // 1. Largest area first
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    // 2. Tallest first
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    // 3. By height desc
    (a, b) => b.h - a.h || b.w - a.w,
    // 4. By width desc
    (a, b) => b.w - a.w || b.h - a.h,
    // 5. Perimeter desc
    (a, b) => (b.w + b.h) - (a.w + a.h),
    // 6. Aspect ratio desc (wide first)
    (a, b) => (b.w / b.h) - (a.w / a.h),
    // 7. Shortest side desc
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    // 8. Most extreme aspect ratio first
    (a, b) => {
      const ra = Math.max(a.w, a.h) / Math.min(a.w, a.h);
      const rb = Math.max(b.w, b.h) / Math.min(b.w, b.h);
      return rb - ra;
    },
    // 9. Longest side desc
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    // 10. Compact ratio (area / perimeter)
    (a, b) => (b.w * b.h) / (b.w + b.h) - (a.w * a.h) / (a.w + a.h),
    // 11. Smallest area first (fill gaps)
    (a, b) => a.area - b.area,
    // 12. Widest first
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w - a.w,
  ];
}

// =====================================================================
// MAIN OPTIMIZER — PURE HEURISTIC
// =====================================================================

export function optimizeV6(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0
): { tree: TreeNode; remaining: Piece[] } {
  if (pieces.length === 0) return { tree: createRoot(usableW, usableH), remaining: [] };

  const strategies = getSortStrategies();

  let bestTree: TreeNode | null = null;
  let bestArea = -1;
  let bestRemaining: Piece[] = pieces;

  // Try: each sort strategy × normal/rotated-all
  for (const sortFn of strategies) {
    for (const rotateAll of [false, true]) {
      const work = pieces.map(p => {
        if (rotateAll) return { ...p, w: p.h, h: p.w, area: p.area };
        return { ...p };
      });
      work.sort(sortFn);

      const { placed, remaining } = placePieces(work, usableW, usableH);
      const area = placed.reduce((s, p) => s + p.w * p.h, 0);

      if (area > bestArea || (area === bestArea && remaining.length < bestRemaining.length)) {
        bestArea = area;
        bestTree = placedToTree(placed, usableW, usableH);
        bestRemaining = remaining.map(r => ({ ...r, area: r.w * r.h }));
      }
    }
  }

  return { tree: bestTree || createRoot(usableW, usableH), remaining: bestRemaining };
}

// =====================================================================
// MULTI-SHEET OPTIMIZER
// =====================================================================

export function optimizeMultiSheet(
  allPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
): Array<{ tree: TreeNode; usedArea: number }> {
  const sheets: Array<{ tree: TreeNode; usedArea: number }> = [];
  let remaining = [...allPieces];
  let safety = 0;

  while (remaining.length > 0 && safety < 100) {
    safety++;
    const result = optimizeV6(remaining, usableW, usableH, minBreak);
    const area = calcPlacedArea(result.tree);
    if (area === 0) break; // can't place anything more
    sheets.push({ tree: result.tree, usedArea: area });
    remaining = result.remaining.map(r => ({ ...r, area: r.w * r.h })) as Piece[];
  }

  return sheets;
}

// =====================================================================
// BACKWARD-COMPATIBLE EXPORTS
// =====================================================================

export function optimizeGeneticV1(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0
): TreeNode {
  return optimizeV6(pieces, usableW, usableH, minBreak).tree;
}

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  onProgress?: (p: OptimizationProgress) => void
): Promise<TreeNode> {
  if (onProgress) onProgress({ phase: 'Otimizando...', current: 0, total: 1 });
  await new Promise(r => setTimeout(r, 5));

  const result = optimizeV6(pieces, usableW, usableH, minBreak);

  if (onProgress) onProgress({ phase: 'Concluído', current: 1, total: 1 });
  return result.tree;
}
