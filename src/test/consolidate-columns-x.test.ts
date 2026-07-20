// Agrupamento em X (coordenadas.md): colunas de mesma altura viram UMA faixa com
// sobra única no topo, em vez de N colunas fragmentadas.
import { describe, it, expect } from "vitest";
import { consolidateColumnsX, extractLeafPieces, calcPlacedArea, collapseRedundantCuts } from "@/lib/engine/tree-utils";
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

// ─────────────────────────────────────────────────────────────────────────────
// Spec 016 — agrupamento de colunas com alturas PRÓXIMAS.
// A faixa usa a MAIOR altura; a peça mais baixa ganha um CORTE DE CORREÇÃO
// (`Z(w) → W(h)`) que preserva a altura original. Duas guardas: FÍSICA (a
// diferença precisa ser nula ou ≥ `tol` = "Quebra Mínima", senão a serra não
// corta o resíduo) e ECONÔMICA (o maior bloco livre não pode encolher).
// Casos G1–G9 de specs/016-agrupamento-alturas-proximas/contracts/.
// ─────────────────────────────────────────────────────────────────────────────

// Coluna do cenário-âncora: X(colW) → Y(UH) → Z(w) → W(h)[peça].
const colAt = (colW: number, w: number, h: number, label: string): TreeNode =>
  n("X", colW, [n("Y", UH, [n("Z", w, [n("W", h, [], label)])])]);

// Membro da faixa: devolve a altura declarada para a peça `label`, ou null.
const bandPieceH = (band: TreeNode, label: string): number | null => {
  for (const z of band.filhos) {
    if (z.label === label) return band.valor;                 // folha Z = altura da faixa
    const w = z.filhos.find((c) => c.label === label);
    if (w) return w.valor;                                     // Z→W = corte de correção
  }
  return null;
};

