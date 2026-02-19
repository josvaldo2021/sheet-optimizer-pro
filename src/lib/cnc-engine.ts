// CNC Cut Plan Engine with IMPROVED Height Grouping
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
  /** Axis along which pieces were grouped */
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

  // Check minimum break distance constraint
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

// ========== IMPROVED GROUPING ALGORITHMS ==========

/**
 * Agrupamento por Altura V2 — Column-Aware
 * 
 * Agrupa peças com mesma altura somando larguras, respeitando usableW.
 * Remove o cap fixo de 3 peças: agrupa tantas quanto cabem na largura útil.
 * Score baseado em aproveitamento do leftover vertical.
 * 
 * Exemplo com usableW=2750, usableH=2750, peças 734×951:
 *   4×734 = 2936 > 2750 → tenta 3×734 = 2202 ✓
 *   strips = floor(2750/951) = 2, leftover = 848
 *   Se alguma peça cabe em 2202×848 → bonus no score
 */
function groupPiecesByHeight(
  pieces: Piece[],
  usableW: number = Infinity,
  usableH: number = 0,
  allPieces?: Piece[]
): Piece[] {
  const heightGroups = new Map<number, Piece[]>();

  pieces.forEach(p => {
    const h = Math.min(p.w, p.h);
    if (!heightGroups.has(h)) heightGroups.set(h, []);
    heightGroups.get(h)!.push(p);
  });

  const result: Piece[] = [];
  const inventory = allPieces || pieces;

  heightGroups.forEach(group => {
    const normalized = group.map(p => ({
      ...p,
      nw: Math.max(p.w, p.h),
      nh: Math.min(p.w, p.h)
    })).sort((a, b) => a.nw - b.nw); // ascending width for greedy packing

    let i = 0;
    while (i < normalized.length) {
      if (i + 1 >= normalized.length) {
        result.push({
          w: normalized[i].nw,
          h: normalized[i].nh,
          area: normalized[i].nw * normalized[i].nh,
          count: 1,
          label: normalized[i].label
        });
        i++;
        continue;
      }

      const h = normalized[i].nh;

      // Try group sizes from 2 up to what fits in usableW
      let bestGroupSize = 1;
      let bestScore = -Infinity;

      let accumW = 0;
      for (let gs = 1; gs <= normalized.length - i && gs <= 10; gs++) {
        accumW += normalized[i + gs - 1].nw;
        if (accumW > usableW) break;
        if (gs < 2) continue;

        // Calculate vertical strips possible
        const strips = usableH > 0 ? Math.floor(usableH / h) : 1;
        const leftoverH = usableH > 0 ? usableH - strips * h : 0;

        // Base score: width utilization × strip count
        let score = (accumW / (usableW || accumW)) * strips;

        // Bonus: leftover height can fit pieces
        if (leftoverH > 0) {
          for (const inv of inventory) {
            for (const o of oris(inv)) {
              if (o.w <= accumW && o.h <= leftoverH) {
                score += 0.5; // significant bonus for usable leftover
                break;
              }
            }
            if (score > bestScore + 1) break; // early exit if already good
          }
        }

        // Bonus: fills width tightly (>85%)
        if (accumW / (usableW || accumW) > 0.85) score += 0.3;

        // Bonus: even sizes for symmetry
        if (gs % 2 === 0) score += 0.05;

        if (score > bestScore) {
          bestScore = score;
          bestGroupSize = gs;
        }
      }

      if (bestGroupSize >= 2) {
        let sumW = 0;
        const groupedLabels: string[] = [];
        for (let k = 0; k < bestGroupSize; k++) {
          sumW += normalized[i + k].nw;
          if (normalized[i + k].label) groupedLabels.push(normalized[i + k].label!);
        }

        result.push({
          w: sumW,
          h,
          area: sumW * h,
          count: bestGroupSize,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: 'w'
        });
        i += bestGroupSize;
      } else {
        result.push({
          w: normalized[i].nw,
          h: normalized[i].nh,
          area: normalized[i].nw * normalized[i].nh,
          count: 1,
          label: normalized[i].label
        });
        i++;
      }
    }
  });

  return result;
}

