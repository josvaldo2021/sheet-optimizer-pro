// CNC Cut Plan Engine — Main Optimizer V6

import { TreeNode, Piece } from './types';
import { createRoot, calcPlacedArea } from './tree-utils';
import { normalizeTree } from './normalization';
import { runPlacement } from './placement';
import { postOptimizeRegroup } from './post-processing';
import {
  groupPiecesBySameWidth,
  groupPiecesBySameHeight,
  groupPiecesByHeight,
  groupPiecesByWidth,
  groupPiecesFillRow,
  groupPiecesFillCol,
  groupPiecesColumnWidth,
  groupPiecesColumnHeight,
  groupPiecesBandFirst,
  groupPiecesBandLast,
  groupByCommonDimension,
  groupByCommonDimensionTransposed,
  groupStripPackingDP,
  groupStripPackingDPTransposed,
  groupCommonDimensionDP,
} from './grouping';

export function getSortStrategies(): ((a: Piece, b: Piece) => number)[] {
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
  ];
}

export function optimizeV6(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  useGrouping?: boolean,
): { tree: TreeNode; remaining: Piece[] } {
  if (pieces.length === 0) return { tree: createRoot(usableW, usableH), remaining: [] };

  const strategies = getSortStrategies();

  const rotatedPieces = pieces.map((p) => ({ w: p.h, h: p.w, area: p.area, count: p.count, label: p.label }));

  const pieceVariants: Piece[][] = useGrouping === false
      ? [pieces, rotatedPieces]
      : [
          pieces,
          rotatedPieces,
          groupPiecesBySameWidth(pieces, usableH),
          groupPiecesBySameWidth(rotatedPieces, usableH),
          groupPiecesBySameWidth(pieces),
          groupPiecesBySameWidth(rotatedPieces),
          groupPiecesBySameHeight(pieces, usableW),
          groupPiecesBySameHeight(rotatedPieces, usableW),
          groupPiecesBySameHeight(pieces),
          groupPiecesBySameHeight(rotatedPieces),
          groupPiecesFillRow(pieces, usableW),
          groupPiecesFillRow(rotatedPieces, usableW),
          groupPiecesFillRow(pieces, usableW, true),
          groupPiecesFillRow(rotatedPieces, usableW, true),
          groupPiecesFillCol(pieces, usableH),
          groupPiecesFillCol(rotatedPieces, usableH),
          groupPiecesFillCol(pieces, usableH, true),
          groupPiecesFillCol(rotatedPieces, usableH, true),
          groupPiecesFillRow(groupPiecesBySameWidth(pieces, usableH), usableW),
          groupPiecesFillRow(groupPiecesBySameHeight(pieces, usableW), usableW),
          groupPiecesColumnWidth(pieces, usableW),
          groupPiecesColumnWidth(rotatedPieces, usableW),
          groupPiecesColumnHeight(pieces, usableH),
          groupPiecesColumnHeight(rotatedPieces, usableH),
          groupPiecesBandFirst(pieces, usableW),
          groupPiecesBandFirst(rotatedPieces, usableW),
          groupPiecesBandFirst(pieces, usableW, true),
          groupPiecesBandFirst(rotatedPieces, usableW, true),
          groupPiecesBandLast(pieces, usableW),
          groupPiecesBandLast(rotatedPieces, usableW),
          groupByCommonDimension(pieces, usableW, usableH),
          groupByCommonDimension(rotatedPieces, usableW, usableH),
          groupByCommonDimension(pieces, usableW, usableH, 0.3),
          groupByCommonDimension(rotatedPieces, usableW, usableH, 0.3),
          groupByCommonDimensionTransposed(pieces, usableW, usableH),
          groupByCommonDimensionTransposed(rotatedPieces, usableW, usableH),
          groupStripPackingDP(pieces, usableW, usableH, 0),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 0),
          groupStripPackingDP(pieces, usableW, usableH, 5),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 5),
          groupStripPackingDP(pieces, usableW, usableH, 30),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 30),
          groupStripPackingDP(pieces, usableW, usableH, 100),
          groupStripPackingDP(pieces, usableW, usableH, 5, "raw"),
          groupStripPackingDP(rotatedPieces, usableW, usableH, 5, "raw"),
          groupStripPackingDPTransposed(pieces, usableW, usableH, 0),
          groupStripPackingDPTransposed(rotatedPieces, usableW, usableH, 0),
          groupStripPackingDPTransposed(pieces, usableW, usableH, 5),
          groupStripPackingDPTransposed(rotatedPieces, usableW, usableH, 5),
          groupCommonDimensionDP(pieces, usableW, usableH),
          groupCommonDimensionDP(rotatedPieces, usableW, usableH),
          groupCommonDimensionDP(pieces, usableW, usableH, 0.2),
          groupCommonDimensionDP(rotatedPieces, usableW, usableH, 0.2),
        ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;
  let bestRemainingCount = Infinity;
  let bestRemaining: Piece[] = [];
  let bestTransposed = false;

  for (const transposed of [false, true]) {
    const eW = transposed ? usableH : usableW;
    const eH = transposed ? usableW : usableH;

    for (const variant of pieceVariants) {
      for (const sortFn of strategies) {
        const sorted = [...variant].sort(sortFn);
        const result = runPlacement(sorted, eW, eH, minBreak);
        // Count remaining pieces (expanding grouped pieces)
        const remCount = result.remaining.reduce((s, p) => s + (p.count || 1), 0);
        // Primary: fewer remaining pieces; Secondary: higher placed area
        const isBetter = remCount < bestRemainingCount ||
          (remCount === bestRemainingCount && result.area > bestArea);
        if (isBetter) {
          bestArea = result.area;
          bestRemainingCount = remCount;
          bestTree = result.tree;
          bestRemaining = result.remaining;
          bestTransposed = transposed;
        }
      }
    }
  }

  let finalTree = bestTree || createRoot(usableW, usableH);
  if (bestTransposed) {
    finalTree.transposed = true;
    finalTree = normalizeTree(finalTree, usableW, usableH);
  }

  return {
    tree: finalTree,
    remaining: bestRemaining,
  };
}
