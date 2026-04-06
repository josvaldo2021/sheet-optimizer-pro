import { describe, it, expect } from 'vitest';
import { runPlacement } from '@/lib/engine/placement';
import { Piece } from '@/lib/engine/types';

describe('debug', () => {
  it('check placement with labels both orientations', () => {
    const pieces: Piece[] = [];
    for (let i = 0; i < 10; i++) pieces.push({ w: 917, h: 725, area: 917*725, label: 'TESTE' });
    pieces.push({ w: 459, h: 1000, area: 459*1000, label: 'TESTE' });
    
    // Sort by area desc (most common sort)
    const sorted = [...pieces].sort((a,b) => b.area - a.area);
    
    // Normal
    const r1 = runPlacement([...sorted], 3210, 2400, 0);
    console.log("Normal 3210x2400: placed area=", r1.area, "remaining=", r1.remaining.length);
    
    // Transposed
    const r2 = runPlacement([...sorted], 2400, 3210, 0);
    console.log("Transposed 2400x3210: placed area=", r2.area, "remaining=", r2.remaining.length);
    
    // Try rotated pieces
    const rotated = sorted.map(p => ({...p, w: p.h, h: p.w}));
    const r3 = runPlacement([...rotated], 3210, 2400, 0);
    console.log("Rotated Normal: placed area=", r3.area, "remaining=", r3.remaining.length);
    
    const r4 = runPlacement([...rotated], 2400, 3210, 0);
    console.log("Rotated Transposed: placed area=", r4.area, "remaining=", r4.remaining.length);
  });
});
