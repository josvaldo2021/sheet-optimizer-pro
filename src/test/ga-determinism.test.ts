// Spec 007 (C1) — determinismo do algoritmo genético com PRNG semeado.
// Princípio V da constituição: mesmo input → mesmo plano de corte.
// Antes desta feature o GA usava Math.random sem semente (não reprodutível).

import { describe, it, expect } from "vitest";
import { optimizeGeneticAsync } from "../lib/engine/genetic";
import { mulberry32 } from "../lib/engine/rng";
import type { TreeNode, Piece } from "../lib/engine/types";

function normalizeTree(n: TreeNode): unknown {
  return {
    tipo: n.tipo,
    valor: n.valor,
    multi: n.multi,
    label: n.label ?? null,
    transposed: n.transposed ?? null,
    filhos: n.filhos.map(normalizeTree),
  };
}

function inventario(): Piece[] {
  // Instâncias rotuladas com uid, como o runAllSheets de produção.
  const specs: Array<[number, number, number]> = [
    [600, 400, 6],
    [350, 300, 8],
    [900, 450, 3],
    [250, 200, 10],
  ];
  const inv: Piece[] = [];
  let uid = 0;
  specs.forEach(([w, h, qty]) => {
    for (let i = 0; i < qty; i++) inv.push({ w, h, area: w * h, label: `__${uid++}` });
  });
  return inv;
}

describe("GA determinístico (spec 007, C1)", () => {
  it("mesmo input duas vezes → planos idênticos (semente default)", async () => {
    const a = await optimizeGeneticAsync(inventario(), 2730, 1810, 10, undefined, undefined, 10, 5);
    const b = await optimizeGeneticAsync(inventario(), 2730, 1810, 10, undefined, undefined, 10, 5);
    expect(normalizeTree(b)).toEqual(normalizeTree(a));
  }, 60000);

  it("mesma semente explícita → planos idênticos", async () => {
    const a = await optimizeGeneticAsync(inventario(), 2730, 1810, 10, undefined, undefined, 10, 5, 42);
    const b = await optimizeGeneticAsync(inventario(), 2730, 1810, 10, undefined, undefined, 10, 5, 42);
    expect(normalizeTree(b)).toEqual(normalizeTree(a));
  }, 60000);

  it("mulberry32: sequência reprodutível e distinta por semente", () => {
    const r1 = mulberry32(123);
    const r2 = mulberry32(123);
    const r3 = mulberry32(456);
    const s1 = Array.from({ length: 8 }, r1);
    const s2 = Array.from({ length: 8 }, r2);
    const s3 = Array.from({ length: 8 }, r3);
    expect(s2).toEqual(s1);
    expect(s3).not.toEqual(s1);
    s1.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });
});
