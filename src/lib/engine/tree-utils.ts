// CNC Cut Plan Engine — Tree Manipulation Utilities

import { NodeType, TreeNode, PieceItem } from './types';

let _c = 0;
export function gid(): string {
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
  } else if (tipo === "R") {
    const p = target?.tipo === "Q" ? target : findParentOfType(tree, selectedId, "Q");
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
  } else if (tipo === "R") {
    const qP = target?.tipo === "Q" ? target : findParentOfType(tree, selectedId, "Q");
    if (!qP) return { allocated: 0, error: "Selecione Q" };
    const wP = findParentOfType(tree, qP.id, "W");
    if (!wP) return { allocated: 0, error: "Selecione W" };
    const occupiedR = qP.filhos.reduce((a, f) => a + f.valor * f.multi, 0);
    free = wP.valor - occupiedR;
  }

  const alloc = Math.min(multi, Math.floor(free / valor));
  if (alloc <= 0) return { allocated: 0, error: "Sem espaço" };

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
    } else if (tipo === "R") {
      const qP = target?.tipo === "Q" ? target : findParentOfType(tree, selectedId, "Q");
      if (qP) siblings = qP.filhos;
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
                          if (q.filhos.length === 0) {
                            area += q.valor * w.valor;
                          } else {
                            for (const r of q.filhos) {
                              for (let ir = 0; ir < r.multi; ir++) {
                                area += q.valor * r.valor;
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
      }
    }
  }

  tree.filhos.forEach(procX);
  return area;
}

// ─── Yield (aproveitamento) helpers ──────────────────────────────────────────

/**
 * Returns the dimensions of the LAST leftover generated by the plan.
 *
 * Generation order (earliest → latest):
 *   W/Q/R-gaps  →  Z-gaps  →  row-gaps  →  column-gap
 *
 * So we check from outermost inward: column-gap is the most recently generated
 * leftover; if absent we recurse into the last column, last row, last Z, etc.
 */
export function getLastLeftover(
  tree: TreeNode,
  usableW: number,
  usableH: number,
): { w: number; h: number } | null {
  if (tree.filhos.length === 0) {
    // Empty plan — full sheet is leftover
    return { w: usableW, h: usableH };
  }

  // ── Level 1: column gap (right-side strip after all X columns) ──
  const usedColW = tree.filhos.reduce((s, x) => s + x.valor * x.multi, 0);
  if (usedColW < usableW) {
    return { w: usableW - usedColW, h: usableH };
  }

  // ── Level 2: row gap at the bottom of the LAST column ──
  const lastX = tree.filhos[tree.filhos.length - 1];
  if (lastX.filhos.length === 0) {
    // Column exists but has no rows → entire column height is leftover
    return { w: lastX.valor, h: usableH };
  }
  const usedRowH = lastX.filhos.reduce((s, y) => s + y.valor * y.multi, 0);
  if (usedRowH < usableH) {
    return { w: lastX.valor, h: usableH - usedRowH };
  }

  // ── Level 3: Z gap at the right of the LAST row in the last column ──
  const lastY = lastX.filhos[lastX.filhos.length - 1];
  if (lastY.filhos.length === 0) {
    // Row exists but has no Z pieces → full row width is leftover
    return { w: lastX.valor, h: lastY.valor };
  }
  const usedZW = lastY.filhos.reduce((s, z) => s + z.valor * z.multi, 0);
  if (usedZW < lastX.valor) {
    return { w: lastX.valor - usedZW, h: lastY.valor };
  }

  // ── Level 4: W gap at the bottom of the LAST Z ──
  const lastZ = lastY.filhos[lastY.filhos.length - 1];
  if (lastZ.filhos.length === 0) {
    // Z is a leaf piece — no sub-structure, no further gap
    return null;
  }
  const usedWH = lastZ.filhos.reduce((s, w) => s + w.valor * w.multi, 0);
  if (usedWH < lastY.valor) {
    return { w: lastZ.valor, h: lastY.valor - usedWH };
  }

  // ── Level 5: Q gap at the right of the LAST W ──
  const lastW = lastZ.filhos[lastZ.filhos.length - 1];
  if (lastW.filhos.length === 0) return null;
  const usedQW = lastW.filhos.reduce((s, q) => s + q.valor * q.multi, 0);
  if (usedQW < lastZ.valor) {
    return { w: lastZ.valor - usedQW, h: lastW.valor };
  }

  // ── Level 6: R gap at the bottom of the LAST Q ──
  const lastQ = lastW.filhos[lastW.filhos.length - 1];
  if (lastQ.filhos.length === 0) return null;
  const usedRH = lastQ.filhos.reduce((s, r) => s + r.valor * r.multi, 0);
  if (usedRH < lastW.valor) {
    return { w: lastQ.valor, h: lastW.valor - usedRH };
  }

  return null; // Fully packed — no leftover
}

