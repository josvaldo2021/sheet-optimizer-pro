// Testes do módulo puro de replicação de layout (spec 008).
// Contrato: specs/008-replanejar-apos-salvar/contracts/layout-replication-contract.md
import { describe, it, expect } from "vitest";
import {
  buildLayoutBom,
  maxRepetitions,
  deductBomTimes,
  partitionByManual,
  partitionByPreserved,
  pendingSavedChapas,
  effectiveInventory,
  allocateDeductions,
  needsReplan,
  type BomEntry,
  type InventoryPiece,
} from "@/lib/lots/layout-replication";

const inv = (items: Array<[string, number, number, number]>): InventoryPiece[] =>
  items.map(([id, qty, w, h]) => ({ id, qty, w, h }));

describe("buildLayoutBom [C1]", () => {
  it("agrega por dimensão normalizada, insensível à orientação", () => {
    const bom = buildLayoutBom([
      { w: 600, h: 400 },
      { w: 400, h: 600 }, // rotacionada — mesma linha
      { w: 300, h: 200 },
    ]);
    expect(bom).toHaveLength(2);
    const big = bom.find((b) => Math.min(b.w, b.h) === 400)!;
    expect(big.count).toBe(2);
    const small = bom.find((b) => Math.min(b.w, b.h) === 200)!;
    expect(small.count).toBe(1);
  });

  it("Σcount = nº de peças de entrada; entrada vazia → []", () => {
    const used = [
      { w: 100, h: 50 },
      { w: 100, h: 50 },
      { w: 50, h: 100 },
      { w: 80, h: 80 },
    ];
    const bom = buildLayoutBom(used);
    expect(bom.reduce((s, b) => s + b.count, 0)).toBe(used.length);
    expect(bom.every((b) => b.count >= 1)).toBe(true);
    expect(buildLayoutBom([])).toEqual([]);
  });
});

describe("maxRepetitions [C2]", () => {
  const bom: BomEntry[] = [
    { w: 600, h: 400, count: 2 },
    { w: 300, h: 200, count: 3 },
  ];

  it("peça mais escassa limita as repetições", () => {
    // 600×400: 10/2 = 5 cópias; 300×200: 9/3 = 3 cópias → 3
    const pieces = inv([["a", 10, 600, 400], ["b", 9, 300, 200]]);
    expect(maxRepetitions(pieces, bom)).toBe(3);
  });

  it("aceita inventário em qualquer orientação", () => {
    const pieces = inv([["a", 4, 400, 600], ["b", 6, 200, 300]]);
    expect(maxRepetitions(pieces, bom)).toBe(2);
  });

  it("linha sem cobertura no inventário → 0", () => {
    const pieces = inv([["a", 10, 600, 400]]); // faltam as 300×200
    expect(maxRepetitions(pieces, bom)).toBe(0);
  });

  it("BOM vazio → 0; nunca Infinity ou negativo", () => {
    const pieces = inv([["a", 10, 600, 400]]);
    expect(maxRepetitions(pieces, [])).toBe(0);
    expect(maxRepetitions([], bom)).toBe(0);
  });
});

describe("deductBomTimes [C3][C4]", () => {
  const bom: BomEntry[] = [{ w: 600, h: 400, count: 2 }];

  it("deduz exatamente n×BOM sem mutar a entrada", () => {
    const pieces = inv([["a", 7, 600, 400]]);
    const res = deductBomTimes(pieces, bom, 3);
    expect(res.shortfall).toEqual([]);
    expect(res.pieces.find((p) => p.id === "a")!.qty).toBe(1);
    expect(pieces.find((p) => p.id === "a")!.qty).toBe(7); // imutável
  });

  it("consome de múltiplos itens da mesma dimensão (qualquer orientação)", () => {
    const pieces = inv([["a", 3, 600, 400], ["b", 3, 400, 600]]);
    const res = deductBomTimes(pieces, bom, 3); // precisa de 6
    expect(res.shortfall).toEqual([]);
    const total = res.pieces.reduce((s, p) => s + p.qty, 0);
    expect(total).toBe(0);
    expect(res.pieces.every((p) => p.qty >= 0)).toBe(true);
  });

  it("falta de peça vai para shortfall, nunca qty negativo", () => {
    const pieces = inv([["a", 3, 600, 400]]);
    const res = deductBomTimes(pieces, bom, 3); // precisa de 6, tem 3
    expect(res.shortfall).toHaveLength(1);
    expect(res.pieces.every((p) => p.qty >= 0)).toBe(true);
  });

  it("n ≤ 0 → cópia idêntica com shortfall vazio", () => {
    const pieces = inv([["a", 3, 600, 400]]);
    for (const n of [0, -1]) {
      const res = deductBomTimes(pieces, bom, n);
      expect(res.shortfall).toEqual([]);
      expect(res.pieces).toEqual(pieces);
      expect(res.pieces).not.toBe(pieces);
    }
  });

  it("conservação exata: Σ deduzido = n × Σ count quando shortfall vazio [FR-006]", () => {
    const multiBom: BomEntry[] = [
      { w: 600, h: 400, count: 2 },
      { w: 300, h: 200, count: 3 },
    ];
    const pieces = inv([["a", 10, 600, 400], ["b", 9, 200, 300], ["c", 5, 100, 100]]);
    const before = pieces.reduce((s, p) => s + p.qty, 0);
    const res = deductBomTimes(pieces, multiBom, 2);
    expect(res.shortfall).toEqual([]);
    const after = res.pieces.reduce((s, p) => s + p.qty, 0);
    expect(before - after).toBe(2 * (2 + 3));
    expect(res.pieces.find((p) => p.id === "c")!.qty).toBe(5); // intocada
  });
});

