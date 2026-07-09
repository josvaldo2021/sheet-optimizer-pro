import { describe, it, expect } from "vitest";
import { TreeNode, PieceItem, extractLeafPieces, previewRemoval } from "../lib/cnc-engine";
import { NodeType } from "../lib/engine/types";
import { restorePiecesToInventory } from "../lib/inventory-utils";

let _id = 0;
function n(
  tipo: NodeType,
  valor: number,
  opts: { multi?: number; label?: string; filhos?: TreeNode[]; id?: string } = {},
): TreeNode {
  return {
    id: opts.id ?? `t${++_id}`,
    tipo,
    valor,
    multi: opts.multi ?? 1,
    filhos: opts.filhos ?? [],
    label: opts.label,
  };
}

function root(filhos: TreeNode[]): TreeNode {
  return { id: "root", tipo: "ROOT", valor: 2750, multi: 1, filhos };
}

describe("extractLeafPieces", () => {
  it("extrai folhas Y e Z com dimensões do contexto dos ancestrais", () => {
    // X600 → [Y400 (folha), Y200 → Z300 (folha)]
    const tree = root([
      n("X", 600, {
        filhos: [
          n("Y", 400),
          n("Y", 200, { filhos: [n("Z", 300)] }),
        ],
      }),
    ]);
    const pieces = extractLeafPieces(tree);
    expect(pieces).toHaveLength(2);
    expect(pieces).toContainEqual({ w: 600, h: 400, label: undefined });
    expect(pieces).toContainEqual({ w: 300, h: 200, label: undefined });
  });

  it("extrai folhas W, Q e R nos níveis profundos", () => {
    // X500 → Y300 → Z200 → [W100 (folha), W150 → [Q80 (folha), Q60 → R40 (folha)]]
    const tree = root([
      n("X", 500, {
        filhos: [
          n("Y", 300, {
            filhos: [
              n("Z", 200, {
                filhos: [
                  n("W", 100),
                  n("W", 150, {
                    filhos: [n("Q", 80), n("Q", 60, { filhos: [n("R", 40)] })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ]);
    const pieces = extractLeafPieces(tree);
    expect(pieces).toContainEqual({ w: 200, h: 100, label: undefined }); // W folha
    expect(pieces).toContainEqual({ w: 80, h: 150, label: undefined }); // Q folha
    expect(pieces).toContainEqual({ w: 60, h: 40, label: undefined }); // R folha
    expect(pieces).toHaveLength(3);
  });

  it("expande multi cumulativo (pai × nó)", () => {
    // Y multi=2 contendo Z multi=3 → 6 peças
    const tree = root([
      n("X", 400, {
        filhos: [n("Y", 200, { multi: 2, filhos: [n("Z", 100, { multi: 3 })] })],
      }),
    ]);
    const pieces = extractLeafPieces(tree);
    expect(pieces).toHaveLength(6);
    pieces.forEach((p) => expect(p).toMatchObject({ w: 100, h: 200 }));
  });

  it("conta peças sem label (armadilha crítica: nunca filtrar por label)", () => {
    const tree = root([
      n("X", 300, { filhos: [n("Y", 100, { label: "P1" }), n("Y", 150)] }),
    ]);
    const pieces = extractLeafPieces(tree);
    expect(pieces).toHaveLength(2);
    expect(pieces.find((p) => p.h === 100)?.label).toBe("P1");
    expect(pieces.find((p) => p.h === 150)?.label).toBeUndefined();
  });

  it("não conta X vazio (coluna sem peças não é folha alocada)", () => {
    const tree = root([n("X", 500)]);
    expect(extractLeafPieces(tree)).toHaveLength(0);
  });
});

describe("previewRemoval", () => {
  it("remoção de folha simples retorna exatamente aquela peça", () => {
    const z = n("Z", 300, { id: "zTarget" });
    const tree = root([
      n("X", 600, { filhos: [n("Y", 400), n("Y", 200, { filhos: [z] })] }),
    ]);
    const removed = previewRemoval(tree, "zTarget");
    expect(removed).toEqual([{ w: 300, h: 200, label: undefined }]);
  });

  it("remoção de subárvore inteira inclui as peças dos níveis internos", () => {
    // Remover o X remove a folha Y e as folhas Z internas
    const x = n("X", 600, {
      id: "xTarget",
      filhos: [
        n("Y", 400, { label: "A" }),
        n("Y", 200, { filhos: [n("Z", 300, { label: "B" }), n("Z", 250, { multi: 2 })] }),
      ],
    });
    const other = n("X", 500, { filhos: [n("Y", 100, { label: "C" })] });
    const tree = root([x, other]);

    const removed = previewRemoval(tree, "xTarget");
    expect(removed).toHaveLength(4); // Y400 + Z300 + 2×Z250
    expect(removed).toContainEqual({ w: 600, h: 400, label: "A" });
    expect(removed).toContainEqual({ w: 300, h: 200, label: "B" });
    expect(removed.filter((p) => p.w === 250 && p.h === 200)).toHaveLength(2);
    // Peça da outra coluna não é afetada
    expect(removed.find((p) => p.label === "C")).toBeUndefined();
  });

  it("respeita multi na contagem de removidas", () => {
    const z = n("Z", 100, { id: "zMulti", multi: 3 });
    const tree = root([n("X", 400, { filhos: [n("Y", 200, { filhos: [z] })] })]);
    expect(previewRemoval(tree, "zMulti")).toHaveLength(3);
  });

  it("não muta a árvore de entrada", () => {
    const z = n("Z", 300, { id: "zTarget" });
    const tree = root([n("X", 600, { filhos: [n("Y", 200, { filhos: [z] })] })]);
    const snapshot = JSON.stringify(tree);
    previewRemoval(tree, "zTarget");
    expect(JSON.stringify(tree)).toBe(snapshot);
  });

  it("remoção de X vazio (desperdício) não afeta nenhuma peça", () => {
    const tree = root([
      n("X", 500, { id: "xEmpty" }),
      n("X", 600, { filhos: [n("Y", 400)] }),
    ]);
    expect(previewRemoval(tree, "xEmpty")).toHaveLength(0);
  });

  it("nodeId inexistente ou root retorna vazio (deleteNode é no-op)", () => {
    const tree = root([n("X", 600, { filhos: [n("Y", 400)] })]);
    expect(previewRemoval(tree, "nope")).toHaveLength(0);
    expect(previewRemoval(tree, "root")).toHaveLength(0);
  });
});

describe("restorePiecesToInventory", () => {
  const inv = (items: Partial<PieceItem>[]): PieceItem[] =>
    items.map((p, i) => ({ id: p.id ?? `i${i}`, qty: p.qty ?? 0, w: p.w ?? 0, h: p.h ?? 0, label: p.label }));

  it("devolve qty por match de label", () => {
    const pieces = inv([{ label: "P1", w: 300, h: 200, qty: 5 }]);
    const result = restorePiecesToInventory(pieces, [{ w: 300, h: 200, label: "P1" }]);
    expect(result.find((p) => p.label === "P1")?.qty).toBe(6);
  });

  it("fallback por dimensões com rotação quando o label não existe no inventário", () => {
    const pieces = inv([{ label: "OUTRO", w: 200, h: 300, qty: 2 }]);
    // Removida 300×200 (rotacionada) com label desconhecido → casa por dimensões
    const result = restorePiecesToInventory(pieces, [{ w: 300, h: 200, label: "X9" }]);
    expect(result.find((p) => p.label === "OUTRO")?.qty).toBe(3);
  });

  it("recria item que zerou e foi filtrado do inventário", () => {
    const pieces = inv([{ label: "OUTRA-DIM", w: 999, h: 111, qty: 1 }]);
    const result = restorePiecesToInventory(pieces, [
      { w: 300, h: 200, label: "P7" },
      { w: 300, h: 200, label: "P7" },
    ]);
    const recreated = result.find((p) => p.label === "P7");
    expect(recreated).toBeDefined();
    expect(recreated?.qty).toBe(2); // segunda peça casa com o item recriado
    expect(recreated?.w).toBe(300);
    expect(recreated?.h).toBe(200);
  });

  it("ignora peças sem label (recorte manual não afeta inventário)", () => {
    const pieces = inv([{ label: "P1", w: 300, h: 200, qty: 5 }]);
    const result = restorePiecesToInventory(pieces, [{ w: 300, h: 200 }]);
    expect(result.find((p) => p.label === "P1")?.qty).toBe(5);
    expect(result).toHaveLength(1);
  });

  it("N peças removidas → qty +N", () => {
    const pieces = inv([{ label: "P1", w: 300, h: 200, qty: 1 }]);
    const removed = Array.from({ length: 4 }, () => ({ w: 300, h: 200, label: "P1" }));
    const result = restorePiecesToInventory(pieces, removed);
    expect(result.find((p) => p.label === "P1")?.qty).toBe(5);
  });

  it("não muta o inventário de entrada", () => {
    const pieces = inv([{ label: "P1", w: 300, h: 200, qty: 5 }]);
    const snapshot = JSON.stringify(pieces);
    restorePiecesToInventory(pieces, [{ w: 300, h: 200, label: "P1" }]);
    expect(JSON.stringify(pieces)).toBe(snapshot);
  });
});
