import { describe, it, expect } from 'vitest';
import { optimizeV6 } from '@/lib/engine/optimizer';
import { calcPlacedArea } from '@/lib/engine/tree-utils';
import { Piece } from '@/lib/engine/types';

function printTree(node: any, indent = 0) {
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}${node.tipo} ${node.valor} x${node.multi}`);
  for (const c of node.filhos) printTree(c, indent + 1);
}

describe('debug', () => {
  it('3210x2400 no margins', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917 * 725 });
    pieces.push({ w: 459, h: 1000, area: 459 * 1000 });
    const result = optimizeV6(pieces, 3210, 2400, 0);
    console.log("Remaining:", result.remaining.length);
    printTree(result.tree);
    expect(result.remaining.length).toBe(0);
  });

  it('3190x2380 with default margins', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917 * 725 });
    pieces.push({ w: 459, h: 1000, area: 459 * 1000 });
    const result = optimizeV6(pieces, 3190, 2380, 0);
    console.log("Remaining:", result.remaining.length, JSON.stringify(result.remaining));
    printTree(result.tree);
  });
});
