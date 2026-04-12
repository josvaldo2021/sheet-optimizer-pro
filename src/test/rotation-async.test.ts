import { describe, it, expect } from "vitest";
import { optimizeGeneticAsync, calcPlacedArea, TreeNode } from "../lib/cnc-engine";

function collectAllRects(tree: TreeNode): Array<{ x: number; y: number; w: number; h: number }> {
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
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
                if (T) rects.push({ x: yOff, y: xOff, w: yNode.valor, h: zNode.valor });
                else rects.push({ x: xOff + zOff, y: yOff, w: zNode.valor, h: yNode.valor });
              } else {
                let wOff = 0;
                for (const wNode of zNode.filhos) {
                  for (let iw = 0; iw < wNode.multi; iw++) {
                    if (wNode.filhos.length === 0) {
                      if (T) rects.push({ x: yOff + wOff, y: xOff + zOff, w: wNode.valor, h: zNode.valor });
                      else rects.push({ x: xOff + zOff, y: yOff + wOff, w: zNode.valor, h: wNode.valor });
                    } else {
                      let qOff = 0;
                      for (const qNode of wNode.filhos) {
                        for (let iq = 0; iq < qNode.multi; iq++) {
                          if (T) rects.push({ x: yOff + wOff, y: xOff + zOff + qOff, w: wNode.valor, h: qNode.valor });
                          else rects.push({ x: xOff + zOff + qOff, y: yOff + wOff, w: qNode.valor, h: wNode.valor });
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

describe("Rotation Bug - Full GA", () => {
  it("final tree from optimizeGeneticAsync must have transposed=false and rects in bounds", async () => {
    const pieces = [
      ...Array.from({ length: 10 }, () => ({ w: 725, h: 917, area: 725 * 917, label: "teste" })),
      { w: 1000, h: 459, area: 1000 * 459, label: "teste" },
    ];
    const usableW = 3210, usableH = 2400;

    const finalTree = await optimizeGeneticAsync(pieces, usableW, usableH, 0, undefined, undefined, 10, 10);

    console.log("Final tree transposed:", finalTree.transposed);
    console.log("Final tree root.valor:", finalTree.valor);
    console.log("calcPlacedArea:", calcPlacedArea(finalTree));

    const rects = collectAllRects(finalTree);
    console.log("Rects placed:", rects.length);
    rects.forEach(r => {
      const outX = r.x + r.w > usableW + 0.5;
      const outY = r.y + r.h > usableH + 0.5;
      if (outX || outY) console.log(`  OUT OF BOUNDS: x=${r.x} y=${r.y} w=${r.w} h=${r.h} (outX=${outX} outY=${outY})`);
    });

    const outOfBounds = rects.filter(r => r.x + r.w > usableW + 0.5 || r.y + r.h > usableH + 0.5 || r.x < 0 || r.y < 0);

    // Key assertions:
    expect(finalTree.transposed).toBeFalsy(); // Must not be transposed after normalization
    expect(finalTree.valor).toBe(usableW);    // Root valor must be usableW
    expect(outOfBounds.length).toBe(0);       // All rects must be within bounds
  }, 60000);
});
