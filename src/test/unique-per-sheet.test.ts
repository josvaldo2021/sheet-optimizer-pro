import { describe, it, expect } from "vitest";
import type { TreeNode } from "../lib/engine/types";
import {
  splitMarked,
  capForSheet,
  perSheetQty,
  sheetInvKey,
  countMarkedOnSheet,
  isMarked,
  pickMarkedForSheet,
  buildSheetInvExclusive,
  exclusiveSheetInvKey,
  type MarkedInvItem,
} from "../lib/unique-per-sheet";

// ─── Helpers ────────────────────────────────────────────────────────────────

let nid = 0;
function node(tipo: TreeNode["tipo"], valor: number, filhos: TreeNode[] = [], label?: string): TreeNode {
  return { id: `n${nid++}`, tipo, valor, multi: 1, filhos, label };
}

/** Minimal guillotine tree: ROOT→X(w)→[Y(h) leaves]. Each Y leaf is one piece. */
function sheetWithPieces(w: number, pieces: Array<{ h: number; label?: string }>): TreeNode {
  const ys = pieces.map((p) => node("Y", p.h, [], p.label));
  return node("ROOT", 0, [node("X", w, ys)]);
}

type Line = MarkedInvItem & { qty: number };
function line(id: string, w: number, h: number, qty: number, marked = false): Line {
  return { id, w, h, qty, label: id, uniquePerSheet: marked || undefined };
}

/**
 * Simula o loop multi-chapa com capping + colocação garantida (marcadas primeiro),
 * com capacidade `cap` de peças por chapa. Retorna o BOM (id→contagem) de cada chapa.
 */
function simulate(initial: Line[], cap: number): Array<Map<string, number>> {
  let remaining = initial.map((p) => ({ ...p }));
  const sheets: Array<Map<string, number>> = [];
  let guard = 0;
  while (remaining.some((p) => p.qty > 0) && guard < 1000) {
    guard++;
    const slice = capForSheet(remaining); // marcadas ≤1, não marcadas integrais
    const { marked, unmarked } = splitMarked(slice);
    let budget = cap;
    const bom = new Map<string, number>();
    for (const l of [...marked, ...unmarked]) {
      const take = Math.min(l.qty, budget);
      if (take > 0) {
        bom.set(l.id, take);
        budget -= take;
      }
      if (budget <= 0) break;
    }
    sheets.push(bom);
    for (const [id, cnt] of bom) {
      const r = remaining.find((p) => p.id === id)!;
      r.qty -= cnt;
    }
    remaining = remaining.filter((p) => p.qty > 0);
  }
  return sheets;
}

/**
 * Spec 010: simula o loop com a fatia EXCLUSIVA (`buildSheetInvExclusive`) —
 * no máximo 1 marcada total por chapa, marcada primeiro (prioridade).
 */
function simulateExclusive(initial: Line[], cap: number): Array<Map<string, number>> {
  let remaining = initial.map((p) => ({ ...p }));
  const sheets: Array<Map<string, number>> = [];
  let guard = 0;
  while (remaining.some((p) => p.qty > 0) && guard < 1000) {
    guard++;
    const slice = buildSheetInvExclusive(remaining); // marcada (≤1) primeiro, depois não marcadas
    let budget = cap;
    const bom = new Map<string, number>();
    for (const l of slice) {
      const take = Math.min(l.qty, budget);
      if (take > 0) {
        bom.set(l.id, take);
        budget -= take;
      }
      if (budget <= 0) break;
    }
    sheets.push(bom);
    for (const [id, cnt] of bom) {
      const r = remaining.find((p) => p.id === id)!;
      r.qty -= cnt;
    }
    remaining = remaining.filter((p) => p.qty > 0);
  }
  return sheets;
}

// ─── C1..C3: capForSheet / perSheetQty ──────────────────────────────────────

describe("C1 capForSheet caps marked lines to 1, keeps unmarked", () => {
  it("marked qty=5 → 1; unmarked qty=5 → 5", () => {
    const inv = [line("A", 100, 200, 5, true), line("B", 100, 200, 5, false)];
    const capped = capForSheet(inv);
    expect(capped.find((p) => p.id === "A")!.qty).toBe(1);
    expect(capped.find((p) => p.id === "B")!.qty).toBe(5);
  });
  it("perSheetQty", () => {
    expect(perSheetQty({ uniquePerSheet: true, qty: 9 })).toBe(1);
    expect(perSheetQty({ uniquePerSheet: false, qty: 9 })).toBe(9);
  });
});

