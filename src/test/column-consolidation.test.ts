// Spec 013 — "Cortar até o final primeiro": consolidação da sobra lateral.
//
// Numa coluna, o placement abre uma faixa W da altura EXATA de cada peça e deixa
// um retalho à direita de CADA faixa. Quando peças de mesma largura se empilham,
// esses retalhos são fatias do MESMO bloco. `consolidateColumns` funde as faixas
// numa coluna Q de altura cheia (peças como R), isolando a sobra lateral como UM
// bloco reutilizável — sem mover nenhuma peça. Padrão-âncora reportado pelo
// usuário (2026-07-18): coluna 3560 com 02508 (3560×1956) + três 02525 (2634×413/
// 413/407) empilhadas ⇒ sobra deve virar 926×1233, não três 926×413.
import { describe, it, expect } from "vitest";
import { consolidateColumns, largestFreeRect, extractLeafPieces } from "@/lib/engine/tree-utils";
import { optimizeV6 } from "@/lib/engine/optimizer";
import type { Piece, TreeNode, NodeType } from "@/lib/engine/types";

let _id = 0;
const N = (tipo: NodeType, valor: number, filhos: TreeNode[] = [], label?: string): TreeNode =>
  ({ id: `n${_id++}`, tipo, valor, multi: 1, filhos, label });

// Coluna do padrão do usuário: X3560 → Y3189 → Z3560 → [W1956[peça], W413→Q2634[peça] ×2, W407→Q2634[peça]]
const userColumn = (): TreeNode =>
  N("ROOT", 3560, [
    N("X", 3560, [
      N("Y", 3189, [
        N("Z", 3560, [
          N("W", 1956, [], "02508"),
          N("W", 413, [N("Q", 2634, [], "02525a")]),
          N("W", 413, [N("Q", 2634, [], "02525b")]),
          N("W", 407, [N("Q", 2634, [], "02525c")]),
        ]),
      ]),
    ]),
  ]);

const leafSet = (t: TreeNode) =>
  extractLeafPieces(t).filter((l) => l.label)
    .map((l) => `${l.label}=${Math.round(l.w)}×${Math.round(l.h)}`).sort();

describe("consolidateColumns (spec 013)", () => {
  it("funde faixas W de mesma largura num bloco Q de altura cheia", () => {
    const t = userColumn();
    const before = leafSet(t);
    consolidateColumns(t);

    // Estrutura: o run de 3 W's virou 1 W(1233) → Q(2634) → R(413/413/407).
    const z = t.filhos[0].filhos[0].filhos[0];
    expect(z.filhos.map((w) => Math.round(w.valor))).toEqual([1956, 1233]);
    const mergedW = z.filhos[1];
    expect(mergedW.filhos.length).toBe(1);
    const q = mergedW.filhos[0];
    expect(q.tipo).toBe("Q");
    expect(Math.round(q.valor)).toBe(2634);
    expect(q.filhos.map((r) => `${r.tipo}${Math.round(r.valor)}[${r.label}]`))
      .toEqual(["R413[02525a]", "R413[02525b]", "R407[02525c]"]);
  });

  it("CONSERVAÇÃO: mesmas peças, mesmas medidas (nada se move)", () => {
    const t = userColumn();
    const before = leafSet(t);
    consolidateColumns(t);
    expect(leafSet(t)).toEqual(before);
    expect(before).toEqual(["02508=3560×1956", "02525a=2634×413", "02525b=2634×413", "02525c=2634×407"]);
  });

  it("consolida a sobra lateral: 926×413 (retalho) → 926×1233 (bloco)", () => {
    const t = userColumn();
    expect(largestFreeRect(t, 3560, 3189)).toEqual({ w: 926, h: 413 });
    consolidateColumns(t);
    expect(largestFreeRect(t, 3560, 3189)).toEqual({ w: 926, h: 1233 });
  });

  it("é idempotente", () => {
    const t = userColumn();
    consolidateColumns(t);
    const once = JSON.stringify(t);
    consolidateColumns(t);
    expect(JSON.stringify(t)).toBe(once);
  });

  it("NÃO funde larguras diferentes", () => {
    const t = N("ROOT", 3560, [N("X", 3560, [N("Y", 3189, [N("Z", 3560, [
      N("W", 413, [N("Q", 2634, [], "a")]),
      N("W", 413, [N("Q", 2000, [], "b")]), // largura diferente
    ])])])]);
    consolidateColumns(t);
    const z = t.filhos[0].filhos[0].filhos[0];
    expect(z.filhos.length, "duas faixas W distintas permanecem").toBe(2);
  });

  it("NÃO funde faixa única (run < 2)", () => {
    const t = N("ROOT", 3560, [N("X", 3560, [N("Y", 3189, [N("Z", 3560, [
      N("W", 413, [N("Q", 2634, [], "a")]),
    ])])])]);
    consolidateColumns(t);
    const z = t.filhos[0].filhos[0].filhos[0];
    expect(z.filhos[0].filhos[0].tipo, "continua W→Q folha").toBe("Q");
  });

  it("NÃO toca peça de largura cheia (W-folha, sem sobra lateral)", () => {
    const t = N("ROOT", 3560, [N("X", 3560, [N("Y", 3189, [N("Z", 3560, [
      N("W", 500, [], "full1"), N("W", 500, [], "full2"),
    ])])])]);
    const before = JSON.stringify(t);
    consolidateColumns(t);
    expect(JSON.stringify(t)).toBe(before);
  });
});

