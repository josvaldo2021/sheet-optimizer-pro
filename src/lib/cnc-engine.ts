// CNC Cut Plan Engine - ENHANCED V7
// Melhorias: Skyline Packer, fillVoids recursivo, SA pós-GA, agrupamento N-ário, fitness com penalidade de desequilíbrio
export type NodeType = "ROOT" | "X" | "Y" | "Z" | "W" | "Q";

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
  groupedAxis?: "w" | "h";
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

// ========== TREE UTILITIES ==========

export function annotateTreeLabels(tree: TreeNode, pieces: PieceItem[]): void {
  const pool: Array<{ w: number; h: number; label: string }> = [];
  pieces.forEach((p) => {
    if (p.label) {
      for (let i = 0; i < p.qty; i++) {
        pool.push({ w: p.w, h: p.h, label: p.label });
      }
    }
  });
  if (pool.length === 0) return;

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
    free = (findParentOfType(tree, wP.id, "Z")?.valor || 0) - wP.filhos.reduce((a, q) => a + q.valor * q.multi, 0);
  }

  if (valor * multi > free + 0.5) {
    return { allocated: free, error: `Máximo disponível: ${free.toFixed(0)}` };
  }
  return { allocated: valor * multi };
}

// ========== PIECE HELPERS ==========

function oris(p: Piece): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [
    { w: p.w, h: p.h },
    { w: p.h, h: p.w },
  ];
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
  return colX.filhos.map((y) => getZCutPositions(y));
}

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

// ========== RESIDUAL FIT CHECK ==========

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

// ========== SCORING WITH LOOKAHEAD ==========

function scoreFit(spaceW: number, spaceH: number, pieceW: number, pieceH: number, remaining: Piece[]): number {
  const wasteW = spaceW - pieceW;
  const wasteH = spaceH - pieceH;
  let score = wasteW * spaceH + wasteH * pieceW;

  let wFits = false,
    hFits = false;
  for (const r of remaining) {
    for (const o of oris(r)) {
      if (!wFits && wasteW >= o.w && spaceH >= o.h) wFits = true;
      if (!hFits && pieceW >= o.w && wasteH >= o.h) hFits = true;
      if (wFits && hFits) break;
    }
    if (wFits && hFits) break;
  }

  if (wasteW > 0 && !wFits) score += wasteW * spaceH * 2;
  if (wasteH > 0 && !hFits) score += wasteH * pieceW * 2;
  if (wasteW === 0) score -= spaceH * 10;
  if (wasteH === 0) score -= pieceW * 10;

  return score;
}

// ========== N-ARY GROUPING (3+ peças) ==========

/**
 * Agrupa peças de mesma altura usando DP de subset sum, gerando grupos de N peças (não só pares).
 * Performance: limitado a grupos de no máximo groupMaxSize peças para manter O(n*target) viável.
 */
function groupPiecesByHeightNary(pieces: Piece[], maxW: number, groupMaxSize: number = 4): Piece[] {
  const heightGroups = new Map<number, Piece[]>();

  pieces.forEach((p) => {
    const key = Math.max(p.w, p.h);
    if (!heightGroups.has(key)) heightGroups.set(key, []);
    heightGroups.get(key)!.push({ ...p, w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) });
  });

  const result: Piece[] = [];

  heightGroups.forEach((group, fixedW) => {
    // Sort by h descending within group
    const sorted = [...group].sort((a, b) => b.h - a.h);
    const used = new Array(sorted.length).fill(false);

    let i = 0;
    while (i < sorted.length) {
      if (used[i]) {
        i++;
        continue;
      }

      // Greedy: build a group starting from piece i that sums h <= maxW
      const groupIndices: number[] = [i];
      let sumH = sorted[i].h;
      used[i] = true;

      for (let j = i + 1; j < sorted.length && groupIndices.length < groupMaxSize; j++) {
        if (used[j]) continue;
        if (sumH + sorted[j].h <= maxW) {
          groupIndices.push(j);
          sumH += sorted[j].h;
          used[j] = true;
        }
      }

      if (groupIndices.length === 1) {
        result.push({
          w: sorted[i].w,
          h: sorted[i].h,
          area: sorted[i].w * sorted[i].h,
          count: 1,
          label: sorted[i].label,
        });
      } else {
        const labels = groupIndices.map((gi) => sorted[gi].label).filter(Boolean) as string[];
        result.push({
          w: fixedW,
          h: sumH,
          area: fixedW * sumH,
          count: groupIndices.length,
          labels: labels.length > 0 ? labels : undefined,
          groupedAxis: "h",
        });
      }
      i++;
    }
  });

  return result;
}

// Original pairwise groupers kept for backward compat
function groupPiecesByHeight(pieces: Piece[], maxW: number): Piece[] {
  return groupPiecesByHeightNary(pieces, maxW, 2);
}

