import { describe, it, expect } from "vitest";
import {
  scoreCandidate,
  selectByRepetition,
  homogeneousCandidates,
  type LayoutCandidate,
  type RemainingItem,
} from "../lib/pattern-repetition";
import type { TreeNode } from "../lib/engine/types";

// Árvore-fantasma para os candidatos (a seleção não a inspeciona).
const fakeTree = (): TreeNode => ({ id: "root", tipo: "ROOT", valor: 0, multi: 1, filhos: [] });

function makeCandidate(
  over: Partial<LayoutCandidate> & { bom: LayoutCandidate["bom"]; util: number; key: string },
): LayoutCandidate {
  const perSheet = over.perSheet ?? over.bom.reduce((s, b) => s + b.count, 0);
  return {
    kind: "best-area",
    buildTree: fakeTree,
    perSheet,
    ...over,
  };
}

describe("Feature 006 — seleção por repetição (módulo puro)", () => {
  // scoreCandidate — contagem de repetição (FR-004)
  it("scoreCandidate calcula reps pela peça mais escassa e coverage = 1+reps", () => {
    const cand = makeCandidate({ bom: [{ w: 500, h: 400, count: 2 }, { w: 300, h: 300, count: 1 }], util: 0.9, key: "k" });
    // 500x400: disponível 10 → additional 8 → 8/2 = 4 ; 300x300: disponível 3 → 2/1 = 2 ; min = 2
    const remaining: RemainingItem[] = [
      { w: 500, h: 400, qty: 10 },
      { w: 300, h: 300, qty: 3 },
    ];
    const ev = scoreCandidate(cand, remaining, 0.85);
    expect(ev.reps).toBe(2);
    expect(ev.coverage).toBe(3);
    expect(ev.passesFloor).toBe(true);
  });

  it("scoreCandidate considera rotação ao somar disponível", () => {
    const cand = makeCandidate({ bom: [{ w: 500, h: 400, count: 1 }], util: 0.5, key: "k" });
    const remaining: RemainingItem[] = [{ w: 400, h: 500, qty: 5 }]; // rotacionada
    const ev = scoreCandidate(cand, remaining, 0.85);
    expect(ev.reps).toBe(4); // (5-1)/1
  });

  it("scoreCandidate: reps = 0 quando não há peças para repetir", () => {
    const cand = makeCandidate({ bom: [{ w: 500, h: 400, count: 3 }], util: 0.9, key: "k" });
    const remaining: RemainingItem[] = [{ w: 500, h: 400, qty: 3 }]; // só dá pra 1 chapa
    const ev = scoreCandidate(cand, remaining, 0.85);
    expect(ev.reps).toBe(0);
    expect(ev.coverage).toBe(1);
  });

  it("scoreCandidate é puro: não muta entradas", () => {
    const bom = [{ w: 500, h: 400, count: 2 }];
    const cand = makeCandidate({ bom, util: 0.9, key: "k" });
    const remaining: RemainingItem[] = [{ w: 500, h: 400, qty: 10 }];
    const remCopy = JSON.parse(JSON.stringify(remaining));
    scoreCandidate(cand, remaining, 0.85);
    expect(remaining).toEqual(remCopy);
    expect(bom).toEqual([{ w: 500, h: 400, count: 2 }]);
  });

  // selectByRepetition — escolha (FR-002/011)
  it("escolhe o candidato de maior repetição entre os que passam no piso", () => {
    const remaining: RemainingItem[] = [
      { w: 600, h: 600, qty: 40 },
      { w: 1000, h: 800, qty: 3 },
    ];
    const bigUtilLowReps = makeCandidate({ bom: [{ w: 1000, h: 800, count: 1 }, { w: 600, h: 600, count: 1 }], util: 0.98, key: "a" });
    const homoHighReps = makeCandidate({ bom: [{ w: 600, h: 600, count: 8 }], util: 0.88, kind: "homogeneous", key: "b" });
    const res = selectByRepetition([bigUtilLowReps, homoHighReps], remaining, 0.85);
    expect(res.chosen.candidate.key).toBe("b"); // repete muito mais, ainda >= piso
    expect(res.floorReached).toBe(true);
  });

  it("o piso é restrição DURA: repetição altíssima abaixo do piso não vence", () => {
    const remaining: RemainingItem[] = [{ w: 300, h: 300, qty: 100 }, { w: 900, h: 900, qty: 20 }];
    const highRepsLowUtil = makeCandidate({ bom: [{ w: 300, h: 300, count: 4 }], util: 0.40, kind: "homogeneous", key: "low" });
    const goodUtil = makeCandidate({ bom: [{ w: 900, h: 900, count: 1 }], util: 0.90, key: "good" });
    const res = selectByRepetition([highRepsLowUtil, goodUtil], remaining, 0.85);
    expect(res.chosen.candidate.key).toBe("good");
  });

  it("empate de reps desempata por maior aproveitamento", () => {
    const remaining: RemainingItem[] = [{ w: 500, h: 500, qty: 30 }, { w: 500, h: 400, qty: 30 }];
    const a = makeCandidate({ bom: [{ w: 500, h: 500, count: 5 }], util: 0.86, key: "a" });
    const b = makeCandidate({ bom: [{ w: 500, h: 400, count: 5 }], util: 0.90, key: "b" });
    // ambos: reps = (30-5)/5 = 5 → empate; b tem util maior
    const res = selectByRepetition([a, b], remaining, 0.85);
    expect(res.chosen.reps).toBe(5);
    expect(res.chosen.candidate.key).toBe("b");
  });

  it("fallback quando nenhum candidato atinge o piso: maior util, floorReached=false", () => {
    const remaining: RemainingItem[] = [{ w: 300, h: 300, qty: 50 }];
    const a = makeCandidate({ bom: [{ w: 300, h: 300, count: 4 }], util: 0.55, kind: "homogeneous", key: "a" });
    const b = makeCandidate({ bom: [{ w: 300, h: 300, count: 2 }], util: 0.70, key: "b" });
    const res = selectByRepetition([a, b], remaining, 0.85);
    expect(res.floorReached).toBe(false);
    expect(res.chosen.candidate.key).toBe("b"); // maior util
  });

  it("é determinístico: mesma entrada → mesma escolha", () => {
    const remaining: RemainingItem[] = [{ w: 600, h: 600, qty: 40 }, { w: 700, h: 500, qty: 40 }];
    const cands = [
      makeCandidate({ bom: [{ w: 600, h: 600, count: 6 }], util: 0.87, key: "x" }),
      makeCandidate({ bom: [{ w: 700, h: 500, count: 6 }], util: 0.87, key: "y" }),
    ];
    const r1 = selectByRepetition(cands, remaining, 0.85);
    const r2 = selectByRepetition([...cands].reverse(), remaining, 0.85);
    expect(r1.chosen.candidate.key).toBe(r2.chosen.candidate.key); // desempate estável por key
  });

  // homogeneousCandidates — ladrilhamento
  it("homogeneousCandidates gera 1 candidato por dimensão que cabe e enche ≥1 chapa", () => {
    const remaining: RemainingItem[] = [
      { w: 600, h: 600, qty: 40 }, // cabe: floor(2750/600)*floor(1830/600)=4*3=12
      { w: 5000, h: 5000, qty: 2 }, // não cabe na chapa
    ];
    const built: unknown[] = [];
    const cands = homogeneousCandidates(remaining, 2750, 1830, 0, (it) => {
      built.push(it);
      return fakeTree();
    });
    expect(cands.length).toBe(1);
    expect(cands[0].perSheet).toBe(12);
    expect(cands[0].kind).toBe("homogeneous");
    // buildTree é lazy — não foi chamado ainda
    expect(built.length).toBe(0);
    cands[0].buildTree();
    expect(built.length).toBe(1);
  });

  it("homogeneousCandidates ignora dimensão sem quantidade para 1 chapa cheia", () => {
    const remaining: RemainingItem[] = [{ w: 600, h: 600, qty: 5 }]; // perSheet 12 > qty 5
    const cands = homogeneousCandidates(remaining, 2750, 1830, 0, () => fakeTree());
    expect(cands.length).toBe(0);
  });
});
