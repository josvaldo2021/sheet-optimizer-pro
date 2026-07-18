// Spec 012 — expansão de peça agrupada segura para rótulos.
//
// Contrato completo em specs/012-qualidade-pecas-identificadas/contracts/
// grouped-expansion-contract.md; invariantes em data-model.md.
//
// Um GRUPO (`count > 1`) não é uma peça: `w`/`h` são as medidas do AGREGADO. O
// placement deve desfazê-lo em `count` folhas rotuladas com as medidas REAIS.
// Quando isso falha, o plano mente: peças somem do rastreio e folhas afirmam
// medidas que não existem no inventário (peças fantasma).
import { describe, it, expect } from "vitest";
import { runPlacement } from "@/lib/engine/placement";
import { optimizeV6 } from "@/lib/engine/optimizer";
import {
  extractLeafPieces,
  validatePlacementCandidate,
  physicalCount,
  physicalMeasureSet,
} from "@/lib/engine/tree-utils";
import * as G from "@/lib/engine/grouping";
import type { Piece, TreeNode } from "@/lib/engine/types";

/** Peça física: a medida real e o rótulo de UMA peça do inventário. */
interface Physical {
  w: number;
  h: number;
  label: string;
}

const mkPieces = (w: number, h: number, n: number, prefix: string): Piece[] =>
  Array.from({ length: n }, (_, i) => ({ w, h, area: w * h, label: `${prefix}${i}` }));

const physicalsOf = (w: number, h: number, n: number, prefix: string): Physical[] =>
  Array.from({ length: n }, (_, i) => ({ w, h, label: `${prefix}${i}` }));

const sameDim = (a: { w: number; h: number }, b: { w: number; h: number }) => {
  const [aw, ah, bw, bh] = [a.w, a.h, b.w, b.h].map(Math.round);
  return (aw === bw && ah === bh) || (aw === bh && ah === bw);
};

/**
 * Asserta INV-1..INV-4 sobre a árvore: cada peça física esperada vira UMA folha
 * rotulada com a medida real, e nada é inventado.
 */
