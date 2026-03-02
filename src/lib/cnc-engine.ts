// CNC Cut Plan Engine v2 — Clean Guillotine Bin-Packing Rewrite
// Architecture: 4 placement strategies (W_IN_Z, Z_IN_Y, NEW_Y, NEW_X)
// Each piece evaluates all strategies, picks best score. No grouping complexity.
// Dimensions validated BEFORE insertion. GA evolves order + rotation + column strategy.

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

// ===== Tree Utilities =====
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

// ===== Helpers =====

function oris(p: { w: number; h: number }): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [{ w: p.w, h: p.h }, { w: p.h, h: p.w }];
}

function childSum(node: TreeNode): number {
  return node.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
}

function canAnyFit(pieces: Piece[], maxW: number, maxH: number): boolean {
  for (const p of pieces) {
    for (const o of oris(p)) {
      if (o.w <= maxW && o.h <= maxH) return true;
    }
  }
  return false;
}

// ===== MinBreak Helpers =====

function getZCutPositions(yNode: TreeNode): number[] {
  const pos: number[] = [];
  let acc = 0;
  for (const z of yNode.filhos) { acc += z.valor * z.multi; pos.push(acc); }
  return pos;
}

function violatesZMinBreak(newPositions: number[], colX: TreeNode, excludeYIdx: number, minBreak: number): boolean {
  for (let i = 0; i < colX.filhos.length; i++) {
    if (i === excludeYIdx) continue;
    const existing = getZCutPositions(colX.filhos[i]);
    for (const ep of existing) {
      for (const np of newPositions) {
        const d = Math.abs(ep - np);
        if (d > 0 && d < minBreak) return true;
      }
    }
  }
  return false;
}

function checkWMinBreak(zNode: TreeNode, newH: number, minBreak: number): boolean {
  for (const w of zNode.filhos) {
    const d = Math.abs(w.valor - newH);
    if (d > 0 && d < minBreak) return false;
  }
  return true;
}

function checkYMinBreak(colX: TreeNode, newH: number, minBreak: number): boolean {
  for (const y of colX.filhos) {
    const d = Math.abs(y.valor - newH);
    if (d > 0 && d < minBreak) return false;
  }
  return true;
}

function checkXMinBreak(tree: TreeNode, newW: number, minBreak: number): boolean {
  for (const x of tree.filhos) {
    const d = Math.abs(x.valor - newW);
    if (d > 0 && d < minBreak) return false;
  }
  return true;
}

// ===== Scoring =====

function scoreFit(
  spaceW: number, spaceH: number,
  pieceW: number, pieceH: number,
  strategyPriority: number,
  remaining: Piece[]
): number {
  const spaceArea = spaceW * spaceH;
  const pieceArea = pieceW * pieceH;
  const wasteRatio = spaceArea > 0 ? 1 - pieceArea / spaceArea : 1;

  let s = wasteRatio + strategyPriority;

  // Exact fit bonuses
  if (pieceW === spaceW) s -= 0.15;
  if (pieceH === spaceH) s -= 0.15;

  // Lookahead: check if residuals are usable
  const resW = spaceW - pieceW;
  const resH = spaceH - pieceH;
  let wUsable = resW <= 0, hUsable = resH <= 0;

  for (let i = 0; i < Math.min(remaining.length, 8); i++) {
    if (wUsable && hUsable) break;
    for (const o of oris(remaining[i])) {
      if (!wUsable && o.w <= resW && o.h <= spaceH) wUsable = true;
      if (!hUsable && o.w <= spaceW && o.h <= resH) hUsable = true;
    }
  }

  if (!wUsable && resW > 0) s += 0.2;
  if (!hUsable && resH > 0) s += 0.2;

  return s;
}

// ===== Placement Candidate =====

interface PlacementCandidate {
  strategy: 'W_IN_Z' | 'Z_IN_Y' | 'NEW_Y' | 'NEW_X';
  score: number;
  ori: { w: number; h: number };
  colX?: TreeNode;
  yNode?: TreeNode;
  zNode?: TreeNode;
  effectiveW?: number;
  yHeight?: number;
}

// ===== Find Best Placement =====

