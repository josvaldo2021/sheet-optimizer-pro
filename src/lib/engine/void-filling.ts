// CNC Cut Plan Engine — Void Filling

import { TreeNode, Piece } from './types';
import { insertNode, findNode } from './tree-utils';
import { oris, canResidualFitAnyPiece, getAllZCutPositionsInColumn, violatesZMinBreak, zResidualViolatesMinBreak, siblingViolatesMinBreak } from './scoring';
import { createPieceNodes } from './placement';

export function fillVoids(tree: TreeNode, remaining: Piece[], usableW: number, usableH: number, minBreak: number = 0): number {
  let filledArea = 0;

  for (const colX of tree.filhos) {
    const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const freeH = usableH - usedH;
    if (freeH > 0) {
      filledArea += fillRect(tree, colX, remaining, colX.valor, freeH, "Y", minBreak);
    }

    for (const yNode of colX.filhos) {
      const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      const freeZ = colX.valor - usedZ;
      if (freeZ > 0) {
        filledArea += fillRectZ(tree, yNode, remaining, freeZ, yNode.valor, minBreak);
      }

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

function fillRect(
  tree: TreeNode,
  colX: TreeNode,
  remaining: Piece[],
  maxW: number,
  maxH: number,
  _level: string,
  minBreak: number = 0,
): number {
  let filled = 0;

  while (maxH > 0 && remaining.length > 0) {
    let bestIdx = -1;
    let bestO: { w: number; h: number } | null = null;
    let bestArea = 0;

    for (let i = 0; i < remaining.length; i++) {
      const pc = remaining[i];
      for (const o of oris(pc)) {
        if (o.w <= maxW && o.h <= maxH) {
          if (minBreak > 0) {
            if (o.h < minBreak) continue;
            const allZPositions = getAllZCutPositionsInColumn(colX);
            if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
            if (zResidualViolatesMinBreak(maxW, o.w, minBreak)) continue;
            const residualH = maxH - o.h;
            if (residualH > 0 && residualH < minBreak) continue;
          }
          const pieceArea = o.w * o.h;
          if (pieceArea > bestArea) {
            bestArea = pieceArea;
            bestIdx = i;
            bestO = o;
          }
        }
      }
    }

    if (bestIdx < 0 || !bestO) break;

    const pc = remaining[bestIdx];

    const actualUsedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    if (actualUsedH + bestO.h > actualUsedH + maxH + 0.5) break;

    let consumed = bestO.h;
    const yId = insertNode(tree, colX.id, "Y", consumed, 1);
    const yNode = findNode(tree, yId)!;

    createPieceNodes(tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);

    filled += bestO.w * bestO.h;
    maxH -= consumed;
    remaining.splice(bestIdx, 1);
  }

  return filled;
}

function fillRectZ(
  _tree: TreeNode,
  yNode: TreeNode,
  remaining: Piece[],
  maxW: number,
  maxH: number,
  minBreak: number = 0,
): number {
  let filled = 0;

  while (maxW > 0 && remaining.length > 0) {
    let bestIdx = -1;
    let bestO: { w: number; h: number } | null = null;
    let bestArea = 0;

    for (let i = 0; i < remaining.length; i++) {
      const pc = remaining[i];
      for (const o of oris(pc)) {
        if (o.w <= maxW && o.h <= maxH) {
          if (minBreak > 0) {
            const parentX = _tree.filhos.find((x) => x.filhos.some((y) => y.id === yNode.id));
            if (parentX) {
              const yIndex = parentX.filhos.indexOf(yNode);
              const allZPositions = getAllZCutPositionsInColumn(parentX);
              const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
              const newCutPos = currentOffset + o.w;
              if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
            }
            if (zResidualViolatesMinBreak(maxW, o.w, minBreak)) continue;
            const residualW = maxW - o.w;
            if (residualW > 0 && residualW < minBreak) continue;
          }
          const pieceArea = o.w * o.h;
          if (pieceArea > bestArea) {
            bestArea = pieceArea;
            bestIdx = i;
            bestO = o;
          }
        }
      }
    }

    if (bestIdx < 0 || !bestO) break;

    const pc = remaining[bestIdx];
    let consumed = bestO.w;
    createPieceNodes(_tree, yNode, pc, bestO.w, bestO.h, bestO.w !== pc.w);
    filled += bestO.w * bestO.h;
    maxW -= consumed;
    remaining.splice(bestIdx, 1);
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

  while (maxH > 0 && remaining.length > 0) {
    let bestIdx = -1;
    let bestO: { w: number; h: number } | null = null;
    let bestArea = 0;

    for (let i = 0; i < remaining.length; i++) {
      const pc = remaining[i];
      for (const o of oris(pc)) {
        if (o.w <= zWidth && o.h <= maxH) {
          if (minBreak > 0) {
            if (siblingViolatesMinBreak(zNode.filhos.map(w => w.valor), o.h, minBreak)) continue;
            const lateralResidual = zWidth - o.w;
            if (lateralResidual > 0 && lateralResidual < minBreak) continue;
            const wHeightResidual = maxH - o.h;
            if (wHeightResidual > 0 && wHeightResidual < minBreak) continue;
          }
          const pieceArea = o.w * o.h;
          if (pieceArea > bestArea) {
            bestArea = pieceArea;
            bestIdx = i;
            bestO = o;
          }
        }
      }
    }

    if (bestIdx < 0 || !bestO) break;

    const pc = remaining[bestIdx];
    let consumed = bestO.h;

    const actualRotated = bestO.w !== pc.w;
    createPieceNodes(tree, zNode, pc, bestO.w, bestO.h, actualRotated, zNode);

    filled += bestO.w * bestO.h;
    maxH -= consumed;
    remaining.splice(bestIdx, 1);
  }

  return filled;
}
