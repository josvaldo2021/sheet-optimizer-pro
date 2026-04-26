// Quantity test: all 6 optimization sort variants must account for
// exactly the same total number of pieces as the input inventory (385 pieces).
// File: parts/test_quanty_parts.xlsx — Sheet: 6000x3210 (no margins)

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import { optimizeV6 } from '@/lib/engine/optimizer';
import { TreeNode, Piece } from '@/lib/engine/types';

// ── Types ─────────────────────────────────────────────────────────────────

interface PieceEntry {
  w: number;
  h: number;
  qty: number;
  label?: string;
}

// ── xlsx helpers ──────────────────────────────────────────────────────────

function getValue(row: any, names: string[]): number {
  const key = Object.keys(row).find((k) =>
    names.some((n) => k.toLowerCase().trim() === n.toLowerCase().trim()),
  );
  return Number(key ? row[key] : null) || 0;
}

function getString(row: any, names: string[]): string {
  const key = Object.keys(row).find((k) =>
    names.some((n) => k.toLowerCase().trim() === n.toLowerCase().trim()),
  );
  return key ? String(row[key] || '').trim() : '';
}

function loadPiecesFromXlsx(filePath: string): PieceEntry[] {
  const buffer = readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];

  return json
    .map((row) => ({
      qty: getValue(row, ['qtd', 'quantidade', 'qtde', 'qty', 'q']) || 1,
      w: getValue(row, ['largura', 'width', 'l', 'w']),
      h: getValue(row, ['altura', 'height', 'h']),
      label:
        getString(row, [
          'id', 'identificação', 'identificacao', 'nome', 'name',
          'código', 'codigo', 'cod', 'ref',
        ]) || undefined,
    }))
    .filter((p) => p.w > 0 && p.h > 0);
}

// ── Tree traversal ────────────────────────────────────────────────────────

// Mirrors extractUsedPiecesWithContext in Index.tsx (requires label — same as app).
function extractUsedPieces(tree: TreeNode): { w: number; h: number; label: string }[] {
  const out: { w: number; h: number; label: string }[] = [];

  function traverse(n: TreeNode, parents: TreeNode[], mult: number) {
    const totalMult = mult * n.multi;
    const rev = [...parents].reverse();
    const yAnc = rev.find((p) => p.tipo === 'Y');
    const zAnc = rev.find((p) => p.tipo === 'Z');
    const wAnc = rev.find((p) => p.tipo === 'W');
    const qAnc = rev.find((p) => p.tipo === 'Q');

    let pw = 0, ph = 0, isLeaf = false;

    if (n.tipo === 'Y' && n.filhos.length === 0) {
      const xAnc = rev.find((p) => p.tipo === 'X');
      const xVal = xAnc?.valor || 0;
      // After expandXMultiToZ, Y.multi > 1 means N identical columns were merged;
      // actual piece width = X.valor / Y.multi.
      pw = n.multi > 1 ? Math.round(xVal / n.multi) : xVal;
      ph = n.valor; isLeaf = true;
    } else if (n.tipo === 'Z' && n.filhos.length === 0) {
      pw = n.valor; ph = yAnc?.valor || 0; isLeaf = true;
    } else if (n.tipo === 'W' && n.filhos.length === 0) {
      pw = zAnc?.valor || 0; ph = n.valor; isLeaf = true;
    } else if (n.tipo === 'Q' && n.filhos.length === 0) {
      pw = n.valor; ph = wAnc?.valor || 0; isLeaf = true;
    } else if (n.tipo === 'R') {
      pw = qAnc?.valor || 0; ph = n.valor; isLeaf = true;
    }

    // Same label check as the app — pieces without label are skipped
    if (isLeaf && pw > 0 && ph > 0 && n.label) {
      for (let m = 0; m < totalMult; m++) out.push({ w: pw, h: ph, label: n.label });
    }

    n.filhos.forEach((f) => traverse(f, [...parents, n], totalMult));
  }

  traverse(tree, [], 1);
  return out;
}

// ── Multi-sheet simulation (mirrors runAllSheets in Index.tsx) ────────────

