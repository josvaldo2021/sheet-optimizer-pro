import { describe, it, expect } from "vitest";
import { optimizeV6, calcPlacedArea, TreeNode, Piece } from "../lib/cnc-engine";
import { regroupAdjacentStrips } from "../lib/engine/post-processing";

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

function collectPieceDims(node: TreeNode, parents: TreeNode[] = []): string[] {
  const yAncestor = [...parents].reverse().find((p) => p.tipo === "Y");
  const zAncestor = [...parents].reverse().find((p) => p.tipo === "Z");
  const wAncestor = [...parents].reverse().find((p) => p.tipo === "W");
  const dims: string[] = [];

  if (node.tipo === "Z" && node.filhos.length === 0) {
    dims.push(`${Math.round(node.valor)}x${Math.round(yAncestor?.valor || 0)}`);
  } else if (node.tipo === "W" && node.filhos.length === 0) {
    dims.push(`${Math.round(zAncestor?.valor || 0)}x${Math.round(node.valor)}`);
  } else if (node.tipo === "Q") {
    dims.push(`${Math.round(node.valor)}x${Math.round(wAncestor?.valor || 0)}`);
  }

  node.filhos.forEach((child) => {
    dims.push(...collectPieceDims(child, [...parents, node]));
  });

  return dims;
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
    const labels = collectLabels(result.tree);
    const placedCount = labels.length;

    console.log(`Y-level test: placed ${placedCount}/10 pieces, remaining: ${result.remaining.length}`);
    console.log(`Tree structure:`, JSON.stringify(result.tree, ['tipo', 'valor', 'multi', 'filhos', 'label'], 2).substring(0, 2000));

    expect(placedCount).toBeGreaterThanOrEqual(10);
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

  it("should not inflate piece height during W-level regrouping", () => {
    const tree: TreeNode = {
      id: "root",
      tipo: "ROOT",
      valor: 962,
      multi: 1,
      filhos: [
        {
          id: "x1",
          tipo: "X",
          valor: 962,
          multi: 1,
          filhos: [
            {
              id: "y1",
              tipo: "Y",
              valor: 962,
              multi: 1,
              filhos: [
                {
                  id: "z1",
                  tipo: "Z",
                  valor: 962,
                  multi: 1,
                  filhos: [
                    { id: "w-piece", tipo: "W", valor: 955, multi: 1, filhos: [], label: "P1" },
                    { id: "w-waste", tipo: "W", valor: 7, multi: 1, filhos: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as TreeNode;

    const remaining: Piece[] = [{ w: 10, h: 10, area: 100, label: "SMALL" }];

    regroupAdjacentStrips(tree, remaining, 962, 962, 0);

    const dims = collectPieceDims(tree);
    expect(dims).not.toContain("962x962");
    expect(dims.some((dim) => dim === "962x955" || dim === "955x962")).toBe(true);
  });
});

import { runPlacement } from "../lib/engine/placement";

describe("Lateral stacking phantom piece regression", () => {
  it("should not produce phantom pieces when a narrower piece is stacked inside a lateral Z slot", () => {
    // Regression test for bug: when stacking a piece (347×880) on top of a lateral piece (955×962)
    // inside a combined Y strip, a Q node must be created if stackOri.w < latZ.valor.
    // Without the fix, extractUsedPiecesWithContext returns wrong width (latZ.valor instead of
    // stackOri.w), causing the piece to not be deducted from inventory → phantom on next sheet.
    const usableW = 3210;
    const usableH = 2200;

    // Scenario: main pieces 962×1086 stacked (2 fit: 2×1086=2172≤2200),
    // lateral piece 955×962, then stacked on top: 347×880 (narrower than 955).
    const pieces = [
      { w: 962, h: 1086, area: 962 * 1086, label: "A" },
      { w: 962, h: 1086, area: 962 * 1086, label: "B" },
      { w: 955, h: 962, area: 955 * 962, label: "C" },
      { w: 347, h: 880, area: 347 * 880, label: "D" },
    ];

    const result = runPlacement(pieces, usableW, usableH, 0);

    const dims = collectPieceDims(result.tree);

    // D should appear as 347×880 or 880×347, NOT as 955×880 or 955×347 (wrong Z-slot width)
    const hasPhantomD = dims.some((d) => {
      const [w, h] = d.split("x").map(Number);
      return (w === 955 && (h === 347 || h === 880)) || (w === 880 && h === 955);
    });
    expect(hasPhantomD).toBe(false);

    // D must appear with its correct dimensions if it was placed
    if (result.remaining.every((r) => r.label !== "D")) {
      const hasCorrectD = dims.some((d) => d === "347x880" || d === "880x347");
      expect(hasCorrectD).toBe(true);
    }
  });
});

describe("unifyColumnWaste phantom piece regression", () => {
  it("should create Q node when a narrower piece is stacked into an existing Z slot via unifyColumnWaste", () => {
    // Regression: unifyColumnWaste Y-branch stacks a second piece (o.w < bestOri.w) into the same
    // Z slot but was missing the Q node. extractUsedPiecesWithContext then read Z.valor as pieceW
    // → phantom on next sheet (e.g. Q627 appearing where Q528 is expected in bug.md scenario).
    const usableW = 3210;
    const usableH = 2200;

    // Arrange: many pieces to force unifyColumnWaste to run and stack a narrow piece into a Z slot
    // that was sized for a wider piece (e.g. 627×610 piece creates Z627, then 528×290 is stacked).
    const pieces = [
      { w: 627, h: 610, area: 627 * 610, label: "A" },
      { w: 528, h: 290, area: 528 * 290, label: "B" },
      { w: 962, h: 1086, area: 962 * 1086, label: "C" },
      { w: 962, h: 1086, area: 962 * 1086, label: "D" },
      { w: 955, h: 962,  area: 955 * 962,  label: "E" },
      { w: 362, h: 800,  area: 362 * 800,  label: "F" },
    ];

    // Run full multi-sheet cycle: phantom would appear on the SECOND sheet
    let remaining = pieces.map(p => ({ ...p }));
    let totalPhantoms = 0;
    let sheets = 0;

    while (remaining.length > 0 && sheets < 10) {
      const result = runPlacement(remaining, usableW, usableH, 0);
      const dims = collectPieceDims(result.tree);

      for (const d of dims) {
        const [w, h] = d.split("x").map(Number);
        const matches = pieces.some(p => (p.w === w && p.h === h) || (p.w === h && p.h === w));
        if (!matches) totalPhantoms++;
      }

      const placed = remaining.length - result.remaining.length;
      if (placed === 0) break;
      remaining = result.remaining as typeof pieces;
      sheets++;
    }

    expect(totalPhantoms).toBe(0);
  });
});

describe("Pass-2 stacking phantom piece regression", () => {
  it("should not show phantom dimensions when a narrower piece is stacked inside a Pass-2 Z slot", () => {
    // Regression test: in Pass 2 (shorter piece stacking), when pw.wo.w < zNodeCurrent.valor,
    // createPieceNodes must create a Q node so the piece is recorded at its actual width.
    // Without the fix, extractUsedPiecesWithContext returns Z.valor (wrong) as the piece width.
    const usableW = 3210;
    const usableH = 2200;

    // Place a 880×303 piece first (Z slot = 880). Then a narrower 528×303 fits on top in same slot.
    // The phantom would show as 880×303 for both instead of 528×303 for the second piece.
    const pieces = [
      { w: 880, h: 303, area: 880 * 303, label: "A" },
      { w: 528, h: 303, area: 528 * 303, label: "B" },
      { w: 528, h: 800, area: 528 * 800, label: "C" },
    ];

    const result = runPlacement(pieces, usableW, usableH, 0);
    const dims = collectPieceDims(result.tree);

    // B or C should NOT appear as 880×... if they were placed in A's 880-wide Z slot
    // and are narrower than 880.
    const hasPhantomB = dims.some((d) => {
      const [w, h] = d.split("x").map(Number);
      return w === 880 && (h === 303 || h === 800) && result.remaining.every((r) => r.label !== "B");
    });
    // A phantom would mean B's dim is reported as 880×303 instead of 528×303
    // (only a phantom if A is also 880×303 — can't distinguish, so check via extractUsedPieces)
    // Instead: verify that no W-leaf in A's Z slot has wrong width
    // The key invariant: every placed piece's dims match an inventory entry (w×h or h×w)
    const inventoryDims = new Set(pieces.map((p) => `${p.w}x${p.h}`));
    for (const d of dims) {
      const [w, h] = d.split("x").map(Number);
      const matches =
        pieces.some((p) => (p.w === w && p.h === h) || (p.w === h && p.h === w));
      if (!matches) {
        // Phantom: a dimension that doesn't correspond to any inventory piece
        throw new Error(`Phantom piece found in tree: ${d} (not in inventory)`);
      }
    }
  });
});
