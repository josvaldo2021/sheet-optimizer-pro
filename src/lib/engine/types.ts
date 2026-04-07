// CNC Cut Plan Engine — Type Definitions

export type NodeType = "ROOT" | "X" | "Y" | "Z" | "W" | "Q";

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
  /** Axis along which pieces were grouped */
  groupedAxis?: "w" | "h";
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
}

export interface OptimizationProgress {
  phase: string;
  current: number;
  total: number;
  bestSheets?: number;
  bestUtil?: number;
  /** The best tree found so far (for live preview) */
  bestTree?: TreeNode;
}