// O caminho do GA (strip horizontal) fragmenta no nível X→Y→Z (cada peça numa
// linha Y própria com um Z estreito), não no nível Z→W→Q. `consolidateColumns`
// tem de pegar OS DOIS.
describe("consolidateColumns — nível Y-linha (caminho do GA)", () => {
  const gaColumn = (): TreeNode =>
    N("ROOT", 3560, [N("X", 3560, [
      N("Y", 1956, [N("Z", 3560, [N("W", 1956, [], "02508")])]),
      N("Y", 413, [N("Z", 2634, [N("W", 413, [], "02525a")])]),
      N("Y", 413, [N("Z", 2634, [N("W", 413, [], "02525b")])]),
      N("Y", 407, [N("Z", 2634, [N("W", 407, [], "02525c")])]),
    ])]);

  it("funde Y-linhas de mesma largura de Z e consolida a sobra (926×413 → 926×1233)", () => {
    const t = gaColumn();
    const before = leafSet(t);
    expect(largestFreeRect(t, 3560, 3189)).toEqual({ w: 926, h: 413 });
    consolidateColumns(t);
    expect(leafSet(t), "conservação").toEqual(before);
    expect(largestFreeRect(t, 3560, 3189)).toEqual({ w: 926, h: 1233 });
    // estrutura: run de 3 Y's virou Y1233 → Z2634 → W413/W413/W407
    const x = t.filhos[0];
    expect(x.filhos.map((y) => Math.round(y.valor))).toEqual([1956, 1233]);
    const z = x.filhos[1].filhos[0];
    expect(Math.round(z.valor)).toBe(2634);
    expect(z.filhos.map((w) => `${w.tipo}${Math.round(w.valor)}[${w.label}]`))
      .toEqual(["W413[02525a]", "W413[02525b]", "W407[02525c]"]);
  });
});

describe("consolidateColumns end-to-end (optimizeV6)", () => {
  it("o padrão do usuário consolida a sobra no plano real", () => {
    const pieces: Piece[] = [
      { w: 3560, h: 1956, area: 3560 * 1956, label: "02508" },
      { w: 2634, h: 413, area: 2634 * 413, label: "02525a" },
      { w: 2634, h: 413, area: 2634 * 413, label: "02525b" },
      { w: 2634, h: 407, area: 2634 * 407, label: "02525c" },
    ];
    const r = optimizeV6(pieces, 3560, 3189, 0);
    expect(extractLeafPieces(r.tree).filter((l) => l.label).length, "4 peças conservadas").toBe(4);
    const fr = largestFreeRect(r.tree, 3560, 3189);
    expect(fr, "sobra consolidada num bloco alto").toEqual({ w: 926, h: 1233 });
  });
});
