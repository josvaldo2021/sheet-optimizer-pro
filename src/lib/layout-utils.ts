import { TreeNode } from './cnc-engine';

/**
 * Serialize a tree to a canonical string for comparison.
 * Two trees with the same structure and values will produce the same string.
 */
function serializeTree(node: TreeNode): string {
  const children = node.filhos
    .map(serializeTree)
    .sort() // sort for canonical ordering
    .join(',');
  return `${node.tipo}:${node.valor}:${node.multi}[${children}]`;
}

export interface LayoutGroup {
  tree: TreeNode;
  usedArea: number;
  count: number;
  /** Original indices in the full chapas array */
  indices: number[];
}

/**
 * Group identical layouts together.
 * Returns deduplicated groups with a count of how many times each appears.
 */
export function groupIdenticalLayouts(
  chapas: Array<{ tree: TreeNode; usedArea: number }>
): LayoutGroup[] {
  const groups: LayoutGroup[] = [];
  const seen = new Map<string, number>(); // serialized -> group index

  chapas.forEach((chapa, idx) => {
    const key = serializeTree(chapa.tree);
    const existingIdx = seen.get(key);

    if (existingIdx !== undefined) {
      groups[existingIdx].count++;
      groups[existingIdx].indices.push(idx);
    } else {
      seen.set(key, groups.length);
      groups.push({
        tree: chapa.tree,
        usedArea: chapa.usedArea,
        count: 1,
        indices: [idx],
      });
    }
  });

  return groups;
}