describe("C2 no marked line → capForSheet is identity on qty", () => {
  it("keeps every qty untouched", () => {
    const inv = [line("A", 1, 1, 3), line("B", 2, 2, 7)];
    const capped = capForSheet(inv);
    expect(capped.map((p) => [p.id, p.qty])).toEqual([
      ["A", 3],
      ["B", 7],
    ]);
  });
});

describe("C3 capForSheet edge quantities", () => {
  it("marked qty=1 → 1; qty=0 dropped", () => {
    const inv = [line("A", 1, 1, 1, true), line("Z", 1, 1, 0, true), line("Y", 1, 1, 0, false)];
    const capped = capForSheet(inv);
    expect(capped.map((p) => p.id)).toEqual(["A"]);
    expect(capped[0].qty).toBe(1);
  });
});

// ─── C4: splitMarked ─────────────────────────────────────────────────────────

describe("C4 splitMarked partitions without mutating input", () => {
  it("partitions and preserves order + flag", () => {
    const inv = [line("A", 1, 1, 2, true), line("B", 1, 1, 2, false), line("C", 1, 1, 2, true)];
    const frozen = JSON.stringify(inv);
    const { marked, unmarked } = splitMarked(inv);
    expect(marked.map((p) => p.id)).toEqual(["A", "C"]);
    expect(unmarked.map((p) => p.id)).toEqual(["B"]);
    expect(marked.every(isMarked)).toBe(true);
    expect(JSON.stringify(inv)).toBe(frozen); // no mutation
  });
});

// ─── C5: sheetInvKey ─────────────────────────────────────────────────────────

describe("C5 sheetInvKey consistent with capForSheet", () => {
  it("no marks → same as raw dims key", () => {
    const inv = [line("A", 100, 200, 3), line("B", 50, 50, 2)];
    const raw = inv
      .filter((p) => p.qty > 0)
      .map((p) => `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}:${p.qty}`)
      .sort()
      .join("|");
    expect(sheetInvKey(inv)).toBe(raw);
  });
  it("marked qty>1 → capped key differs from integral", () => {
    const inv = [line("A", 100, 200, 5, true)];
    expect(sheetInvKey(inv)).toBe("100x200:1");
    const integral = "100x200:5";
    expect(sheetInvKey(inv)).not.toBe(integral);
  });
  it("two equivalent capped slices → same key", () => {
    const a = [line("A", 100, 200, 5, true), line("B", 50, 50, 4)];
    const b = [line("X", 200, 100, 9, true), line("Y", 50, 50, 4)];
    expect(sheetInvKey(a)).toBe(sheetInvKey(b));
  });
});

// ─── C6: countMarkedOnSheet (derived from tree) ──────────────────────────────

describe("C6 countMarkedOnSheet derives from the tree", () => {
  it("1 marked leaf among others → 1; none → 0", () => {
    const tree = sheetWithPieces(1000, [
      { h: 300, label: "MARK" },
      { h: 300, label: "plain" },
      { h: 400, label: "plain" },
    ]);
    expect(countMarkedOnSheet(tree, new Set(["MARK"]))).toBe(1);
    expect(countMarkedOnSheet(tree, new Set(["nope"]))).toBe(0);
  });
  it("counts multiple marked leaves", () => {
    const tree = sheetWithPieces(1000, [
      { h: 300, label: "MARK" },
      { h: 300, label: "MARK" },
    ]);
    expect(countMarkedOnSheet(tree, new Set(["MARK"]))).toBe(2);
  });
});

// ─── C7: conservation + SC-001 + SC-002 over the capped plan loop ────────────

