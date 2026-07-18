// Spec 014 (fase 2) — Decomposição da sobra do jumbo.
//
// Uma peça jumbo (maior lado > altura útil) só cabe deitada num CANTO da chapa,
// e deixa a sobra em DOIS retângulos EXATOS que a gramática guilhotina representa
// nativamente:
//   - ABAIXO do jumbo:  jw × (H − jh)
//   - à DIREITA do jumbo: (W − jw) × H
// Em vez do `runPlacement` guloso (que não preenche bem esses blocos), otimizamos
// CADA região com `optimizeV6` e montamos a árvore final. É o passo que leva
// ~35→34 chapas e enche a sobra do jumbo com as peças médias (ver
// memória "proxima-spec-chapa-dedicada" / specs/014).
//
// Módulo PURO: recebe `optimize` injetada (testável; no app é o optimizeV6/WASM).

import type { Piece, TreeNode, NodeType } from "./engine/types";
import { gid, extractLeafPieces } from "./engine/tree-utils";

export type OptimizeFn = (
  pieces: Piece[], usableW: number, usableH: number, minBreak: number,
) => { tree: TreeNode; remaining: Piece[] };

const LEVEL: Record<string, number> = { X: 1, Y: 2, Z: 3, W: 4, Q: 5, R: 6 };
const BY_LEVEL: Record<number, NodeType> = { 1: "X", 2: "Y", 3: "Z", 4: "W", 5: "Q", 6: "R" };

const node = (tipo: NodeType, valor: number, filhos: TreeNode[] = [], label?: string): TreeNode =>
  ({ id: gid(), tipo, valor, multi: 1, filhos, label });

/**
 * Reindexa um subárvore N níveis para baixo (X→Z para `delta=2`, etc.), para
 * ENXERTAR um plano (ROOT→X→…) dentro de um nó mais profundo. Preserva geometria
 * (a alternância largura/altura se mantém sob deslocamento par) e rótulos.
 * Devolve `null` se algum nó ultrapassaria `R` (região funda demais para caber).
 */
function remapSubtree(n: TreeNode, delta: number): TreeNode | null {
  const l = LEVEL[n.tipo];
  if (l === undefined) return null;
  const nl = l + delta;
  if (nl > 6) return null;
  const kids: TreeNode[] = [];
  for (const c of n.filhos) {
    const rc = remapSubtree(c, delta);
    if (!rc) return null;
    kids.push(rc);
  }
  return { id: gid(), tipo: BY_LEVEL[nl], valor: n.valor, multi: n.multi, filhos: kids, label: n.label };
}

/**
 * Monta a chapa dedicada de um jumbo com a sobra decomposta e otimizada.
 * `jumbo` é UMA peça; `others` são as candidatas a preencher a sobra. Devolve a
 * árvore final e as peças NÃO colocadas (`remaining`), ou `null` se o jumbo não
 * cabe. Conserva: folhas(árvore) + remaining = {jumbo} ∪ others.
 */
export function buildJumboSheet(
  jumbo: Piece, usableW: number, usableH: number,
  others: Piece[], minBreak: number, optimize: OptimizeFn,
): { tree: TreeNode; remaining: Piece[] } | null {
  const jw = Math.max(jumbo.w, jumbo.h); // lado longo ao longo da largura
  const jh = Math.min(jumbo.w, jumbo.h);
  if (jw > usableW + 0.5 || jh > usableH + 0.5) return null;

  const placed = new Set<string>();
  const collect = (t: TreeNode) => {
    for (const lf of extractLeafPieces(t)) if (lf.label) placed.add(lf.label);
  };

  // Coluna do jumbo: X(jw) → Y(jh)=jumbo (Z folha jw×jh).
  const jumboX = node("X", jw, [node("Y", jh, [node("Z", jw, [], jumbo.label)])]);

  // DIREITA ((W−jw) × H): otimiza e anexa as X-colunas ao ROOT (full-height).
  const rightW = usableW - jw;
  let rightTree: TreeNode | null = null;
  if (rightW > 0.5) {
    rightTree = optimize(others, rightW, usableH, minBreak).tree;
    collect(rightTree);
  }

  // ABAIXO (jw × (H−jh)): otimiza o que sobrou da direita e ENXERTA como
  // Z-colunas sob Y(H−jh) (remap X→Z). Se ficar fundo demais, deixa vazio.
  const belowH = usableH - jh;
  if (belowH > 0.5) {
    const belowInput = others.filter((p) => !(p.label && placed.has(p.label)));
    const belowTree = optimize(belowInput, jw, belowH, minBreak).tree;
    const yBelow = node("Y", belowH);
    let ok = true;
    for (const x of belowTree.filhos) {
      const z = remapSubtree(x, 2);
      if (!z) { ok = false; break; }
      yBelow.filhos.push(z);
    }
    if (ok && yBelow.filhos.length > 0) {
      collect(belowTree);
      jumboX.filhos.push(yBelow);
    }
  }

  const rootKids: TreeNode[] = [jumboX];
  if (rightTree) for (const x of rightTree.filhos) rootKids.push(x);

  placed.add(jumbo.label!);
  const remaining = others.filter((p) => !(p.label && placed.has(p.label)));
  return { tree: { id: "root", tipo: "ROOT", valor: usableW, multi: 1, filhos: rootKids }, remaining };
}