function findBestPlacement(
  tree: TreeNode,
  piece: Piece,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  forceFullWidth: boolean
): PlacementCandidate | null {
  let best: PlacementCandidate | null = null;

  // === Strategy 1: W_IN_Z (fill vertical space in existing Z) ===
  for (const colX of tree.filhos) {
    for (const yNode of colX.filhos) {
      for (const zNode of yNode.filhos) {
        const usedH = childSum(zNode);
        const freeH = yNode.valor - usedH;
        if (freeH <= 0) continue;

        for (const ori of oris(piece)) {
          if (ori.w > zNode.valor || ori.h > freeH) continue;
          if (minBreak > 0 && !checkWMinBreak(zNode, ori.h, minBreak)) continue;

          const s = scoreFit(zNode.valor, freeH, ori.w, ori.h, -0.3, remaining);
          if (!best || s < best.score) {
            best = { strategy: 'W_IN_Z', score: s, ori, colX, yNode, zNode };
          }
        }
      }
    }
  }

  // === Strategy 2: Z_IN_Y (fill horizontal space in existing Y strip) ===
  for (const colX of tree.filhos) {
    for (let yi = 0; yi < colX.filhos.length; yi++) {
      const yNode = colX.filhos[yi];
      const usedZ = childSum(yNode);
      const freeW = colX.valor - usedZ;
      if (freeW <= 0) continue;

      for (const ori of oris(piece)) {
        if (ori.w > freeW || ori.h > yNode.valor) continue;
        if (minBreak > 0) {
          const newCutPos = usedZ + ori.w;
          if (violatesZMinBreak([newCutPos], colX, yi, minBreak)) continue;
        }

        const s = scoreFit(freeW, yNode.valor, ori.w, ori.h, -0.2, remaining);
        if (!best || s < best.score) {
          best = { strategy: 'Z_IN_Y', score: s, ori, colX, yNode };
        }
      }
    }
  }

  // === Strategy 3: NEW_Y (new strip in existing column) ===
  for (const colX of tree.filhos) {
    const usedH = childSum(colX);
    const freeH = usableH - usedH;
    if (freeH <= 0) continue;

    for (const ori of oris(piece)) {
      if (ori.w > colX.valor || ori.h > freeH) continue;
      if (minBreak > 0 && !checkYMinBreak(colX, ori.h, minBreak)) continue;

      // Absorb unusable residual height
      let yHeight = ori.h;
      const resH = freeH - ori.h;
      if (resH > 0 && !canAnyFit(remaining, colX.valor, resH)) {
        yHeight = freeH;
      }

      const s = scoreFit(colX.valor, freeH, ori.w, ori.h, -0.1, remaining);
      if (!best || s < best.score) {
        best = { strategy: 'NEW_Y', score: s, ori, colX, yHeight };
      }
    }
  }

  // === Strategy 4: NEW_X (new column) ===
  const usedW = childSum(tree);
  const freeW = usableW - usedW;
  if (freeW > 0) {
    for (const ori of oris(piece)) {
      if (ori.w > freeW || ori.h > usableH) continue;

      let effectiveW = forceFullWidth ? freeW : ori.w;
      if (!forceFullWidth) {
        const resW = freeW - ori.w;
        if (resW > 0 && !canAnyFit(remaining, resW, usableH)) {
          effectiveW = freeW;
        }
      }

      if (minBreak > 0 && !checkXMinBreak(tree, effectiveW, minBreak)) continue;

      // Absorb unusable residual height
      let yHeight = ori.h;
      const resH = usableH - ori.h;
      if (resH > 0 && !canAnyFit(remaining, effectiveW, resH)) {
        yHeight = usableH;
      }

      const s = scoreFit(effectiveW, usableH, ori.w, ori.h, 0, remaining);
      if (!best || s < best.score) {
        best = { strategy: 'NEW_X', score: s, ori, effectiveW, yHeight };
      }
    }
  }

  return best;
}

// ===== Execute Placement =====