function groupPiecesByWidth(pieces: Piece[], maxH: number): Piece[] {
  const widthGroups = new Map<number, Piece[]>();
  pieces.forEach((p) => {
    const w = Math.max(p.w, p.h);
    if (!widthGroups.has(w)) widthGroups.set(w, []);
    widthGroups.get(w)!.push(p);
  });

  const result: Piece[] = [];
  widthGroups.forEach((group) => {
    const sorted = group
      .map((p) => ({
        ...p,
        nw: Math.max(p.w, p.h),
        nh: Math.min(p.w, p.h),
      }))
      .sort((a, b) => b.nh - a.nh);

    let i = 0;
    while (i < sorted.length) {
      if (i + 1 < sorted.length) {
        const w = sorted[i].nw;
        const sumH = sorted[i].nh + sorted[i + 1].nh;
        if (maxH && sumH > maxH) {
          result.push({
            w: sorted[i].nw,
            h: sorted[i].nh,
            area: sorted[i].nw * sorted[i].nh,
            count: 1,
            label: sorted[i].label,
          });
          i++;
          continue;
        }
        const groupedLabels: string[] = [];
        if (sorted[i].label) groupedLabels.push(sorted[i].label as string);
        if (sorted[i + 1].label) groupedLabels.push(sorted[i + 1].label as string);
        result.push({
          w,
          h: sumH,
          area: w * sumH,
          count: 2,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "h",
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
        label: sorted[i].label,
      });
      i++;
    }
  });
  return result;
}

// ========== SKYLINE PACKER (nova heurística) ==========

interface SkylineNode {
  x: number;
  width: number;
  y: number; // teto livre nesta posição
}

interface PlacedRect {
  piece: Piece;
  x: number;
  y: number;
  w: number;
  h: number;
}

function skylinePack(
  pieces: Piece[],
  sheetW: number,
  sheetH: number,
  minBreak: number = 0,
): { placed: PlacedRect[]; remaining: Piece[]; area: number } {
  let skyline: SkylineNode[] = [{ x: 0, width: sheetW, y: 0 }];
  const placed: PlacedRect[] = [];
  const remaining = [...pieces];
  let totalArea = 0;

  // Mescla nós adjacentes de mesma altura
  function mergeSkyline(sl: SkylineNode[]): SkylineNode[] {
    const merged: SkylineNode[] = [];
    for (const node of sl) {
      if (merged.length > 0 && merged[merged.length - 1].y === node.y) {
        merged[merged.length - 1].width += node.width;
      } else {
        merged.push({ ...node });
      }
    }
    return merged;
  }

  // Encontra a altura mínima do skyline entre x e x+w
  function findMinY(sl: SkylineNode[], x: number, w: number): number {
    let maxY = 0;
    let covered = 0;
    for (const node of sl) {
      if (node.x + node.width <= x) continue;
      if (node.x >= x + w) break;
      if (node.y > maxY) maxY = node.y;
      covered += Math.min(node.x + node.width, x + w) - Math.max(node.x, x);
      if (covered >= w) break;
    }
    return maxY;
  }

  // Computa desperdício criado ao colocar peça em posição x com altura y+h
  function computeWaste(sl: SkylineNode[], x: number, w: number, newY: number): number {
    let waste = 0;
    for (const node of sl) {
      if (node.x + node.width <= x) continue;
      if (node.x >= x + w) break;
      const overlapW = Math.min(node.x + node.width, x + w) - Math.max(node.x, x);
      waste += overlapW * (newY - node.y);
    }
    return waste;
  }

  // Atualiza skyline após colocar peça
  function updateSkyline(sl: SkylineNode[], x: number, w: number, newY: number): SkylineNode[] {
    const newSl: SkylineNode[] = [];
    for (const node of sl) {
      if (node.x + node.width <= x || node.x >= x + w) {
        newSl.push({ ...node });
        continue;
      }
      // Left segment
      if (node.x < x) {
        newSl.push({ x: node.x, width: x - node.x, y: node.y });
      }
      // Raised segment
      newSl.push({
        x: Math.max(node.x, x),
        width: Math.min(node.x + node.width, x + w) - Math.max(node.x, x),
        y: newY,
      });
      // Right segment
      if (node.x + node.width > x + w) {
        newSl.push({ x: x + w, width: node.x + node.width - (x + w), y: node.y });
      }
    }
    return mergeSkyline(newSl);
  }

  let changed = true;
  while (changed && remaining.length > 0) {
    changed = false;
    let bestScore = Infinity;
    let bestIdx = -1;
    let bestX = -1,
      bestY = -1,
      bestW = 0,
      bestH = 0;

    for (let pi = 0; pi < remaining.length; pi++) {
      const piece = remaining[pi];
      for (const ori of oris(piece)) {
        if (ori.w > sheetW || ori.h > sheetH) continue;

        // Tenta cada posição do skyline
        let x = 0;
        for (const node of skyline) {
          if (node.x + ori.w > sheetW) {
            x += node.width;
            continue;
          }

          const y = findMinY(skyline, node.x, ori.w);
          if (y + ori.h > sheetH) {
            x += node.width;
            continue;
          }

          // minBreak check: verifica se a nova posição y cria uma quebra inválida
          if (minBreak > 0) {
            const existingYs = skyline.map((n) => n.y).filter((yv) => yv > 0);
            const violates = existingYs.some((ey) => {
              const diff = Math.abs(ey - (y + ori.h));
              return diff > 0 && diff < minBreak;
            });
            if (violates) {
              x += node.width;
              continue;
            }
          }

          const waste = computeWaste(skyline, node.x, ori.w, y + ori.h);
          // Score: waste + penalidade por altura (prefere peças mais baixas)
          const score = waste + y * ori.w * 0.1;

          if (score < bestScore) {
            bestScore = score;
            bestIdx = pi;
            bestX = node.x;
            bestY = y;
            bestW = ori.w;
            bestH = ori.h;
          }
          x += node.width;
        }
      }
    }

    if (bestIdx >= 0) {
      placed.push({ piece: remaining[bestIdx], x: bestX, y: bestY, w: bestW, h: bestH });
      totalArea += bestW * bestH;
      skyline = updateSkyline(skyline, bestX, bestW, bestY + bestH);
      remaining.splice(bestIdx, 1);
      changed = true;
    }
  }

  return { placed, remaining, area: totalArea };
}

/**
 * Converte resultado do Skyline Packer para TreeNode (mantém compatibilidade com interface).
 * Estratégia: agrupa peças em colunas X por faixa de x, depois y por linha, z pela peça.
 */
function skylineToTree(placed: PlacedRect[], usableW: number, usableH: number): TreeNode {
  const tree = createRoot(usableW, usableH);
  if (placed.length === 0) return tree;

  // Agrupar por coluna X: peças com mesmo x e width formam uma coluna
  // Simplificação: criar uma coluna X por peça individual para máxima compatibilidade
  // Depois mesclar colunas adjacentes de mesmo x+w

  // Ordenar por x, depois y
  const sortedPlaced = [...placed].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

  // Colunas: cada grupo de peças com mesmo intervalo [x, x+w]
  const colGroups = new Map<string, PlacedRect[]>();
  for (const p of sortedPlaced) {
    const key = `${p.x}:${p.w}`;
    if (!colGroups.has(key)) colGroups.set(key, []);
    colGroups.get(key)!.push(p);
  }

  // Ordenar colunas por x
  const sortedCols = [...colGroups.entries()].sort((a, b) => {
    const ax = parseInt(a[0].split(":")[0]);
    const bx = parseInt(b[0].split(":")[0]);
    return ax - bx;
  });

  for (const [key, rects] of sortedCols) {
    const colW = parseInt(key.split(":")[1]);
    const xId = insertNode(tree, "root", "X", colW, 1);
    const xNode = findNode(tree, xId)!;

    // Ordenar por y dentro da coluna
    rects.sort((a, b) => a.y - b.y);

    for (const rect of rects) {
      const yId = insertNode(tree, xNode.id, "Y", rect.h, 1);
      const yNode = findNode(tree, yId)!;

      const zId = insertNode(tree, yNode.id, "Z", rect.w, 1);
      const zNode = findNode(tree, zId)!;
      if (rect.piece.label) zNode.label = rect.piece.label;

      const actualW = rect.piece.w === rect.w ? rect.piece.w : rect.piece.h;
      const wId = insertNode(tree, zNode.id, "W", rect.h, 1);
      const wNode = findNode(tree, wId)!;
      if (rect.piece.label) wNode.label = rect.piece.label;

      // Q se a peça é mais estreita que a coluna
      if (actualW < rect.w) {
        const qId = insertNode(tree, wId, "Q", actualW, 1);
        const qNode = findNode(tree, qId)!;
        if (rect.piece.label) qNode.label = rect.piece.label;
      }
    }
  }

  return tree;
}

// ========== VOID FILLING (recursivo, depth ≤ 3) ==========

function fillVoids(
  tree: TreeNode,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  depth: number = 0,
): number {
  if (depth > 2 || remaining.length === 0) return 0;

  let filledArea = 0;

  for (const colX of tree.filhos) {
    const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const freeH = usableH - usedH;

    if (freeH > 0 && remaining.length > 0) {
      filledArea += fillRectY(tree, colX, remaining, colX.valor, freeH, minBreak);
    }

    for (const yNode of colX.filhos) {
      const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      const freeZ = colX.valor - usedZ;

      if (freeZ > 0 && remaining.length > 0) {
        filledArea += fillRectZ(tree, yNode, remaining, freeZ, yNode.valor, minBreak);
      }

      for (const zNode of yNode.filhos) {
        const usedW = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        const freeW = yNode.valor - usedW;

        if (freeW > 0 && remaining.length > 0) {
          filledArea += fillRectW(tree, remaining, zNode, zNode.valor, freeW, minBreak);
        }
      }
    }
  }

  // Recursão: se algo foi colocado, tentar de novo para preencher novos vazios
  if (filledArea > 0 && depth < 2) {
    filledArea += fillVoids(tree, remaining, usableW, usableH, minBreak, depth + 1);
  }

  return filledArea;
}

function fillRectY(
  tree: TreeNode,
  colX: TreeNode,
  remaining: Piece[],
  maxW: number,
  maxH: number,
  minBreak: number = 0,
): number {
  let filled = 0;

  for (let i = 0; i < remaining.length; i++) {
    if (maxH <= 0) break;
    const pc = remaining[i];
    let bestO: { w: number; h: number } | null = null;
    let bestScore = Infinity;

    for (const o of oris(pc)) {
      if (o.w <= maxW && o.h <= maxH) {
        if (minBreak > 0) {
          const ySibValues = colX.filhos.map((y) => y.valor);
          const violates = ySibValues.some((yv) => {
            const diff = Math.abs(yv - o.h);
            return diff > 0 && diff < minBreak;
          });
          if (violates) continue;
        }
        const s = scoreFit(maxW, maxH, o.w, o.h, remaining);
        if (s < bestScore) {
          bestScore = s;
          bestO = o;
        }
      }
    }

    if (bestO) {
      let consumed = bestO.h;
      const residualH = maxH - bestO.h;
      if (residualH > 0 && !canResidualFitAnyPiece(maxW, residualH, remaining)) consumed = maxH;

      const yId = insertNode(tree, colX.id, "Y", bestO.h, 1);
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

function fillRectZ(
  tree: TreeNode,
  yNode: TreeNode,
  remaining: Piece[],
  maxW: number,
  maxH: number,
  minBreak: number = 0,
): number {
  let filled = 0;
  for (let i = 0; i < remaining.length; i++) {
    if (maxW <= 0) break;
    const pc = remaining[i];
    let bestO: { w: number; h: number } | null = null;
    let bestScore = Infinity;

    for (const o of oris(pc)) {
      if (o.w <= maxW && o.h <= maxH) {
        if (minBreak > 0) {
          const parentX = tree.filhos.find((x) => x.filhos.some((y) => y.id === yNode.id));
          if (parentX) {
            const yIndex = parentX.filhos.indexOf(yNode);
            const allZPositions = getAllZCutPositionsInColumn(parentX);
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
      let consumed = bestO.w;
      const residualW = maxW - bestO.w;
      if (residualW > 0 && !canResidualFitAnyPiece(residualW, maxH, remaining)) consumed = maxW;
      createPieceNodes(tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);
      filled += bestO.w * bestO.h;
      maxW -= consumed;
      remaining.splice(i, 1);
      i--;
    }
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
  for (let i = 0; i < remaining.length; i++) {
    if (maxH <= 0) break;
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
        let consumed = o.h;
        const residualH = maxH - o.h;
        if (residualH > 0 && !canResidualFitAnyPiece(zWidth, residualH, remaining)) consumed = maxH;

        const actualRotated = o.w !== pc.w;
        // Use yNode from zNode's parent
        const parentY = tree.filhos.flatMap((x) => x.filhos).find((y) => y.filhos.some((z) => z.id === zNode.id));
        if (parentY) {
          createPieceNodes(tree, parentY, pc, o.w, o.h, actualRotated, zNode);
          filled += o.w * o.h;
          maxH -= consumed;
          remaining.splice(i, 1);
          i--;
        }
        break;
      }
    }
  }
  return filled;
}

// ========== CREATE PIECE NODES ==========

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

    if (originalAxis === "w" && !rotated) splitAxis = "Z";
    else if ((originalAxis === "h" && !rotated) || (originalAxis === "w" && rotated)) splitAxis = "W";
    else splitAxis = "Q";

    if (zNodeToUse && splitAxis === "Z") splitAxis = "W";

    if (splitAxis === "Z") {
      const baseWidth = Math.floor(placedW / piece.count!);
      for (let i = 0; i < piece.count!; i++) {
        const individualWidth = i === piece.count! - 1 ? placedW - baseWidth * (piece.count! - 1) : baseWidth;
        const zId = insertNode(tree, yNode.id, "Z", individualWidth, 1);
        const zNode = findNode(tree, zId)!;
        const lbl = piece.labels ? piece.labels[i] : piece.label;
        if (lbl) zNode.label = lbl;
        const wId = insertNode(tree, zNode.id, "W", placedH, 1);
        const wNode = findNode(tree, wId)!;
        if (lbl) wNode.label = lbl;
      }
      addedArea = placedW * placedH;
    } else if (splitAxis === "W") {
      const zId = zNodeToUse ? zNodeToUse.id : insertNode(tree, yNode.id, "Z", placedW, 1);
      const zNode = zNodeToUse || findNode(tree, zId)!;
      const baseHeight = Math.floor(placedH / piece.count!);
      for (let i = 0; i < piece.count!; i++) {
        const individualHeight = i === piece.count! - 1 ? placedH - baseHeight * (piece.count! - 1) : baseHeight;
        const wId = insertNode(tree, zNode.id, "W", individualHeight, 1);
        const wNode = findNode(tree, wId)!;
        const lbl = piece.labels ? piece.labels[i] : piece.label;
        if (lbl) wNode.label = lbl;
      }
      addedArea = placedW * placedH;
    } else {
      // Q split (fallback)
      const zId = insertNode(tree, yNode.id, "Z", placedW, 1);
      const zNode = findNode(tree, zId)!;
      const wId = insertNode(tree, zNode.id, "W", placedH, 1);
      const baseW = Math.floor(placedW / piece.count!);
      for (let i = 0; i < piece.count!; i++) {
        const individualW = i === piece.count! - 1 ? placedW - baseW * (piece.count! - 1) : baseW;
        const qId = insertNode(tree, wId, "Q", individualW, 1);
        const qNode = findNode(tree, qId)!;
        const lbl = piece.labels ? piece.labels[i] : piece.label;
        if (lbl) qNode.label = lbl;
      }
      addedArea = placedW * placedH;
    }
  } else {
    // Single piece
    let zNode: TreeNode;
    if (zNodeToUse) {
      zNode = zNodeToUse;
    } else {
      const zId = insertNode(tree, yNode.id, "Z", placedW, 1);
      zNode = findNode(tree, zId)!;
      if (piece.label) zNode.label = piece.label;
    }

    const wId = insertNode(tree, zNode.id, "W", placedH, 1);
    const wNode = findNode(tree, wId)!;
    if (piece.label) wNode.label = piece.label;

    const actualPieceW = rotated ? piece.h : piece.w;
    if (actualPieceW < placedW) {
      const qId = insertNode(tree, wId, "Q", actualPieceW, 1);
      const qNode = findNode(tree, qId)!;
      if (piece.label) qNode.label = piece.label;
    }

    addedArea = placedW * placedH;
  }

  return addedArea;
}

// ========== VALIDATE TREE ==========

function validateTree(tree: TreeNode, usableW: number, usableH: number): void {
  const totalX = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
  if (totalX > usableW + 1) {
    while (tree.filhos.length > 0) {
      const sum = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
      if (sum <= usableW + 1) break;
      tree.filhos.pop();
    }
  }

  for (const colX of tree.filhos) {
    const totalY = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    if (totalY > usableH + 1) {
      while (colX.filhos.length > 0) {
        const sum = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
        if (sum <= usableH + 1) break;
        colX.filhos.pop();
      }
    }

    for (const yNode of colX.filhos) {
      const totalZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      if (totalZ > colX.valor + 1) {
        while (yNode.filhos.length > 0) {
          const sum = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
          if (sum <= colX.valor + 1) break;
          yNode.filhos.pop();
        }
      }

      for (const zNode of yNode.filhos) {
        const totalW = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        if (totalW > yNode.valor + 1) {
          while (zNode.filhos.length > 0) {
            const sum = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
            if (sum <= yNode.valor + 1) break;
            zNode.filhos.pop();
          }
        }
      }
    }
  }
}

// ========== RUN PLACEMENT (Guillotine clássico melhorado) ==========

function runPlacement(
  inventory: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  forceFullWidth: boolean = false,
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
        if (minBreak > 0) {
          if (o.h < minBreak) continue;
          const allZPositions = getAllZCutPositionsInColumn(colX);
          if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
        }
        if (o.w <= colX.valor && o.h <= freeH) {
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
        if (minBreak > 0) {
          const violatesX = tree.filhos.some((x) => {
            const diff = Math.abs(x.valor - (forceFullWidth ? freeW : o.w));
            return diff > 0 && diff < minBreak;
          });
          if (violatesX) continue;
        }
        if (o.w <= freeW && o.h <= usableH) {
          let effectiveW: number;
          if (forceFullWidth) {
            effectiveW = freeW;
          } else {
            effectiveW = o.w;
            const residualW = freeW - o.w;
            if (residualW > 0) {
              const xSibValues = tree.filhos.map((x) => x.valor);
              if (!canResidualFitAnyPiece(residualW, usableH, remaining.slice(1), minBreak, xSibValues, "w")) {
                effectiveW = freeW;
              }
            }
          }
          const score = forceFullWidth ? -0.1 : ((freeW - effectiveW) / usableW) * 0.5;
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

    const yId = insertNode(tree, col.id, "Y", bestFit.h, 1);
    const yNode = findNode(tree, yId)!;

    placedArea += createPieceNodes(tree, yNode, piece, bestFit.pieceW, bestFit.pieceH, bestFit.rotated);
    remaining.shift();

    // Lateral Z filling - Pass 1: exact height
    let freeZW = col.valor - bestFit.pieceW;
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
          if (violatesZMinBreak([currentOffset + o.w], allZPositions, minBreak, yIndex)) continue;
        }
        if (o.w <= freeZW) {
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

    // Lateral Z filling - Pass 2: shorter pieces with W subdivision
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (minBreak > 0) {
          const allZPositions = getAllZCutPositionsInColumn(col);
          const yIndex = col.filhos.indexOf(yNode);
          const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
          if (violatesZMinBreak([currentOffset + o.w], allZPositions, minBreak, yIndex)) continue;
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
        const zId = insertNode(tree, yNode.id, "Z", bestOri.w, 1);
        const zNode2 = findNode(tree, zId)!;

        let freeWH = bestFit.h;
        placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);

        const zNodeCurrent = yNode.filhos[yNode.filhos.length - 1];
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

    // Vertical continuation
    {
      const usedHAfter = col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      let freeHRemain = usableH - usedHAfter;

      while (freeHRemain >= bestFit.pieceH && remaining.length > 0) {
        const candidates: number[] = [];
        for (let i = 0; i < remaining.length; i++) {
          const pc = remaining[i];
          const matchesOriginal = oris(pc).some((o) => o.w === bestFit!.pieceW && o.h === bestFit!.pieceH);
          if (matchesOriginal) candidates.push(i);
        }
        if (candidates.length === 0) break;

        if (minBreak > 0) {
          const ySibValues = col.filhos.map((y) => y.valor);
          const violatesY = ySibValues.some((yv) => {
            const diff = Math.abs(yv - bestFit!.pieceH);
            return diff > 0 && diff < minBreak;
          });
          if (violatesY) break;
          const allZPositions = getAllZCutPositionsInColumn(col);
          if (violatesZMinBreak([bestFit.pieceW], allZPositions, minBreak, col.filhos.length)) break;
        }

        const newYId = insertNode(tree, col.id, "Y", bestFit.pieceH, 1);
        const newYNode = findNode(tree, newYId)!;

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
            if (!matchOri || newFreeZW - o.w < newFreeZW - matchOri.w) matchOri = o;
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

    // Void filling (recursivo)
    if (remaining.length > 0) {
      placedArea += fillVoids(tree, remaining, usableW, usableH, minBreak, 0);
    }
  }

  validateTree(tree, usableW, usableH);
  return { tree, area: placedArea, remaining };
}

// ========== SORT STRATEGIES ==========

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
    // Novas estratégias V7
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || b.area - a.area,
    (a, b) => {
      const ra = Math.min(a.w, a.h) / Math.max(a.w, a.h);
      const rb = Math.min(b.w, b.h) / Math.max(b.w, b.h);
      return rb - ra; // mais "quadradas" primeiro
    },
    (a, b) => b.w + b.h - (a.w + a.h) || b.area - a.area,
    (a, b) => b.h - a.h || b.w + b.h - (a.w + a.h),
  ];
}

// ========== OPTIMIZE V6 MELHORADO ==========

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

  const pieceVariants: Piece[][] = hasLabels
    ? [pieces, pieces.map((p) => ({ ...p, w: p.h, h: p.w }))]
    : useGrouping === false
      ? [pieces, pieces.map((p) => ({ w: p.h, h: p.w, area: p.area, count: p.count }))]
      : [
          pieces,
          pieces.map((p) => ({ w: p.h, h: p.w, area: p.area, count: p.count })),
          groupPiecesByHeight(pieces, usableW),
          groupPiecesByWidth(pieces, usableH),
          groupPiecesByHeight(
            pieces.map((p) => ({ w: p.h, h: p.w, area: p.area, count: p.count })),
            usableW,
          ),
          // V7: agrupamento N-ário (3+ peças)
          groupPiecesByHeightNary(pieces, usableW, 3),
          groupPiecesByHeightNary(pieces, usableW, 4),
        ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;
  let bestRemaining: Piece[] = [];

  for (const variant of pieceVariants) {
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

    // V7: também testa Skyline Packer por variante (apenas sem labels para performance)
    if (!hasLabels) {
      for (const sortFn of strategies.slice(0, 6)) {
        // top 6 strategies para skyline
        const sorted = [...variant].sort(sortFn);
        const skyResult = skylinePack(sorted, usableW, usableH, minBreak);
        if (skyResult.area > bestArea) {
          bestArea = skyResult.area;
          bestTree = skylineToTree(skyResult.placed, usableW, usableH);
          bestRemaining = skyResult.remaining;
        }
      }
    }
  }

  return {
    tree: bestTree || createRoot(usableW, usableH),
    remaining: bestRemaining,
  };
}

// ========== SIMULATED ANNEALING (pós-otimização) ==========

interface SAState {
  genome: number[];
  rotations: boolean[];
  groupingMode: 0 | 1 | 2;
  forceFullWidth: boolean;
}

function simulatedAnnealingRefine(
  bestState: SAState,
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  initialFitness: number,
  maxIterations: number = 200,
): { state: SAState; fitness: number } {
  const T0 = 0.15;
  const cooling = 0.96;
  let T = T0;

  function buildAndEval(state: SAState): number {
    let work = state.genome.map((idx) => ({ ...pieces[idx] }));
    work = work.map((p, i) => (state.rotations[i] ? { ...p, w: p.h, h: p.w } : p));
    if (state.groupingMode === 1) work = groupPiecesByHeight(work, usableW);
    else if (state.groupingMode === 2) work = groupPiecesByWidth(work, usableH);

    const res = runPlacement(work, usableW, usableH, minBreak, state.forceFullWidth);
    const sheetArea = usableW * usableH;
    return res.area / sheetArea;
  }

  function neighbor(state: SAState): SAState {
    const c: SAState = {
      genome: [...state.genome],
      rotations: [...state.rotations],
      groupingMode: state.groupingMode,
      forceFullWidth: state.forceFullWidth,
    };
    const r = Math.random();
    if (r < 0.4) {
      // Swap dois genes
      const a = Math.floor(Math.random() * c.genome.length);
      const b = Math.floor(Math.random() * c.genome.length);
      [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
    } else if (r < 0.6) {
      // Flip rotação de 1 peça
      const idx = Math.floor(Math.random() * c.rotations.length);
      c.rotations[idx] = !c.rotations[idx];
    } else if (r < 0.75) {
      // Move bloco
      const n = c.genome.length;
      if (n > 4) {
        const size = Math.floor(Math.random() * Math.min(4, n / 3)) + 2;
        const start = Math.floor(Math.random() * (n - size));
        const seg = c.genome.splice(start, size);
        const target = Math.floor(Math.random() * c.genome.length);
        c.genome.splice(target, 0, ...seg);
      }
    } else if (r < 0.87) {
      c.groupingMode = ([0, 1, 2] as const)[Math.floor(Math.random() * 3)];
    } else {
      c.forceFullWidth = !c.forceFullWidth;
    }
    return c;
  }

  let currentState = { ...bestState, genome: [...bestState.genome], rotations: [...bestState.rotations] };
  let currentFitness = initialFitness;
  let bestFitness = initialFitness;
  let bestFoundState = currentState;

  for (let iter = 0; iter < maxIterations; iter++) {
    const candidateState = neighbor(currentState);
    const candidateFitness = buildAndEval(candidateState);

    const delta = candidateFitness - currentFitness;
    if (delta > 0 || Math.random() < Math.exp(delta / T)) {
      currentState = candidateState;
      currentFitness = candidateFitness;

      if (currentFitness > bestFitness) {
        bestFitness = currentFitness;
        bestFoundState = { ...currentState, genome: [...currentState.genome], rotations: [...currentState.rotations] };
      }
    }
    T *= cooling;
  }

  return { state: bestFoundState, fitness: bestFitness };
}

// ========== GA SUPPORT ==========

interface GAIndividual {
  genome: number[];
  rotations: boolean[];
  groupingMode: 0 | 1 | 2;
  forceFullWidth: boolean;
}

/**
 * Simula múltiplas chapas com fitness melhorado:
 * - Penaliza desequilíbrio entre chapas (std deviation de utilização)
 * - Penaliza peças não colocadas
 * - Bônus por remnant utilizável
 */
function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  maxSheets: number,
  forceFullWidth: boolean = false,
): {
  fitness: number;
  firstTree: TreeNode;
  stat_rejectedByMinBreak: number;
  stat_fragmentCount: number;
  stat_continuity: number;
} {
  let currentRemaining = [...workPieces];
  const sheetUtils: number[] = [];
  let firstTree: TreeNode | null = null;
  const sheetArea = usableW * usableH;
  let rejectedCount = 0;
  let continuityScore = 0;

  for (let s = 0; s < maxSheets; s++) {
    if (currentRemaining.length === 0) break;

    const countBefore = currentRemaining.length;

    // V7: alterna entre runPlacement e skyline por chapa para diversidade
    let res: { tree: TreeNode; area: number; remaining: Piece[] };
    if (s % 3 === 2 && !workPieces.some((p) => p.label)) {
      const skyRes = skylinePack(currentRemaining, usableW, usableH, minBreak);
      res = {
        tree: skylineToTree(skyRes.placed, usableW, usableH),
        area: skyRes.area,
        remaining: skyRes.remaining,
      };
    } else {
      res = runPlacement(currentRemaining, usableW, usableH, minBreak, forceFullWidth);
    }

    if (s === 0) firstTree = res.tree;

    const util = res.area / sheetArea;
    sheetUtils.push(util);

    const usedW = res.tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
    const freeW = usableW - usedW;
    if (freeW > 50) continuityScore += freeW / usableW;

    const piecesPlaced = countBefore - res.remaining.length;
    if (piecesPlaced === 0) rejectedCount++;

    currentRemaining = res.remaining;
  }

  const sheetsUsed = sheetUtils.length;
  if (sheetsUsed === 0)
    return {
      fitness: 0,
      firstTree: firstTree || createRoot(usableW, usableH),
      stat_rejectedByMinBreak: rejectedCount,
      stat_fragmentCount: 0,
      stat_continuity: 0,
    };

  // Fitness base: média de utilização
  const avgUtil = sheetUtils.reduce((a, b) => a + b, 0) / sheetsUsed;

  // Penalidade de desequilíbrio (std deviation das utilizações)
  // Chapas com utilização muito diferente entre si geram planos operacionalmente piores
  let stdDev = 0;
  if (sheetsUsed > 1) {
    const variance = sheetUtils.reduce((a, u) => a + (u - avgUtil) ** 2, 0) / sheetsUsed;
    stdDev = Math.sqrt(variance);
  }

  let fitness = avgUtil;
  fitness -= rejectedCount * 0.05;
  fitness -= stdDev * 0.1; // penaliza desequilíbrio
  fitness += (continuityScore * 0.01) / sheetsUsed;

  return {
    fitness: Math.max(0, fitness),
    firstTree: firstTree || createRoot(usableW, usableH),
    stat_rejectedByMinBreak: rejectedCount,
    stat_fragmentCount: 0,
    stat_continuity: continuityScore,
  };
}

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  onProgress?: (p: OptimizationProgress) => void,
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
      groupingMode: ([0, 1, 2] as const)[Math.floor(Math.random() * 3)],
      forceFullWidth: Math.random() > 0.5,
    };
  }

  function buildPieces(ind: GAIndividual): Piece[] {
    let work = ind.genome.map((idx) => ({ ...pieces[idx] }));
    work = work.map((p, i) => (ind.rotations[i] ? { ...p, w: p.h, h: p.w } : p));
    if (ind.groupingMode === 1) work = groupPiecesByHeight(work, usableW);
    else if (ind.groupingMode === 2) work = groupPiecesByWidth(work, usableH);
    return work;
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
      rotations: pA.rotations.map((r, i) => (Math.random() > 0.5 ? r : pB.rotations[i])),
      groupingMode: Math.random() > 0.5 ? pA.groupingMode : pB.groupingMode,
      forceFullWidth: Math.random() > 0.5 ? pA.forceFullWidth : pB.forceFullWidth,
    };
  }

  function mutate(ind: GAIndividual): GAIndividual {
    const c: GAIndividual = {
      genome: [...ind.genome],
      rotations: [...ind.rotations],
      groupingMode: ind.groupingMode,
      forceFullWidth: ind.forceFullWidth,
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
    } else if (r < 0.9) {
      c.groupingMode = ([0, 1, 2] as const)[Math.floor(Math.random() * 3)];
    } else {
      c.forceFullWidth = !c.forceFullWidth;
    }
    return c;
  }

  // Seeding com estratégias determinísticas
  const initialPop: GAIndividual[] = [];
  const strategies = getSortStrategies();
  strategies.forEach((sortFn) => {
    const sortedIndices = Array.from({ length: numPieces }, (_, i) => i).sort((a, b) => sortFn(pieces[a], pieces[b]));
    initialPop.push({
      genome: sortedIndices,
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: 0,
      forceFullWidth: false,
    });
  });
  while (initialPop.length < populationSize) initialPop.push(randomIndividual());

  let population = initialPop;
  let bestTree: TreeNode | null = null;
  let bestFitness = -1;
  let bestInd: GAIndividual | null = null;

  if (onProgress) onProgress({ phase: "Semeando População e V6...", current: 0, total: generations });

  for (let g = 0; g < generations; g++) {
    const currentLookahead = Math.min(8, 3 + Math.floor(g / 20));

    const evaluated = population.map((ind) => {
      const work = buildPieces(ind);
      const res = simulateSheets(work, usableW, usableH, minBreak, currentLookahead, ind.forceFullWidth);
      return { ind, tree: res.firstTree, fitness: res.fitness };
    });

    evaluated.sort((a, b) => b.fitness - a.fitness);

    if (evaluated[0].fitness > bestFitness) {
      bestFitness = evaluated[0].fitness;
      bestTree = JSON.parse(JSON.stringify(evaluated[0].tree));
      bestInd = evaluated[0].ind;
    }

    if (onProgress) {
      onProgress({
        phase: "Otimização Evolutiva Global",
        current: g + 1,
        total: generations,
        bestUtil: bestFitness * 100,
      });
    }

    if (g % 5 === 0)
      await new Promise<void>((r) => {
        (globalThis as any).setTimeout ? (globalThis as any).setTimeout(r, 0) : r();
      });

    const nextPop: GAIndividual[] = evaluated.slice(0, eliteCount).map((e) => e.ind);
    const seenGenomes = new Set(nextPop.map((i) => i.genome.join(",")));

    while (nextPop.length < populationSize) {
      const pA = tournament(evaluated);
      const pB = tournament(evaluated);
      let child = crossover(pA, pB);
      if (Math.random() < mutationRate) child = mutate(child);

      const key = child.genome.join(",");
      if (!seenGenomes.has(key)) {
        nextPop.push(child);
        seenGenomes.add(key);
      } else if (Math.random() < 0.2) {
        nextPop.push(randomIndividual());
      }
    }
    population = nextPop;
  }

  // ===== V7: SIMULATED ANNEALING PÓS-GA =====
  if (bestInd && numPieces <= 80) {
    if (onProgress)
      onProgress({
        phase: "Refinamento SA (pós-GA)...",
        current: generations,
        total: generations + 1,
        bestUtil: bestFitness * 100,
      });

    // SA roda de forma síncrona - limitamos iterações para manter responsividade
    const saIterations = Math.min(200, 30 * numPieces);
    const saResult = simulatedAnnealingRefine(
      bestInd as SAState,
      pieces,
      usableW,
      usableH,
      minBreak,
      bestFitness,
      saIterations,
    );

    if (saResult.fitness > bestFitness) {
      // Reconstruir a árvore com o melhor estado SA
      let saWork = saResult.state.genome.map((idx) => ({ ...pieces[idx] }));
      saWork = saWork.map((p, i) => (saResult.state.rotations[i] ? { ...p, w: p.h, h: p.w } : p));
      if (saResult.state.groupingMode === 1) saWork = groupPiecesByHeight(saWork, usableW);
      else if (saResult.state.groupingMode === 2) saWork = groupPiecesByWidth(saWork, usableH);

      const saPlacement = runPlacement(saWork, usableW, usableH, minBreak, saResult.state.forceFullWidth);
      bestTree = saPlacement.tree;
      bestFitness = saResult.fitness;
    }

    await new Promise<void>((r) => {
      (globalThis as any).setTimeout ? (globalThis as any).setTimeout(r, 0) : r();
    });
  }

  return bestTree || createRoot(usableW, usableH);
}

// Synchronous wrapper for backward compatibility
export function optimizeGeneticV1(pieces: Piece[], usableW: number, usableH: number, minBreak: number = 0): TreeNode {
  return optimizeV6(pieces, usableW, usableH, minBreak).tree;
}
