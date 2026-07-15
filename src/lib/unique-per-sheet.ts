// Spec 009 — "Peça única por chapa" (medida sem repetição).
//
// Módulo PURO (sem React/DOM/rede/I/O). Concentra toda a lógica testável da
// restrição "uma linha marcada aparece no máximo 1× por chapa". A UI/plano
// (`src/pages/Index.tsx`) apenas orquestra: usa `capForSheet` ao montar o
// inventário de cada chapa e `sheetInvKey` como chave do cache de layout.
//
// Contrato: specs/009-peca-unica-por-chapa/contracts/unique-per-sheet-contract.md

import type { PieceItem, TreeNode } from "./engine/types";
import { extractLeafPieces } from "./engine/tree-utils";

/** Forma mínima de item de inventário que o plano manipula por chapa. */
export type MarkedInvItem = Pick<PieceItem, "id" | "w" | "h" | "qty" | "label"> & {
  uniquePerSheet?: boolean;
};

/** Uma linha está marcada como "não repetir na chapa"? */
export function isMarked(p: { uniquePerSheet?: boolean }): boolean {
  return p.uniquePerSheet === true;
}

/** Particiona por marcação, preservando a ordem. Não muta a entrada. */
export function splitMarked<T extends { uniquePerSheet?: boolean }>(
  pieces: readonly T[],
): { marked: T[]; unmarked: T[] } {
  const marked: T[] = [];
  const unmarked: T[] = [];
  for (const p of pieces) (isMarked(p) ? marked : unmarked).push(p);
  return { marked, unmarked };
}

/**
 * Quantidade desta linha ofertada a UMA chapa: linhas marcadas são limitadas a
 * `min(qty, 1)`; linhas não marcadas mantêm `qty`.
 */
export function perSheetQty(p: { uniquePerSheet?: boolean; qty: number }): number {
  return isMarked(p) ? Math.min(p.qty, 1) : p.qty;
}

/**
 * Fatia de inventário da chapa atual: cada linha marcada capada a ≤1, linhas não
 * marcadas com `qty` integral, apenas `qty > 0`. Retorna cópias (não muta).
 */
export function capForSheet<T extends { uniquePerSheet?: boolean; qty: number }>(
  remaining: readonly T[],
): T[] {
  const out: T[] = [];
  for (const p of remaining) {
    const q = perSheetQty(p);
    if (q > 0) out.push({ ...p, qty: q });
  }
  return out;
}

/**
 * Chave de cache de layout CONSISTENTE com `capForSheet`: assinatura
 * `min×max:qty` sobre a fatia capada, ordenada. Sem nenhuma linha marcada, é
 * idêntica à chave usada historicamente (não-regressão de cache/plano).
 */
export function sheetInvKey(
  remaining: readonly (MarkedInvItem & { qty: number })[],
): string {
  return capForSheet(remaining)
    .map((p) => `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}:${p.qty}`)
    .sort()
    .join("|");
}

// ─── Spec 010 — exclusividade total + prioridade ─────────────────────────────
// Substitui, no plano (runAllSheets), a regra per-linha da 009 (`capForSheet`):
// no máximo 1 peça marcada NO TOTAL por chapa, colocada primeiro (prioridade), de
// modo que as marcadas ocupem as primeiras chapas (1 por chapa) até esgotar.

/**
 * Retorna a PRIMEIRA linha marcada com `qty > 0` (ordem do inventário) ou `null`.
 * É a única peça marcada ofertada à chapa atual (exclusividade entre medidas
 * marcadas diferentes). Determinística; não muta.
 */
export function pickMarkedForSheet<T extends { uniquePerSheet?: boolean; qty: number }>(
  remaining: readonly T[],
): T | null {
  for (const p of remaining) {
    if (isMarked(p) && p.qty > 0) return p;
  }
  return null;
}

/**
 * Fatia de inventário EXCLUSIVA da chapa atual (spec 010): no máximo 1 peça
 * marcada no total (a de `pickMarkedForSheet`), colocada PRIMEIRO (prioridade),
 * seguida de todas as linhas não marcadas com `qty` integral. Nenhuma outra linha
 * marcada entra. Sem marcadas → apenas as não marcadas. Retorna cópias; não muta.
 */
export function buildSheetInvExclusive<T extends { uniquePerSheet?: boolean; qty: number }>(
  remaining: readonly T[],
): T[] {
  const pick = pickMarkedForSheet(remaining);
  const out: T[] = [];
  if (pick) out.push({ ...pick, qty: 1 });
  for (const p of remaining) {
    if (!isMarked(p) && p.qty > 0) out.push({ ...p });
  }
  return out;
}

/**
 * Chave de cache de layout consistente com `buildSheetInvExclusive`: assinatura
 * `min×max:qty` da fatia exclusiva, ordenada. Sem marcadas → igual à chave só das
 * não marcadas (não-regressão do cache/plano).
 */
export function exclusiveSheetInvKey(
  remaining: readonly (MarkedInvItem & { qty: number })[],
): string {
  return buildSheetInvExclusive(remaining)
    .map((p) => `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}:${p.qty}`)
    .sort()
    .join("|");
}

/**
 * Conta, DERIVANDO DA ÁRVORE (Princípio IV), quantas peças de linhas marcadas
 * foram alocadas numa chapa. `markedLabels` é o conjunto de labels (rótulo do
 * usuário) das linhas marcadas. Ignora `label` para navegar as folhas e compara
 * o label da folha contra o conjunto.
 */
export function countMarkedOnSheet(
  tree: TreeNode,
  markedLabels: ReadonlySet<string>,
): number {
  let n = 0;
  for (const leaf of extractLeafPieces(tree)) {
    if (leaf.label !== undefined && markedLabels.has(leaf.label)) n++;
  }
  return n;
}
