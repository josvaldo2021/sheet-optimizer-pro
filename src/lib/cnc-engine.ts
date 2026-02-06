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

// ========== OPTIMIZER V6 ==========

// Agrupa peças com mesma altura em pares (soma larguras)
function groupPiecesByHeight(pieces: Piece[]): Piece[] {
  // Map: altura -> lista de peças com essa altura
  const heightGroups = new Map<number, Piece[]>();
  
  pieces.forEach(p => {
    const h = Math.min(p.w, p.h); // altura será a menor dimensão
    if (!heightGroups.has(h)) heightGroups.set(h, []);
    heightGroups.get(h)!.push(p);
  });
  
  // Processa cada grupo: agrupa em pares quando possível
  const optimized: Piece[] = [];

  heightGroups.forEach(group => {

    let i = 0;
    while (i < group.length) {
      const p1 = group[i];
      const h = Math.min(p1.w, p1.h);
      const w1 = Math.max(p1.w, p1.h);

      // Procura próxima peça com mesma altura
      let nextIdx = -1;
      for (let j = i + 1; j < group.length; j++) {
        const h2 = Math.min(group[j].w, group[j].h);
        if (h2 === h) {
          nextIdx = j;
          break;
        }
      }

      if (nextIdx !== -1) {
        // Encontrou par: soma as larguras
        const p2 = group[nextIdx];
        const w2 = Math.max(p2.w, p2.h);
        const summedWidth = w1 + w2;
        const summedArea = summedWidth * h; // soma das áreas

        const grouped: Piece = {
          w: summedWidth,
          h: h,
          area: summedArea,
          count: 2,
        };
        optimized.push(grouped);

        group.splice(nextIdx, 1);
      } else {
        // Nenhum par: adiciona individualmente (normalizando orientação)
        const single: Piece = {
          w: w1,
          h: h,
          area: w1 * h,
          count: 1,
        };
        optimized.push(single);
      }
      i++;
    }
  });

  return optimized;
}

function oris(p: Piece): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [{ w: p.w, h: p.h }, { w: p.h, h: p.w }];
}

export function optimizeV6(pieces: Piece[], usableW: number, usableH: number): TreeNode {
  if (pieces.length === 0) return createRoot(usableW, usableH);

  const strategies: ((a: Piece, b: Piece) => number)[] = [
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => (b.w + b.h) - (a.w + a.h),
  ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;

  for (const sortFn of strategies) {
    const sorted = [...pieces].sort(sortFn);
    const result = runPlacement(sorted, usableW, usableH);
    if (result.area > bestArea) {
      bestArea = result.area;
      bestTree = JSON.parse(JSON.stringify(result.tree));
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

    // 1. Try existing columns (IMPROVED SCORING)
    for (const colX of tree.filhos) {
      const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      const freeH = usableH - usedH;
      for (const o of oris(piece)) {
        if (o.w <= colX.valor && o.h <= freeH) {
          const widthRatio = o.w / colX.valor;
          const score = (1 - widthRatio) * 3 + (1 - o.h / freeH) * 0.5;
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: 'EXISTING', col: colX, w: o.w, h: o.h, score };
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

    // Insert Y strip + Z piece(s)
    const yId = insertNode(tree, col.id, 'Y', bestFit.h, 1);
    const yNode = findNode(tree, yId)!;
    
    // Verifica se esta peça foi agrupada (marcada em groupPiecesByHeight)
    const grouped = piece.count && piece.count > 1;

    if (grouped) {
      // Estrutura: Z (largura total) → W (altura) → Q (cada pedaço)
      const partW = Math.round(bestFit.w / (piece.count || 2));
      const zId = insertNode(tree, yNode.id, 'Z', bestFit.w, 1);
      const wId = insertNode(tree, zId, 'W', bestFit.h, 1);
      insertNode(tree, wId, 'Q', partW, piece.count || 2);
      placedArea += bestFit.w * bestFit.h;
    } else {
      // Estrutura normal: Z + W
      const zId = insertNode(tree, yNode.id, 'Z', bestFit.w, 1);
      insertNode(tree, zId, 'W', bestFit.h, 1);
      placedArea += bestFit.w * bestFit.h;
    }
    
    remaining.shift();

    // IMPROVEMENT: Flexible lateral Z filling (accept h <= stripH)
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
          // Shorter piece → Z + W subdivision
          const zId = insertNode(tree, yNode.id, 'Z', bestOri.w, 1);
          insertNode(tree, zId, 'W', bestOri.h, 1);
          placedArea += bestOri.w * bestOri.h;

          // IMPROVEMENT: Fill remaining W height with exact-width pieces
          let freeWH = bestFit.h - bestOri.h;
          for (let j = 0; j < remaining.length && freeWH > 0; j++) {
            if (j === i) continue;
            const pw = remaining[j];
            for (const wo of oris(pw)) {
              if (wo.w === bestOri.w && wo.h <= freeWH) {
                insertNode(tree, zId, 'W', wo.h, 1);
                placedArea += bestOri.w * wo.h;
                freeWH -= wo.h;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }
        } else {
          // Exact height → simple Z
          insertNode(tree, yNode.id, 'Z', bestOri.w, 1);
          placedArea += bestOri.w * bestFit.h;
        }
        freeZW -= bestOri.w;
        remaining.splice(i, 1);
        i--;
      }
    }
  }

  return { tree, area: placedArea };
}