describe("partitionByManual [C5] e needsReplan [C6]", () => {
  const chapas = [
    { id: 1, manual: true },
    { id: 2 },
    { id: 3, manual: false },
    { id: 4, manual: true },
  ];

  it("partição estável: união = entrada, ordem preservada, sem mutação", () => {
    const { manuais, autos } = partitionByManual(chapas);
    expect(manuais.map((c) => c.id)).toEqual([1, 4]);
    expect(autos.map((c) => c.id)).toEqual([2, 3]);
    expect(manuais.length + autos.length).toBe(chapas.length);
    expect(chapas).toHaveLength(4);
  });

  it("needsReplan ≡ existe chapa automática descartável (nem confirmada, nem salva)", () => {
    expect(needsReplan(chapas)).toBe(true);
    expect(needsReplan([{ manual: true }])).toBe(false);
    expect(needsReplan([{ saved: true }])).toBe(false); // pendente de lote não é descartável
    expect(needsReplan([{ saved: true }, {}])).toBe(true);
    expect(needsReplan([])).toBe(false);
  });
});

// ── Emenda A1: dedução movida para a confirmação do lote (reservas) ──
describe("Emenda A1 — reservas de cópias salvas pendentes", () => {
  const chapasMix = [
    { manual: true, deductions: [{ id: "a", qty: 5 }] }, // confirmada: já deduzida, não reserva
    { saved: true, deductions: [{ id: "a", qty: 4 }, { id: "b", qty: 1 }] }, // pendente: reserva
    { deductions: [{ id: "b", qty: 2 }] }, // auto do plano: não reserva
  ];

  it("pendingSavedChapas filtra só salvas não confirmadas", () => {
    expect(pendingSavedChapas(chapasMix)).toHaveLength(1);
    expect(pendingSavedChapas([{ manual: true, saved: true }])).toHaveLength(0);
  });

  it("effectiveInventory subtrai apenas reservas pendentes, saturando em 0", () => {
    const pieces = inv([["a", 10, 600, 400], ["b", 3, 300, 200]]);
    const eff = effectiveInventory(pieces, chapasMix);
    expect(eff.find((p) => p.id === "a")!.qty).toBe(6); // 10 − 4 (manual e auto ignoradas)
    expect(eff.find((p) => p.id === "b")!.qty).toBe(2); // 3 − 1
    expect(pieces.find((p) => p.id === "a")!.qty).toBe(10); // imutável

    // Reserva órfã (usuário reduziu qty depois do save): satura em 0.
    const low = inv([["a", 2, 600, 400]]);
    expect(effectiveInventory(low, chapasMix).find((p) => p.id === "a")!.qty).toBe(0);
  });

  it("partitionByPreserved preserva confirmadas E salvas pendentes", () => {
    const chapas = [{ tag: 1, manual: true }, { tag: 2, saved: true }, { tag: 3 }];
    const { preserved, autos } = partitionByPreserved(chapas);
    expect(preserved.map((c) => c.tag)).toEqual([1, 2]);
    expect(autos.map((c) => c.tag)).toEqual([3]);
  });

  it("allocateDeductions: deduções id-a-id por cópia, Σ por id ≤ qty do item", () => {
    const bom: BomEntry[] = [{ w: 600, h: 400, count: 3 }];
    // 3 por cópia × 2 cópias = 6, repartidas entre dois itens (4 + 2), com rotação.
    const pieces = inv([["a", 4, 600, 400], ["b", 2, 400, 600]]);
    const { perCopy, remaining, shortfall } = allocateDeductions(pieces, bom, 2);
    expect(shortfall).toEqual([]);
    expect(perCopy).toHaveLength(2);
    perCopy.forEach((d) => expect(d.reduce((s, x) => s + x.qty, 0)).toBe(3));
    const totalPorId = new Map<string, number>();
    perCopy.flat().forEach(({ id, qty }) => totalPorId.set(id, (totalPorId.get(id) || 0) + qty));
    expect(totalPorId.get("a")).toBe(4);
    expect(totalPorId.get("b")).toBe(2);
    expect(remaining.reduce((s, p) => s + p.qty, 0)).toBe(0);
    expect(remaining.every((p) => p.qty >= 0)).toBe(true);
    expect(pieces.find((p) => p.id === "a")!.qty).toBe(4); // imutável
  });

  it("allocateDeductions: falta vai para shortfall; n ≤ 0 devolve cópia intacta", () => {
    const bom: BomEntry[] = [{ w: 600, h: 400, count: 3 }];
    const pieces = inv([["a", 4, 600, 400]]);
    const res = allocateDeductions(pieces, bom, 2); // precisa 6, tem 4
    expect(res.shortfall).toHaveLength(1);
    expect(res.shortfall[0].count).toBe(2);
    expect(res.remaining.every((p) => p.qty >= 0)).toBe(true);

    const zero = allocateDeductions(pieces, bom, 0);
    expect(zero.perCopy).toEqual([]);
    expect(zero.shortfall).toEqual([]);
    expect(zero.remaining).toEqual(pieces);
  });

  it("conservação ponta a ponta: reservas + inventário efetivo = inventário original", () => {
    const layoutUsed = [{ w: 600, h: 400 }, { w: 600, h: 400 }, { w: 300, h: 200 }];
    const pieces = inv([["big", 10, 600, 400], ["small", 6, 300, 200]]);
    const bom = buildLayoutBom(layoutUsed);

    // save ×2 (emenda A1): reserva sem deduzir
    const alloc = allocateDeductions(effectiveInventory(pieces, []), bom, 2);
    expect(alloc.shortfall).toEqual([]);
    const copies = alloc.perCopy.map((deductions) => ({ saved: true, deductions }));

    // inventário exibido permanece intacto
    expect(pieces.reduce((s, p) => s + p.qty, 0)).toBe(16);

    // inventário efetivo (para próximos saves/repetições) = original − reservas
    const eff = effectiveInventory(pieces, copies);
    expect(eff.find((p) => p.id === "big")!.qty).toBe(6);   // 10 − 2×2
    expect(eff.find((p) => p.id === "small")!.qty).toBe(4); // 6 − 2×1

    // reservas + efetivo = original, por id
    const reservado = new Map<string, number>();
    copies.flatMap((c) => c.deductions).forEach(({ id, qty }) =>
      reservado.set(id, (reservado.get(id) || 0) + qty));
    pieces.forEach((p) => {
      expect((reservado.get(p.id) || 0) + eff.find((x) => x.id === p.id)!.qty).toBe(p.qty);
    });
  });
});

