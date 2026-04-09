import { describe, it, expect } from "vitest";
import { createRoot, insertNode, findNode, calcPlacedArea, TreeNode } from "../lib/cnc-engine";
import { createPieceNodes } from "../lib/engine/placement";

function extractUsedPieces(node: TreeNode): Array<{ w: number; h: number; label?: string }> {
  const used: Array<{ w: number; h: number; label?: string }> = [];

  const traverse = (n: TreeNode, parents: TreeNode[]) => {
    const yAncestor = parents.find((p) => p.tipo === "Y");
    const zAncestor = parents.find((p) => p.tipo === "Z");
    const wAncestor = parents.find((p) => p.tipo === "W");

    let pieceW = 0;
    let pieceH = 0;
    let isLeaf = false;

    if (n.tipo === "Z" && n.filhos.length === 0) {
      pieceW = n.valor;
      pieceH = yAncestor?.valor || 0;
      isLeaf = true;
    } else if (n.tipo === "W" && n.filhos.length === 0) {
      pieceW = zAncestor?.valor || 0;
      pieceH = n.valor;
      isLeaf = true;
    } else if (n.tipo === "Q") {
      pieceW = n.valor;
      pieceH = wAncestor?.valor || 0;
      isLeaf = true;
    }

    if (isLeaf && pieceW > 0 && pieceH > 0) {
      used.push({ w: pieceW, h: pieceH, label: n.label });
    }

    n.filhos.forEach((f) => traverse(f, [...parents, n]));
  };

  traverse(node, []);
  return used;
}

describe("Stacked width regression", () => {
  it("preserves the actual width of a narrower piece stacked inside an existing Z column", () => {
    const tree = createRoot(3000, 3150);
    const xId = insertNode(tree, "root", "X", 1466, 1);
    const yId = insertNode(tree, xId, "Y", 2018, 1);
    const yNode = findNode(tree, yId)!;

    createPieceNodes(tree, yNode, { w: 1466, h: 1118, area: 1466 * 1118, label: "A" }, 1466, 1118, false);
    const zNode = yNode.filhos[0];

    createPieceNodes(tree, yNode, { w: 1118, h: 900, area: 1118 * 900, label: "B" }, 1118, 900, false, zNode);

    const usedPieces = extractUsedPieces(tree);

    expect(usedPieces).toEqual([
      { w: 1466, h: 1118, label: "A" },
      { w: 1118, h: 900, label: "B" },
    ]);

    expect(calcPlacedArea(tree)).toBe(1466 * 1118 + 1118 * 900);
    expect(zNode.filhos[1].filhos[0].tipo).toBe("Q");
    expect(zNode.filhos[1].filhos[0].valor).toBe(1118);
  });
});
