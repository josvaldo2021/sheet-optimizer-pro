// CNC Cut Plan Engine — Tree Normalization (Canonical Hierarchy Rebuilding)

import { TreeNode } from './types';
import { gid } from './tree-utils';

interface AbsRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

function extractAbsoluteRects(tree: TreeNode, usableW: number, usableH: number): AbsRect[] {
  const rects: AbsRect[] = [];
  const T = tree.transposed || false;

  let xOff = 0;
  for (const colX of tree.filhos) {
    for (let ix = 0; ix < colX.multi; ix++) {
      let yOff = 0;
      for (const yNode of colX.filhos) {
        for (let iy = 0; iy < yNode.multi; iy++) {
          let zOff = 0;
          for (const zNode of yNode.filhos) {
            for (let iz = 0; iz < zNode.multi; iz++) {
              if (zNode.filhos.length === 0) {
                if (T) {
                  rects.push({ x: yOff, y: xOff, w: yNode.valor, h: zNode.valor, label: zNode.label });
                } else {
                  rects.push({ x: xOff + zOff, y: yOff, w: zNode.valor, h: yNode.valor, label: zNode.label });
                }
              } else {
                let wOff = 0;
                for (const wNode of zNode.filhos) {
                  for (let iw = 0; iw < wNode.multi; iw++) {
                    if (wNode.filhos.length === 0) {
                      if (T) {
                        rects.push({ x: yOff + wOff, y: xOff + zOff, w: wNode.valor, h: zNode.valor, label: wNode.label });
                      } else {
                        rects.push({ x: xOff + zOff, y: yOff + wOff, w: zNode.valor, h: wNode.valor, label: wNode.label });
                      }
                    } else {
                      let qOff = 0;
                      for (const qNode of wNode.filhos) {
                        for (let iq = 0; iq < qNode.multi; iq++) {
                          if (T) {
                            rects.push({ x: yOff + wOff, y: xOff + zOff + qOff, w: wNode.valor, h: qNode.valor, label: qNode.label });
                          } else {
                            rects.push({ x: xOff + zOff + qOff, y: yOff + wOff, w: qNode.valor, h: wNode.valor, label: qNode.label });
                          }
                          qOff += qNode.valor;
                        }
                      }
                    }
                    wOff += wNode.valor;
                  }
                }
              }
              zOff += zNode.valor;
            }
          }
          yOff += yNode.valor;
        }
      }
      xOff += colX.valor;
    }
  }

  return rects;
}

function findVerticalCuts(rects: AbsRect[], bx: number, by: number, bw: number, bh: number): number[] {
  const edges = new Set<number>();
  for (const r of rects) {
    const left = r.x - bx;
    const right = r.x + r.w - bx;
    if (left > 0.5 && left < bw - 0.5) edges.add(Math.round(left));
    if (right > 0.5 && right < bw - 0.5) edges.add(Math.round(right));
  }

  const validCuts: number[] = [];
  for (const cx of [...edges].sort((a, b) => a - b)) {
    const absCx = bx + cx;
    const straddles = rects.some(r => r.x < absCx - 0.5 && r.x + r.w > absCx + 0.5);
    if (!straddles) validCuts.push(cx);
  }

  return validCuts;
}

function findHorizontalCuts(rects: AbsRect[], bx: number, by: number, bw: number, bh: number): number[] {
  const edges = new Set<number>();
  for (const r of rects) {
    const bottom = r.y - by;
    const top = r.y + r.h - by;
    if (bottom > 0.5 && bottom < bh - 0.5) edges.add(Math.round(bottom));
    if (top > 0.5 && top < bh - 0.5) edges.add(Math.round(top));
  }

  const validCuts: number[] = [];
  for (const cy of [...edges].sort((a, b) => a - b)) {
    const absCy = by + cy;
    const straddles = rects.some(r => r.y < absCy - 0.5 && r.y + r.h > absCy + 0.5);
    if (!straddles) validCuts.push(cy);
  }

  return validCuts;
}

function rectsInBounds(rects: AbsRect[], bx: number, by: number, bw: number, bh: number): AbsRect[] {
  return rects.filter(r =>
    r.x >= bx - 0.5 && r.x + r.w <= bx + bw + 0.5 &&
    r.y >= by - 0.5 && r.y + r.h <= by + bh + 0.5
  );
}