function assertFaithfulExpansion(tree: TreeNode, expected: Physical[], ctx: string) {
  const leaves = extractLeafPieces(tree);
  const labeled = leaves.filter((l) => l.label);
  const shown = labeled.map((l) => `${l.label}=${Math.round(l.w)}×${Math.round(l.h)}`).join(" ");

  // INV-4 / C1: um grupo de count=n expande em exatamente n folhas rotuladas.
  expect(labeled.length, `${ctx}: esperado ${expected.length} folhas rotuladas, veio ${labeled.length} → ${shown}`).toBe(expected.length);

  // INV-3 / C2: cada rótulo aparece no máximo uma vez.
  const labels = labeled.map((l) => l.label!);
  expect(new Set(labels).size, `${ctx}: rótulo duplicado em ${shown}`).toBe(labels.length);
  expect(new Set(labels), `${ctx}: conjunto de rótulos divergente`).toEqual(new Set(expected.map((e) => e.label)));

  // INV-2 / C3: toda folha rotulada tem a medida REAL da sua peça.
  for (const leaf of labeled) {
    const real = expected.find((e) => e.label === leaf.label)!;
    expect(
      sameDim(leaf, real),
      `${ctx}: folha ${leaf.label} afirma ${Math.round(leaf.w)}×${Math.round(leaf.h)}, mas a peça real é ${real.w}×${real.h} (fantasma)`,
    ).toBe(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T004 — Contrato do PRODUTOR (P1–P5). Deve PASSAR já: congela o estado limpo.
// ─────────────────────────────────────────────────────────────────────────────

describe("contrato do produtor de grupos (P1-P5)", () => {
  const W = 2750, H = 1830;
  const ITEMS = [
    { qty: 6, w: 716, h: 600 }, { qty: 8, w: 600, h: 500 },
    { qty: 10, w: 400, h: 380 }, { qty: 12, w: 250, h: 200 },
    { qty: 4, w: 900, h: 300 },
  ];
  const REAL = new Set<number>();
  ITEMS.forEach((p) => { REAL.add(p.w); REAL.add(p.h); });

  const pieces: Piece[] = [];
  let uid = 0;
  ITEMS.forEach((p) => {
    for (let i = 0; i < p.qty; i++) pieces.push({ w: p.w, h: p.h, area: p.w * p.h, label: `__${uid++}` });
  });
  const rotated: Piece[] = pieces.map((p) => ({ w: p.h, h: p.w, area: p.area, label: p.label }));

  const producers: Array<[string, () => Piece[]]> = [
    ["BySameWidth(H)", () => G.groupPiecesBySameWidth(pieces, H)],
    ["BySameWidth()", () => G.groupPiecesBySameWidth(pieces)],
    ["BySameHeight(W)", () => G.groupPiecesBySameHeight(pieces, W)],
    ["BySameHeight()", () => G.groupPiecesBySameHeight(pieces)],
    ["FillRow", () => G.groupPiecesFillRow(pieces, W)],
    ["FillRow(raw)", () => G.groupPiecesFillRow(pieces, W, true)],
    ["FillCol", () => G.groupPiecesFillCol(pieces, H)],
    ["FillCol(raw)", () => G.groupPiecesFillCol(pieces, H, true)],
    ["ColumnWidth", () => G.groupPiecesColumnWidth(pieces, W)],
    ["ColumnHeight", () => G.groupPiecesColumnHeight(pieces, H)],
    ["BandFirst", () => G.groupPiecesBandFirst(pieces, W)],
    ["BandLast", () => G.groupPiecesBandLast(pieces, W)],
    ["ByCommonDimension", () => G.groupByCommonDimension(pieces, W, H)],
    ["ByCommonDimensionTransposed", () => G.groupByCommonDimensionTransposed(pieces, W, H)],
    ["StripPackingDP(0)", () => G.groupStripPackingDP(pieces, W, H, 0)],
    ["StripPackingDP(5)", () => G.groupStripPackingDP(pieces, W, H, 5)],
    // Tolerâncias altas aproximam peças de ALTURAS DIFERENTES na mesma faixa. Um
    // grupo "w" guarda uma única altura ⇒ as peças mais baixas mentiriam a medida.
    ["StripPackingDP(30)", () => G.groupStripPackingDP(pieces, W, H, 30)],
    ["StripPackingDP(100)", () => G.groupStripPackingDP(pieces, W, H, 100)],
    ["StripPackingDP(5,raw)", () => G.groupStripPackingDP(pieces, W, H, 5, "raw")],
    ["StripPackingDPTransposed(0)", () => G.groupStripPackingDPTransposed(pieces, W, H, 0)],
    ["StripPackingDPTransposed(5)", () => G.groupStripPackingDPTransposed(pieces, W, H, 5)],
    ["ByCommonDimension(0.3)", () => G.groupByCommonDimension(pieces, W, H, 0.3)],
    ["CommonDimensionDP(0.2)", () => G.groupCommonDimensionDP(pieces, W, H, 0.2)],
    ["CommonDimensionDP", () => G.groupCommonDimensionDP(pieces, W, H)],
    ["IdenticalPieces2D", () => G.groupIdenticalPieces2D(pieces, W, H)],
    ["rot:BySameWidth(H)", () => G.groupPiecesBySameWidth(rotated, H)],
    ["rot:FillCol", () => G.groupPiecesFillCol(rotated, H)],
    ["rot:StripPackingDP(5)", () => G.groupStripPackingDP(rotated, W, H, 5)],
  ];

  // P4 (COMPLETO): um grupo guarda UMA medida transversal (`p.h` para eixo "w",
  // `p.w` para eixo "h") compartilhada por TODOS os membros. Se o produtor juntar
  // peças de medidas transversais diferentes, a representação não consegue
  // expressá-las e cada membro passa a renderizar com a medida do GRUPO — folha
  // fantasma. Verificado por rótulo: labels[i] identifica a peça real.
  const byLabel = new Map<string, { w: number; h: number }>();
  pieces.forEach((p) => byLabel.set(p.label!, { w: p.w, h: p.h }));
  const fits = (a: { w: number; h: number }, b: { w: number; h: number }) =>
    (Math.round(a.w) === Math.round(b.w) && Math.round(a.h) === Math.round(b.h)) ||
    (Math.round(a.w) === Math.round(b.h) && Math.round(a.h) === Math.round(b.w));

  it.each(producers)("%s: P4 — a medida do grupo bate com CADA membro", (name, build) => {
    for (const p of build()) {
      const n = p.count ?? 1;
      if (n <= 1 || p.groupedAxis === "2d" || !p.individualDims || !p.labels) continue;
      for (let i = 0; i < n; i++) {
        const real = byLabel.get(p.labels[i]);
        if (!real) continue;
        // reconstrói a peça i como o motor a lerá na expansão
        const asPlaced = p.groupedAxis === "w"
          ? { w: p.individualDims[i], h: p.h }
          : { w: p.w, h: p.individualDims[i] };
        expect(
          fits(asPlaced, real),
          `${name}: grupo ${p.w}×${p.h} #${n} eixo=${p.groupedAxis} — o membro ${p.labels[i]} seria cortado ${asPlaced.w}×${asPlaced.h}, mas a peça real é ${real.w}×${real.h}`,
        ).toBe(true);
      }
    }
  });

  it.each(producers)("%s: P1-P4 — labels completos e individualDims com medidas reais", (name, build) => {
    for (const p of build()) {
      const n = p.count ?? 1;
      if (n <= 1) continue;

      // P1 — uma identificação por peça física contida.
      expect(p.labels?.length, `${name}: grupo ${p.w}×${p.h} #${n} com ${p.labels?.length ?? 0} labels`).toBe(n);

      const dims = p.individualDims ?? [];
      if (p.groupedAxis === "2d") {
        // P3 — em "2d", individualDims são [cols, rows] (contagens), não medidas.
        expect(dims.length, `${name}: grupo 2d deve ter [cols, rows]`).toBe(2);
        expect(dims[0] * dims[1], `${name}: cols*rows deve ser ${n}`).toBe(n);
      } else {
        // P2 — cada valor é a medida de uma peça REAL do inventário.
        expect(dims.length, `${name}: grupo ${p.w}×${p.h} #${n} individualDims incompleto`).toBe(n);
        const fora = dims.filter((d) => !REAL.has(Math.round(d)));
        expect(fora, `${name}: individualDims fora do inventário em ${p.w}×${p.h} #${n}`).toEqual([]);
      }
    }
  });

  it("P5 — peça já agrupada passa intacta, nunca é reagrupada", () => {
    const inner = G.groupPiecesBySameWidth(pieces, H);
    const grupos = inner.filter((p) => (p.count ?? 1) > 1);
    expect(grupos.length, "cenário inválido: nenhum grupo para testar").toBeGreaterThan(0);

    const outer = G.groupPiecesFillRow(inner, W);
    for (const g of grupos) {
      const sobreviveu = outer.some(
        (p) => p.count === g.count && p.w === g.w && p.h === g.h && p.groupedAxis === g.groupedAxis,
      );
      expect(sobreviveu, `grupo ${g.w}×${g.h} #${g.count} foi reagrupado/achatado por FillRow`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T005/T006/T007 — Contrato do CONSUMIDOR (C1–C5).
// Os grupos são construídos pelos produtores reais (que T004 prova limpos).
// ─────────────────────────────────────────────────────────────────────────────

describe("contrato do consumidor: expansão em runPlacement (C1-C4)", () => {
  /** Grupo "h": 4× 250×200 empilhadas ⇒ agregado 250×800. */
  const groupH = (): Piece => {
    const g = G.groupPiecesBySameWidth(mkPieces(250, 200, 4, "h"), 800).find((p) => (p.count ?? 1) === 4);
    expect(g, "cenário inválido: BySameWidth não formou o grupo de 4").toBeDefined();
    expect(g!.groupedAxis, "esperado agrupamento no eixo h").toBe("h");
    return g!;
  };

  /** Grupo "w": 4× 250×200 lado a lado ⇒ agregado 1000×200. */
  const groupW = (): Piece => {
    const g = G.groupPiecesBySameHeight(mkPieces(250, 200, 4, "w"), 1000).find((p) => (p.count ?? 1) === 4);
    expect(g, "cenário inválido: BySameHeight não formou o grupo de 4").toBeDefined();
    expect(g!.groupedAxis, "esperado agrupamento no eixo w").toBe("w");
    return g!;
  };

  it('C1-C3: grupo "h" NÃO rotacionado ⇒ 4 folhas de 250×200', () => {
    const r = runPlacement([groupH()], 300, 900, 0);
    expect(r.remaining, "o grupo deveria caber sem rotação").toEqual([]);
    assertFaithfulExpansion(r.tree, physicalsOf(250, 200, 4, "h"), 'grupo "h" não rotacionado');
  });

  it('C1-C4: grupo "h" ROTACIONADO ⇒ 4 folhas de 250×200', () => {
    // Chapa baixa e larga: 250×800 não cabe em pé (800 > 300); rotacionado (800×250) cabe.
    const r = runPlacement([groupH()], 900, 300, 0);
    expect(r.remaining, "o grupo deveria caber rotacionado").toEqual([]);
    assertFaithfulExpansion(r.tree, physicalsOf(250, 200, 4, "h"), 'grupo "h" rotacionado');
  });

  it('C1-C3: grupo "w" NÃO rotacionado ⇒ 4 folhas de 250×200', () => {
    const r = runPlacement([groupW()], 1100, 300, 0);
    expect(r.remaining, "o grupo deveria caber sem rotação").toEqual([]);
    assertFaithfulExpansion(r.tree, physicalsOf(250, 200, 4, "w"), 'grupo "w" não rotacionado');
  });

  it('C1-C4: grupo "w" ROTACIONADO ⇒ 4 folhas de 250×200', () => {
    // Chapa alta e estreita: 1000×200 não cabe deitado (1000 > 300); rotacionado (200×1000) cabe.
    const r = runPlacement([groupW()], 300, 1100, 0);
    expect(r.remaining, "o grupo deveria caber rotacionado").toEqual([]);
    assertFaithfulExpansion(r.tree, physicalsOf(250, 200, 4, "w"), 'grupo "w" rotacionado');
  });

  it("C1-C3: grupo 2d (grade) ⇒ cada peça da grade vira uma folha rotulada", () => {
    const g = G.groupIdenticalPieces2D(mkPieces(250, 200, 4, "g"), 600, 500).find((p) => (p.count ?? 1) > 1);
    if (!g) return; // a função pode legitimamente não formar grade neste espaço
    const r = runPlacement([g], 600, 500, 0);
    expect(r.remaining).toEqual([]);
    assertFaithfulExpansion(r.tree, physicalsOf(250, 200, g.count!, "g").slice(0, g.count!), "grupo 2d");
  });
});

describe("C5: grupo não expansível é recusado, nunca vira folha infiel", () => {
  // NOTA sobre `remaining`: quando nada cabe, `runPlacement` NÃO devolve a peça em
  // `remaining` — ela simplesmente não é colocada. Verificado como comportamento
  // pré-existente e geral: uma peça SOLTA de 250×800 numa chapa 240×240 se comporta
  // igual a um GRUPO de mesmas medidas (ambos: remaining=0, zero folhas). Não é
  // específico de grupos nem introduzido pela spec 012, então não é asserido aqui.
  // O que C5 exige é o que se testa abaixo: não inventar folha.
  it("grupo que não cabe não deixa NENHUMA folha na árvore", () => {
    const g = G.groupPiecesBySameWidth(mkPieces(250, 200, 4, "x"), 800).find((p) => (p.count ?? 1) === 4)!;
    // Chapa pequena demais para o agregado em qualquer orientação.
    const r = runPlacement([g], 240, 240, 0);
    expect(extractLeafPieces(r.tree), "o grupo não cabe: nenhuma folha deveria existir").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US2 — o valor que o usuário pediu: identificar uma peça não pode piorar o corte.
// ─────────────────────────────────────────────────────────────────────────────

describe("US2: cenário-âncora do usuário (SC-004)", () => {
  // A chapa que originou a spec: sobra saía fragmentada em 2× 1034×1262 em vez de
  // um retalho inteiro de 1034×2524.
  const AW = 5980, AH = 3190;
  const anchor = (labeled: boolean): Piece[] => [
    ...Array.from({ length: 4 }, (_, i) => ({ w: 2473, h: 1262, area: 2473 * 1262, ...(labeled ? { label: `02539/26#${i}` } : {}) })),
    ...Array.from({ length: 2 }, (_, i) => ({ w: 2634, h: 406, area: 2634 * 406, ...(labeled ? { label: `02525/26#${i}` } : {}) })),
  ];

  it("as 6 peças rotuladas são alocadas na mesma chapa, todas rastreáveis", () => {
    const r = optimizeV6(anchor(true), AW, AH);
    const leaves = extractLeafPieces(r.tree);
    expect(r.remaining, "nenhuma peça deveria ficar de fora").toEqual([]);
    expect(leaves.length, "as 6 peças devem estar na chapa").toBe(6);
    expect(leaves.every((l) => !!l.label), `toda folha deve ser rastreável: ${leaves.map((l) => `${Math.round(l.w)}×${Math.round(l.h)}${l.label ? "" : "[SEM RÓTULO]"}`).join(" ")}`).toBe(true);
  });

  it("toda folha tem medida existente no inventário (sem fantasma)", () => {
    const r = optimizeV6(anchor(true), AW, AH);
    const reais = [{ w: 2473, h: 1262 }, { w: 2634, h: 406 }];
    const fantasmas = extractLeafPieces(r.tree).filter((l) => !reais.some((p) => sameDim(l, p)));
    expect(fantasmas.map((f) => `${f.label}=${Math.round(f.w)}×${Math.round(f.h)}`)).toEqual([]);
  });

  it("SC-006: rotulado aloca tanto quanto anônimo", () => {
    const comRotulo = optimizeV6(anchor(true), AW, AH);
    const anonimo = optimizeV6(anchor(false), AW, AH);
    const area = (t: TreeNode) => extractLeafPieces(t).reduce((s, l) => s + l.w * l.h, 0);
    expect(
      Math.round(area(comRotulo.tree)),
      "identificar a peça não pode custar aproveitamento",
    ).toBeGreaterThanOrEqual(Math.round(area(anonimo.tree)));
  });
});

describe("T007: regressão do fantasma 250×800 (research.md, Achado 4)", () => {
  it("4 peças 250×200 empilhadas nunca viram folhas de 250×800", () => {
    const r = runPlacement([groupOf4Stacked()], 900, 300, 0);
    const labeled = extractLeafPieces(r.tree).filter((l) => l.label);
    const fantasmas = labeled.filter((l) => !sameDim(l, { w: 250, h: 200 }));
    expect(
      fantasmas.map((f) => `${f.label}=${Math.round(f.w)}×${Math.round(f.h)}`),
      "folhas com medida inexistente no inventário",
    ).toEqual([]);
    expect(labeled.length, "as 4 peças devem estar rastreáveis").toBe(4);
  });

  function groupOf4Stacked(): Piece {
    return G.groupPiecesBySameWidth(mkPieces(250, 200, 4, "f"), 800).find((p) => (p.count ?? 1) === 4)!;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// T011 — Validação de conservação no LIMITE candidato→plano (V1-V4).
// data-model.md, "Regras de validação". Um candidato inválido deve ser
// DESCARTADO antes do desempate para não vencer por parecer mais compacto.
// ─────────────────────────────────────────────────────────────────────────────

describe("T011: validatePlacementCandidate (V1-V4)", () => {
  // Árvore mínima: 1 coluna X, 1 faixa Y, 1 folha Z rotulada.
  // A folha renderiza (w = Z.valor, h = Y.valor).
  const leafTree = (colW: number, rowH: number, zW: number, label: string): TreeNode => ({
    id: "root", tipo: "ROOT", valor: 3000, multi: 1, filhos: [
      { id: "x", tipo: "X", valor: colW, multi: 1, filhos: [
        { id: "y", tipo: "Y", valor: rowH, multi: 1, filhos: [
          { id: "z", tipo: "Z", valor: zW, multi: 1, filhos: [], label },
        ] },
      ] },
    ],
  });

  const oneMeasure = (w: number, h: number): Set<string> =>
    physicalMeasureSet([{ w, h, area: w * h, label: "p0" }])!;

  it("V1: aceita candidato conservado e fiel", () => {
    const tree = leafTree(400, 380, 400, "p0"); // renderiza 400×380
    expect(validatePlacementCandidate(tree, [], 1, oneMeasure(400, 380))).toBe(true);
  });

  it("V2 (INV-2): rejeita folha fantasma (medida inexistente)", () => {
    // Y=800 mas a peça é 400×380 ⇒ a folha afirma 400×800 (fantasma).
    const tree = leafTree(400, 800, 400, "p0");
    expect(validatePlacementCandidate(tree, [], 1, oneMeasure(400, 380))).toBe(false);
  });

  it("V1 (INV-1): rejeita quebra de conservação (folhas + remaining ≠ oferecidas)", () => {
    const tree = leafTree(400, 380, 400, "p0"); // 1 folha
    // Oferecidas = 3, remaining vazio ⇒ 1 ≠ 3.
    expect(validatePlacementCandidate(tree, [], 3, oneMeasure(400, 380))).toBe(false);
  });

  it("V3 (INV-3): rejeita rótulo duplicado na árvore", () => {
    const tree = leafTree(400, 380, 400, "p0");
    // Segunda folha com o MESMO rótulo.
    tree.filhos[0].filhos[0].filhos.push({ id: "z2", tipo: "Z", valor: 400, multi: 1, filhos: [], label: "p0" });
    expect(validatePlacementCandidate(tree, [], 2, oneMeasure(400, 380))).toBe(false);
  });

  it("fidelidade desligada (null) quando o grupo não é decodificável", () => {
    // Grupo 2d ⇒ physicalMeasureSet devolve null ⇒ INV-2 não é checado,
    // mas a conservação (INV-1) continua valendo.
    const twoD: Piece = { w: 800, h: 600, area: 480000, count: 4, labels: ["a", "b", "c", "d"], groupedAxis: "2d", individualDims: [2, 2] };
    expect(physicalMeasureSet([twoD])).toBeNull();
    const tree = leafTree(400, 380, 400, "a");
    expect(validatePlacementCandidate(tree, [], 1, null)).toBe(true);
  });

  it("physicalCount conta grupos por `count`", () => {
    const pieces: Piece[] = [
      { w: 100, h: 100, area: 1e4, label: "s0" },
      { w: 300, h: 100, area: 3e4, count: 3, labels: ["g0", "g1", "g2"], groupedAxis: "w", individualDims: [100, 100, 100] },
    ];
    expect(physicalCount(pieces)).toBe(4);
  });
});
