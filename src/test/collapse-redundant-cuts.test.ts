// Colapso de coordenadas de corte REDUNDANTES (coordenadas.md).
// Um nó terminal único que preenche a dimensão inteira do pai é uma coordenada
// desperdiçada; um que de fato subdivide (trima a peça) é mantido.
import { describe, it, expect } from "vitest";
import { collapseRedundantCuts, extractLeafPieces, calcPlacedArea } from "@/lib/engine/tree-utils";
import type { TreeNode } from "@/lib/engine/types";

let nid = 0;
const n = (tipo: TreeNode["tipo"], valor: number, filhos: TreeNode[] = [], label?: string): TreeNode =>
  ({ id: `n${nid++}`, tipo, valor, multi: 1, filhos, label });

const UW = 5980, UH = 3190;

describe("collapseRedundantCuts", () => {
  it("colapsa Q que repete a largura do Z (coordenada redundante)", () => {
    // Y847 → Z2570 → W742 → Q2570(folha)  ⇒  o Q2570 preenche a largura do Z2570.
    const tree = n("ROOT", UW, [
      n("X", 3518, [
        n("Y", 2343, [], "jumbo"),
        n("Y", 847, [
          n("Z", 2570, [
            n("W", 742, [n("Q", 2570, [], "p")]),
          ]),
        ]),
      ]),
    ]);
    const before = extractLeafPieces(tree).find((l) => l.label === "p")!;
    collapseRedundantCuts(tree, UW, UH);
    // O Q sumiu: agora o W742 é a folha.
    const zNode = tree.filhos[0].filhos[1].filhos[0]; // Z2570
    const wNode = zNode.filhos[0]; // W742
    expect(wNode.tipo).toBe("W");
    expect(wNode.filhos).toHaveLength(0); // virou folha
    expect(wNode.label).toBe("p");
    // Geometria preservada (mesma medida da peça).
    const after = extractLeafPieces(tree).find((l) => l.label === "p")!;
    expect({ w: after.w, h: after.h }).toEqual({ w: before.w, h: before.h });
  });

  it("NÃO colapsa Q que trima a largura da peça (corte necessário)", () => {
    // Z948 → W670 → Q937(folha): 937 ≠ 948 ⇒ o Q corta a largura da peça, mantido.
    const tree = n("ROOT", UW, [
      n("X", 948, [
        n("Y", 3190, [
          n("Z", 948, [
            n("W", 670, [n("Q", 937, [], "q")]),
          ]),
        ]),
      ]),
    ]);
    collapseRedundantCuts(tree, UW, UH);
    const wNode = tree.filhos[0].filhos[0].filhos[0].filhos[0]; // W670
    expect(wNode.filhos).toHaveLength(1); // Q mantido
    expect(wNode.filhos[0].tipo).toBe("Q");
    expect(wNode.filhos[0].valor).toBe(937);
  });

  it("conserva o nº de folhas (não perde nem inventa peça)", () => {
    const tree = n("ROOT", UW, [
      n("X", 3518, [
        n("Y", 2343, [], "jumbo"),
        n("Y", 847, [
          n("Z", 2570, [n("W", 742, [n("Q", 2570, [], "p1")])]),
          n("Z", 948, [n("W", 670, [n("Q", 937, [], "p2")])]),
        ]),
      ]),
    ]);
    const before = extractLeafPieces(tree).filter((l) => l.label).map((l) => l.label).sort();
    collapseRedundantCuts(tree, UW, UH);
    const after = extractLeafPieces(tree).filter((l) => l.label).map((l) => l.label).sort();
    expect(after).toEqual(before); // jumbo, p1, p2 — todas presentes uma vez
  });

  it("calcPlacedArea NÃO muda com o colapso (percentual reflete o layout)", () => {
    // Inclui um JUMBO como X→Y→Z(folha): o colapso o torna X→Y(folha). calcPlacedArea
    // DEVE contar a Y-folha (era o bug do percentual errado).
    const tree = n("ROOT", UW, [
      n("X", 3560, [n("Y", 1956, [n("Z", 3560, [], "jumbo")])]),        // vira X→Y(folha)
      n("X", 2420, [n("Y", 1234, [n("Z", 2570, [n("W", 742, [n("Q", 2570, [], "p")])])])]),
    ]);
    const areaBefore = calcPlacedArea(tree);
    collapseRedundantCuts(tree, UW, UH);
    const areaAfter = calcPlacedArea(tree);
    expect(areaAfter).toBe(areaBefore); // área idêntica após remover coordenadas redundantes
    // e a área bate com a soma real das peças (jumbo 3560×1956 + p 2570×742).
    expect(areaAfter).toBe(3560 * 1956 + 2570 * 742);
    // o jumbo virou Y-folha e continua contado:
    expect(tree.filhos[0].filhos[0].filhos).toHaveLength(0); // Y(1956) é folha
  });
});