// SC-001 — conservação de quantidades no fluxo lógico do save ×N (US1, T004).
describe("Conservação no save ×N [SC-001]", () => {
  // Layout: 2× 600×400 + 1× 300×200 por cópia.
  const layoutUsed = [
    { w: 600, h: 400 },
    { w: 400, h: 600 },
    { w: 300, h: 200 },
  ];

  const scenario = (qtyBig: number, qtySmall: number) =>
    inv([["big", qtyBig, 600, 400], ["small", qtySmall, 300, 200]]);

  const simulateSave = (pieces: InventoryPiece[], reps: number) => {
    const bom = buildLayoutBom(layoutUsed);
    const max = maxRepetitions(pieces, bom);
    const n = Math.max(1, Math.min(reps, max));
    if (max === 0) return { saved: 0, pieces, max };
    const res = deductBomTimes(pieces, bom, n);
    expect(res.shortfall).toEqual([]); // clamp garante cobertura
    return { saved: n, pieces: res.pieces, max };
  };

  it("N = máximo: inventário das peças do layout zera, nada negativo", () => {
    const start = scenario(8, 4); // max = min(8/2, 4/1) = 4
    const { saved, pieces } = simulateSave(start, 99);
    expect(saved).toBe(4);
    const totalBefore = start.reduce((s, p) => s + p.qty, 0);
    const totalAfter = pieces.reduce((s, p) => s + p.qty, 0);
    expect(totalAfter).toBe(totalBefore - saved * 3);
    expect(totalAfter).toBe(0);
    expect(pieces.every((p) => p.qty >= 0)).toBe(true);
  });

  it("N < máximo: sobras permanecem para replanejamento", () => {
    const start = scenario(10, 6);
    const { saved, pieces } = simulateSave(start, 2);
    expect(saved).toBe(2);
    expect(pieces.find((p) => p.id === "big")!.qty).toBe(6);
    expect(pieces.find((p) => p.id === "small")!.qty).toBe(4);
  });

  it("BOM com peça ausente do inventário: máximo 0, nenhum efeito", () => {
    const start = inv([["big", 8, 600, 400]]); // sem as 300×200
    const { saved, pieces, max } = simulateSave(start, 3);
    expect(max).toBe(0);
    expect(saved).toBe(0);
    expect(pieces).toEqual(start); // intocado
  });

  it("autos descartadas, manuais preservadas na partição do save", () => {
    const chapas = [
      { tag: "auto1" },
      { tag: "salva", manual: true },
      { tag: "auto2", manual: false },
    ];
    const { manuais, autos } = partitionByManual(chapas);
    expect(needsReplan(chapas)).toBe(true);
    expect(manuais.map((c) => c.tag)).toEqual(["salva"]);
    expect(autos.map((c) => c.tag)).toEqual(["auto1", "auto2"]);
  });
});