function runAllSheets(
  inventory: PieceEntry[],
  usableW: number,
  usableH: number,
): { totalPlaced: number; sheets: number } {
  const remaining = inventory.map((p) => ({ ...p }));
  let totalPlaced = 0;
  let sheets = 0;
  const totalPieces = inventory.reduce((s, p) => s + p.qty, 0);
  const maxSheets = Math.max(100, totalPieces * 2);

  while (remaining.length > 0 && sheets < maxSheets) {
    const inv: Piece[] = [];
    for (const p of remaining) {
      for (let i = 0; i < p.qty; i++) {
        inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: p.label });
      }
    }
    if (inv.length === 0) break;

    const result = optimizeV6(inv, usableW, usableH, 0);
    const usedPieces = extractUsedPieces(result.tree);

    if (usedPieces.length === 0) break;

    // ── Replication logic (same as app) ──────────────────────────────────
    const layoutBOM = new Map<string, { w: number; h: number; count: number }>();
    usedPieces.forEach((used) => {
      const key = `${Math.min(used.w, used.h)}x${Math.max(used.w, used.h)}`;
      const existing = layoutBOM.get(key);
      if (existing) {
        existing.count++;
      } else {
        layoutBOM.set(key, { w: used.w, h: used.h, count: 1 });
      }
    });

    let maxReplications = Infinity;
    layoutBOM.forEach(({ w, h, count }) => {
      let available = 0;
      remaining.forEach((p) => {
        if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) available += p.qty;
      });
      const additionalAvailable = available - count;
      const possibleCopies = Math.floor(additionalAvailable / count);
      maxReplications = Math.min(maxReplications, possibleCopies);
    });
    if (!isFinite(maxReplications) || maxReplications < 0) maxReplications = 0;
    maxReplications = Math.min(maxReplications, maxSheets - sheets - 1);

    // Deduct first sheet
    usedPieces.forEach((used) => {
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i];
        if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
          p.qty--;
          if (p.qty <= 0) remaining.splice(i, 1);
          break;
        }
      }
    });
    totalPlaced += usedPieces.length;
    sheets++;

    // Deduct replications
    for (let rep = 0; rep < maxReplications; rep++) {
      layoutBOM.forEach(({ w, h, count }) => {
        let toDeduct = count;
        for (let i = 0; i < remaining.length && toDeduct > 0; i++) {
          const p = remaining[i];
          if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) {
            const deducted = Math.min(toDeduct, p.qty);
            p.qty -= deducted;
            toDeduct -= deducted;
            if (p.qty <= 0) { remaining.splice(i, 1); i--; }
          }
        }
      });
      totalPlaced += usedPieces.length;
      sheets++;
    }
  }

  return { totalPlaced, sheets };
}

// ── Sort variants (same as optimizeAllSheets in Index.tsx) ────────────────

const SORT_VARIANTS: Array<{
  label: string;
  fn?: (a: PieceEntry, b: PieceEntry) => number;
}> = [
  { label: 'ordem original',  fn: undefined },
  { label: 'área desc',       fn: (a, b) => b.w * b.h - a.w * a.h },
  { label: 'área asc',        fn: (a, b) => a.w * a.h - b.w * b.h },
  { label: 'maior dim desc',  fn: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) },
  { label: 'perímetro desc',  fn: (a, b) => b.w + b.h - (a.w + a.h) },
  { label: 'altura desc',     fn: (a, b) => b.h - a.h },
];

// ── Test ──────────────────────────────────────────────────────────────────

describe('Quantity test — 6 optimization groups', () => {
  const USABLE_W = 6000;
  const USABLE_H = 3210;
  const EXPECTED_TOTAL = 385;

  let basePieces: PieceEntry[] = [];

  beforeAll(() => {
    const filePath = resolve(process.cwd(), 'parts/test_quanty_parts.xlsx');
    basePieces = loadPiecesFromXlsx(filePath);
  });

  it('arquivo deve conter exatamente 385 peças no inventário', () => {
    const total = basePieces.reduce((s, p) => s + p.qty, 0);
    expect(total).toBe(EXPECTED_TOTAL);
  });

  for (let vi = 0; vi < SORT_VARIANTS.length; vi++) {
    const { label, fn } = SORT_VARIANTS[vi];

    it(`Grupo ${vi + 1} (${label}): deve colocar exatamente ${EXPECTED_TOTAL} peças`, () => {
      const inventory = fn ? [...basePieces].sort(fn) : [...basePieces];
      const { totalPlaced, sheets } = runAllSheets(inventory, USABLE_W, USABLE_H);

      console.log(`  Grupo ${vi + 1} [${label}]: ${totalPlaced} peças em ${sheets} chapa(s)`);

      expect(totalPlaced).toBe(EXPECTED_TOTAL);
    }, 120_000);
  }

  it('todos os grupos devem retornar o mesmo total de peças', () => {
    const counts: number[] = [];

    for (const { fn } of SORT_VARIANTS) {
      const inventory = fn ? [...basePieces].sort(fn) : [...basePieces];
      const { totalPlaced } = runAllSheets(inventory, USABLE_W, USABLE_H);
      counts.push(totalPlaced);
    }

    console.log('  Totais por grupo:', counts.join(', '));

    const first = counts[0];
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `Grupo ${i + 1} diverge do Grupo 1`).toBe(first);
    }
  }, 600_000);
});
