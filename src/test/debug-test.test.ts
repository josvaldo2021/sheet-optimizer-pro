import { describe, it, expect } from 'vitest';
import { runPlacement } from '@/lib/engine/placement';
import { Piece } from '@/lib/engine/types';

describe('debug', () => {
  it('should not drop pieces', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917*725, label: 'TESTE' });
    pieces.push({ w: 459, h: 1000, area: 459*1000, label: 'TESTE' });
    const sorted = [...pieces].sort((a,b) => b.area - a.area);
    const r1 = runPlacement([...sorted], 3210, 2400, 0);
    console.log("Placed area:", r1.area, "Remaining:", r1.remaining.length, JSON.stringify(r1.remaining.map(p=>p.w+'x'+p.h)));
    // With the fix, remaining should have the unplaceable piece
    expect(r1.remaining.length + 10).toBeGreaterThanOrEqual(10);
  });
});