/**
 * Greedy Row Grouping — preenche cada linha até usableW
 * 
 * Diferente do agrupamento por altura (que tenta tamanhos ótimos),
 * este empacota greedily peças lado a lado até encher a largura,
 * maximizando o número de peças por fita Y.
 */
function greedyRowGrouping(
  pieces: Piece[],
  usableW: number,
  usableH: number = 0
): Piece[] {
  const heightGroups = new Map<number, { nw: number; nh: number; piece: Piece }[]>();

  pieces.forEach(p => {
    const h = Math.min(p.w, p.h);
    if (!heightGroups.has(h)) heightGroups.set(h, []);
    heightGroups.get(h)!.push({
      nw: Math.max(p.w, p.h),
      nh: Math.min(p.w, p.h),
      piece: p
    });
  });

  const result: Piece[] = [];

  heightGroups.forEach(group => {
    // Sort by width descending for better first-fit
    group.sort((a, b) => b.nw - a.nw);

    let i = 0;
    while (i < group.length) {
      // Greedy: accumulate pieces until we can't fit more
      let sumW = group[i].nw;
      const batch = [group[i]];
      let j = i + 1;

      while (j < group.length) {
        if (sumW + group[j].nw <= usableW) {
          sumW += group[j].nw;
          batch.push(group[j]);
          j++;
        } else {
          j++;
        }
      }

      if (batch.length >= 2) {
        const h = batch[0].nh;
        const groupedLabels: string[] = [];
        batch.forEach(b => {
          if (b.piece.label) groupedLabels.push(b.piece.label!);
        });

        result.push({
          w: sumW,
          h,
          area: sumW * h,
          count: batch.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: 'w'
        });

        // Remove used items from group
        const usedSet = new Set(batch);
        group = group.filter(g => !usedSet.has(g));
        // Don't increment i, re-process from same position
      } else {
        result.push({
          w: group[i].nw,
          h: group[i].nh,
          area: group[i].nw * group[i].nh,
          count: 1,
          label: group[i].piece.label
        });
        i++;
      }
    }
  });

  return result;
}

/**
 * Agrupamento por Largura (implementação original mantida)
 */
function groupPiecesByWidth(pieces: Piece[]): Piece[] {
  const widthGroups = new Map<number, Piece[]>();

  pieces.forEach(p => {
    const w = Math.max(p.w, p.h);
    if (!widthGroups.has(w)) widthGroups.set(w, []);
    widthGroups.get(w)!.push(p);
  });

  const result: Piece[] = [];

  widthGroups.forEach(group => {
    const sorted = group.map(p => ({
      ...p,
      nw: Math.max(p.w, p.h),
      nh: Math.min(p.w, p.h)
    })).sort((a, b) => b.nh - a.nh);

    let i = 0;
    while (i < sorted.length) {
      if (i + 1 < sorted.length) {
        const w = sorted[i].nw;
        const sumH = sorted[i].nh + sorted[i + 1].nh;

        const groupedLabels: string[] = [];
        if (sorted[i].label) groupedLabels.push(sorted[i].label);
        if (sorted[i + 1].label) groupedLabels.push(sorted[i + 1].label);

        result.push({
          w,
          h: sumH,
          area: w * sumH,
          count: 2,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: 'h' // Agrupou alturas (somou H), mantendo largura fixa
        });

        sorted.splice(i + 1, 1);
        sorted.splice(i, 1);
        continue;
      }

      result.push({
        w: sorted[i].nw,
        h: sorted[i].nh,
        area: sorted[i].nw * sorted[i].nh,
        count: 1,
        label: sorted[i].label
      });
      i++;
    }
  });

  return result;
}

function oris(p: Piece): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [{ w: p.w, h: p.h }, { w: p.h, h: p.w }];
}

// ========== SCORING WITH LOOKAHEAD ==========

