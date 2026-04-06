import { describe, it, expect } from 'vitest';
import { optimizeV6 } from '@/lib/engine/optimizer';
import { calcPlacedArea } from '@/lib/engine/tree-utils';
import { normalizeTree } from '@/lib/engine/normalization';
import { runPlacement } from '@/lib/engine/placement';
import { postOptimizeRegroup } from '@/lib/engine/post-processing';
import { getSortStrategies } from '@/lib/engine/optimizer';
import { Piece, TreeNode } from '@/lib/engine/types';

function countLeaves(node: TreeNode, parents: TreeNode[] = []): Array<{w:number,h:number}> {
  const used: Array<{w:number,h:number}> = [];
  if (!node) return used;
  const yAnc = [...parents].reverse().find(p => p.tipo === 'Y');
  const zAnc = [...parents].reverse().find(p => p.tipo === 'Z');
  const wAnc = [...parents].reverse().find(p => p.tipo === 'W');
  let pieceW = 0, pieceH = 0, isLeaf = false;
  const totalMulti = parents.reduce((m, p) => m * p.multi, 1) * node.multi;
  if (node.tipo === 'Z' && node.filhos.length === 0) { pieceW = node.valor; pieceH = yAnc?.valor || 0; isLeaf = true; }
  else if (node.tipo === 'W' && node.filhos.length === 0) { pieceW = zAnc?.valor || 0; pieceH = node.valor; isLeaf = true; }
  else if (node.tipo === 'Q') { pieceW = node.valor; pieceH = wAnc?.valor || 0; isLeaf = true; }
  if (isLeaf && pieceW > 0 && pieceH > 0) {
    for (let m = 0; m < totalMulti; m++) used.push({w: pieceW, h: pieceH});
  }
  if (node.filhos) node.filhos.forEach(f => used.push(...countLeaves(f, [...parents, node])));
  return used;
}

describe('debug with labels', () => {
  it('trace genetic pipeline', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917 * 725, label: 'TESTE' });
    pieces.push({ w: 459, h: 1000, area: 459 * 1000, label: 'TESTE' });
    
    // Step 1: V6
    const v6Result = optimizeV6(pieces, 3210, 2400, 0);
    const v6Leaves = countLeaves(v6Result.tree);
    console.log("V6 leaves:", v6Leaves.length, "remaining:", v6Result.remaining.length);
    console.log("V6 has 459x1000:", v6Leaves.some(l => (l.w===459&&l.h===1000)||(l.w===1000&&l.h===459)));
    
    // Step 2: V6 transposed
    const v6T = optimizeV6(pieces, 2400, 3210, 0);
    const v6TLeaves = countLeaves(v6T.tree);
    console.log("V6T leaves:", v6TLeaves.length, "remaining:", v6T.remaining.length);
    
    // Step 3: postOptimizeRegroup on V6 result
    const v6Area = calcPlacedArea(v6Result.tree);
    console.log("V6 area:", v6Area);
    const postResult = postOptimizeRegroup(
      v6Result.tree, v6Area, pieces, 3210, 2400, 0,
      getSortStrategies, runPlacement, normalizeTree
    );
    const postLeaves = countLeaves(postResult.tree);
    console.log("Post leaves:", postLeaves.length, "improved:", postResult.improved);
    console.log("Post has 459x1000:", postLeaves.some(l => (l.w===459&&l.h===1000)||(l.w===1000&&l.h===459)));
    
    expect(postLeaves.some(l => (l.w===459&&l.h===1000)||(l.w===1000&&l.h===459))).toBe(true);
  });
});
