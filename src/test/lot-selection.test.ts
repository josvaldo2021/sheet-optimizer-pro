// Testes da seleção de chapas e dedução de inventário (feature 003).
import { describe, it, expect } from "vitest";
import {
  selectedAutoChapas,
  applyDeductions,
  countAuto,
  countSelectedAuto,
  isSelectedAuto,
} from "@/lib/lots/lot-selection";

type Chapa = {
  manual?: boolean;
  selected?: boolean;
  deductions?: Array<{ id: string; qty: number }>;
};

// 3 chapas automáticas, cada uma consumindo peças distintas (como no multi-chapa).
const makeChapas = (): Chapa[] => [
  { deductions: [{ id: "A", qty: 2 }] },
  { deductions: [{ id: "B", qty: 3 }] },
  { deductions: [{ id: "C", qty: 1 }] },
];

const inventory = () => [
  { id: "A", qty: 2 },
  { id: "B", qty: 3 },
  { id: "C", qty: 1 },
];

describe("Seleção de chapas para o lote", () => {
  it("por padrão (sem flag) nenhuma chapa vem marcada [FR-002]", () => {
    const chapas = makeChapas();
    expect(countAuto(chapas)).toBe(3);
    expect(countSelectedAuto(chapas)).toBe(0);
    expect(selectedAutoChapas(chapas)).toHaveLength(0);
  });

  it("ignora chapas já confirmadas (manual) [FR-008]", () => {
    const chapas: Chapa[] = [...makeChapas(), { manual: true, deductions: [{ id: "A", qty: 9 }] }];
    expect(countAuto(chapas)).toBe(3);
    expect(isSelectedAuto(chapas[3])).toBe(false);
  });

  it("confirmar subconjunto deduz só as peças das chapas marcadas [SC-004/FR-004]", () => {
    const chapas = makeChapas();
    chapas[0].selected = true; // marca A
    chapas[2].selected = true; // marca C (B permanece desmarcada)
    const sel = selectedAutoChapas(chapas);
    expect(sel).toHaveLength(2);
    const updated = applyDeductions(inventory(), sel);
    const byId = Object.fromEntries(updated.map((p) => [p.id, p.qty]));
    expect(byId).toEqual({ A: 0, B: 3, C: 0 }); // B intacto: não foi confirmado
  });

  it("marcar todas = deduz tudo [SC-003]", () => {
    const chapas = makeChapas();
    chapas.forEach((c) => (c.selected = true));
    const updated = applyDeductions(inventory(), selectedAutoChapas(chapas));
    expect(updated.every((p) => p.qty === 0)).toBe(true);
  });

  it("não muta o inventário original", () => {
    const inv = inventory();
    const chapas = makeChapas();
    chapas.forEach((c) => (c.selected = true));
    applyDeductions(inv, selectedAutoChapas(chapas));
    expect(inv.find((p) => p.id === "A")!.qty).toBe(2);
  });

  it("conta corretamente selecionadas vs total [SC-005]", () => {
    const chapas = makeChapas();
    chapas[1].selected = true;
    expect(countSelectedAuto(chapas)).toBe(1);
    expect(countAuto(chapas)).toBe(3);
  });
});
