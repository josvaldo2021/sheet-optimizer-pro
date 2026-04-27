// CNC Cut Plan Engine — Barrel Re-export
// All public API is re-exported from submodules for backward compatibility.

export type { NodeType, TreeNode, Piece, PieceItem, OptimizationProgress, Lot, LotPieceEntry } from './engine/types';

export {
  createRoot,
  cloneTree,
  findNode,
  findParentOfType,
  insertNode,
  deleteNode,
  calcAllocation,
  calcPlacedArea,
  getLastLeftover,
  calcPlanUtilization,
  annotateTreeLabels,
  countAllocatedPieces,
} from './engine/tree-utils';

export { normalizeTree } from './engine/normalization';
export { optimizeV6, optimizeGeneticAsync, optimizeGeneticV1 } from './engine/engine-adapter';