function buildCanonicalTree(rects: AbsRect[], usableW: number, usableH: number): TreeNode {
  const root: TreeNode = { id: 'root', tipo: 'ROOT', valor: usableW, multi: 1, filhos: [] };

  if (rects.length === 0) return root;

  type Level = 'X' | 'Y' | 'Z' | 'W' | 'Q';
  const levelSequence: Level[] = ['X', 'Y', 'Z', 'W', 'Q'];
  const isVertical = (level: Level) => level === 'X' || level === 'Z' || level === 'Q';

  function subdivide(
    parentNode: TreeNode,
    levelIdx: number,
    subRects: AbsRect[],
    bx: number, by: number, bw: number, bh: number,
  ): void {
    if (subRects.length === 0 || levelIdx >= levelSequence.length) return;

    const level = levelSequence[levelIdx];
    const vertical = isVertical(level);

    const cuts = vertical
      ? findVerticalCuts(subRects, bx, by, bw, bh)
      : findHorizontalCuts(subRects, bx, by, bw, bh);

    if (cuts.length === 0) {
      if (subRects.length === 1) {
        const r = subRects[0];
        if (vertical) {
          const node: TreeNode = { id: gid(), tipo: level, valor: Math.round(r.w), multi: 1, filhos: [], label: r.label };
          parentNode.filhos.push(node);
          if (levelIdx + 1 < levelSequence.length) {
            const nextLevel = levelSequence[levelIdx + 1];
            const hNode: TreeNode = { id: gid(), tipo: nextLevel, valor: Math.round(r.h), multi: 1, filhos: [], label: r.label };
            node.filhos.push(hNode);
          }
        } else {
          const node: TreeNode = { id: gid(), tipo: level, valor: Math.round(r.h), multi: 1, filhos: [], label: r.label };
          parentNode.filhos.push(node);
          if (levelIdx + 1 < levelSequence.length) {
            const nextLevel = levelSequence[levelIdx + 1];
            const wNode: TreeNode = { id: gid(), tipo: nextLevel, valor: Math.round(r.w), multi: 1, filhos: [], label: r.label };
            node.filhos.push(wNode);
          }
        }
        return;
      }

      // At the X level with no valid vertical cuts: preserve canonical ROOT→X→Y→… structure
      // by wrapping all rects in a single full-width X node. Without this, Y nodes become
      // direct children of ROOT, breaking the assumed X→Y→Z→W→Q traversal order everywhere.
      if (level === 'X') {
        const xNode: TreeNode = { id: gid(), tipo: 'X', valor: Math.round(bw), multi: 1, filhos: [] };
        subdivide(xNode, levelIdx + 1, subRects, bx, by, bw, bh);
        parentNode.filhos.push(xNode);
        return;
      }

      subdivide(parentNode, levelIdx + 1, subRects, bx, by, bw, bh);
      return;
    }

    const boundaries = vertical
      ? [0, ...cuts, Math.round(bw)]
      : [0, ...cuts, Math.round(bh)];

    const uniqueBounds = [...new Set(boundaries)].sort((a, b) => a - b);

    for (let i = 0; i < uniqueBounds.length - 1; i++) {
      const segStart = uniqueBounds[i];
      const segEnd = uniqueBounds[i + 1];
      const segSize = segEnd - segStart;
      if (segSize < 1) continue;

      let segBx: number, segBy: number, segBw: number, segBh: number;
      if (vertical) {
        segBx = bx + segStart;
        segBy = by;
        segBw = segSize;
        segBh = bh;
      } else {
        segBx = bx;
        segBy = by + segStart;
        segBw = bw;
        segBh = segSize;
      }

      const segRects = rectsInBounds(subRects, segBx, segBy, segBw, segBh);

      if (segRects.length === 0) continue;

      const nodeValor = vertical ? segBw : segBh;
      const node: TreeNode = { id: gid(), tipo: level, valor: Math.round(nodeValor), multi: 1, filhos: [] };

      if (segRects.length === 1) {
        const r = segRects[0];
        const fillsW = Math.abs(r.w - segBw) < 1;
        const fillsH = Math.abs(r.h - segBh) < 1;

        if (fillsW && fillsH) {
          node.label = r.label;
          if (levelIdx + 1 < levelSequence.length) {
            const nextLevel = levelSequence[levelIdx + 1];
            const childValor = vertical ? Math.round(segBh) : Math.round(segBw);
            const child: TreeNode = { id: gid(), tipo: nextLevel, valor: childValor, multi: 1, filhos: [], label: r.label };
            node.filhos.push(child);
          }
          parentNode.filhos.push(node);
          continue;
        }
      }

      subdivide(node, levelIdx + 1, segRects, segBx, segBy, segBw, segBh);
      parentNode.filhos.push(node);
    }
  }

  subdivide(root, 0, rects, 0, 0, usableW, usableH);
  return root;
}

function nodesStructurallyEqual(a: TreeNode, b: TreeNode): boolean {
  if (a.tipo !== b.tipo || Math.abs(a.valor - b.valor) > 0.5) return false;
  if (a.multi !== b.multi) return false;
  if (a.filhos.length !== b.filhos.length) return false;
  for (let i = 0; i < a.filhos.length; i++) {
    if (!nodesStructurallyEqual(a.filhos[i], b.filhos[i])) return false;
  }
  return true;
}

function compressMulti(node: TreeNode): void {
  for (const child of node.filhos) {
    compressMulti(child);
  }

  if (node.filhos.length < 2) return;

  const compressed: TreeNode[] = [];
  for (const child of node.filhos) {
    if (compressed.length > 0) {
      const last = compressed[compressed.length - 1];
      if (nodesStructurallyEqual(last, child)) {
        last.multi += child.multi;
        continue;
      }
    }
    compressed.push(child);
  }
  node.filhos = compressed;
}

export function normalizeTree(tree: TreeNode, usableW: number, usableH: number): TreeNode {
  const rects = extractAbsoluteRects(tree, usableW, usableH);

  if (rects.length === 0) return tree;

  const canonical = buildCanonicalTree(rects, usableW, usableH);
  compressMulti(canonical);
  canonical.transposed = false;

  return canonical;
}
