import { describe, it, expect } from "vitest";
import { optimizeV6 } from "../lib/cnc-engine";
import { getSortStrategies } from "../lib/engine/optimizer";
import { runPlacement } from "../lib/engine/placement";
import type { Piece, TreeNode } from "../lib/engine/types";

// Feature 005 — duas novas heurísticas de ordenação (idx 12 altura asc, idx 13 largura asc).
// Ver specs/005-novas-heuristicas/{spec,plan,research,contracts}.

const W = 2750;
const H = 1830;

/**
 * Melhor área alcançável variando SOMENTE o eixo das estratégias de ordenação
 * (raw + rotacionado, ambas orientações) — subconjunto fiel do laço de optimizeV6
 * sem as variantes de agrupamento. Isola o efeito das heurísticas de ordenação.
 */
function bestAreaOverStrategies(
  pieces: Piece[],
  strategies: ((a: Piece, b: Piece) => number)[],
): number {
  let best = 0;
  const rotated = pieces.map((p) => ({ w: p.h, h: p.w, area: p.area }));
  for (const transposed of [false, true]) {
    const eW = transposed ? H : W;
    const eH = transposed ? W : H;
    for (const variant of [pieces, rotated]) {
      for (const s of strategies) {
        const sorted = [...variant].sort(s);
        const r = runPlacement(sorted as Piece[], eW, eH, 0);
        if (r.area > best) best = r.area;
      }
    }
  }
  return best;
}

// LCG determinístico para gerar cenários reproduzíveis.
function makeRng(seedVal: number) {
  let v = seedVal;
  return (n: number) => {
    v = (v * 1103515245 + 12345) & 0x7fffffff;
    return v % n;
  };
}

function makeOversubscribedScene(rand: (n: number) => number): Piece[] {
  const pieces: Piece[] = [];
  let acc = 0;
  const sheetArea = W * H;
  while (acc < sheetArea * 1.8) {
    const w = 200 + rand(700);
    const h = 200 + rand(700);
    pieces.push({ w, h, area: w * h });
    acc += w * h;
  }
  return pieces;
}

// Cenário-alvo fixo (descoberto empiricamente) onde as heurísticas ascendentes
// desbloqueiam mais área preenchida que as 12 estratégias descendentes.
const TARGET_SCENE: Piece[] = [
  { w: 644, h: 220 }, { w: 284, h: 800 }, { w: 348, h: 664 }, { w: 416, h: 216 },
  { w: 572, h: 280 }, { w: 820, h: 740 }, { w: 408, h: 836 }, { w: 812, h: 784 },
  { w: 460, h: 400 }, { w: 688, h: 896 }, { w: 664, h: 588 }, { w: 492, h: 396 },
  { w: 824, h: 224 }, { w: 200, h: 712 }, { w: 744, h: 584 }, { w: 380, h: 596 },
  { w: 772, h: 520 }, { w: 420, h: 884 }, { w: 732, h: 612 }, { w: 448, h: 764 },
  { w: 612, h: 384 }, { w: 300, h: 540 }, { w: 860, h: 556 }, { w: 288, h: 364 },
  { w: 596, h: 848 }, { w: 224, h: 216 }, { w: 368, h: 368 }, { w: 520, h: 352 },
  { w: 777, h: 528 }, { w: 444, h: 764 }, { w: 340, h: 512 },
].map((p) => ({ ...p, area: p.w * p.h }));

const ALL_14 = getSortStrategies();
const BASELINE_12 = ALL_14.slice(0, 12);

describe("Feature 005 — duas novas heurísticas de ordenação", () => {
  // FR-001 / contrato
  it("expõe exatamente 14 estratégias de ordenação (12 → 14)", () => {
    expect(ALL_14.length).toBe(14);
  });

  // FR-005 / SC-002 — monotonicidade: adicionar estratégias nunca reduz a área.
  it("nunca regride: melhor área com 14 estratégias ≥ com 12 (batch determinístico)", () => {
    const rand = makeRng(2026);
    for (let t = 0; t < 40; t++) {
      const scene = makeOversubscribedScene(rand);
      const base = bestAreaOverStrategies(scene, BASELINE_12);
      const withNew = bestAreaOverStrategies(scene, ALL_14);
      expect(withNew).toBeGreaterThanOrEqual(base);
    }
  });

  // FR-001 / SC-001 — melhora estrita em ao menos um cenário-alvo.
  it("melhora estritamente o aproveitamento no cenário-alvo fixo", () => {
    const base = bestAreaOverStrategies(TARGET_SCENE, BASELINE_12);
    const withNew = bestAreaOverStrategies(TARGET_SCENE, ALL_14);
    expect(withNew).toBeGreaterThan(base);
  });

  // Peças rotuladas = caminho real de otimização multi-chapa (ver optimization.test.ts).
  const labeled = () => TARGET_SCENE.map((p, i) => ({ ...p, label: `p${i}` }));

  // FR-006 / SC-004 — determinismo: mesmo input → mesmo plano.
  // Ignora `id` (contador global + sufixo aleatório, irrelevante ao plano físico);
  // compara estrutura: tipo/valor/multi/label/transposed.
  const structural = (n: TreeNode): unknown => ({
    tipo: n.tipo,
    valor: n.valor,
    multi: n.multi,
    label: n.label ?? null,
    transposed: n.transposed ?? false,
    filhos: n.filhos.map(structural),
  });
  it("é determinístico: mesmo input produz o mesmo plano", () => {
    const a = optimizeV6(labeled(), W, H, 0);
    const b = optimizeV6(labeled(), W, H, 0);
    expect(JSON.stringify(structural(a.tree))).toBe(JSON.stringify(structural(b.tree)));
  });

  // FR-003 / SC-003 / Princípio IV — folhas são peças; nada extrapola a chapa.
  it("produz árvore válida: peças alocadas dentro dos limites da chapa", () => {
    const { tree } = optimizeV6(labeled(), W, H, 0);
    // Soma das larguras dos cortes X de topo não excede a largura útil.
    const topWidths = tree.filhos
      .filter((c) => c.tipo === "X")
      .reduce((s, c) => s + c.valor, 0);
    expect(topWidths).toBeLessThanOrEqual(W + 1e-6);

    // Toda folha tem valor positivo (representa peça alocada, nunca desperdício).
    const checkLeaves = (n: TreeNode) => {
      if (n.filhos.length === 0) {
        expect(n.valor).toBeGreaterThan(0);
      } else {
        n.filhos.forEach(checkLeaves);
      }
    };
    tree.filhos.forEach(checkLeaves);
  });

  // Distinção: as duas novas ordens NÃO coincidem com nenhuma das 12 existentes.
  it("as duas novas estratégias produzem ordenações distintas das 12 anteriores", () => {
    const orderKey = (s: (a: Piece, b: Piece) => number) =>
      [...TARGET_SCENE].sort(s).map((p) => `${p.w}x${p.h}`).join(",");
    const baseKeys = new Set(BASELINE_12.map(orderKey));
    expect(baseKeys.has(orderKey(ALL_14[12]))).toBe(false);
    expect(baseKeys.has(orderKey(ALL_14[13]))).toBe(false);
  });
});
