import { describe, it } from "vitest";
import { optimizeV6, normalizeTree, calcPlacedArea, TreeNode } from "../lib/cnc-engine";

function collectRects(tree: TreeNode): Array<{ x: number; y: number; w: number; h: number }> {
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

describe("Rotation Debug", () => {
  it("show tree structure and rects for transposed layout", () => {
    const pieces = [
      ...Array.from({ length: 10 }, (_, i) => ({ w: 725, h: 917, area: 725 * 917, label: "teste" })),
      { w: 1000, h: 459, area: 1000 * 459, label: "teste" },
    ];
    const usableW = 3210, usableH = 2400;

    const v6 = optimizeV6(pieces, usableW, usableH, 0, false);
    const v6T = optimizeV6(pieces, usableH, usableW, 0, false);

    console.log("\n=== v6 (3210x2400) ===");
    console.log("area:", calcPlacedArea(v6.tree), "remaining:", v6.remaining.length, "root.valor:", v6.tree.valor);
    const rectsV6 = collectRects(v6.tree);
    rectsV6.forEach(r => console.log(`  rect: x=${r.x} y=${r.y} w=${r.w} h=${r.h}`));

    console.log("\n=== v6T (optimizeV6 with 2400x3210) ===");
    console.log("area:", calcPlacedArea(v6T.tree), "remaining:", v6T.remaining.length, "root.valor:", v6T.tree.valor);
    const rectsV6T = collectRects(v6T.tree);
    rectsV6T.forEach(r => console.log(`  rect: x=${r.x} y=${r.y} w=${r.w} h=${r.h}`));

    console.log("\n=== After re-normalization (as done in genetic.ts) ===");
    let finalTree: TreeNode = { ...v6T.tree };
    finalTree.transposed = true;
    finalTree = normalizeTree(finalTree, usableW, usableH);
    console.log("root.valor:", finalTree.valor, "transposed:", finalTree.transposed);
    const rectsFinal = collectRects(finalTree);
    rectsFinal.forEach(r => console.log(`  rect: x=${r.x} y=${r.y} w=${r.w} h=${r.h}`));
    console.log("Total rects:", rectsFinal.length);
    console.log("Out of bounds:", rectsFinal.filter(r => r.x + r.w > usableW || r.y + r.h > usableH).length);
  });
});
