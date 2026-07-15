import { describe, it, expect } from "vitest";
import { optimizeV6, extractLeafPieces } from "../lib/cnc-engine";
import { runPlacement } from "../lib/engine/placement";

// Chapa 6000×3210 → área útil ~5980×3190 (margens 10).
const W = 5980;
const H = 3190;

function entry(w: number, h: number, label: string) {
  return { w, h, area: w * h, label };
}

function placedLabels(tree: Parameters<typeof extractLeafPieces>[0]): Set<string | undefined> {
  return new Set(extractLeafPieces(tree).map((lp) => lp.label));
}

// Cenário que motiva o fix da spec 010 (prioridade): uma peça MARCADA pequena
// entre várias NÃO marcadas grandes. `optimizeV6` maximiza ÁREA e pode excluir a
// marcada pequena (mandando-a para `remaining` → fim do plano). O plano então
// refaz a chapa com `runPlacement` colocando a marcada PRIMEIRO (garantido).
describe("Spec 010 priority fix — runPlacement guarantees the marked piece", () => {
  const marked = entry(200, 200, "__M");
  const nonMarked = Array.from({ length: 8 }, (_, i) => entry(1500, 1000, `__U${i}`));
  const inv = [marked, ...nonMarked]; // marcada PRIMEIRO (como no runAllSheets)

  it("runPlacement (marked first) ALWAYS places the marked piece", () => {
    const rp = runPlacement(inv, W, H, 0);
    expect(placedLabels(rp.tree).has("__M")).toBe(true);
  });

  it("if optimizeV6 excludes the marked piece, the runPlacement fallback recovers it", () => {
    const opt = optimizeV6(inv, W, H, 0);
    const optHasMarked = placedLabels(opt.tree).has("__M");
    // O fix: quando a marcada NÃO está no layout de maior área, refaz com runPlacement.
    const finalTree = optHasMarked ? opt.tree : runPlacement(inv, W, H, 0).tree;
    expect(placedLabels(finalTree).has("__M")).toBe(true); // marcada garantida na chapa
  });
});
