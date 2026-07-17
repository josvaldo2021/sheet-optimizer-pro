// Spec 012 — Paridade TS ↔ WASM (Princípio VI).
//
// POR QUE ESTE ARQUIVO EXISTE: a spec 012 mexeu nos dois motores, mas os 207
// testes cobriam SÓ o TypeScript — o Rust era apenas compilado. Uma regressão
// em que o WASM não alocava todas as peças passou por toda a suíte verde e
// chegou ao usuário, que roda WASM por padrão
// (`localStorage.useWasmEngine !== 'false'`). Compilar não é verificar.
//
// O contrato aqui é deliberadamente grosso e barato: mesmo input ⇒ mesma
// contagem de peças alocadas nos dois motores, e conservação em ambos. Não
// exige árvores idênticas (heurísticas podem empatar e desempatar diferente),
// mas divergência de CONTAGEM é sempre bug — peça alocada num motor e sumida no
// outro significa que um dos dois mente sobre o que corta.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { optimizeV6 as optimizeV6TS } from "@/lib/engine/optimizer";
import { extractLeafPieces } from "@/lib/engine/tree-utils";
import type { Piece, TreeNode } from "@/lib/engine/types";

interface WasmBindings {
  wasm_optimize_v6(pieces_json: string, usable_w: number, usable_h: number, min_break: number): string;
}

let wasm: WasmBindings;

beforeAll(async () => {
  // O pkg é gerado com `--target web`: o init faz fetch da URL do .wasm, que
  // não existe no Node. Passar os bytes direto contorna isso sem um segundo build.
  const mod = await import("../../wasm-engine/pkg/optimizer_wasm.js");
  const bytes = readFileSync(resolve(process.cwd(), "wasm-engine/pkg/optimizer_wasm_bg.wasm"));
  await (mod as unknown as { default: (o: unknown) => Promise<unknown> }).default({ module_or_path: bytes });
  wasm = mod as unknown as WasmBindings;
});

/** Conta TODA folha da árvore, rotulada ou não (armadilha nº 1 do CLAUDE.md). */
const countLeaves = (tree: TreeNode) => extractLeafPieces(tree).length;

const runWasm = (pieces: Piece[], w: number, h: number) =>
  JSON.parse(wasm.wasm_optimize_v6(JSON.stringify(pieces), w, h, 0)) as { tree: TreeNode; remaining: Piece[] };

const mk = (w: number, h: number, n: number, prefix: string): Piece[] =>
  Array.from({ length: n }, (_, i) => ({ w, h, area: w * h, label: `${prefix}${i}` }));

interface Scenario {
  name: string;
  pieces: Piece[];
  sheet: [number, number];
}

const scenarios: Scenario[] = [
  {
    // Cenário-âncora da spec 012 (SC-004): cabe inteiro em uma chapa.
    name: "âncora: 4× 2473×1262 + 2× 2634×406 em 5980×3190",
    pieces: [...mk(2473, 1262, 4, "A"), ...mk(2634, 406, 2, "B")],
    sheet: [5980, 3190],
  },
  {
    // Alturas idênticas ⇒ exercita a faixa do groupStripPackingDP.
    name: "faixa de altura única: 8× 500×200 rotuladas",
    pieces: mk(500, 200, 8, "S"),
    sheet: [2100, 1000],
  },
  {
    // Alturas DIFERENTES ⇒ exercita a subdivisão por altura exata (T010),
    // que é o suspeito nº 1 de perder peças no caminho de `unassigned`.
    name: "alturas mistas: 4× 500×200 + 4× 500×300 + 3× 400×250",
    pieces: [...mk(500, 200, 4, "H"), ...mk(500, 300, 4, "I"), ...mk(400, 250, 3, "J")],
    sheet: [2100, 1500],
  },
  {
    // Duplicatas SEM rótulo: no Rust a remoção da linha usada é por igualdade
    // de (largura, altura, rótulo), não por identidade — peças idênticas somem
    // em bloco. Sem rótulo não há o que as distinga.
    name: "duplicatas anônimas: 6× 600×300 sem rótulo",
    pieces: Array.from({ length: 6 }, () => ({ w: 600, h: 300, area: 180000 })),
    sheet: [1900, 1000],
  },
  {
    // 60 medidas TODAS distintas, nenhuma repetida: dispara o gate
    // `skipExpensiveGrouping` (`pieces.length > 50 && maxRepetition < 3`), que
    // existe SÓ no TS — o WASM agrupa aqui e o TS não. Foi este cenário que
    // expôs o bug de tolerância do groupStripPackingDPTransposed: medidas
    // vizinhas (nw 350 vs 353) caíam na mesma faixa e as mais estreitas eram
    // cortadas com a largura da faixa.
    name: "gate: 60 medidas únicas (skip no TS, agrupa no WASM)",
    pieces: Array.from({ length: 60 }, (_, i) => {
      const w = 300 + i * 7;
      const h = 200 + i * 3;
      return { w, h, area: w * h, label: `P${i}` };
    }),
    sheet: [5980, 3190],
  },
];

