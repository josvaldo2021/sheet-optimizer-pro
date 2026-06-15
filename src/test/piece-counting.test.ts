import { describe, it, expect } from 'vitest';
import { TreeNode } from '../lib/engine/types';
import { countAllocatedPieces } from '../lib/engine/tree-utils';

describe('countAllocatedPieces', () => {
  it('should return 0 for safe nodes without labels', () => {
    const node: TreeNode = { id: '1', tipo: 'Z', valor: 100, multi: 1, filhos: [] };
    expect(countAllocatedPieces(node)).toBe(0);
  });

  it('should count a single labeled piece', () => {
    const node: TreeNode = { id: '1', tipo: 'Z', valor: 100, multi: 1, filhos: [], label: 'A' };
    expect(countAllocatedPieces(node)).toBe(1);
  });

  it('should account for node multiplier on leaf pieces', () => {
    const node: TreeNode = { id: '1', tipo: 'Z', valor: 100, multi: 5, filhos: [], label: 'A' };
    expect(countAllocatedPieces(node)).toBe(5);
  });

  it('should account for nested multipliers', () => {
    // ROOT -> X(2) -> Y(3) -> Z(4, label A)
    const z: TreeNode = { id: 'z', tipo: 'Z', valor: 100, multi: 4, filhos: [], label: 'A' };
    const y: TreeNode = { id: 'y', tipo: 'Y', valor: 100, multi: 3, filhos: [z] };
    const x: TreeNode = { id: 'x', tipo: 'X', valor: 100, multi: 2, filhos: [y] };
    const root: TreeNode = { id: 'root', tipo: 'ROOT', valor: 1000, multi: 1, filhos: [x] };

    expect(countAllocatedPieces(root)).toBe(2 * 3 * 4); // 24
  });

  it('should sum multiple branches correctly', () => {
    // X -> Y1(2, Z1(3, label A)), Y2(1, Z2(5, label B))
    const z1: TreeNode = { id: 'z1', tipo: 'Z', valor: 100, multi: 3, filhos: [], label: 'A' };
    const y1: TreeNode = { id: 'y1', tipo: 'Y', valor: 100, multi: 2, filhos: [z1] };
    const z2: TreeNode = { id: 'z2', tipo: 'Z', valor: 100, multi: 5, filhos: [], label: 'B' };
    const y2: TreeNode = { id: 'y2', tipo: 'Y', valor: 100, multi: 1, filhos: [z2] };
    const x: TreeNode = { id: 'x', tipo: 'X', valor: 100, multi: 1, filhos: [y1, y2] };

    // (3 * 2) + (5 * 1) = 6 + 5 = 11
    expect(countAllocatedPieces(x)).toBe(11);
  });
});
