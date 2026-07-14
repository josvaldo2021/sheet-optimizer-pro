// Replicação de layout e replanejamento pós-save (spec 008).
//
// Funções puras e agnósticas de UI (Constituição, Artigo II): recebem dados e
// retornam dados. Contrato completo em
// specs/008-replanejar-apos-salvar/contracts/layout-replication-contract.md.
//
// Convenção de identidade (D3): peças são agregadas por dimensão normalizada
// `min(w,h)×max(w,h)` — a dedução aceita o item do inventário em qualquer
// orientação. Labels não participam da identidade do BOM de replicação.

/** Peça extraída da árvore de corte (apenas dimensões importam aqui). */
export interface UsedPieceDim {
  w: number;
  h: number;
}

/** Linha do BOM de um layout: peças de uma dimensão por cópia. */
export interface BomEntry {
  w: number;
  h: number;
  count: number;
}

/** Item de inventário dedutível (subconjunto de PieceItem). */
export interface InventoryPiece {
  id: string;
  qty: number;
  w: number;
  h: number;
}

export interface DeductionResult<P extends InventoryPiece> {
  /** Cópia do inventário com n×BOM deduzido; nunca qty < 0. */
  pieces: P[];
  /** Linhas que o inventário não cobriu por inteiro (vazio = sucesso). */
  shortfall: BomEntry[];
}

const dimKey = (w: number, h: number) => `${Math.min(w, h)}x${Math.max(w, h)}`;

const sameDim = (p: { w: number; h: number }, w: number, h: number) =>
  (p.w === w && p.h === h) || (p.w === h && p.h === w);

/** Agrega as peças de UM layout em BOM por dimensão normalizada. */
export function buildLayoutBom(used: UsedPieceDim[]): BomEntry[] {
  const map = new Map<string, BomEntry>();
  used.forEach((u) => {
    const key = dimKey(u.w, u.h);
    const existing = map.get(key);
    if (existing) existing.count++;
    else map.set(key, { w: u.w, h: u.h, count: 1 });
  });
  return Array.from(map.values());
}

/** Quantidade disponível no inventário para uma dimensão (qualquer orientação). */
function availableFor(pieces: InventoryPiece[], w: number, h: number): number {
  return pieces.reduce((s, p) => (sameDim(p, w, h) ? s + p.qty : s), 0);
}

/** Máximo de cópias inteiras do BOM que o inventário cobre (0 se alguma linha não cobre). */
export function maxRepetitions(pieces: InventoryPiece[], bom: BomEntry[]): number {
  if (bom.length === 0) return 0;
  let max = Infinity;
  bom.forEach(({ w, h, count }) => {
    max = Math.min(max, Math.floor(availableFor(pieces, w, h) / count));
  });
  return isFinite(max) && max > 0 ? max : 0;
}

/**
 * Deduz n×BOM de uma cópia do inventário (qualquer orientação). O que faltar
 * é reportado em `shortfall`; nenhum `qty` fica negativo. O chamador deve
 * tratar `shortfall` não vazio como erro e descartar o resultado (dedução é
 * tudo-ou-nada do ponto de vista do estado).
 */
export function deductBomTimes<P extends InventoryPiece>(
  pieces: P[],
  bom: BomEntry[],
  n: number,
): DeductionResult<P> {
  const updated = pieces.map((p) => ({ ...p }));
  const shortfall: BomEntry[] = [];
  if (n <= 0) return { pieces: updated, shortfall };

  bom.forEach(({ w, h, count }) => {
    let toDeduct = count * n;
    for (const p of updated) {
      if (toDeduct === 0) break;
      if (sameDim(p, w, h) && p.qty > 0) {
        const deducted = Math.min(toDeduct, p.qty);
        p.qty -= deducted;
        toDeduct -= deducted;
      }
    }
    if (toDeduct > 0) shortfall.push({ w, h, count: toDeduct });
  });

  return { pieces: updated, shortfall };
}