/** Multiset de medidas do inventário, normalizado por orientação. */
const dimKey = (p: { w: number; h: number }) =>
  `${Math.min(Math.round(p.w), Math.round(p.h))}x${Math.max(Math.round(p.w), Math.round(p.h))}`;

describe("Paridade TS ↔ WASM (Princípio VI)", () => {
  for (const { name, pieces, sheet } of scenarios) {
    it(`aloca a mesma quantidade de peças nos dois motores — ${name}`, () => {
      const ts = optimizeV6TS(pieces, sheet[0], sheet[1], 0);
      const rs = runWasm(pieces, sheet[0], sheet[1]);

      const tsLeaves = countLeaves(ts.tree);
      const rsLeaves = countLeaves(rs.tree);

      expect(
        rsLeaves,
        `WASM alocou ${rsLeaves} peças, TS alocou ${tsLeaves} (input: ${pieces.length})`,
      ).toBe(tsLeaves);
    });

    it(`não perde nem inventa peças — ${name}`, () => {
      for (const [engine, result] of [
        ["TS", optimizeV6TS(pieces, sheet[0], sheet[1], 0)],
        ["WASM", runWasm(pieces, sheet[0], sheet[1])],
      ] as const) {
        // Conservação: cada peça do inventário ou virou folha, ou está em
        // `remaining`. Um grupo em `remaining` conta `count` peças, não 1.
        const allocated = countLeaves(result.tree);
        const left = result.remaining.reduce((s, p) => s + (p.count ?? 1), 0);
        expect(
          allocated + left,
          `${engine}: ${allocated} alocadas + ${left} restantes ≠ ${pieces.length} do inventário`,
        ).toBe(pieces.length);
      }
    });

    it(`nenhuma folha afirma medida inexistente — ${name}`, () => {
      // Contar peças não basta: o motor pode alocar as N certas e ainda MENTIR a
      // medida de algumas. Foi assim que o bug de tolerância do
      // groupStripPackingDPTransposed sobreviveu — 60 de 60 peças alocadas, 20
      // delas com a largura da faixa em vez da própria (fantasmas).
      const stock = new Map<string, number>();
      for (const p of pieces) stock.set(dimKey(p), (stock.get(dimKey(p)) ?? 0) + 1);

      for (const [engine, result] of [
        ["TS", optimizeV6TS(pieces, sheet[0], sheet[1], 0)],
        ["WASM", runWasm(pieces, sheet[0], sheet[1])],
      ] as const) {
        const left = new Map(stock);
        const phantoms: string[] = [];
        for (const leaf of extractLeafPieces(result.tree)) {
          const k = dimKey(leaf);
          const n = left.get(k) ?? 0;
          if (n === 0) phantoms.push(`${leaf.label ?? "(sem rótulo)"}=${k}`);
          else left.set(k, n - 1);
        }
        expect(
          phantoms,
          `${engine}: ${phantoms.length} folha(s) com medida que não existe no inventário — ${phantoms.slice(0, 5).join(", ")}`,
        ).toEqual([]);

        // A área alocada tem de ser exatamente a soma das peças que ela afirma
        // cortar — área inflada é a assinatura do fantasma.
        const leafArea = extractLeafPieces(result.tree).reduce((s, l) => s + l.w * l.h, 0);
        const realArea = pieces.reduce((s, p) => s + p.w * p.h, 0) -
          result.remaining.reduce((s, p) => s + p.area * (p.count ?? 1), 0);
        expect(
          Math.round(leafArea / 100),
          `${engine}: área das folhas (${Math.round(leafArea / 1000)}k) ≠ área real das peças alocadas (${Math.round(realArea / 1000)}k)`,
        ).toBe(Math.round(realArea / 100));
      }
    });
  }
});
