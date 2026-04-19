// CNC Cut Plan Engine — Scoring, Lookahead, and Cut Position Helpers

import { TreeNode, Piece } from './types';

export function oris(p: Piece): { w: number; h: number }[] {
  if (p.w === p.h) return [{ w: p.w, h: p.h }];
  return [
    { w: p.w, h: p.h },
    { w: p.h, h: p.w },
  ];
}

export function scoreFit(spaceW: number, spaceH: number, pieceW: number, pieceH: number, remaining: Piece[]): number {
  const wasteW = spaceW - pieceW;
  const wasteH = spaceH - pieceH;

  let score = wasteW * spaceH + wasteH * pieceW;

  const pieceArea = pieceW * pieceH;
  score -= pieceArea * 0.5;

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

  if (wasteW > 10 && !wFits) score += wasteW * spaceH * 4;
  if (wasteH > 10 && !hFits) score += wasteH * pieceW * 4;

  if (wasteW === 0) score -= spaceH * 20;
  if (wasteH === 0) score -= pieceW * 20;

  return score;
}

export function canResidualFitAnyPiece(
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

/**
 * Returns true if placing a piece of width `pieceW` in a slot of width `slotW`
 * leaves a residual strip that is narrower than minBreak (but not zero).
 * A zero residual (piece fills the slot exactly) is always valid.
 */
export function zResidualViolatesMinBreak(slotW: number, pieceW: number, minBreak: number): boolean {
  const residual = slotW - pieceW;
  return residual > 0 && residual < minBreak;
}

/** Generic: returns true if newValue creates a gap < minBreak with any sibling value. */
export function siblingViolatesMinBreak(existingValues: number[], newValue: number, minBreak: number): boolean {
  return existingValues.some(v => { const d = Math.abs(v - newValue); return d > 0 && d < minBreak; });
}

export function getZCutPositions(yStrip: TreeNode): number[] {
  const positions: number[] = [];
  let acc = 0;
  for (const z of yStrip.filhos) {
    acc += z.valor * z.multi;
    positions.push(acc);
  }
  return positions;
}

export function getAllZCutPositionsInColumn(colX: TreeNode): number[][] {
  return colX.filhos.map((y) => getZCutPositions(y));
}

export function violatesZMinBreak(
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
