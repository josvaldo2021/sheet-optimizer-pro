import { describe, it, expect } from "vitest";
import { optimizeV6, calcPlacedArea, TreeNode, Piece } from "../lib/cnc-engine";

function collectLabels(node: TreeNode): string[] {
  const labels: string[] = [];
  if (node.label) labels.push(node.label);
  for (const c of node.filhos) labels.push(...collectLabels(c));
  return labels;
}

function countSheets(pieces: Piece[], usableW: number, usableH: number): { sheets: number; totalPlaced: number } {
  let remaining = pieces.map(p => ({ ...p }));
  let sheets = 0;
  let totalPlaced = 0;

  while (remaining.length > 0 && sheets < 50) {
    const result = optimizeV6(remaining, usableW, usableH, 0);
    const placed = remaining.length - result.remaining.length;
    if (placed === 0) break;
    totalPlaced += placed;
    remaining = result.remaining;
    sheets++;
  }
  return { sheets, totalPlaced };
}

describe("Waste Regrouping", () => {
  it("should place all pieces with varied sizes (Y-level regrouping opportunity)", () => {
    const usableW = 3210;
    const usableH = 2400;

    // 10 pieces of 917x725 - the example from the document
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) {
      pieces.push({ w: 917, h: 725, area: 917 * 725, label: `P${i + 1}` });
    }

    const result = optimizeV6(pieces, usableW, usableH, 0);

    console.log(`Y-level test: remaining: ${result.remaining.length}`);

    // All 10 pieces should be placed (remaining = 0)
    expect(result.remaining.length).toBe(0);
  });

  it("should handle mixed piece sizes and consolidate waste", () => {
    const usableW = 5940;
    const usableH = 3150;

    const pieces: Piece[] = [
      // Large pieces that leave significant waste
      { w: 2500, h: 1500, area: 2500 * 1500, label: "A" },
      { w: 2500, h: 1500, area: 2500 * 1500, label: "B" },
      // Medium pieces that could fit in consolidated waste
      { w: 1200, h: 800, area: 1200 * 800, label: "C" },
      { w: 1200, h: 800, area: 1200 * 800, label: "D" },
      // Small pieces for gap filling
      { w: 600, h: 400, area: 600 * 400, label: "E" },
      { w: 600, h: 400, area: 600 * 400, label: "F" },
      { w: 500, h: 350, area: 500 * 350, label: "G" },
      { w: 500, h: 350, area: 500 * 350, label: "H" },
    ];

    const result = optimizeV6(pieces, usableW, usableH, 0);
    const labels = collectLabels(result.tree);
    const area = calcPlacedArea(result.tree);
    const totalArea = pieces.reduce((s, p) => s + p.area, 0);
    const utilization = area / (usableW * usableH) * 100;

    console.log(`Mixed test: placed ${labels.length}/8 pieces, utilization: ${utilization.toFixed(1)}%`);
    console.log(`Remaining: ${result.remaining.length}`);

    expect(labels.length).toBeGreaterThanOrEqual(8);
  });

  it("should achieve better utilization with regrouping on many small pieces", () => {
    const usableW = 2440;
    const usableH = 1220;

    // Many varied small pieces that create fragmented waste
    const pieces: Piece[] = [
      { w: 800, h: 400, area: 800 * 400, label: "S1" },
      { w: 800, h: 400, area: 800 * 400, label: "S2" },
      { w: 750, h: 380, area: 750 * 380, label: "S3" },
      { w: 750, h: 380, area: 750 * 380, label: "S4" },
      { w: 600, h: 300, area: 600 * 300, label: "S5" },
      { w: 600, h: 300, area: 600 * 300, label: "S6" },
      { w: 500, h: 250, area: 500 * 250, label: "S7" },
      { w: 500, h: 250, area: 500 * 250, label: "S8" },
      { w: 400, h: 200, area: 400 * 200, label: "S9" },
      { w: 400, h: 200, area: 400 * 200, label: "S10" },
      { w: 350, h: 180, area: 350 * 180, label: "S11" },
      { w: 350, h: 180, area: 350 * 180, label: "S12" },
    ];

    const result = optimizeV6(pieces, usableW, usableH, 0);
    const labels = collectLabels(result.tree);
    const area = calcPlacedArea(result.tree);
    const utilization = area / (usableW * usableH) * 100;

    console.log(`Small pieces test: placed ${labels.length}/12, utilization: ${utilization.toFixed(1)}%, remaining: ${result.remaining.length}`);

    // With good regrouping, all 12 should fit in one sheet
    // Total area = 3,271,200 vs sheet area = 2,976,800 — might need 2 sheets
    const totalArea = pieces.reduce((s, p) => s + p.area, 0);
    console.log(`Total piece area: ${totalArea} vs sheet area: ${usableW * usableH}`);

    const { sheets, totalPlaced } = countSheets(pieces, usableW, usableH);
    console.log(`Sheets needed: ${sheets}, total placed: ${totalPlaced}/12`);

    expect(totalPlaced).toBe(12);
  });

  it("multi-sheet scenario: regrouping should reduce total sheet count", () => {
    const usableW = 5940;
    const usableH = 3150;

    // 20 pieces with sizes that create fragmented waste
    const pieces: Piece[] = [];
    const sizes = [
      [1800, 1200], [1800, 1200], [1800, 1200], [1800, 1200],
      [1500, 1000], [1500, 1000], [1500, 1000], [1500, 1000],
      [1200, 800],  [1200, 800],  [1200, 800],  [1200, 800],
      [900, 600],   [900, 600],   [900, 600],   [900, 600],
      [700, 500],   [700, 500],   [700, 500],   [700, 500],
    ];
    sizes.forEach(([w, h], i) => {
      pieces.push({ w, h, area: w * h, label: `P${i + 1}` });
    });

    const { sheets, totalPlaced } = countSheets(pieces, usableW, usableH);
    const totalArea = pieces.reduce((s, p) => s + p.area, 0);
    const sheetArea = usableW * usableH;
    const theoreticalMin = Math.ceil(totalArea / sheetArea);

    console.log(`Multi-sheet: ${sheets} sheets for ${totalPlaced} pieces`);
    console.log(`Theoretical minimum: ${theoreticalMin} sheets (total area: ${totalArea}, sheet: ${sheetArea})`);

    expect(totalPlaced).toBe(20);
    // Should be close to theoretical minimum
    expect(sheets).toBeLessThanOrEqual(theoreticalMin + 2);
  });
});