/** Partição estável por `manual === true` (não muta a entrada). */
export function partitionByManual<C extends { manual?: boolean }>(
  chapas: C[],
): { manuais: C[]; autos: C[] } {
  const manuais: C[] = [];
  const autos: C[] = [];
  chapas.forEach((c) => (c.manual === true ? manuais : autos).push(c));
  return { manuais, autos };
}

// ── Emenda A1 (spec 008): dedução movida para a confirmação do lote ──
// Cópias salvas ×N não deduzem o inventário no save; entram no plano como
// chapas pendentes (`saved: true`, `selected: true`, `deductions` exatas) e
// apenas RESERVAM inventário até o lote ser confirmado.

export interface PendingChapa {
  manual?: boolean;
  saved?: boolean;
  deductions?: Array<{ id: string; qty: number }>;
}

/** Cópias salvas aguardando lote: reservam inventário sem tê-lo deduzido. */
export function pendingSavedChapas<C extends PendingChapa>(chapas: C[]): C[] {
  return chapas.filter((c) => c.manual !== true && c.saved === true);
}

/**
 * Inventário efetivo = peças − reservas das cópias salvas pendentes.
 * Nunca produz `qty` negativo (reserva órfã, ex.: usuário reduziu a qty, é
 * saturada em 0). Não muta a entrada.
 */
export function effectiveInventory<P extends InventoryPiece>(
  pieces: P[],
  chapas: PendingChapa[],
): P[] {
  const updated = pieces.map((p) => ({ ...p }));
  pendingSavedChapas(chapas).forEach((c) => {
    c.deductions?.forEach(({ id, qty }) => {
      const p = updated.find((x) => x.id === id);
      if (p) p.qty = Math.max(0, p.qty - qty);
    });
  });
  return updated;
}

/**
 * Partição estável: preservadas (confirmadas OU salvas pendentes) vs chapas
 * automáticas descartáveis em replanejamentos e trocas de grupo.
 */
export function partitionByPreserved<C extends PendingChapa>(
  chapas: C[],
): { preserved: C[]; autos: C[] } {
  const preserved: C[] = [];
  const autos: C[] = [];
  chapas.forEach((c) => (c.manual === true || c.saved === true ? preserved : autos).push(c));
  return { preserved, autos };
}

/** Existe chapa automática descartável (não confirmada nem salva)? — gatilho do replanejamento (FR-003) */
export function needsReplan(chapas: Array<{ manual?: boolean; saved?: boolean }>): boolean {
  return chapas.some((c) => c.manual !== true && c.saved !== true);
}

/**
 * Aloca deduções id-a-id para n cópias do BOM, consumindo de uma cópia do
 * inventário (qualquer orientação). Cada cópia recebe sua própria lista de
 * `deductions` — Σ por id nunca excede a qty do item. Faltas vão para
 * `shortfall`; o chamador trata como erro e descarta tudo (tudo-ou-nada).
 */
export function allocateDeductions<P extends InventoryPiece>(
  pieces: P[],
  bom: BomEntry[],
  n: number,
): { perCopy: Array<Array<{ id: string; qty: number }>>; remaining: P[]; shortfall: BomEntry[] } {
  const remaining = pieces.map((p) => ({ ...p }));
  const shortfall: BomEntry[] = [];
  const perCopy: Array<Array<{ id: string; qty: number }>> = [];

  for (let i = 0; i < Math.max(0, n); i++) {
    const map = new Map<string, number>();
    bom.forEach(({ w, h, count }) => {
      let toDeduct = count;
      for (const p of remaining) {
        if (toDeduct === 0) break;
        if (sameDim(p, w, h) && p.qty > 0) {
          const deducted = Math.min(toDeduct, p.qty);
          p.qty -= deducted;
          toDeduct -= deducted;
          map.set(p.id, (map.get(p.id) || 0) + deducted);
        }
      }
      if (toDeduct > 0) {
        const existing = shortfall.find((s) => dimKey(s.w, s.h) === dimKey(w, h));
        if (existing) existing.count += toDeduct;
        else shortfall.push({ w, h, count: toDeduct });
      }
    });
    perCopy.push(Array.from(map.entries()).map(([id, qty]) => ({ id, qty })));
  }

  return { perCopy, remaining, shortfall };
}