function scoreFit(
  spaceW: number,
  spaceH: number,
  pieceW: number,
  pieceH: number,
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
  axis: 'w' | 'h' = 'w'
): boolean {
  if (residualW <= 0 || residualH <= 0) return false;
  for (const p of remainingPieces) {
    for (const o of oris(p)) {
      if (o.w <= residualW && o.h <= residualH) {
        // Check minBreak against existing siblings
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
  return colX.filhos.map(y => getZCutPositions(y));
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

// ========== VOID FILLING ==========

function fillVoids(tree: TreeNode, remaining: Piece[], usableW: number, usableH: number, minBreak: number = 0): number {
  let filledArea = 0;

  for (const colX of tree.filhos) {
    // Void in Y direction (remaining height in column)
    const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const freeH = usableH - usedH;
    if (freeH > 0) {
      filledArea += fillRect(tree, colX, remaining, colX.valor, freeH, 'Y', minBreak);
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

function fillRect(tree: TreeNode, colX: TreeNode, remaining: Piece[], maxW: number, maxH: number, _level: string, minBreak: number = 0): number {
  let filled = 0;

  for (let i = 0; i < remaining.length; i++) {
    if (maxH <= 0) break;

    const pc = remaining[i];
    let bestO: { w: number; h: number } | null = null;
    let bestScore = Infinity;

    for (const o of oris(pc)) {
      if (o.w <= maxW && o.h <= maxH) {
        // Check minBreak for Y height and Z cut positions across all Y strips
        if (minBreak > 0) {
          if (o.h < minBreak) continue;
          // Check Z cut positions: new piece creates a cut at position o.w
          const allZPositions = getAllZCutPositionsInColumn(colX);
          if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
        }
        const s = scoreFit(maxW, maxH, o.w, o.h, remaining);
        if (s < bestScore) {
          bestScore = s;
          bestO = o;
        }
      }
    }

    if (bestO) {
      // Residual dominance: extend Y container if residual can't fit anything
      let consumed = bestO.h;
      const residualH = maxH - bestO.h;
      if (residualH > 0 && !canResidualFitAnyPiece(maxW, residualH, remaining, minBreak)) {
        consumed = maxH;
      }
      const yId = insertNode(tree, colX.id, 'Y', consumed, 1);
      const yNode = findNode(tree, yId)!;

      createPieceNodes(tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);

      filled += bestO.w * bestO.h;
      maxH -= consumed;
      remaining.splice(i, 1);
      i--;
    }
  }

  return filled;
}

function fillRectZ(_tree: TreeNode, yNode: TreeNode, remaining: Piece[], maxW: number, maxH: number, minBreak: number = 0): number {
  let filled = 0;

  for (let i = 0; i < remaining.length; i++) {
    if (maxW <= 0) break;

    const pc = remaining[i];
    let bestO: { w: number; h: number } | null = null;
    let bestScore = Infinity;

    for (const o of oris(pc)) {
      if (o.w <= maxW && o.h <= maxH) {
        // Check minBreak for Z cut positions across all Y strips in parent column
        if (minBreak > 0) {
          const parentX = _tree.filhos.find(x => x.filhos.some(y => y.id === yNode.id));
          if (parentX) {
            const yIndex = parentX.filhos.indexOf(yNode);
            const allZPositions = getAllZCutPositionsInColumn(parentX);
            // Current offset in this Y strip
            const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
            const newCutPos = currentOffset + o.w;
            if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
          }
        }
        const s = scoreFit(maxW, maxH, o.w, o.h, remaining);
        if (s < bestScore) {
          bestScore = s;
          bestO = o;
        }
      }
    }

    if (bestO) {
      // Residual dominance: skip unusable residual for loop optimization
      let consumed = bestO.w;
      const residualW = maxW - bestO.w;
      if (residualW > 0 && !canResidualFitAnyPiece(residualW, maxH, remaining, minBreak)) {
        consumed = maxW;
      }
      createPieceNodes(_tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);
      filled += bestO.w * bestO.h;
      maxW -= consumed;
      remaining.splice(i, 1);
      i--;
    }
  }

  return filled;
}

function fillRectW(tree: TreeNode, remaining: Piece[], zNode: TreeNode, zWidth: number, maxH: number, minBreak: number = 0): number {
  let filled = 0;

  for (let i = 0; i < remaining.length; i++) {
    if (maxH <= 0) break;

    const pc = remaining[i];
    for (const o of oris(pc)) {
      if (o.w <= zWidth && o.h <= maxH) {
        // Check minBreak for W siblings
        if (minBreak > 0) {
          const violates = zNode.filhos.some(w => {
            const diff = Math.abs(w.valor - o.h);
            return diff > 0 && diff < minBreak;
          });
          if (violates) continue;
        }
        // Residual dominance: skip unusable residual for loop optimization
        let consumed = o.h;
        const residualH = maxH - o.h;
        if (residualH > 0 && !canResidualFitAnyPiece(zWidth, residualH, remaining, minBreak)) {
          consumed = maxH;
        }

        const actualRotated = (o.w !== pc.w);
        createPieceNodes(tree, zNode, pc, o.w, o.h, actualRotated, zNode);

        filled += o.w * o.h;
        maxH -= consumed;
        remaining.splice(i, 1);
        i--;
        break;
      }
    }
  }

  return filled;
}

// ========== MAIN OPTIMIZER V6 IMPROVED ==========

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

  const rotated = pieces.map(p => ({ ...p, w: p.h, h: p.w }));
  const rotatedNoLabel = pieces.map(p => ({ w: p.h, h: p.w, area: p.area, count: p.count }));

  const pieceVariants: Piece[][] = hasLabels ? [
    pieces,
    rotated,
  ] : useGrouping === false ? [
    pieces,
    rotatedNoLabel,
  ] : [
    pieces,
    rotatedNoLabel,
    // Height grouping with column awareness (passes usableW/usableH for smart sizing)
    groupPiecesByHeight(pieces, usableW, usableH, pieces),
    groupPiecesByHeight(rotatedNoLabel, usableW, usableH, pieces),
    // Width grouping
    groupPiecesByWidth(pieces),
    groupPiecesByWidth(rotatedNoLabel),
    // Greedy row grouping (fills rows up to usableW)
    greedyRowGrouping(pieces, usableW, usableH),
    greedyRowGrouping(rotatedNoLabel, usableW, usableH),
    // Legacy height grouping (no column awareness, for diversity)
    groupPiecesByHeight(pieces),
  ];

  let bestTree: TreeNode | null = null;
  let bestRemaining: Piece[] = pieces;
  let bestSheets = Infinity;
  let bestArea = 0;

  for (const variant of pieceVariants) {
    for (const sortFn of strategies) {
      const sorted = [...variant].sort(sortFn);
      // Simulate ALL sheets for this strategy
      const sim = simulateSheets(sorted, usableW, usableH, minBreak, 100);
      const result = runPlacement(sorted, usableW, usableH, minBreak);
      
      // Compare: fewer sheets first, then higher area on first sheet
      if (sim.sheetsUsed < bestSheets || 
          (sim.sheetsUsed === bestSheets && result.area > bestArea)) {
        bestSheets = sim.sheetsUsed;
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

// ========== SHARED SORT STRATEGIES ==========

function getSortStrategies(): ((a: Piece, b: Piece) => number)[] {
  return [
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
  groupingMode: 0 | 1 | 2 | 3 | 4;
}

/**
 * Simulates ALL sheets needed to place every piece.
 * Fitness = minimize sheets, then maximize utilization.
 */
function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  _maxSheets: number // kept for signature compat but we simulate all
): {
  fitness: number;
  firstTree: TreeNode;
  sheetsUsed: number;
  stat_rejectedByMinBreak: number;
  stat_fragmentCount: number;
  stat_continuity: number;
} {
  let currentRemaining = [...workPieces];
  const sheetArea = usableW * usableH;
  let firstTree: TreeNode | null = null;
  let sheetsUsed = 0;
  let totalUtilArea = 0;
  let stuckCount = 0;
  const maxSafety = 100; // prevent infinite loops

  while (currentRemaining.length > 0 && sheetsUsed < maxSafety) {
    const countBefore = currentRemaining.length;
    const res = runPlacement(currentRemaining, usableW, usableH, minBreak);
    if (sheetsUsed === 0) firstTree = res.tree;

    const piecesPlaced = countBefore - res.remaining.length;
    if (piecesPlaced === 0) {
      // Can't place anything - stuck
      stuckCount++;
      break;
    }

    totalUtilArea += res.area;
    currentRemaining = res.remaining;
    sheetsUsed++;
  }

  // Primary: fewer sheets is better (normalized inversely)
  // Secondary: higher utilization within those sheets
  const avgUtil = sheetsUsed > 0 ? totalUtilArea / (sheetsUsed * sheetArea) : 0;
  // Fitness: heavily penalize more sheets, reward utilization
  // Max possible fitness ≈ 1.0 (1 sheet, 100% util)
  const fitness = sheetsUsed > 0
    ? (1.0 / sheetsUsed) * 0.7 + avgUtil * 0.3 - stuckCount * 0.5
    : 0;

  return {
    fitness: Math.max(0, fitness),
    firstTree: firstTree || createRoot(usableW, usableH),
    sheetsUsed,
    stat_rejectedByMinBreak: stuckCount,
    stat_fragmentCount: 0,
    stat_continuity: 0
  };
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
  const baseMutationRate = 0.15;

  const numPieces = pieces.length;

  function randomIndividual(): GAIndividual {
    const genome = Array.from({ length: numPieces }, (_, i) => i);
    // Shuffle genome
    for (let i = genome.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [genome[i], genome[j]] = [genome[j], genome[i]];
    }
    return {
      genome,
      rotations: Array.from({ length: numPieces }, () => Math.random() > 0.5),
      groupingMode: ([0, 1, 2, 3, 4] as const)[Math.floor(Math.random() * 5)],
    };
  }

  function buildPieces(ind: GAIndividual): Piece[] {
    // 1. Map piece sequence based on genome
    let work = ind.genome.map(idx => ({ ...pieces[idx] }));

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
      work = groupPiecesByHeight(work, usableW, usableH, pieces);
    } else if (ind.groupingMode === 4) {
      work = greedyRowGrouping(work, usableW, usableH);
    }

    return work;
  }

  function evaluate(ind: GAIndividual): { tree: TreeNode; fitness: number; sheetsUsed: number } {
    const work = buildPieces(ind);
    const result = simulateSheets(work, usableW, usableH, minBreak, 100);
    return { tree: result.firstTree, fitness: result.fitness, sheetsUsed: result.sheetsUsed };
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
      // Swap Mutation
      const a = Math.floor(Math.random() * c.genome.length);
      const b = Math.floor(Math.random() * c.genome.length);
      [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
    } else if (r < 0.6) {
      // Block Mutation (Move a segment)
      if (c.genome.length > 3) {
        const blockSize = Math.floor(Math.random() * Math.min(5, c.genome.length / 2)) + 2;
        const start = Math.floor(Math.random() * (c.genome.length - blockSize));
        const [segment] = [c.genome.splice(start, blockSize)];
        const target = Math.floor(Math.random() * c.genome.length);
        c.genome.splice(target, 0, ...segment);
      }
    } else if (r < 0.8) {
      // Rotation Mutation (Flip 10% of bits)
      const count = Math.max(1, Math.floor(c.rotations.length * 0.1));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * c.rotations.length);
        c.rotations[idx] = !c.rotations[idx];
      }
    } else {
      // Grouping Mutation
      c.groupingMode = ([0, 1, 2, 3, 4] as const)[Math.floor(Math.random() * 5)];
    }

    return c;
  }

  // --- Seeding ---
  const initialPop: GAIndividual[] = [];
  const strategies = getSortStrategies();
  
  // Seed with each sort strategy × each grouping mode
  const seedGroupModes: (0 | 1 | 2 | 3 | 4)[] = [0, 3, 4]; // none, smart height, greedy row
  strategies.forEach(sortFn => {
    const sortedIndices = Array.from({ length: numPieces }, (_, i) => i)
      .sort((a, b) => sortFn(pieces[a], pieces[b]));

    for (const gm of seedGroupModes) {
      if (initialPop.length >= populationSize) break;
      initialPop.push({
        genome: [...sortedIndices],
        rotations: Array.from({ length: numPieces }, () => false),
        groupingMode: gm
      });
    }
  });

  // Fill rest with random
  while (initialPop.length < populationSize) {
    initialPop.push(randomIndividual());
  }

  let population = initialPop;
  let bestTree: TreeNode | null = null;
  let bestFitness = -1;

  // Report baseline
  if (onProgress) {
    onProgress({ phase: 'Semeando População e V6...', current: 0, total: generations });
  }

  let bestSheetsUsed = Infinity;

  for (let g = 0; g < generations; g++) {
    // Adaptive mutation: increase when stuck
    const diversityRatio = new Set(population.map(i => i.genome.slice(0, 5).join(','))).size / population.length;
    const mutationRate = diversityRatio < 0.3 ? baseMutationRate * 3 : baseMutationRate;

    const evaluated = population.map(ind => {
      const work = buildPieces(ind);
      const res = simulateSheets(work, usableW, usableH, minBreak, 100);
      return { ind, tree: res.firstTree, fitness: res.fitness, sheetsUsed: res.sheetsUsed };
    });

    evaluated.sort((a, b) => b.fitness - a.fitness);

    // Elitism and Best Update
    if (evaluated[0].fitness > bestFitness || 
        (evaluated[0].fitness === bestFitness && evaluated[0].sheetsUsed < bestSheetsUsed)) {
      bestFitness = evaluated[0].fitness;
      bestSheetsUsed = evaluated[0].sheetsUsed;
      bestTree = JSON.parse(JSON.stringify(evaluated[0].tree));
    }

    if (onProgress) {
      onProgress({
        phase: 'Otimização Evolutiva Global',
        current: g + 1,
        total: generations,
        bestSheets: bestSheetsUsed,
        bestUtil: bestFitness * 100,
      });
    }

    if (g % 3 === 0) await new Promise(r => setTimeout(r, 0));

    // Next Gen with diversity management
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
      } else {
        // Inject random individual for diversity
        nextPop.push(randomIndividual());
      }
    }
    population = nextPop;
  }

  return bestTree || createRoot(usableW, usableH);
}

// Synchronous wrapper for backward compatibility - Fast Mini-GA Burst
export function optimizeGeneticV1(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0
): TreeNode {
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

    // Special case: if we are provided a zNodeToUse, we CANNOT splitAxis: 'Z'.
    // We must treat it as a 'W' or 'Q' split inside that Z.
    if (zNodeToUse && splitAxis === 'Z') splitAxis = 'W';

    if (splitAxis === 'Z') {
      const individualWidth = Math.round(placedW / piece.count!);
      for (let i = 0; i < piece.count!; i++) {
        const zId = insertNode(tree, yNode.id, 'Z', individualWidth, 1);
        const zNode = findNode(tree, zId)!;
        if (piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
        const wId = insertNode(tree, zId, 'W', placedH, 1);
        const wNode = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode.label = piece.labels[i];
      }
    } else if (splitAxis === 'W') {
      const individualHeight = Math.round(placedH / piece.count!);
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, 'Z', placedW, 1))!;
      for (let i = 0; i < piece.count!; i++) {
        const wId = insertNode(tree, zNode.id, 'W', individualHeight, 1);
        const wNode_f = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode_f.label = piece.labels[i];
        if (i === 0 && piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
      }
    } else {
      const individualWidth = Math.round(placedW / piece.count!);
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, 'Z', placedW, 1))!;
      const wId = insertNode(tree, zNode.id, 'W', placedH, 1);
      const wNode = findNode(tree, wId)!;
      for (let i = 0; i < piece.count!; i++) {
        const qId = insertNode(tree, wId, 'Q', individualWidth, 1);
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
    const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, 'Z', placedW, 1))!;
    if (piece.label) zNode.label = piece.label;

    const wId = insertNode(tree, zNode.id, 'W', placedH, 1);
    const wNode = findNode(tree, wId)!;
    if (piece.label) wNode.label = piece.label;

    // Narrowing Q cut if piece is narrower than its assigned Z width
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

/**
 * MODIFICAÇÃO: Detecção de peças agrupadas
 * 
 * Quando uma peça tem count > 1, significa que é resultado de agrupamento.
 * Neste caso, criamos múltiplos nós Z em vez de um único Z com largura somada.
 */
function runPlacement(inventory: Piece[], usableW: number, usableH: number, minBreak: number = 0): { tree: TreeNode; area: number; remaining: Piece[] } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  while (remaining.length > 0) {
    const piece = remaining[0];
    let bestFit: { type: 'EXISTING' | 'NEW'; col?: TreeNode; w: number; h: number; pieceW: number; pieceH: number; score: number; rotated: boolean } | null = null;

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
            const ySibValues = colX.filhos.map(y => y.valor);
            if (!canResidualFitAnyPiece(colX.valor, residualH, remaining.slice(1), minBreak, ySibValues, 'h')) {
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
            bestFit = { type: 'EXISTING', col: colX, w: o.w, h: effectiveH, pieceW: o.w, pieceH: o.h, score, rotated: o.w !== piece.w };
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
          const violatesX = tree.filhos.some(x => {
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
            const xSibValues = tree.filhos.map(x => x.valor);
            if (!canResidualFitAnyPiece(residualW, usableH, remaining.slice(1), minBreak, xSibValues, 'w')) {
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
        // FIX: Use createPieceNodes with zNodeToUse to avoid creating a redundant Z
        // First, create the Z container manually, then place the piece inside it
        const zId = insertNode(tree, yNode.id, 'Z', bestOri.w, 1);
        const zNodeCurrent = findNode(tree, zId)!;

        // Place first piece using the Z we just created
        placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w, zNodeCurrent);

        // W-stacking: fill remaining vertical space with matching or fitting pieces
        let freeWH_remaining = bestFit.h - bestOri.h;

        // First try stacking identical pieces (multi optimization)
        if (freeWH_remaining >= bestOri.h) {
          const lastW = zNodeCurrent.filhos[zNodeCurrent.filhos.length - 1];
          if (lastW && lastW.filhos.length === 0) {
            // Try to increment multi for identical pieces
            for (let j = 0; j < remaining.length && freeWH_remaining >= bestOri.h; j++) {
              if (j === i) continue;
              const pw = remaining[j];
              const matches = oris(pw).some(o => 
                o.w === bestOri.w && o.h === bestOri.h
              );
              if (matches && (lastW.label || undefined) === (pw.label || undefined)) {
                lastW.multi++;
                placedArea += zNodeCurrent.valor * bestOri.h;
                freeWH_remaining -= bestOri.h;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
              }
            }
          }
        }

        // Then fill remaining height with any fitting pieces
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
              createPieceNodes(tree, yNode, pw, wo.w, wo.h, wo.w !== pw.w, zNodeCurrent);
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

    // --- Vertical continuation: fill remaining height in column with ANY fitting pieces ---
    {
      const usedHAfter = col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      let freeHRemain = usableH - usedHAfter;

      while (freeHRemain > 0 && remaining.length > 0) {
        // Find best fitting piece for the remaining height
        let bestCandIdx = -1;
        let bestCandOri: { w: number; h: number } | null = null;
        let bestCandScore = Infinity;

        for (let i = 0; i < remaining.length; i++) {
          const pc = remaining[i];
          for (const o of oris(pc)) {
            if (o.w > col.valor || o.h > freeHRemain) continue;

            if (minBreak > 0) {
              const ySibValues = col.filhos.map(y => y.valor);
              const violatesY = ySibValues.some(yv => {
                const diff = Math.abs(yv - o.h);
                return diff > 0 && diff < minBreak;
              });
              if (violatesY) continue;

              const allZPositions = getAllZCutPositionsInColumn(col);
              if (violatesZMinBreak([o.w], allZPositions, minBreak, col.filhos.length)) continue;
            }

            // Score: prefer pieces that use more width and height
            const score = (col.valor - o.w) + (freeHRemain - o.h) * 0.5;
            if (score < bestCandScore) {
              bestCandScore = score;
              bestCandIdx = i;
              bestCandOri = o;
            }
          }
        }

        if (bestCandIdx === -1 || !bestCandOri) break;

        const pc = remaining[bestCandIdx];

        // Residual dominance for Y height
        let effectiveH = bestCandOri.h;
        const residualH = freeHRemain - bestCandOri.h;
        if (residualH > 0 && !canResidualFitAnyPiece(col.valor, residualH, remaining, minBreak)) {
          effectiveH = freeHRemain;
        }

        const newYId = insertNode(tree, col.id, 'Y', effectiveH, 1);
        const newYNode = findNode(tree, newYId)!;

        placedArea += createPieceNodes(tree, newYNode, pc, bestCandOri.w, bestCandOri.h, bestCandOri.w !== pc.w);
        remaining.splice(bestCandIdx, 1);

        // Lateral fill: Pass 1 (exact height) then Pass 2 (shorter with W subdivision)
        let newFreeZW = col.valor - bestCandOri.w;
        
        // Pass 1: exact height
        for (let i = 0; i < remaining.length && newFreeZW > 0; i++) {
          const lpc = remaining[i];
          let matchOri: { w: number; h: number } | null = null;
          for (const o of oris(lpc)) {
            if (o.h !== bestCandOri.h) continue;
            if (o.w > newFreeZW) continue;
            if (minBreak > 0) {
              const allZPos = getAllZCutPositionsInColumn(col);
              const yIdx = col.filhos.indexOf(newYNode);
              const curOff = newYNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
              if (violatesZMinBreak([curOff + o.w], allZPos, minBreak, yIdx)) continue;
            }
            if (!matchOri || o.w > matchOri.w) matchOri = o;
          }
          if (matchOri) {
            placedArea += createPieceNodes(tree, newYNode, lpc, matchOri.w, matchOri.h, matchOri.w !== lpc.w);
            newFreeZW -= matchOri.w;
            remaining.splice(i, 1);
            i--;
          }
        }

        // Pass 2: shorter pieces with vertical stacking
        for (let i = 0; i < remaining.length && newFreeZW > 0; i++) {
          const lpc = remaining[i];
          let shortOri: { w: number; h: number } | null = null;
          let shortScore = Infinity;
          for (const o of oris(lpc)) {
            if (o.w > newFreeZW || o.h > effectiveH) continue;
            if (o.h === bestCandOri.h) continue; // already tried in pass 1
            if (minBreak > 0) {
              const allZPos = getAllZCutPositionsInColumn(col);
              const yIdx = col.filhos.indexOf(newYNode);
              const curOff = newYNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
              if (violatesZMinBreak([curOff + o.w], allZPos, minBreak, yIdx)) continue;
            }
            const s = (effectiveH - o.h) * 2 + (newFreeZW - o.w);
            if (s < shortScore) { shortScore = s; shortOri = o; }
          }
          if (shortOri) {
            const zId2 = insertNode(tree, newYNode.id, 'Z', shortOri.w, 1);
            const zNode3 = findNode(tree, zId2)!;
            placedArea += createPieceNodes(tree, newYNode, lpc, shortOri.w, shortOri.h, shortOri.w !== lpc.w, zNode3);
            
            // Fill remaining height in this Z
            let freeWH2 = effectiveH - shortOri.h;
            for (let j = 0; j < remaining.length && freeWH2 > 0; j++) {
              if (j === i) continue;
              const pw = remaining[j];
              for (const wo of oris(pw)) {
                if (wo.w <= zNode3.valor && wo.h <= freeWH2) {
                  createPieceNodes(tree, newYNode, pw, wo.w, wo.h, wo.w !== pw.w, zNode3);
                  placedArea += zNode3.valor * wo.h;
                  freeWH2 -= wo.h;
                  remaining.splice(j, 1);
                  if (j < i) i--;
                  j--;
                  break;
                }
              }
            }
            
            newFreeZW -= shortOri.w;
            remaining.splice(i, 1);
            i--;
          }
        }

        freeHRemain -= effectiveH;
      }
    }

    // Void filling
    if (remaining.length > 0) {
      placedArea += fillVoids(tree, remaining, usableW, usableH, minBreak);
    }
  }

  return { tree, area: placedArea, remaining };
}