/**
 * Computes plan utilization according to the aproveitamento.md specification:
 *
 *   Aproveitamento = Área total das peças / (Área total das chapas − Área da última sobra reaproveitável)
 *
 * Only the LAST leftover of the LAST chapa is eligible for reuse discount.
 * All other leftovers are treated as real loss (already tested by the optimizer).
 *
 * @param chapas        All chapas in the plan (tree + usedArea per sheet)
 * @param usableW       Sheet usable width (mm)
 * @param usableH       Sheet usable height (mm)
 * @param minReusableW  Minimum width for a leftover to be considered reusable (default 200 mm)
 * @param minReusableH  Minimum height for a leftover to be considered reusable (default 200 mm)
 * @returns Utilization percentage [0, 100]
 */
export function calcPlanUtilization(
  chapas: Array<{ tree: TreeNode; usedArea: number }>,
  usableW: number,
  usableH: number,
  minReusableW = 200,
  minReusableH = 200,
): number {
  if (chapas.length === 0 || usableW <= 0 || usableH <= 0) return 0;

  const totalPiecesArea = chapas.reduce((s, c) => s + c.usedArea, 0);
  const totalSheetArea = chapas.length * usableW * usableH;

  // Only the last chapa can contribute a reusable leftover
  const lastChapa = chapas[chapas.length - 1];
  const lastLeftover = getLastLeftover(lastChapa.tree, usableW, usableH);

  let reusableArea = 0;
  if (
    lastLeftover &&
    lastLeftover.w >= minReusableW &&
    lastLeftover.h >= minReusableH
  ) {
    reusableArea = lastLeftover.w * lastLeftover.h;
  }

  const denominator = totalSheetArea - reusableArea;
  if (denominator <= 0) return 100;

  return Math.min(100, (totalPiecesArea / denominator) * 100);
}

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

    let pieceW = 0, pieceH = 0;
    let isLeaf = false;

    if (n.tipo === "Z" && n.filhos.length === 0) {
      pieceW = n.valor; pieceH = yAncestor?.valor || 0; isLeaf = true;
    } else if (n.tipo === "W" && n.filhos.length === 0) {
      pieceW = zAncestor?.valor || 0; pieceH = n.valor; isLeaf = true;
    } else if (n.tipo === "Q" && n.filhos.length === 0) {
      pieceW = n.valor; pieceH = wAncestor?.valor || 0; isLeaf = true;
    } else if (n.tipo === "R") {
      const qAncestor = [...parents].reverse().find((p) => p.tipo === "Q");
      pieceW = qAncestor?.valor || 0; pieceH = n.valor; isLeaf = true;
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

/** Check if a subtree is pure waste (no labels anywhere) */
export function isWasteSubtree(node: TreeNode): boolean {
  if (node.label) return false;
  return node.filhos.every(c => isWasteSubtree(c));
}

/** Calculate area of a Z subtree */
export function calculateZArea(zNode: TreeNode, yHeight: number): number {
  if (zNode.filhos.length === 0) return zNode.valor * yHeight * zNode.multi;
  let area = 0;
  for (const w of zNode.filhos) {
    if (w.filhos.length === 0) {
      area += zNode.valor * w.valor * w.multi;
    } else {
      for (const q of w.filhos) {
        if (q.filhos.length === 0) {
          area += q.valor * w.valor * q.multi;
        } else {
          for (const r of q.filhos) {
            area += q.valor * r.valor * r.multi;
          }
        }
      }
    }
  }
  return area * zNode.multi;
}

/** Calculate area of a W subtree */
export function calculateWArea(wNode: TreeNode, zWidth: number): number {
  if (wNode.filhos.length === 0) return zWidth * wNode.valor * wNode.multi;
  let area = 0;
  for (const q of wNode.filhos) {
    if (q.filhos.length === 0) {
      area += q.valor * wNode.valor * q.multi;
    } else {
      for (const r of q.filhos) {
        area += q.valor * r.valor * r.multi;
      }
    }
  }
  return area * wNode.multi;
}

/** Recursively calculate the area of pieces in a subtree */
export function calculateNodeArea(node: TreeNode): number {
  if (node.filhos.length === 0) {
    return node.valor * node.multi;
  }
  let area = 0;
  for (const child of node.filhos) {
    area += calculateNodeArea(child) * node.multi;
  }
  return area;
}
