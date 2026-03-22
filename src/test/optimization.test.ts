import { describe, it, expect } from "vitest";
import { PieceItem, optimizeGeneticAsync, calcPlacedArea } from "../lib/cnc-engine";

describe("Optimization Regression", () => {
  it("should achieve the 50-sheet solution for the 200-piece scenario", async () => {
    const usableW = 5940;
    const usableH = 3150;
    
    // 200 pieces total
    const pieces: PieceItem[] = [
      { id: "big", qty: 100, w: 2500, h: 2500 },
      { id: "small", qty: 100, w: 1000, h: 900 }
    ];

    // Simulate the whole process (same logic as Index.tsx optimizeAllSheets)
    let remaining = pieces.map(p => ({ ...p }));
    let sheetCount = 0;
    const maxSheets = 100;

    while (remaining.length > 0 && sheetCount < maxSheets) {
      sheetCount++;
      const inv: any[] = [];
      remaining.forEach(p => {
        for (let i = 0; i < p.qty; i++) {
          inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: p.id });
        }
      });
      if (inv.length === 0) break;

      // Use a lower generation count for faster tests, but high enough to find the pattern
      const result = await optimizeGeneticAsync(
        inv,
        usableW,
        usableH,
        0,
        undefined,
        undefined,
        10, // pop
        10  // gens
      );

      // Deduct pieces... this part needs to be accurately reflected from the UI logic
      const usedPieces: any[] = [];
      const traverse = (n: any, parents: any[], mult: number) => {
        const totalMult = mult * n.multi;
        const yAncestor = parents.find(p => p.tipo === "Y");
        const zAncestor = parents.find(p => p.tipo === "Z");
        const wAncestor = parents.find(p => p.tipo === "W");
        
        let pw = 0, ph = 0, leaf = false;
        if (n.tipo === "Z" && n.filhos.length === 0) { pw = n.valor; ph = yAncestor?.valor || 0; leaf = true; }
        else if (n.tipo === "W" && n.filhos.length === 0) { pw = zAncestor?.valor || 0; ph = n.valor; leaf = true; }
        else if (n.tipo === "Q") { pw = n.valor; ph = wAncestor?.valor || 0; leaf = true; }

        if (leaf && pw > 0 && ph > 0) {
          for (let m = 0; m < totalMult; m++) usedPieces.push({ w: pw, h: ph });
        }
        n.filhos.forEach((f: any) => traverse(f, [...parents, n], totalMult));
      };
      traverse(result, [], 1);

      // Track how many copies can we replicate
      const layoutBOM = new Map<string, number>();
      usedPieces.forEach(p => {
        const k = `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}`;
        layoutBOM.set(k, (layoutBOM.get(k) || 0) + 1);
      });

      let maxReps = Infinity;
      layoutBOM.forEach((count, key) => {
        const [w, h] = key.split('x').map(Number);
        const avail = remaining.filter(p => (p.w === w && p.h === h) || (p.w === h && p.h === w)).reduce((s, p) => s + p.qty, 0);
        maxReps = Math.min(maxReps, Math.floor((avail - count) / count));
      });
      if (!isFinite(maxReps) || maxReps < 0) maxReps = 0;

      // Deduct pieces for the first sheet
      usedPieces.forEach(used => {
        for (let i = 0; i < remaining.length; i++) {
          const p = remaining[i];
          if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
            p.qty--;
            if (p.qty <= 0) remaining.splice(i, 1);
            break;
          }
        }
      });

      // Dedut for replications
      if (maxReps > 0) {
        layoutBOM.forEach((count, key) => {
          const [w, h] = key.split('x').map(Number);
          let toDeduct = count * maxReps;
          for (let i = 0; i < remaining.length && toDeduct > 0; i++) {
            const p = remaining[i];
            if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) {
              const d = Math.min(toDeduct, p.qty);
              p.qty -= d;
              toDeduct -= d;
              if (p.qty <= 0) { remaining.splice(i, 1); i--; }
            }
          }
        });
        sheetCount += maxReps;
      }
    }

    console.log(`Final Sheet Count: ${sheetCount}`);
    expect(sheetCount).toBeLessThan(55);
    expect(sheetCount).toBeLessThanOrEqual(51); // We hope for 50
  }, 60000);
});
