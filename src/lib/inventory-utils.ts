// Inventory restore helpers — devolve peças removidas do layout ao inventário

import { PieceItem } from "./engine/types";

export interface RemovedPiece {
  w: number;
  h: number;
  label?: string;
}

/**
 * Returns a NEW inventory array with quantities restored for each removed
 * piece that carries a label. Match order: label first, then dimensions in
 * either orientation (same criteria as returnLotToInventory). Items that were
 * filtered out after reaching qty 0 are recreated. Pieces without label are
 * ignored (manual cuts have no inventory linkage). Input is never mutated.
 */
export function restorePiecesToInventory(pieces: PieceItem[], removed: RemovedPiece[]): PieceItem[] {
  const updated = pieces.map((p) => ({ ...p }));

  removed.forEach((piece) => {
    if (!piece.label) return;

    const byLabel = updated.find((p) => p.label === piece.label);
    const match =
      byLabel ||
      updated.find(
        (p) =>
          (p.w === piece.w && p.h === piece.h) ||
          (p.w === piece.h && p.h === piece.w),
      );

    if (match) {
      match.qty += 1;
    } else {
      updated.push({
        id: `p${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        qty: 1,
        w: piece.w,
        h: piece.h,
        label: piece.label,
      });
    }
  });

  return updated;
}
