// Seleção de chapas e dedução de inventário ao confirmar um plano.
//
// Funções puras e agnósticas de UI (Constituição, Artigo II): recebem dados e
// retornam dados, para serem testadas de forma determinística (Artigo V).

export interface ChapaSelectable {
  manual?: boolean;
  /** marcada para entrar no próximo lote (default: NÃO marcada) */
  selected?: boolean;
  /** peças consumidas pela chapa, por PieceItem.id, registradas na geração */
  deductions?: Array<{ id: string; qty: number }>;
}

export interface DeductiblePiece {
  id: string;
  qty: number;
}

/** Uma chapa entra no lote quando é automática (não confirmada) e foi marcada. */
export function isSelectedAuto(chapa: ChapaSelectable): boolean {
  return !chapa.manual && chapa.selected === true;
}

/** Chapas automáticas atualmente marcadas para o lote. */
export function selectedAutoChapas<T extends ChapaSelectable>(chapas: T[]): T[] {
  return chapas.filter(isSelectedAuto);
}

/** Total de chapas automáticas (confirmáveis), marcadas ou não. */
export function countAuto(chapas: ChapaSelectable[]): number {
  return chapas.filter((c) => !c.manual).length;
}

/** Quantas chapas automáticas estão marcadas. */
export function countSelectedAuto(chapas: ChapaSelectable[]): number {
  return chapas.filter(isSelectedAuto).length;
}

/**
 * Aplica as deduções das chapas informadas a uma cópia do inventário.
 * Não remove peças zeradas — isso fica a cargo do chamador (ex.: filtrar qty>0).
 */
export function applyDeductions<P extends DeductiblePiece>(
  pieces: P[],
  chapas: ChapaSelectable[],
): P[] {
  const updated = pieces.map((p) => ({ ...p }));
  chapas.forEach((chapa) => {
    chapa.deductions?.forEach(({ id, qty }) => {
      const p = updated.find((x) => x.id === id);
      if (p) p.qty -= qty;
    });
  });
  return updated;
}
