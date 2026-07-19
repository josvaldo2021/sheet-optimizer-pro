// Agrupamento em X (coordenadas.md): colunas de mesma altura viram UMA faixa com
// sobra única no topo, em vez de N colunas fragmentadas.
import { describe, it, expect } from "vitest";
import { consolidateColumnsX, extractLeafPieces, calcPlacedArea } from "@/lib/engine/tree-utils";
import { runPlacement } from "@/lib/engine/placement";
import { normalizeTree } from "@/lib/engine/normalization";
import type { TreeNode, Piece } from "@/lib/engine/types";

let nid = 0;
const n = (tipo: TreeNode["tipo"], valor: number, filhos: TreeNode[] = [], label?: string): TreeNode =>
  ({ id: `n${nid++}`, tipo, valor, multi: 1, filhos, label });
const UW = 2462, UH = 3190;

// 6 colunas X(393) fragmentadas, cada uma com uma peça 393×2500 (sobra 690 no topo).
const fragmented = (): TreeNode =>
  n("ROOT", UW,
    [1, 2, 3, 4, 5].map((i) =>
      n("X", 393, [n("Y", UH, [n("Z", 393, [n("W", 2500, [], `c${i}`)])])]),
    ).concat([
      // última coluna mais larga (peça não preenche a largura) — NÃO deve agrupar.
      n("X", 497, [n("Y", UH, [n("Z", 393, [n("W", 2500, [], "c6")])])]),
    ]),
  );

describe("consolidateColumnsX", () => {
  it("agrupa as 6 colunas de mesma altura (inclui a mais larga) numa faixa só", () => {
    const tree = fragmented(); // 5× X393 + 1× X497 (peça 393 em todas, altura 2500)
    consolidateColumnsX(tree, UW, UH);
    expect(tree.filhos).toHaveLength(1); // uma faixa só (a X497 tb agrupa: 393 ≤ 497)
    const grouped = tree.filhos[0];
    expect(grouped.tipo).toBe("X");
    expect(grouped.valor).toBe(5 * 393 + 497); // soma das LARGURAS DE COLUNA = 2462
    const band = grouped.filhos[0];
    expect(band.tipo).toBe("Y");
    expect(band.valor).toBe(2500);
    expect(band.filhos).toHaveLength(6); // as 6 peças lado a lado
    expect(band.filhos.every((z) => z.tipo === "Z" && z.valor === 393)).toBe(true); // largura da PEÇA
    // resíduo implícito (2462 − 6×393 = 104) fica à direita da faixa; peças conservadas.
    expect(extractLeafPieces(tree).map((l) => l.label).sort()).toEqual(
      ["c1", "c2", "c3", "c4", "c5", "c6"],
    );
  });

  it("conserva peças e área (a sobra vira uma tira, não some peça)", () => {
    const tree = fragmented();
    const areaBefore = calcPlacedArea(tree);
    const labelsBefore = extractLeafPieces(tree).map((l) => l.label).sort();
    consolidateColumnsX(tree, UW, UH);
    expect(calcPlacedArea(tree)).toBe(areaBefore); // 6 peças 393×2500
    expect(extractLeafPieces(tree).map((l) => l.label).sort()).toEqual(labelsBefore);
  });

  it("PREENCHE a tira do topo da faixa agrupada com peças do pool", () => {
    const tree = fragmented(); // faixa 1965×690 no topo (usableH 3190 − 2500)
    const pool: Piece[] = [1, 2].map((i) => ({ w: 900, h: 600, area: 900 * 600, label: `fill${i}` }));
    consolidateColumnsX(tree, UW, UH, {
      pool,
      minBreak: 0,
      optimize: (pcs, w, h, mb) => runPlacement([...pcs].sort((a, b) => b.area - a.area), w, h, mb),
      normalize: (t, w, h, mb) => normalizeTree(t, w, h, mb),
    });
    const labels = extractLeafPieces(tree).filter((l) => l.label).map((l) => l.label!);
    // as peças do pool entraram na tira (a faixa agrupada tem uma 2ª banda Y no topo).
    expect(labels.some((l) => l.startsWith("fill"))).toBe(true);
    const grouped = tree.filhos[0];
    expect(grouped.filhos.length).toBe(2); // Y(2500) das peças + Y(690) da tira preenchida
    expect(grouped.filhos[1].tipo).toBe("Y");
    expect(grouped.filhos[1].valor).toBe(690);
  });

  it("agrupa colunas de mesma altura mesmo NÃO-adjacentes (2 de 3 → 3 de 3)", () => {
    // a(h2500), meio(h1800), b(h2500), c(h2500): as 3 de 2500 devem agrupar juntas,
    // mesmo com o 'meio' entre elas.
    const col = (h: number, label: string) =>
      n("X", 393, [n("Y", UH, [n("Z", 393, [n("W", h, [], label)])])]);
    const tree = n("ROOT", UW, [
      col(2500, "a"), col(1800, "meio"), col(2500, "b"), col(2500, "c"),
    ]);
    consolidateColumnsX(tree, UW, UH);
    // faixa das 3 de 2500 (na posição da 1ª) + a coluna 'meio' separada.
    const band = tree.filhos[0].filhos[0];
    expect(band.tipo).toBe("Y");
    expect(band.valor).toBe(2500);
    expect(band.filhos.map((z) => z.label)).toEqual(["a", "b", "c"]); // as 3 juntas
    expect(extractLeafPieces(tree).map((l) => l.label).sort()).toEqual(["a", "b", "c", "meio"]);
  });

  it("não agrupa colunas de alturas diferentes", () => {
    const tree = n("ROOT", UW, [
      n("X", 393, [n("Y", UH, [n("Z", 393, [n("W", 2500, [], "a")])])]),
      n("X", 393, [n("Y", UH, [n("Z", 393, [n("W", 1800, [], "b")])])]), // altura diferente
    ]);
    consolidateColumnsX(tree, UW, UH);
    expect(tree.filhos).toHaveLength(2); // nada agrupado
    expect(tree.filhos.every((x) => x.filhos[0].tipo === "Y" && x.filhos[0].valor === UH)).toBe(true);
  });
});
