import { describe, it, expect } from 'vitest';
import { optimizeV6 } from '@/lib/engine/optimizer';
import { calcPlacedArea } from '@/lib/engine/tree-utils';
import { Piece, TreeNode } from '@/lib/engine/types';

function printTree(node: any, indent = 0) {
  if (!node) return;
  const prefix = '  '.repeat(indent);
  const label = node.label ? ` [${node.label}]` : '';
  const tr = node.transposed ? ' (T)' : '';
  console.log(`${prefix}${node.tipo} ${node.valor} x${node.multi}${label}${tr}`);
  if (node.filhos) for (const c of node.filhos) printTree(c, indent + 1);
}

describe('debug', () => {
  it('V6 normal vs transposed', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917 * 725, label: 'TESTE' });
    pieces.push({ w: 459, h: 1000, area: 459 * 1000, label: 'TESTE' });
    
    // Normal (not transposed internally)
    const r1 = optimizeV6(pieces, 3210, 2400, 0);
    console.log("=== V6 NORMAL ===");
    console.log("Remaining:", r1.remaining.length);
    console.log("calcPlacedArea:", calcPlacedArea(r1.tree));
    printTree(r1.tree);
    
    // Use useGrouping=false to test only basic variants like genetic does
    const r2 = optimizeV6(pieces, 3210, 2400, 0, false);
    console.log("\n=== V6 NO GROUPING ===");
    console.log("Remaining:", r2.remaining.length);
    console.log("calcPlacedArea:", calcPlacedArea(r2.tree));
    printTree(r2.tree);
  });
});
