// CNC Cut Plan Engine — Type Definitions

export type NodeType = "ROOT" | "X" | "Y" | "Z" | "W" | "Q" | "R";

export interface TreeNode {
  id: string;
  tipo: NodeType;
  valor: number;
  multi: number;
  filhos: TreeNode[];
  label?: string;
  transposed?: boolean;
}

export interface Piece {
  w: number;
  h: number;
  area: number;
  /** number of original pieces combined into this Piece (1 by default) */
  count?: number;
  label?: string;
  /** Individual labels when grouping multiple pieces */
  labels?: string[];
  /** Axis along which pieces were grouped ("2d" = rectangular grid of identical pieces) */
  groupedAxis?: "w" | "h" | "2d";
  /** Individual dimensions of each piece in the group */
  individualDims?: number[];
}

export interface PieceItem {
  id: string;
  qty: number;
  w: number;
  h: number;
  label?: string;
  priority?: boolean;
  /**
   * Plan-layer flag (spec 009): when true, this inventory line is limited to at
   * most 1 piece per sheet ("não repetir na chapa"). Enforced by the multi-sheet
   * plan (see src/lib/unique-per-sheet.ts); the engine's placement logic ignores
   * it and it is stripped before the WASM boundary. Independent of `priority`
   * (which is a UI-level filter with different semantics).
   */
  uniquePerSheet?: boolean;
}

export interface OptimizationProgress {
  phase: string;
  current: number;
  total: number;
  bestSheets?: number;
  bestUtil?: number;
}

export interface LotPieceEntry {
  w: number;
  h: number;
  qty: number;
  label?: string;
}

export interface Lot {
  id: string;
  number: number;
  date: string; // ISO string
  chapas: Array<{ tree: TreeNode; usedArea: number }>;
  piecesUsed: LotPieceEntry[];
  sheetW: number;
  sheetH: number;
  totalSheets: number;
  /**
   * Contexto de renderização capturado quando o lote foi criado, para reexibir
   * os layouts fielmente (spec: visualizar layouts do lote). Opcional para
   * compatibilidade com lotes antigos — quando ausente, a UI usa as margens
   * atuais como fallback. `usableW/usableH` = área útil dentro das margens;
   * `ml/mb` = deslocamento das margens esquerda/inferior.
   */
  usableW?: number;
  usableH?: number;
  ml?: number;
  mb?: number;
}
