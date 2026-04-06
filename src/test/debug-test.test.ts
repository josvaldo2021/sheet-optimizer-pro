import { describe, it, expect } from 'vitest';
import { optimizeV6 } from '@/lib/engine/optimizer';
import { optimizeGeneticAsync } from '@/lib/engine/genetic';
import { calcPlacedArea } from '@/lib/engine/tree-utils';
import { Piece, TreeNode } from '@/lib/engine/types';

function countLeaves(node: TreeNode, parents: TreeNode[] = []): Array<{w:number,h:number}> {
  const used: Array<{w:number,h:number}> = [];
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
  node.filhos.forEach(f => used.push(...countLeaves(f, [...parents, node])));
  return used;
}

function printTree(node: any, indent = 0) {
  const prefix = '  '.repeat(indent);
  const label = node.label ? ` [${node.label}]` : '';
  console.log(`${prefix}${node.tipo} ${node.valor} x${node.multi}${label}`);
  for (const c of node.filhos) printTree(c, indent + 1);
}

describe('debug with labels', () => {
  it('V6 with labels should place all 11 pieces', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917 * 725, label: 'TESTE' });
    pieces.push({ w: 459, h: 1000, area: 459 * 1000, label: 'TESTE' });
    const result = optimizeV6(pieces, 3210, 2400, 0);
    console.log("V6 Remaining:", result.remaining.length, JSON.stringify(result.remaining));
    printTree(result.tree);
  });

  it('genetic with labels should place all 11 pieces', async () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917 * 725, label: 'TESTE' });
    pieces.push({ w: 459, h: 1000, area: 459 * 1000, label: 'TESTE' });
    const result = await optimizeGeneticAsync(pieces, 3210, 2400, 0, undefined, undefined, 10, 5);
    const leaves = countLeaves(result);
    console.log("Genetic leaves:", leaves.length);
    const has459 = leaves.some(l => (l.w === 459 && l.h === 1000) || (l.w === 1000 && l.h === 459));
    console.log("Has 459x1000:", has459);
    printTree(result.tree);
    expect(has459).toBe(true);
  }, 30000);
});