describe("consolidateColumnsX — alturas próximas (spec 016)", () => {
  // Âncora do usuário: 02545/26 (592×2388) e 02554/26 (469 de largura × 2320),
  // diferença de 68 mm, quebra mínima de 50 mm.
  const anchor = (): TreeNode =>
    n("ROOT", UW, [colAt(592, 592, 2388, "02545"), colAt(561, 469, 2320, "02554")]);

  it("G1 — agrupa 2388 com 2320 (diff 68) quando a quebra mínima é 50", () => {
    const tree = anchor();
    consolidateColumnsX(tree, UW, UH, undefined, 50);

    expect(tree.filhos).toHaveLength(1);
    const grouped = tree.filhos[0];
    expect(grouped.tipo).toBe("X");
    expect(grouped.valor).toBe(592 + 561); // soma das larguras de COLUNA (conserva)

    const band = grouped.filhos[0];
    expect(band.tipo).toBe("Y");
    expect(band.valor).toBe(2388); // altura da MAIOR peça

    // a peça alta é folha Z; a baixa ganha o corte de correção Z→W com a altura ORIGINAL
    expect(bandPieceH(band, "02545")).toBe(2388);
    expect(bandPieceH(band, "02554")).toBe(2320);
    const zBaixa = band.filhos.find((z) => z.filhos.length === 1)!;
    expect(zBaixa.valor).toBe(469);          // largura da PEÇA
    expect(zBaixa.filhos[0].tipo).toBe("W"); // resíduo de 68 mm acima da peça
  });

  it("G2 — NÃO agrupa quando a diferença é menor que a quebra mínima (corte impossível)", () => {
    const tree = n("ROOT", UW, [colAt(592, 592, 2388, "a"), colAt(561, 469, 2376, "b")]); // diff 12
    consolidateColumnsX(tree, UW, UH, undefined, 50);
    expect(tree.filhos).toHaveLength(2);
    expect(tree.filhos.every((x) => x.filhos[0].valor === UH)).toBe(true);
  });

  it("G3 — diferença exatamente igual à quebra mínima agrupa (limite inclusivo)", () => {
    const tree = n("ROOT", UW, [colAt(592, 592, 2388, "a"), colAt(561, 469, 2338, "b")]); // diff 50
    consolidateColumnsX(tree, UW, UH, undefined, 50);
    expect(tree.filhos).toHaveLength(1);
    expect(tree.filhos[0].filhos[0].valor).toBe(2388);
  });

  it("G4 — 3 colunas num conjunto só, cada peça com a sua altura original", () => {
    const tree = n("ROOT", UW, [
      colAt(592, 592, 2388, "a"), colAt(561, 469, 2320, "b"), colAt(500, 500, 2000, "c"),
    ]);
    consolidateColumnsX(tree, UW, UH, undefined, 50);
    expect(tree.filhos).toHaveLength(1);
    const band = tree.filhos[0].filhos[0];
    expect(band.valor).toBe(2388);
    expect(bandPieceH(band, "a")).toBe(2388);
    expect(bandPieceH(band, "b")).toBe(2320);
    expect(bandPieceH(band, "c")).toBe(2000);
    expect(tree.filhos[0].valor).toBe(592 + 561 + 500);
  });

  it("G5 — guarda econômica: rejeita a fusão que ENCOLHE o maior bloco livre", () => {
    // 393×2500 e 393×1800: fundir daria tira de 786×690 (542k) contra o bloco livre
    // atual de 393×1390 (546k) ⇒ não compensa. `tol = 0` (sem piso físico) isola a
    // guarda econômica como única causa da rejeição.
    const tree = n("ROOT", UW, [colAt(393, 393, 2500, "a"), colAt(393, 393, 1800, "b")]);
    consolidateColumnsX(tree, UW, UH, undefined, 0);
    expect(tree.filhos).toHaveLength(2);
    expect(tree.filhos.every((x) => x.filhos[0].valor === UH)).toBe(true);
  });

  it("G5b — aceita a fusão que AUMENTA o maior bloco livre", () => {
    // 6 colunas estreitas quase da mesma altura: a tira somada (2358 de largura) supera
    // com folga qualquer sobrinha individual ⇒ a guarda aprova.
    const tree = n("ROOT", UW, [
      colAt(393, 393, 2500, "a"), colAt(393, 393, 2400, "b"), colAt(393, 393, 2400, "c"),
      colAt(393, 393, 2400, "d"), colAt(393, 393, 2400, "e"), colAt(393, 393, 2400, "f"),
    ]);
    consolidateColumnsX(tree, UW, UH, undefined, 50);
    expect(tree.filhos).toHaveLength(1);
    expect(tree.filhos[0].filhos[0].valor).toBe(2500);
  });

  it("G6 — regressão: alturas idênticas produzem o mesmo resultado com ou sem tol", () => {
    const uniform = () => n("ROOT", UW, [
      colAt(393, 393, 2500, "a"), colAt(393, 393, 2500, "b"), colAt(393, 393, 2500, "c"),
    ]);
    const semTol = uniform(); consolidateColumnsX(semTol, UW, UH);
    const comTol = uniform(); consolidateColumnsX(comTol, UW, UH, undefined, 50);
    const shape = (t: TreeNode): unknown =>
      ({ tipo: t.tipo, valor: t.valor, label: t.label, filhos: t.filhos.map(shape) });
    expect(shape(comTol)).toEqual(shape(semTol));
    expect(semTol.filhos).toHaveLength(1);
    expect(semTol.filhos[0].filhos[0].filhos.every((z) => z.filhos.length === 0)).toBe(true);
  });

  it("G7 — conservação: nenhuma peça some, duplica ou muda de medida", () => {
    for (const build of [anchor, () => n("ROOT", UW, [
      colAt(592, 592, 2388, "a"), colAt(561, 469, 2320, "b"), colAt(500, 500, 2000, "c"),
    ])]) {
      const tree = build();
      const key = (t: TreeNode) =>
        extractLeafPieces(t).map((l) => `${l.label}:${l.w}x${l.h}`).sort();
      const before = key(tree);
      const areaBefore = calcPlacedArea(tree);
      consolidateColumnsX(tree, UW, UH, undefined, 50);
      expect(key(tree)).toEqual(before);                       // INV-A
      expect(calcPlacedArea(tree)).toBe(areaBefore);           // INV-C (sem preenchimento)
    }
  });

  it("G8 — determinístico e idempotente", () => {
    const shape = (t: TreeNode): unknown =>
      ({ tipo: t.tipo, valor: t.valor, label: t.label, filhos: t.filhos.map(shape) });
    const a = anchor(); consolidateColumnsX(a, UW, UH, undefined, 50);
    const b = anchor(); consolidateColumnsX(b, UW, UH, undefined, 50);
    expect(shape(a)).toEqual(shape(b));                        // C7 determinismo
    const once = shape(a);
    consolidateColumnsX(a, UW, UH, undefined, 50);
    expect(shape(a)).toEqual(once);                            // C8 idempotência
  });

  it("collapseRedundantCuts preserva o corte de correção (ele SUBDIVIDE)", () => {
    // No plano, collapseRedundantCuts roda logo depois (Index.tsx). Ele colapsa cortes
    // que não subdividem — o W de correção (2320 dentro de uma faixa de 2388) subdivide
    // de verdade, então DEVE sobreviver; se fosse colapsado, a peça passaria a declarar
    // 2388 (fantasma) e o resíduo sumiria.
    const tree = anchor();
    consolidateColumnsX(tree, UW, UH, undefined, 50);
    const areaAntes = calcPlacedArea(tree);
    collapseRedundantCuts(tree, UW, UH);
    const band = tree.filhos[0].filhos[0];
    expect(bandPieceH(band, "02554")).toBe(2320); // altura original mantida
    expect(calcPlacedArea(tree)).toBe(areaAntes);
  });

  it("G9 — preenche a tira consolidada acima da faixa de alturas próximas", () => {
    const tree = anchor(); // faixa 1153×802 no topo (3190 − 2388)
    const pool: Piece[] = [1, 2].map((i) => ({ w: 500, h: 700, area: 500 * 700, label: `fill${i}` }));
    consolidateColumnsX(tree, UW, UH, {
      pool,
      minBreak: 0,
      optimize: (pcs, w, h, mb) => runPlacement([...pcs].sort((x, y) => y.area - x.area), w, h, mb),
      normalize: (t, w, h, mb) => normalizeTree(t, w, h, mb),
    }, 50);
    const labels = extractLeafPieces(tree).map((l) => l.label);
    expect(labels.some((l) => l?.startsWith("fill"))).toBe(true);
    expect(labels.filter((l) => l === "02545")).toHaveLength(1); // nada duplicado
    const grouped = tree.filhos[0];
    expect(grouped.filhos[1].tipo).toBe("Y");
    expect(grouped.filhos[1].valor).toBe(UH - 2388); // tira do topo = 802
  });
});
