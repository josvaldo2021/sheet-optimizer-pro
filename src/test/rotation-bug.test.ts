import { describe, it, expect } from "vitest";
import { optimizeV6, normalizeTree, calcPlacedArea, TreeNode } from "../lib/cnc-engine";

function collectRects(tree: TreeNode): Array<{ x: number; y: number; w: number; h: number; label?: string }> {
  const rects: Array<{ x: number; y: number; w: number; h: number; label?: string }> = [];
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

describe("Rotation Bug", () => {
  it("transposed v6 result should produce rects within usableW×usableH after re-normalization", () => {
    const pieces = [
      ...Array.from({ length: 10 }, (_, i) => ({ w: 725, h: 917, area: 725 * 917, label: "A" + i })),
      { w: 1000, h: 459, area: 1000 * 459, label: "B" },
    ];
    const usableW = 3210,
      usableH = 2400;

    // Simulate what optimizeGeneticAsync does (lines 410-416 in genetic.ts)
    const v6T = optimizeV6(pieces, usableH, usableW, 0, false);

    console.log(
      "v6T area:", calcPlacedArea(v6T.tree),
      "remaining:", v6T.remaining.length,
      "root.valor:", v6T.tree.valor,
      "transposed:", v6T.tree.transposed,
    );

    // Apply bestTransposed=true normalization as done in optimizeGeneticAsync (lines 511-513)
    let finalTree: TreeNode = { ...v6T.tree };
    finalTree.transposed = true;
    finalTree = normalizeTree(finalTree, usableW, usableH);

    console.log("Final tree root.valor:", finalTree.valor, "transposed:", finalTree.transposed);

    const rects = collectRects(finalTree);
    console.log("Rects placed:", rects.length);

    for (const r of rects) {
      const outX = r.x + r.w > usableW + 1;
      const outY = r.y + r.h > usableH + 1;
      if (outX || outY) {
        console.log(`OUT OF BOUNDS: x=${r.x} y=${r.y} w=${r.w} h=${r.h}`);
      }
    }

    const outOfBounds = rects.filter((r) => r.x + r.w > usableW + 1 || r.y + r.h > usableH + 1);
    expect(outOfBounds.length).toBe(0);

    // Also verify root.valor equals usableW (3210)
    expect(finalTree.valor).toBe(usableW);
  });
});