function executePlacement(tree: TreeNode, cand: PlacementCandidate, piece: Piece): number {
  switch (cand.strategy) {
    case 'W_IN_Z': {
      const wNode: TreeNode = { id: gid(), tipo: 'W', valor: cand.ori.h, multi: 1, filhos: [], label: piece.label };
      cand.zNode!.filhos.push(wNode);
      if (cand.ori.w < cand.zNode!.valor) {
        wNode.filhos.push({ id: gid(), tipo: 'Q', valor: cand.ori.w, multi: 1, filhos: [], label: piece.label });
      }
      return cand.ori.w * cand.ori.h;
    }
    case 'Z_IN_Y': {
      const zNode: TreeNode = { id: gid(), tipo: 'Z', valor: cand.ori.w, multi: 1, filhos: [], label: piece.label };
      cand.yNode!.filhos.push(zNode);
      if (cand.ori.h < cand.yNode!.valor) {
        zNode.filhos.push({ id: gid(), tipo: 'W', valor: cand.ori.h, multi: 1, filhos: [], label: piece.label });
      }
      return cand.ori.w * cand.ori.h;
    }
    case 'NEW_Y': {
      const yHeight = cand.yHeight || cand.ori.h;
      const yNode: TreeNode = { id: gid(), tipo: 'Y', valor: yHeight, multi: 1, filhos: [] };
      cand.colX!.filhos.push(yNode);
      const zNode: TreeNode = { id: gid(), tipo: 'Z', valor: cand.ori.w, multi: 1, filhos: [], label: piece.label };
      yNode.filhos.push(zNode);
      if (cand.ori.h < yHeight) {
        zNode.filhos.push({ id: gid(), tipo: 'W', valor: cand.ori.h, multi: 1, filhos: [], label: piece.label });
      }
      return cand.ori.w * cand.ori.h;
    }
    case 'NEW_X': {
      const effectiveW = cand.effectiveW || cand.ori.w;
      const yHeight = cand.yHeight || cand.ori.h;
      const colX: TreeNode = { id: gid(), tipo: 'X', valor: effectiveW, multi: 1, filhos: [] };
      tree.filhos.push(colX);
      const yNode: TreeNode = { id: gid(), tipo: 'Y', valor: yHeight, multi: 1, filhos: [] };
      colX.filhos.push(yNode);
      const zNode: TreeNode = { id: gid(), tipo: 'Z', valor: cand.ori.w, multi: 1, filhos: [], label: piece.label };
      yNode.filhos.push(zNode);
      if (cand.ori.h < yHeight) {
        zNode.filhos.push({ id: gid(), tipo: 'W', valor: cand.ori.h, multi: 1, filhos: [], label: piece.label });
      }
      return cand.ori.w * cand.ori.h;
    }
  }
  return 0;
}

// ===== Main Placement Engine =====

function runPlacement(
  inventory: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  forceFullWidth: boolean = false
): { tree: TreeNode; area: number; remaining: Piece[] } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const skipped: Piece[] = [];

  // Pass 1: place pieces in genome order
  for (let i = 0; i < inventory.length; i++) {
    const piece = inventory[i];
    // Quick check: can piece fit on sheet at all?
    const canFit = oris(piece).some(o => o.w <= usableW && o.h <= usableH);
    if (!canFit) { skipped.push(piece); continue; }

    const rest = inventory.slice(i + 1).concat(skipped);
    const best = findBestPlacement(tree, piece, rest, usableW, usableH, minBreak, forceFullWidth);
    if (best) {
      placedArea += executePlacement(tree, best, piece);
    } else {
      skipped.push(piece);
    }
  }

  // Pass 2: retry skipped pieces (new spaces opened by later placements)
  let progress = true;
  while (progress && skipped.length > 0) {
    progress = false;
    for (let i = 0; i < skipped.length; i++) {
      const best = findBestPlacement(tree, skipped[i], skipped, usableW, usableH, minBreak, forceFullWidth);
      if (best) {
        placedArea += executePlacement(tree, best, skipped[i]);
        skipped.splice(i, 1);
        i--;
        progress = true;
      }
    }
  }

  return { tree, area: placedArea, remaining: skipped };
}

// ===== Deterministic Optimizer (tries multiple sort strategies) =====