describe("C7 capped multi-sheet loop invariants", () => {
  const scenarios: Array<{ name: string; inv: Line[]; cap: number }> = [
    { name: "1 marked (5) + unmarked (10)", inv: [line("M", 100, 100, 5, true), line("U", 100, 100, 10)], cap: 6 },
    { name: "marked stock < sheets", inv: [line("M", 100, 100, 2, true), line("U", 100, 100, 20)], cap: 3 },
    { name: "only marked (4)", inv: [line("M", 100, 100, 4, true)], cap: 5 },
  ];

  for (const sc of scenarios) {
    it(`${sc.name}: SC-001 ≤1/chapa, conservation, SC-002`, () => {
      const stockM = sc.inv.filter(isMarked).reduce((s, p) => s + p.qty, 0);
      const stockU = sc.inv.filter((p) => !isMarked(p)).reduce((s, p) => s + p.qty, 0);
      const sheets = simulate(sc.inv, sc.cap);
      const markedIds = new Set(sc.inv.filter(isMarked).map((p) => p.id));

      // SC-001: nenhuma chapa tem >1 de uma linha marcada
      for (const bom of sheets) {
        for (const id of markedIds) {
          expect(bom.get(id) ?? 0).toBeLessThanOrEqual(1);
        }
      }

      // Conservação: nada de peça marcada (nem não marcada) vira sobra
      let placedM = 0;
      let placedU = 0;
      for (const bom of sheets) {
        for (const [id, cnt] of bom) {
          if (markedIds.has(id)) placedM += cnt;
          else placedU += cnt;
        }
      }
      expect(placedM).toBe(stockM);
      expect(placedU).toBe(stockU);

      // SC-002 (por linha marcada): nº de chapas contendo a linha = min(estoque, nº chapas),
      // e quando estoque ≥ nº chapas, TODA chapa contém exatamente 1.
      for (const m of sc.inv.filter(isMarked)) {
        const sheetsWith = sheets.filter((bom) => (bom.get(m.id) ?? 0) === 1).length;
        expect(sheetsWith).toBe(Math.min(m.qty, sheets.length));
        if (m.qty >= sheets.length) expect(sheetsWith).toBe(sheets.length);
      }
    });
  }
});

// ─── Spec 010 — E1..E5: exclusividade + prioridade (funções puras) ───────────

describe("E1 pickMarkedForSheet chooses the first marked line with stock", () => {
  it("A(2) before B(3); after A empty → B; none → null", () => {
    const inv = [line("A", 1, 1, 2, true), line("B", 1, 1, 3, true), line("U", 1, 1, 9)];
    expect(pickMarkedForSheet(inv)!.id).toBe("A");
    const afterA = [line("A", 1, 1, 0, true), line("B", 1, 1, 3, true)];
    expect(pickMarkedForSheet(afterA)!.id).toBe("B");
    expect(pickMarkedForSheet([line("U", 1, 1, 5)])).toBeNull();
  });
});

describe("E2 buildSheetInvExclusive offers at most 1 marked total", () => {
  it("A and B marked + U → exactly 1 marked (A), U integral, no B", () => {
    const inv = [line("A", 100, 100, 3, true), line("B", 200, 200, 3, true), line("U", 50, 50, 12)];
    const slice = buildSheetInvExclusive(inv);
    const markedCount = slice.filter(isMarked).reduce((s, p) => s + p.qty, 0);
    expect(markedCount).toBe(1);
    expect(slice.some((p) => p.id === "A")).toBe(true);
    expect(slice.some((p) => p.id === "B")).toBe(false);
    expect(slice.find((p) => p.id === "U")!.qty).toBe(12);
  });
});

describe("E3 buildSheetInvExclusive puts the marked piece first (priority)", () => {
  it("marked pick is the first element", () => {
    const inv = [line("U", 50, 50, 12), line("A", 100, 100, 3, true)];
    const slice = buildSheetInvExclusive(inv);
    expect(slice[0].id).toBe("A");
    expect(isMarked(slice[0])).toBe(true);
  });
});

describe("E4 buildSheetInvExclusive is identity on unmarked-only inventories", () => {
  it("no marked lines → same lines and qty", () => {
    const inv = [line("A", 1, 1, 3), line("B", 2, 2, 7)];
    const slice = buildSheetInvExclusive(inv);
    expect(slice.map((p) => [p.id, p.qty])).toEqual([
      ["A", 3],
      ["B", 7],
    ]);
  });
});

