import { describe, it, expect } from 'vitest';
import { optimizeV6 } from '@/lib/engine/optimizer';
import { Piece } from '@/lib/engine/types';

describe('debug', () => {
  it('V6 with labels should place all 11', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917*725, label: 'TESTE' });
    pieces.push({ w: 459, h: 1000, area: 459*1000, label: 'TESTE' });
    const r = optimizeV6(pieces, 3210, 2400, 0);
    console.log("Remaining:", r.remaining.length);
    expect(r.remaining.length).toBe(0);
  });
});