function getSortStrategies(): ((a: Piece, b: Piece) => number)[] {
  return [
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => (b.w + b.h) - (a.w + a.h),
    (a, b) => (b.w / b.h) - (a.w / a.h),
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    (a, b) => { const ra = Math.max(a.w, a.h) / Math.min(a.w, a.h); const rb = Math.max(b.w, b.h) / Math.min(b.w, b.h); return rb - ra; },
    (a, b) => b.area - a.area || b.w - a.w,
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => (b.w * b.h) / (b.w + b.h) - (a.w * a.h) / (a.w + a.h),
    (a, b) => a.area - b.area, // ascending area (small first)
  ];
}

export function optimizeV6(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0
): { tree: TreeNode; remaining: Piece[] } {
  if (pieces.length === 0) return { tree: createRoot(usableW, usableH), remaining: [] };

  const strategies = getSortStrategies();
  const variants: Piece[][] = [
    pieces,
    pieces.map(p => ({ ...p, w: p.h, h: p.w })),
  ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;
  let bestRemaining: Piece[] = [];

  for (const variant of variants) {
    for (const sortFn of strategies) {
      for (const fullWidth of [false, true]) {
        const sorted = [...variant].sort(sortFn);
        const result = runPlacement(sorted, usableW, usableH, minBreak, fullWidth);
        if (result.area > bestArea) {
          bestArea = result.area;
          bestTree = result.tree;
          bestRemaining = result.remaining;
        }
      }
    }
  }

  return { tree: bestTree || createRoot(usableW, usableH), remaining: bestRemaining };
}

// ===== Genetic Algorithm =====

interface GAIndividual {
  genome: number[];
  rotations: boolean[];
  forceFullWidth: boolean;
}

function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  forceFullWidth: boolean,
  maxSheets: number = 5
): { fitness: number; firstTree: TreeNode; sheets: number } {
  let remaining = [...workPieces];
  let totalArea = 0;
  let firstTree: TreeNode | null = null;
  let sheets = 0;
  const sheetArea = usableW * usableH;

  while (remaining.length > 0 && sheets < maxSheets) {
    const result = runPlacement(remaining, usableW, usableH, minBreak, forceFullWidth);
    if (result.area === 0) break;
    if (sheets === 0) firstTree = result.tree;
    totalArea += result.area;
    remaining = result.remaining;
    sheets++;
  }

  let fitness = sheets > 0 ? (totalArea / (sheetArea * sheets)) : 0;
  // Penalty for unplaced pieces
  if (remaining.length > 0) {
    fitness *= (1 - remaining.length / workPieces.length * 0.5);
  }
  // Bonus for fewer sheets
  fitness += (1 / (sheets || 1)) * 0.05;

  return { fitness: Math.max(0, fitness), firstTree: firstTree || createRoot(usableW, usableH), sheets };
}

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  onProgress?: (p: OptimizationProgress) => void
): Promise<TreeNode> {
  const populationSize = 40;
  const generations = 30;
  const eliteCount = 3;
  const mutationRate = 0.15;
  const numPieces = pieces.length;

  // === Helper functions ===
  function randomIndividual(): GAIndividual {
    const genome = Array.from({ length: numPieces }, (_, i) => i);
    for (let i = genome.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [genome[i], genome[j]] = [genome[j], genome[i]];
    }
    return {
      genome,
      rotations: Array.from({ length: numPieces }, () => Math.random() > 0.5),
      forceFullWidth: Math.random() > 0.5,
    };
  }

  function buildPieces(ind: GAIndividual): Piece[] {
    return ind.genome.map((idx, i) => {
      const p = { ...pieces[idx] };
      if (ind.rotations[i]) { const tmp = p.w; p.w = p.h; p.h = tmp; }
      return p;
    });
  }

  function evaluate(ind: GAIndividual): { tree: TreeNode; fitness: number } {
    const work = buildPieces(ind);
    const result = simulateSheets(work, usableW, usableH, minBreak, ind.forceFullWidth);
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
    for (let i = start; i <= end; i++) childGenome[i] = pA.genome[i];
    let current = 0;
    for (let i = 0; i < size; i++) {
      const gene = pB.genome[i];
      if (!childGenome.includes(gene)) {
        while (childGenome[current] !== -1) current++;
        childGenome[current] = gene;
      }
    }
    return {
      genome: childGenome,
      rotations: pA.rotations.map((r, i) => Math.random() > 0.5 ? r : pB.rotations[i]),
      forceFullWidth: Math.random() > 0.5 ? pA.forceFullWidth : pB.forceFullWidth,
    };
  }

  function mutate(ind: GAIndividual): GAIndividual {
    const c: GAIndividual = { genome: [...ind.genome], rotations: [...ind.rotations], forceFullWidth: ind.forceFullWidth };
    const r = Math.random();
    if (r < 0.25) {
      // Swap mutation
      const a = Math.floor(Math.random() * c.genome.length);
      const b = Math.floor(Math.random() * c.genome.length);
      [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
    } else if (r < 0.5) {
      // Block move mutation
      if (c.genome.length > 3) {
        const blockSize = Math.floor(Math.random() * Math.min(5, c.genome.length / 2)) + 2;
        const start = Math.floor(Math.random() * (c.genome.length - blockSize));
        const segment = c.genome.splice(start, blockSize);
        const target = Math.floor(Math.random() * c.genome.length);
        c.genome.splice(target, 0, ...segment);
      }
    } else if (r < 0.7) {
      // Reversal mutation (reverse a segment)
      if (c.genome.length > 3) {
        const start = Math.floor(Math.random() * (c.genome.length - 2));
        const end = start + Math.floor(Math.random() * Math.min(6, c.genome.length - start)) + 2;
        const segment = c.genome.slice(start, end).reverse();
        c.genome.splice(start, segment.length, ...segment);
      }
    } else if (r < 0.85) {
      // Rotation mutation
      const count = Math.max(1, Math.floor(c.rotations.length * 0.1));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * c.rotations.length);
        c.rotations[idx] = !c.rotations[idx];
      }
    } else {
      // Full-width mutation
      c.forceFullWidth = !c.forceFullWidth;
    }
    return c;
  }

  // === Seed population ===
  const initialPop: GAIndividual[] = [];
  const strategies = getSortStrategies();

  // Seed with deterministic strategies
  strategies.forEach(sortFn => {
    const sortedIndices = Array.from({ length: numPieces }, (_, i) => i)
      .sort((a, b) => sortFn(pieces[a], pieces[b]));
    initialPop.push({
      genome: sortedIndices,
      rotations: Array.from({ length: numPieces }, () => false),
      forceFullWidth: false,
    });
    if (initialPop.length < populationSize) {
      initialPop.push({
        genome: [...sortedIndices],
        rotations: Array.from({ length: numPieces }, () => false),
        forceFullWidth: true,
      });
    }
  });

  // Fill rest with random
  while (initialPop.length < populationSize) {
    initialPop.push(randomIndividual());
  }

  let population = initialPop.slice(0, populationSize);
  let bestTree: TreeNode | null = null;
  let bestFitness = -1;

  if (onProgress) {
    onProgress({ phase: 'Iniciando otimização...', current: 0, total: generations });
  }

  // === Evolution loop ===
  for (let g = 0; g < generations; g++) {
    const evaluated = population.map(ind => {
      const result = evaluate(ind);
      return { ind, tree: result.tree, fitness: result.fitness };
    });

    evaluated.sort((a, b) => b.fitness - a.fitness);

    if (evaluated[0].fitness > bestFitness) {
      bestFitness = evaluated[0].fitness;
      bestTree = JSON.parse(JSON.stringify(evaluated[0].tree));
    }

    if (onProgress) {
      onProgress({
        phase: 'Otimização Evolutiva',
        current: g + 1,
        total: generations,
        bestUtil: bestFitness * 100,
      });
    }

    if (g % 3 === 0) await new Promise(r => setTimeout(r, 0));

    // Next generation
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
      } else if (Math.random() < 0.3) {
        nextPop.push(randomIndividual());
      }
    }
    population = nextPop;
  }

  // Also try deterministic V6 and keep best
  const v6Result = optimizeV6(pieces, usableW, usableH, minBreak);
  const v6Area = calcPlacedArea(v6Result.tree);
  const v6Fitness = v6Area / (usableW * usableH);

  if (v6Fitness > bestFitness) {
    bestTree = v6Result.tree;
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