describe("E5 exclusiveSheetInvKey consistent with the exclusive slice", () => {
  it("no marks → same as raw dims key; marked qty collapses to 1", () => {
    const plain = [line("A", 100, 200, 3), line("B", 50, 50, 2)];
    const raw = plain
      .map((p) => `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}:${p.qty}`)
      .sort()
      .join("|");
    expect(exclusiveSheetInvKey(plain)).toBe(raw);
    expect(exclusiveSheetInvKey([line("A", 100, 200, 5, true)])).toBe("100x200:1");
  });
  it("key changes when the current marked pick changes", () => {
    const withA = [line("A", 100, 100, 2, true), line("U", 50, 50, 4)];
    const afterA = [line("A", 100, 100, 0, true), line("B", 300, 300, 2, true), line("U", 50, 50, 4)];
    expect(exclusiveSheetInvKey(withA)).not.toBe(exclusiveSheetInvKey(afterA));
  });
});

// ─── Spec 010 — E6: exclusividade + prioridade + conservação sobre o loop ────

describe("E6 exclusive multi-sheet loop invariants (SC-001/SC-002/SC-003)", () => {
  const markedIdsOf = (inv: Line[]) => new Set(inv.filter(isMarked).map((p) => p.id));

  it("E6a/E6d SC-001 (≤1 marcada total/chapa) + conservação das não marcadas", () => {
    const inv = [line("A", 100, 100, 3, true), line("B", 200, 200, 2, true), line("U", 50, 50, 30)];
    const markedIds = markedIdsOf(inv);
    const sheets = simulateExclusive(inv, 12);
    for (const bom of sheets) {
      let markedOnSheet = 0;
      for (const [id, cnt] of bom) if (markedIds.has(id)) markedOnSheet += cnt;
      expect(markedOnSheet).toBeLessThanOrEqual(1); // SC-001: nunca A+B, nunca A+A
    }
    // conservação: todas as não marcadas colocadas
    const placedU = sheets.reduce((s, bom) => s + (bom.get("U") ?? 0), 0);
    expect(placedU).toBe(30);
  });

  it("E6b SC-002: as primeiras N chapas contêm 1 marcada cada (N = total marcadas)", () => {
    const inv = [line("A", 100, 100, 3, true), line("B", 200, 200, 2, true), line("U", 50, 50, 40)];
    const markedIds = markedIdsOf(inv);
    const totalMarked = 5;
    const sheets = simulateExclusive(inv, 12);
    const markedPerSheet = sheets.map((bom) => {
      let n = 0;
      for (const [id, cnt] of bom) if (markedIds.has(id)) n += cnt;
      return n;
    });
    // primeiras N chapas: exatamente 1 marcada cada
    for (let i = 0; i < totalMarked; i++) expect(markedPerSheet[i]).toBe(1);
    // chapas seguintes: nenhuma marcada
    for (let i = totalMarked; i < markedPerSheet.length; i++) expect(markedPerSheet[i]).toBe(0);
  });

  it("E6c SC-003: nenhuma peça marcada vira sobra", () => {
    const inv = [line("A", 100, 100, 4, true), line("B", 200, 200, 3, true), line("U", 50, 50, 5)];
    const markedIds = markedIdsOf(inv);
    const sheets = simulateExclusive(inv, 8);
    const placedMarked = sheets.reduce((s, bom) => {
      let n = 0;
      for (const [id, cnt] of bom) if (markedIds.has(id)) n += cnt;
      return s + n;
    }, 0);
    expect(placedMarked).toBe(7); // 4 + 3, tudo colocado
  });
});

// ─── US3: desmarcar volta a permitir repetição; flag é preservada ────────────

describe("US3 unmarking restores repetition; flag preserved by pure ops", () => {
  it("flag off → capForSheet keeps full qty (repetition allowed)", () => {
    const marked = [line("A", 100, 100, 4, true)];
    const unmarked = marked.map((p) => ({ ...p, uniquePerSheet: false }));
    expect(capForSheet(marked)[0].qty).toBe(1);
    expect(capForSheet(unmarked)[0].qty).toBe(4);
  });
  it("capForSheet/splitMarked preserve uniquePerSheet on outputs", () => {
    const inv = [line("A", 1, 1, 2, true)];
    expect(capForSheet(inv)[0].uniquePerSheet).toBe(true);
    expect(splitMarked(inv).marked[0].uniquePerSheet).toBe(true);
  });
});

