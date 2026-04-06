import { describe, it, expect } from 'vitest';
import { optimizeV6 } from '../src/lib/engine/optimizer';
import { calcPlacedArea } from '../src/lib/engine/tree-utils';
import { Piece } from '../src/lib/engine/types';

describe('debug', () => {
  it('should place 459x1000 with 10x 917x725 on 3210x2400', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) {
      pieces.push({ w: 917, h: 725, area: 917 * 725 });
    }
    pieces.push({ w: 459, h: 1000, area: 459 * 1000 });

    const result = optimizeV6(pieces, 3210, 2400, 0);
    
    console.log("Remaining:", result.remaining.length, JSON.stringify(result.remaining));
    
    function printTree(node: any, indent = 0) {
      const prefix = '  '.repeat(indent);
      const label = node.label ? ` [${node.label}]` : '';
      console.log(`${prefix}${node.tipo} ${node.valor} x${node.multi}${label}`);
      for (const c of node.filhos) printTree(c, indent + 1);
    }
    printTree(result.tree);
    
    expect(result.remaining.length).toBe(0);
  });
});
