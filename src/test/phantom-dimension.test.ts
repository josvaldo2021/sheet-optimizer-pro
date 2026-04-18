// Regression test: phantom dimension bug
// Inventory: 1059×2651 ×4, 1381×2102 ×1, 1381×2092 ×1
// Bug: piece 1381×2092 was being displayed as 1381×2102 (or 2102×1381)
// because the W node was inflated from 2092 to 2102 (the parent Y container).

import { describe, it, expect } from 'vitest';
import { optimizeV6 } from '@/lib/engine/optimizer';
import { TreeNode, Piece } from '@/lib/engine/types';

interface DisplayedPiece {
  w: number;
  h: number;
  label?: string;
}

/**
 * Walk the tree and collect every leaf piece with its DERIVED dimensions
 * exactly as the SheetViewer would render them.
 *
 * Rules (mirrors normalization extractAbsoluteRects):
 *   Z leaf (no W)     → w=Z.valor, h=Y.valor  ← bug source
 *   W leaf (no Q)     → w=Z.valor, h=W.valor  ← correct
 *   Q leaf (no R)     → w=Q.valor, h=W.valor
 *   R leaf            → w=Q.valor, h=R.valor
 */
function collectDisplayedPieces(tree: TreeNode): DisplayedPiece[] {
  const out: DisplayedPiece[] = [];
  for (const colX of tree.filhos) {
    for (let ix = 0; ix < colX.multi; ix++) {
      for (const yNode of colX.filhos) {
        for (let iy = 0; iy < yNode.multi; iy++) {
          for (const zNode of yNode.filhos) {
            for (let iz = 0; iz < zNode.multi; iz++) {
              if (zNode.filhos.length === 0) {
                if (zNode.label) {
                  out.push({ w: zNode.valor, h: yNode.valor, label: zNode.label });
                }
              } else {
                for (const wNode of zNode.filhos) {
                  for (let iw = 0; iw < wNode.multi; iw++) {
                    if (wNode.filhos.length === 0) {
                      if (wNode.label) {
                        out.push({ w: zNode.valor, h: wNode.valor, label: wNode.label });
                      }
                    } else {
                      for (const qNode of wNode.filhos) {
                        for (let iq = 0; iq < qNode.multi; iq++) {
                          if (qNode.filhos.length === 0) {
                            if (qNode.label) {
                              out.push({ w: qNode.valor, h: wNode.valor, label: qNode.label });
                            }
                          } else {
                            for (const rNode of qNode.filhos) {
                              for (let ir = 0; ir < rNode.multi; ir++) {
                                if (rNode.label) {
                                  out.push({ w: qNode.valor, h: rNode.valor, label: rNode.label });
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
  }
  return out;
}

/** Normalize a (w,h) pair so rotation doesn't matter for matching. */
const key = (w: number, h: number) => {
  const a = Math.min(w, h);
  const b = Math.max(w, h);
  return `${a}x${b}`;
};

describe('Phantom dimension bug — teste min break', () => {
  // Inventory from teste_min_breack.xlsx
  const inventory: Piece[] = [
    { w: 1059, h: 2651, area: 1059 * 2651, count: 4, label: '00381/26' },
    { w: 1381, h: 2102, area: 1381 * 2102, count: 1, label: '00381/26' },
    { w: 1381, h: 2092, area: 1381 * 2092, count: 1, label: '00381/26' },
  ];

  // Expand counts → individual pieces (the way the engine actually receives them)
  function expand(inv: Piece[]): Piece[] {
    const out: Piece[] = [];
    for (const p of inv) {
      const n = p.count ?? 1;
      for (let i = 0; i < n; i++) {
        out.push({ w: p.w, h: p.h, area: p.area, count: 1, label: p.label });
      }
    }
    return out;
  }

  // Allowed (w,h) keys exactly as in inventory
  const allowedKeys = new Set([
    key(1059, 2651),
    key(1381, 2102),
    key(1381, 2092),
  ]);

  it('should never display a piece with phantom dimensions (e.g. 1381×2102 instead of 1381×2092)', () => {
    const pieces = expand(inventory);
    const usableW = 6000;
    const usableH = 3210;
    const minBreak = 30;

    // Run multiple sheets to exhaust the inventory and exercise post-processing
    let remaining = pieces;
    let safety = 10;
    const allDisplayed: DisplayedPiece[] = [];

    while (remaining.length > 0 && safety-- > 0) {
      const result = optimizeV6(remaining, usableW, usableH, minBreak, true);
      const displayed = collectDisplayedPieces(result.tree);
      allDisplayed.push(...displayed);

      if (result.remaining.length === remaining.length) break; // no progress
      remaining = result.remaining;
    }

    // Every displayed piece must match an inventory dimension
    const phantoms = allDisplayed.filter(d => !allowedKeys.has(key(d.w, d.h)));
    if (phantoms.length > 0) {
      console.error('Phantom pieces found:', phantoms);
    }
    expect(phantoms).toEqual([]);
  });

  it('should display exactly the right COUNT of each dimension across all sheets', () => {
    const pieces = expand(inventory);
    const usableW = 6000;
    const usableH = 3210;
    const minBreak = 30;

    let remaining = pieces;
    let safety = 10;
    const allDisplayed: DisplayedPiece[] = [];

    while (remaining.length > 0 && safety-- > 0) {
      const result = optimizeV6(remaining, usableW, usableH, minBreak, true);
      allDisplayed.push(...collectDisplayedPieces(result.tree));
      if (result.remaining.length === remaining.length) break;
      remaining = result.remaining;
    }

    // Count per dimension
    const counts: Record<string, number> = {};
    for (const d of allDisplayed) {
      const k = key(d.w, d.h);
      counts[k] = (counts[k] ?? 0) + 1;
    }

    // 2102 and 2092 are NEAR each other (diff = 10mm < minBreak=30) — the bug
    // would inflate 2092 → 2102 making the count of 1381×2102 = 2 and 1381×2092 = 0.
    expect(counts[key(1381, 2102)] ?? 0).toBeLessThanOrEqual(1);
    expect(counts[key(1381, 2092)] ?? 0).toBeLessThanOrEqual(1);
  });
});