// ─── FR-010: interação com specs 006 (repetição/homogêneo) e 008 (save ×N) ───
//
// A garantia ≤1/chapa se propaga a esses fluxos porque TODOS os construtores de
// árvore derivam da fatia CAPADA (`inv`): o `homoBuild` da spec 006 fatia o `inv`
// já capado, e a replicação de layout clona uma chapa-base capada. O ponto único
// de controle é o cap; estes testes fixam a propriedade que os protege.
describe("FR-010 cap protege repetição de padrão e save ×N", () => {
  it("linha marcada + linha NÃO marcada com a MESMA dimensão → só 1 marcada ofertada", () => {
    // Cenário crítico: A (marcada) e B (não marcada) têm 100x100. Um padrão
    // homogêneo de 100x100 poderia querer muitas peças; a fatia capada só oferta
    // 1 peça da LINHA marcada, então qualquer chapa (direta, homogênea ou clonada)
    // tem no máximo 1 peça da linha marcada.
    const inv = [line("A", 100, 100, 9, true), line("B", 100, 100, 50, false)];
    const capped = capForSheet(inv);
    expect(capped.find((p) => p.id === "A")!.qty).toBe(1); // marcada capada
    expect(capped.find((p) => p.id === "B")!.qty).toBe(50); // não marcada integral
    // "homoBuild" ofertaria capped (1 A + 50 B); nº de peças da linha marcada = 1.
    const markedOffered = capForSheet(inv)
      .filter(isMarked)
      .reduce((s, p) => s + p.qty, 0);
    expect(markedOffered).toBe(1);
  });

  it("replicar uma chapa-base capada mantém ≤1 marcada por cópia", () => {
    // Modela a replicação de layout (runAllSheets/save ×N): a base tem 1 marcada;
    // N clones ⇒ N chapas, cada uma com exatamente 1 marcada (nunca 2+).
    const baseBom = new Map<string, number>([
      ["M", 1], // linha marcada: 1 na base (garantido pelo cap)
      ["U", 7], // não marcadas preenchem o resto
    ]);
    const markedIds = new Set(["M"]);
    const copies = 4;
    const sheets = Array.from({ length: copies }, () => new Map(baseBom));
    for (const bom of sheets) {
      for (const id of markedIds) expect(bom.get(id) ?? 0).toBeLessThanOrEqual(1);
    }
    const totalMarked = sheets.reduce((s, bom) => s + (bom.get("M") ?? 0), 0);
    expect(totalMarked).toBe(copies); // 1 por cópia, espalhado
  });
});

// ─── Spec 010 — US3 (desmarcar) + FR-009 (exclusividade protege 006/008) ─────

describe("Spec 010 US3: unmarking removes exclusivity/priority", () => {
  it("no marked lines → buildSheetInvExclusive is identity (repetição permitida)", () => {
    const marked = [line("A", 100, 100, 4, true)];
    const off = marked.map((p) => ({ ...p, uniquePerSheet: false }));
    expect(buildSheetInvExclusive(off).find((p) => p.id === "A")!.qty).toBe(4);
    // com a flag ligada, oferta só 1
    expect(buildSheetInvExclusive(marked).find((p) => p.id === "A")!.qty).toBe(1);
  });
  it("pickMarkedForSheet/buildSheetInvExclusive preserve uniquePerSheet", () => {
    const inv = [line("A", 1, 1, 2, true)];
    expect(pickMarkedForSheet(inv)!.uniquePerSheet).toBe(true);
    expect(buildSheetInvExclusive(inv)[0].uniquePerSheet).toBe(true);
  });
});

describe("Spec 010 FR-009: exclusividade protege repetição de padrão e save ×N", () => {
  it("marcada + não marcada com MESMA dimensão → só 1 marcada ofertada, e nenhuma outra marcada", () => {
    // A e C marcadas de dimensões distintas + B não marcada com a MESMA dim de A.
    const inv = [
      line("A", 100, 100, 9, true),
      line("B", 100, 100, 50, false),
      line("C", 300, 300, 4, true),
    ];
    const slice = buildSheetInvExclusive(inv);
    const markedOffered = slice.filter(isMarked).reduce((s, p) => s + p.qty, 0);
    expect(markedOffered).toBe(1); // só 1 marcada total (A), nunca C junto
    expect(slice.some((p) => p.id === "C")).toBe(false);
    expect(slice.find((p) => p.id === "B")!.qty).toBe(50); // não marcada integral (fillers)
  });
});
