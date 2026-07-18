// Spec 011 — lookahead residual: consolidar a sobra que recebe a próxima peça.
//
// Contrato em specs/011-lookahead-residual-sobra/contracts/
// residual-lookahead-contract.md; data-model em data-model.md.
//
// `largestFreeRect` generaliza `getLastLeftover`: em vez do gap gerado por
// último, devolve o MAIOR retângulo livre da chapa. `residualFits` responde se
// esse maior livre comporta a próxima peça (com rotação e minBreak). O
// `optimizeV6` usa isso como desempate SUBORDINADO à área.
import { describe, it, expect } from "vitest";
import { largestFreeRect, extractLeafPieces } from "@/lib/engine/tree-utils";
import { optimizeV6 } from "@/lib/engine/optimizer";
import type { Piece, TreeNode, NodeType } from "@/lib/engine/types";

let _id = 0;
const N = (tipo: NodeType, valor: number, filhos: TreeNode[] = [], label?: string): TreeNode =>
  ({ id: `n${_id++}`, tipo, valor, multi: 1, filhos, label });
const root = (w: number, filhos: TreeNode[]): TreeNode => N("ROOT", w, filhos);

// ─────────────────────────────────────────────────────────────────────────────
// T002 / L1-L4 — largestFreeRect
// ─────────────────────────────────────────────────────────────────────────────

describe("largestFreeRect (L1-L4)", () => {
  it("L1: árvore vazia → chapa inteira", () => {
    expect(largestFreeRect(root(3000, []), 3000, 2000)).toEqual({ w: 3000, h: 2000 });
  });

  it("L2: coluna X ocupada + faixa à direita → a faixa, se for a maior", () => {
    // X de 1000 cheio (Y=2000 com peça Z), sobra faixa 2000×2000 à direita.
    const tree = root(3000, [
      N("X", 1000, [N("Y", 2000, [N("Z", 1000, [], "p")])]),
    ]);
    expect(largestFreeRect(tree, 3000, 2000)).toEqual({ w: 2000, h: 2000 });
  });

  it("L3: gap intermediário MAIOR que o final → retorna o maior (≠ getLastLeftover)", () => {
    // Col1 (1000): peça Y=500 no topo, fundo livre 1000×1500 (gap grande, nível 2).
    // Col2 (2000): peça Y=2000 cheia, com Z=1900 ⇒ gap à direita 100×2000 (pequeno, nível 3, gerado por último).
    const tree = root(3000, [
      N("X", 1000, [N("Y", 500, [N("Z", 1000, [], "a")])]),
      N("X", 2000, [N("Y", 2000, [N("Z", 1900, [], "b")])]),
    ]);
    // usedColW = 3000 = usableW ⇒ sem faixa à direita. Maior gap = fundo da col1: 1000×1500.
    expect(largestFreeRect(tree, 3000, 2000)).toEqual({ w: 1000, h: 1500 });
  });

  it("L4: chapa totalmente preenchida → null", () => {
    const tree = root(3000, [N("X", 3000, [N("Y", 2000, [N("Z", 3000, [], "p")])])]);
    expect(largestFreeRect(tree, 3000, 2000)).toBeNull();
  });

  it("coleta gaps profundos (W/Q) e devolve o maior", () => {
    // X(3000) cheio de largura, Y(2000) cheia, Z(3000) com um W=500 ⇒ fundo do Z = 3000×1500.
    const tree = root(3000, [
      N("X", 3000, [N("Y", 2000, [N("Z", 3000, [N("W", 500, [], "p")])])]),
    ]);
    expect(largestFreeRect(tree, 3000, 2000)).toEqual({ w: 3000, h: 1500 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Seleção por consolidação no optimizeV6 (S1, S2, S4)
// ─────────────────────────────────────────────────────────────────────────────

const mk = (w: number, h: number, n: number, p: string): Piece[] =>
  Array.from({ length: n }, (_, i) => ({ w, h, area: w * h, label: `${p}${i}` }));

// Estrutura da árvore (tipo/valor/multi/label/filhos), ignorando `id` (o gerador
// usa Math.random e não faz parte do layout).
const shape = (n: TreeNode): unknown =>
  ({ tipo: n.tipo, valor: n.valor, multi: n.multi, label: n.label ?? null, filhos: n.filhos.map(shape) });

describe("optimizeV6 — desempate por consolidação", () => {
  // Cenário-âncora "Chapa 2" (ESTUDO DE LAYOUTS): 4× 2473×1262 + 2× 2634×406 em
  // 5980×3190. Todas as 6 peças cabem, então área e nº de peças empatam entre os
  // candidatos — só a consolidação distingue. SEM o critério, o motor escolhia
  // por compactação e deixava a sobra em ~991k (fragmentada em 5 retalhos, medido).
  // COM o critério, escolhe o layout cuja sobra é um bloco único de ~2305k.
  it("S1: âncora Chapa 2 → sobra consolidada (bloco único ≫ fragmento)", () => {
    const pieces = [...mk(2473, 1262, 4, "A"), ...mk(2634, 406, 2, "B")];
    const r = optimizeV6(pieces, 5980, 3190, 0);

    // Todas as 6 peças alocadas (área máxima preservada).
    expect(extractLeafPieces(r.tree).filter((l) => l.label).length).toBe(6);

    const fr = largestFreeRect(r.tree, 5980, 3190);
    expect(fr, "deve haver sobra").not.toBeNull();
    const area = fr!.w * fr!.h;
    // Bloco consolidado (~2.305k) ≫ o fragmentado que a compactação escolhia (~991k).
    expect(area, `maior sobra ${Math.round(area / 1000)}k deveria ser um bloco consolidado`).toBeGreaterThan(1_800_000);
  });

  // S2 — subordinação à área: a consolidação NUNCA sacrifica aproveitamento. Se
  // todas as peças cabem, todas são colocadas (a consolidação só desempata entre
  // candidatos que já colocam o máximo).
  it("S2: consolidação é subordinada à área (não sacrifica peças)", () => {
    const pieces = [...mk(2473, 1262, 4, "A"), ...mk(2634, 406, 2, "B")];
    const r = optimizeV6(pieces, 5980, 3190, 0);
    expect(extractLeafPieces(r.tree).filter((l) => l.label).length).toBe(6);
  });

  // S4 — determinismo.
  it("S4: mesmo input 2× → mesmo layout", () => {
    const pieces = [...mk(2473, 1262, 4, "A"), ...mk(2634, 406, 2, "B"), ...mk(1000, 900, 3, "C")];
    const r1 = optimizeV6(pieces, 5980, 3190, 0);
    const r2 = optimizeV6(pieces, 5980, 3190, 0);
    expect(JSON.stringify(shape(r1.tree))).toBe(JSON.stringify(shape(r2.tree)));
  });
});
