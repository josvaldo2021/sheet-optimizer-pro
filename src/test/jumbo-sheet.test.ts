// Spec 014 (fase 2) — decomposição da sobra do jumbo.
//
// Uma peça jumbo (maior lado > altura útil) só cabe deitada num canto e deixa a
// sobra em dois retângulos exatos. `buildJumboSheet` otimiza cada um com uma
// função `optimize` injetada, em vez do `runPlacement` guloso — enchendo a sobra
// com as peças médias. Deve CONSERVAR (nada perdido/inventado).
import { describe, it, expect } from "vitest";
import { buildJumboSheet } from "@/lib/jumbo-sheet";
import { optimizeV6 } from "@/lib/engine/optimizer";
import {
  extractLeafPieces, validatePlacementCandidate, physicalCount, physicalMeasureSet,
} from "@/lib/engine/tree-utils";
import type { Piece } from "@/lib/engine/types";

const W = 5980, H = 3190;
const jumbo: Piece = { w: 1956, h: 3560, area: 1956 * 3560, label: "J" };
const others: Piece[] = [
  ...[1, 2, 3, 4].map((i) => ({ w: 406, h: 2634, area: 406 * 2634, label: `h${i}` })),
  { w: 1262, h: 2473, area: 1262 * 2473, label: "e" },
  { w: 980, h: 580, area: 980 * 580, label: "f" },
  { w: 295, h: 2665, area: 295 * 2665, label: "g" },
  { w: 900, h: 1000, area: 900 * 1000, label: "i" },
];

const placedLabels = (t: import("@/lib/engine/types").TreeNode) =>
  new Set(extractLeafPieces(t).filter((l) => l.label).map((l) => l.label!));

describe("buildJumboSheet (spec 014 fase 2)", () => {
  it("coloca o jumbo num canto e ENCHE a sobra melhor que o runPlacement guloso", () => {
    const jr = buildJumboSheet(jumbo, W, H, others, 0, optimizeV6)!;
    expect(jr).not.toBeNull();
    const placed = placedLabels(jr.tree);
    expect(placed.has("J"), "jumbo colocado").toBe(true);
    expect(placed.has("i"), "peça média 'i' encaixada na sobra (o fallback guloso a largava)").toBe(true);
    // todas as 9 peças colocadas neste caso
    expect(placed.size).toBe(1 + others.length);
    expect(jr.remaining.length).toBe(0);
  });

  it("CONSERVA: sem perder nem inventar peça/medida (validação spec 012)", () => {
    const jr = buildJumboSheet(jumbo, W, H, others, 0, optimizeV6)!;
    const all = [jumbo, ...others];
    expect(
      validatePlacementCandidate(jr.tree, jr.remaining, physicalCount(all), physicalMeasureSet(all)),
      "conservação + fidelidade + rótulo único",
    ).toBe(true);
  });

  it("o jumbo fica no canto (X = lado longo, Y = lado curto)", () => {
    const jr = buildJumboSheet(jumbo, W, H, others, 0, optimizeV6)!;
    const x0 = jr.tree.filhos[0];
    expect(x0.tipo).toBe("X");
    expect(Math.round(x0.valor)).toBe(3560); // lado longo do jumbo ao longo da largura
    const y0 = x0.filhos[0];
    expect(Math.round(y0.valor)).toBe(1956); // lado curto = altura da faixa do jumbo
  });

  it("devolve null quando o jumbo não cabe nem deitado", () => {
    const huge: Piece = { w: 4000, h: 7000, area: 4000 * 7000, label: "X" };
    expect(buildJumboSheet(huge, W, H, others, 0, optimizeV6)).toBeNull();
  });

  it("peças que não cabem voltam em `remaining` (nada some)", () => {
    // só o jumbo + uma peça que não cabe na sobra (larga demais)
    const tooBig: Piece[] = [{ w: 5000, h: 3000, area: 5000 * 3000, label: "big" }];
    const jr = buildJumboSheet(jumbo, W, H, tooBig, 0, optimizeV6)!;
    const placed = placedLabels(jr.tree);
    expect(placed.has("J")).toBe(true);
    // conservação: colocadas + remaining = jumbo + tooBig
    expect(placed.size + jr.remaining.length).toBe(1 + tooBig.length);
  });
});
