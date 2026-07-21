// Regressão — dimensão fantasma disparada por Quebra Mínima (minBreak > 0).
//
// Bug (achado pelo usuário, 2026-07-21): com minBreak>0, `consolidateColumns`
// (spec 013) copiava a ALTURA DA BANDA como medida da sub-banda. Quando a
// normalização deixa uma banda mais ALTA que a peça — porque o resíduo lateral é
// menor que minBreak e não pode ser cortado — a peça era INFLADA para a altura da
// banda (ex.: 995×1995 virava 995×2010). Correção: a sub-banda passa a carregar a
// EXTENSÃO REAL da peça; o resíduo não-cortável fica implícito.
//
// Cobria uma lacuna: `wasm-parity.test.ts` só exercita min_break=0. Este arquivo
// trava o regime minBreak>0 nos DOIS motores.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { optimizeV6 } from "@/lib/engine/optimizer";
import { optimizeGeneticAsync } from "@/lib/engine/genetic";
import { extractLeafPieces } from "@/lib/engine/tree-utils";
import type { Piece, TreeNode } from "@/lib/engine/types";

interface WasmBindings {
  wasm_optimize_v6(pj: string, w: number, h: number, mb: number): string;
  wasm_optimize_genetic(pj: string, w: number, h: number, mb: number, pop: number, gen: number, cb?: unknown): string;
}
let wasm: WasmBindings;
beforeAll(async () => {
  const mod = await import("../../wasm-engine/pkg/optimizer_wasm.js");
  const bytes = readFileSync(resolve(process.cwd(), "wasm-engine/pkg/optimizer_wasm_bg.wasm"));
  await (mod as unknown as { default: (o: unknown) => Promise<unknown> }).default({ module_or_path: bytes });
  wasm = mod as unknown as WasmBindings;
});

const mk = (w: number, h: number, n: number, prefix: string): Piece[] =>
  Array.from({ length: n }, (_, i) => ({ w, h, area: w * h, label: `${prefix}${i}` }));

// Cenário-âncora do usuário: mesma largura (995), alturas 1995 e 995, quebra 30.
// Empilhar 3× 1995 = 5985 deixa 15mm (< 30) no topo — o gatilho exato.
const INV: Piece[] = [...mk(995, 1995, 20, "A"), ...mk(995, 995, 20, "B")];
const MB = 30;

const dimKey = (p: { w: number; h: number }) =>
  `${Math.min(Math.round(p.w), Math.round(p.h))}x${Math.max(Math.round(p.w), Math.round(p.h))}`;
const REAL = new Set([dimKey({ w: 995, h: 1995 }), dimKey({ w: 995, h: 995 })]);

const phantoms = (tree: TreeNode) =>
  extractLeafPieces(tree)
    .filter((l) => !REAL.has(dimKey(l)))
    .map((l) => `${l.label ?? "?"}=${Math.round(l.w)}×${Math.round(l.h)}`);

describe("fantasma por minBreak — consolidateColumns (spec 013)", () => {
  // Ambas as orientações da chapa: a inflação aparecia só na transposta (3210×6000).
  for (const [W, H] of [[6000, 3210], [3210, 6000]] as const) {
    it(`optimizeV6 TS ${W}×${H} mb=${MB}: sem folha fantasma`, () => {
      const p = phantoms(optimizeV6(INV, W, H, MB).tree);
      expect(p, `folhas com medida inexistente: ${p.join(", ")}`).toEqual([]);
    });

    it(`optimizeV6 WASM ${W}×${H} mb=${MB}: sem folha fantasma`, () => {
      const r = JSON.parse(wasm.wasm_optimize_v6(JSON.stringify(INV), W, H, MB)) as { tree: TreeNode };
      const p = phantoms(r.tree);
      expect(p, `folhas com medida inexistente: ${p.join(", ")}`).toEqual([]);
    });
  }

  it(`GA TS 6000×3210 mb=${MB}: sem folha fantasma`, async () => {
    const t = await optimizeGeneticAsync(INV, 6000, 3210, MB);
    const p = phantoms(t);
    expect(p, `folhas com medida inexistente: ${p.join(", ")}`).toEqual([]);
  });

  it(`GA WASM 6000×3210 mb=${MB}: sem folha fantasma`, () => {
    const t = JSON.parse(wasm.wasm_optimize_genetic(JSON.stringify(INV), 6000, 3210, MB, 10, 10)) as TreeNode;
    const p = phantoms(t);
    expect(p, `folhas com medida inexistente: ${p.join(", ")}`).toEqual([]);
  });
});
