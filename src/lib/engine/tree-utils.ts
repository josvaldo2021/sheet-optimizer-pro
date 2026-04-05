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
    } else if (n.tipo === "Q") {
      pieceW = n.valor; pieceH = wAncestor?.valor || 0; isLeaf = true;
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
        area += q.valor * w.valor * q.multi;
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
    area += q.valor * wNode.valor * q.multi;
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
