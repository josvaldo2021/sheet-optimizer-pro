import { describe, expect, it } from "vitest";
import { createRoot, insertNode, findNode, normalizeCutTree } from "../lib/cnc-engine";

describe("Node normalization by cut orientation", () => {
  it("should normalize the documented case into X/Y/Z/W nodes with consolidated multis", () => {
    const tree = createRoot(3210, 2400);

    const x917Id = insertNode(tree, "root", "X", 917, 1);
    for (let i = 0; i < 4; i++) {
      const y725 = insertNode(tree, x917Id, "Y", 725, 1);
      const z917 = insertNode(tree, y725, "Z", 917, 1);
      const zNode = findNode(tree, z917)!;
      zNode.label = "TESTE";
    }
    const y459Id = insertNode(tree, x917Id, "Y", 459, 1);
    const z1483 = insertNode(tree, y459Id, "Z", 1483, 1);
    const z1483Node = findNode(tree, z1483)!;
    z1483Node.label = "TESTE";

    const x1376Id = insertNode(tree, "root", "X", 1376, 1);
    for (let i = 0; i < 3; i++) {
      const y917 = insertNode(tree, x1376Id, "Y", 917, 1);
      const z725 = insertNode(tree, y917, "Z", 725, 1);
      const z725Node = findNode(tree, z725)!;
      z725Node.label = "TA20";
    }

    const normalized = normalizeCutTree(tree);

    expect(normalized.filhos).toHaveLength(1);
    const rootX = normalized.filhos[0];
    expect(rootX.tipo).toBe("X");
    expect(rootX.valor).toBe(3210);
    expect(rootX.filhos).toHaveLength(2);

    const y917Node = rootX.filhos.find((child) => child.tipo === "Y" && child.valor === 917);
    const y459Node = rootX.filhos.find((child) => child.tipo === "Y" && child.valor === 459);

    expect(y917Node).toBeTruthy();
    expect(y459Node).toBeTruthy();
    expect(y917Node!.filhos).toHaveLength(1);
    expect(y917Node!.filhos[0].tipo).toBe("Z");
    expect(y917Node!.filhos[0].valor).toBe(725);
    expect(y917Node!.filhos[0].multi).toBe(4);

    expect(y459Node!.filhos).toHaveLength(1);

    const z1483Norm = y459Node!.filhos[0];
    expect(z1483Norm.tipo).toBe("Z");
    expect(z1483Norm.valor).toBe(1483);
    expect(z1483Norm.filhos).toHaveLength(1);

    const w725 = z1483Norm.filhos[0];
    expect(w725.tipo).toBe("W");
    expect(w725.valor).toBe(725);
    expect(w725.multi).toBe(2);
  });
});