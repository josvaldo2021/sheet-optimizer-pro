// Regressão da Causa 2: o algoritmo genético não deve produzir peças com
// dimensão "fantasma" (folha cortada na medida do contêiner em vez da real).
// Corrigido em genetic.ts via capPhantomLeaves. Determinístico (PRNG semeável).
import { describe, it, expect, afterAll } from "vitest";
import { optimizeGeneticAsync } from "../lib/cnc-engine";
import { TreeNode } from "../lib/engine/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ORIG = Math.random;
afterAll(() => { Math.random = ORIG; });

const W = 2750, H = 1830;
const ITEMS = [
  { id: "A", qty: 6, w: 716, h: 600 }, { id: "B", qty: 8, w: 600, h: 500 },
  { id: "C", qty: 10, w: 400, h: 380 }, { id: "D", qty: 12, w: 250, h: 200 },
  { id: "E", qty: 4, w: 900, h: 300 },
];
const key = (w: number, h: number) => `${Math.min(Math.round(w), Math.round(h))}x${Math.max(Math.round(w), Math.round(h))}`;
const validDims = new Set(ITEMS.map((p) => key(p.w, p.h)));

// Extração de folhas espelhando extractAbsoluteRects (folha = nó sem filhos).
function leafDims(tree: TreeNode): { w: number; h: number; label?: string }[] {
  const out: { w: number; h: number; label?: string }[] = [];
  const walk = (n: TreeNode, par: TreeNode[]) => {
    if (n.filhos.length === 0) {
      const y = par.find((p) => p.tipo === "Y");
      const z = par.find((p) => p.tipo === "Z");
      const w = par.find((p) => p.tipo === "W");
      const q = par.find((p) => p.tipo === "Q");
      let pw = 0, ph = 0;
      if (n.tipo === "Z") { pw = n.valor; ph = y?.valor || 0; }
      else if (n.tipo === "W") { pw = z?.valor || 0; ph = n.valor; }
      else if (n.tipo === "Q") { pw = n.valor; ph = w?.valor || 0; }
      else if (n.tipo === "R") { pw = q?.valor || 0; ph = n.valor; }
      if (pw > 0 && ph > 0) out.push({ w: pw, h: ph, label: n.label });
    }
    n.filhos.forEach((f) => walk(f, [...par, n]));
  };
  tree.filhos.forEach((c) => walk(c, []));
  return out;
}

describe("GA não produz dimensões fantasma (Causa 2)", () => {
  // Os fantasmas apareciam em chapas posteriores (inventário menor) e cresciam com
  // a busca; pop/gen=50 e 2 sementes que historicamente os produziam.
  it.each([1, 11])("seed %i — toda folha rotulada casa com uma dimensão do inventário", async (seed) => {
    let remaining = ITEMS.map((p) => ({ ...p }));
    Math.random = mulberry32(seed);
    const phantoms: string[] = [];

    for (let sheet = 0; sheet < 3 && remaining.length > 0; sheet++) {
      const inv: { w: number; h: number; area: number; label: string }[] = [];
      const uidToItem = new Map<string, (typeof remaining)[number]>();
      let uid = 0;
      remaining.forEach((p) => {
        for (let i = 0; i < p.qty; i++) {
          const u = `__${uid++}`;
          inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: u });
          uidToItem.set(u, p);
        }
      });
      if (!inv.length) break;

      const tree = await optimizeGeneticAsync(inv, W, H, 0, undefined, undefined, 50, 50);

      for (const leaf of leafDims(tree)) {
        if (leaf.label && !validDims.has(key(leaf.w, leaf.h))) {
          phantoms.push(`chapa ${sheet + 1}: ${Math.round(leaf.w)}x${Math.round(leaf.h)} (label ${leaf.label})`);
        }
      }

      // deduz por uid para avançar as chapas
      const used: string[] = [];
      const tr = (n: TreeNode, m: number) => {
        const tm = m * n.multi;
        if (!n.filhos.length && n.label) for (let i = 0; i < tm; i++) used.push(n.label);
        n.filhos.forEach((f) => tr(f, tm));
      };
      tr(tree, 1);
      used.forEach((lb) => { const it = uidToItem.get(lb); if (it && it.qty > 0) it.qty--; });
      remaining = remaining.filter((p) => p.qty > 0);
    }

    expect(phantoms).toEqual([]);
  }, 120000);
});
