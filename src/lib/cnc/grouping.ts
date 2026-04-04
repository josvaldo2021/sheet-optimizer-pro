// CNC Cut Plan — piece grouping strategies

import { Piece } from "./types";

// ========== HELPERS ==========

/**
 * REGRA ABSOLUTA: A peça com maior área INDIVIDUAL sempre inicia o layout (índice 0).
 * Grupos nunca podem ultrapassar uma peça individual grande.
 * Chamada após qualquer ordenação para garantir a regra.
 */
export function ensureLargestIndividualFirst(pieces: Piece[]): Piece[] {
  if (pieces.length <= 1) return pieces;

  let bestIdx = -1;
  let bestArea = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const isIndividual = !p.count || p.count === 1;
    if (isIndividual) {
      const area = p.w * p.h;
      if (area > bestArea) {
        bestArea = area;
        bestIdx = i;
      }
    }
  }

  if (bestIdx > 0) {
    const largest = pieces[bestIdx];
    pieces.splice(bestIdx, 1);
    pieces.unshift(largest);
  }

  return pieces;
}

// ========== IMPROVED GROUPING ALGORITHMS ==========

/**
 * AGRUPAMENTO POR MESMA LARGURA EM X (Estratégia Principal)
 *
 * Peças com a mesma largura (W) são empilhadas verticalmente numa única coluna X.
 * Cada peça individual vira um Y strip separado dentro dessa coluna.
 * Isso espelha o comportamento do comando manual m4x818 (1 coluna X, N faixas Y).
 *
 * @param maxH - Altura máxima da chapa. Limita a soma das alturas do grupo.
 */
export function groupPiecesBySameWidth(pieces: Piece[], maxH: number = Infinity): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
  }));

  const widthGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!widthGroups.has(p.nw)) widthGroups.set(p.nw, []);
    widthGroups.get(p.nw)!.push(p);
  });

  const result: Piece[] = [];

  widthGroups.forEach((group, w) => {
    const sorted = [...group].sort((a, b) => b.nh - a.nh);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const stack: typeof remaining = [];
      let stackHeight = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (stackHeight + remaining[i].nh <= maxH) {
          stack.push(remaining[i]);
          stackHeight += remaining[i].nh;
        }
      }

      if (stack.length >= 2) {
        const groupedLabels: string[] = [];
        stack.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        const individualArea = w * stack[0].nh;
        result.push({
          w,
          h: stackHeight,
          area: individualArea,
          count: stack.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "h",
          individualDims: stack.map(p => p.nh),
        });

        for (const used of stack) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const wA = a.count && a.count > 1 ? a.w : Math.max(a.w, a.h);
    const wB = b.count && b.count > 1 ? b.w : Math.max(b.w, b.h);
    return wB - wA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * AGRUPAMENTO POR MESMA ALTURA EM Y (Estratégia Complementar)
 * Peças com a mesma altura são colocadas lado a lado, somando larguras.
 */
export function groupPiecesBySameHeight(pieces: Piece[], maxW: number = Infinity): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: Math.max(p.w, p.h),
    nh: Math.min(p.w, p.h),
  }));

  const heightGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!heightGroups.has(p.nh)) heightGroups.set(p.nh, []);
    heightGroups.get(p.nh)!.push(p);
  });

  const result: Piece[] = [];

  heightGroups.forEach((group, h) => {
    const sorted = [...group].sort((a, b) => b.nw - a.nw);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const row: typeof remaining = [];
      let rowWidth = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (rowWidth + remaining[i].nw <= maxW) {
          row.push(remaining[i]);
          rowWidth += remaining[i].nw;
        }
      }

      if (row.length >= 2) {
        const groupedLabels: string[] = [];
        row.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        const individualArea = row[0].nw * h;
        result.push({
          w: rowWidth,
          h,
          area: individualArea,
          count: row.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "w",
          individualDims: row.map(p => p.nw),
        });

        for (const used of row) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const hA = a.count && a.count > 1 ? a.h : Math.min(a.w, a.h);
    const hB = b.count && b.count > 1 ? b.h : Math.min(b.w, b.h);
    return hB - hA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

// Backward-compatible aliases used by other grouping strategies
export function groupPiecesByHeight(pieces: Piece[]): Piece[] {
  return groupPiecesBySameHeight(pieces);
}
export function groupPiecesByWidth(pieces: Piece[]): Piece[] {
  return groupPiecesBySameWidth(pieces);
}

/**
 * FILL-ROW: Agrupa peças de mesma altura para preencher a largura total da chapa.
 * Sem limite de quantidade — empacota o máximo possível em cada "fila".
 *
 * @param raw - Se true, usa as dimensões originais (w,h) sem normalizar.
 */
export function groupPiecesFillRow(pieces: Piece[], usableW: number, raw: boolean = false): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: raw ? p.w : Math.max(p.w, p.h),
    nh: raw ? p.h : Math.min(p.w, p.h),
  }));

  const heightGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!heightGroups.has(p.nh)) heightGroups.set(p.nh, []);
    heightGroups.get(p.nh)!.push(p);
  });

  const result: Piece[] = [];

  heightGroups.forEach((group, h) => {
    const sorted = [...group].sort((a, b) => b.nw - a.nw);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const row: typeof remaining = [];
      let rowWidth = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (rowWidth + remaining[i].nw <= usableW) {
          row.push(remaining[i]);
          rowWidth += remaining[i].nw;
        }
      }

      if (row.length >= 2) {
        const groupedLabels: string[] = [];
        row.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        const individualArea = row[0].nw * h;
        result.push({
          w: rowWidth,
          h,
          area: individualArea,
          count: row.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "w",
          individualDims: row.map(p => p.nw),
        });

        for (const used of row) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const hA = a.count && a.count > 1 ? a.h : Math.min(a.w, a.h);
    const hB = b.count && b.count > 1 ? b.h : Math.min(b.w, b.h);
    return hB - hA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * FILL-COL: Agrupa peças de mesma largura para preencher a altura total da chapa.
 *
 * @param raw - Se true, usa as dimensões originais (w,h) sem normalizar.
 */
export function groupPiecesFillCol(pieces: Piece[], usableH: number, raw: boolean = false): Piece[] {
  const normalized = pieces.map((p) => ({
    ...p,
    nw: raw ? p.w : Math.max(p.w, p.h),
    nh: raw ? p.h : Math.min(p.w, p.h),
  }));

  const widthGroups = new Map<number, typeof normalized>();
  normalized.forEach((p) => {
    if (!widthGroups.has(p.nw)) widthGroups.set(p.nw, []);
    widthGroups.get(p.nw)!.push(p);
  });

  const result: Piece[] = [];

  widthGroups.forEach((group, w) => {
    const sorted = [...group].sort((a, b) => b.nh - a.nh);
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const col: typeof remaining = [];
      let colHeight = 0;

      for (let i = 0; i < remaining.length; i++) {
        if (colHeight + remaining[i].nh <= usableH) {
          col.push(remaining[i]);
          colHeight += remaining[i].nh;
        }
      }

      if (col.length >= 2) {
        const groupedLabels: string[] = [];
        col.forEach((p) => {
          if (p.label) groupedLabels.push(p.label);
        });

        const individualArea = w * col[0].nh;
        result.push({
          w,
          h: colHeight,
          area: individualArea,
          count: col.length,
          labels: groupedLabels.length > 0 ? groupedLabels : undefined,
          groupedAxis: "h",
          individualDims: col.map(p => p.nh),
        });

        for (const used of col) {
          const idx = remaining.indexOf(used);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      } else {
        const p = remaining.shift()!;
        result.push({
          w: p.nw,
          h: p.nh,
          area: p.nw * p.nh,
          count: 1,
          label: p.label,
        });
      }
    }
  });

  result.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const wA = a.count && a.count > 1 ? a.w : Math.max(a.w, a.h);
    const wB = b.count && b.count > 1 ? b.w : Math.max(b.w, b.h);
    return wB - wA;
  });

  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * COLUMN-WIDTH MAXIMIZING: Groups pieces by height, then sorts so widest grouped pieces come first.
 */
export function groupPiecesColumnWidth(pieces: Piece[], usableW: number): Piece[] {
  const grouped = groupPiecesByHeight(pieces);

  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (aIsGrouped && bIsGrouped) return b.w - a.w || b.h - a.h;
    if (aIsGrouped && !bIsGrouped) return -1;
    if (!aIsGrouped && bIsGrouped) return 1;
    return 0;
  });

  const filtered = grouped.filter((p) => p.w <= usableW);
  ensureLargestIndividualFirst(filtered);
  return filtered;
}

/**
 * BAND-FIRST: Groups pieces by height using fill-row, then sorts widest bands first.
 */
export function groupPiecesBandFirst(pieces: Piece[], usableW: number, raw: boolean = false): Piece[] {
  const grouped = groupPiecesFillRow(pieces, usableW, raw);

  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (aIsGrouped && bIsGrouped) return b.w - a.w || b.h - a.h;
    if (aIsGrouped && !bIsGrouped) return -1;
    if (!aIsGrouped && bIsGrouped) return 1;
    return 0;
  });

  ensureLargestIndividualFirst(grouped);
  return grouped;
}

/**
 * BAND-LAST: Same as band-first but groups go LAST (placed at the bottom).
 */
export function groupPiecesBandLast(pieces: Piece[], usableW: number, raw: boolean = false): Piece[] {
  const grouped = groupPiecesFillRow(pieces, usableW, raw);

  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (!aIsGrouped && bIsGrouped) return -1;
    if (aIsGrouped && !bIsGrouped) return 1;
    if (aIsGrouped && bIsGrouped) return b.w - a.w || b.h - a.h;
    return 0;
  });

  ensureLargestIndividualFirst(grouped);
  return grouped;
}

/**
 * Same as groupPiecesColumnWidth but groups by width (sum heights).
 */
export function groupPiecesColumnHeight(pieces: Piece[], usableH: number): Piece[] {
  const grouped = groupPiecesByWidth(pieces);

  grouped.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    const aIsGrouped = (a.count || 1) > 1;
    const bIsGrouped = (b.count || 1) > 1;
    if (aIsGrouped && bIsGrouped) return b.h - a.h || b.w - a.w;
    if (aIsGrouped && !bIsGrouped) return -1;
    if (!aIsGrouped && bIsGrouped) return 1;
    return 0;
  });

  const filtered = grouped.filter((p) => p.h <= usableH);
  ensureLargestIndividualFirst(filtered);
  return filtered;
}

// ========== GROUP BY COMMON DIMENSION ==========

/**
 * AGRUPAMENTO POR DIMENSÃO COMUM
 *
 * Detecta a dimensão mais frequente entre todas as peças.
 * Orienta todas as peças para que a dimensão comum seja a altura.
 * Empacota peças lado a lado usando BFD.
 *
 * @param threshold - Fração mínima de peças que devem compartilhar a dimensão (default 0.4 = 40%)
 */
export function groupByCommonDimension(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  threshold: number = 0.4,
): Piece[] {
  if (pieces.length < 2) return pieces;

  const dimCount = new Map<number, number>();
  for (const p of pieces) {
    dimCount.set(p.w, (dimCount.get(p.w) || 0) + 1);
    if (p.h !== p.w) {
      dimCount.set(p.h, (dimCount.get(p.h) || 0) + 1);
    }
  }

  let bestDim = 0, bestCount = 0;
  for (const [dim, count] of dimCount) {
    if (count > bestCount) { bestCount = count; bestDim = dim; }
  }

  if (bestCount < Math.max(2, Math.floor(pieces.length * threshold))) return pieces;

  const oriented: Array<Piece & { origW: number }> = [];
  const others: Piece[] = [];
  for (const p of pieces) {
    if (p.h === bestDim) {
      oriented.push({ ...p, origW: p.w });
    } else if (p.w === bestDim) {
      oriented.push({ ...p, w: p.h, h: p.w, origW: p.h });
    } else {
      others.push(p);
    }
  }

  oriented.sort((a, b) => b.origW - a.origW);

  const rows: Array<typeof oriented> = [];
  const rowWidths: number[] = [];

  for (const p of oriented) {
    let bestRowIdx = -1;
    let bestRemaining = Infinity;
    for (let r = 0; r < rows.length; r++) {
      const remaining = usableW - rowWidths[r];
      if (p.origW <= remaining && remaining < bestRemaining) {
        bestRemaining = remaining;
        bestRowIdx = r;
      }
    }

    if (bestRowIdx >= 0) {
      rows[bestRowIdx].push(p);
      rowWidths[bestRowIdx] += p.origW;
    } else {
      rows.push([p]);
      rowWidths.push(p.origW);
    }
  }

  const result: Piece[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].length >= 2) {
      const groupLabels = rows[r].filter(p => p.label).map(p => p.label!);
      result.push({
        w: rowWidths[r],
        h: bestDim,
        area: rows[r][0].origW * bestDim,
        count: rows[r].length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "w",
        individualDims: rows[r].map(p => p.origW),
      });
    } else {
      const p = rows[r][0];
      result.push({
        w: p.origW,
        h: bestDim,
        area: p.origW * bestDim,
        count: 1,
        label: p.label,
      });
    }
  }

  result.push(...others);
  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * Variante com orientação invertida: a dimensão comum vira a LARGURA (não a altura).
 */
export function groupByCommonDimensionTransposed(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  threshold: number = 0.4,
): Piece[] {
  if (pieces.length < 2) return pieces;

  const dimCount = new Map<number, number>();
  for (const p of pieces) {
    dimCount.set(p.w, (dimCount.get(p.w) || 0) + 1);
    if (p.h !== p.w) dimCount.set(p.h, (dimCount.get(p.h) || 0) + 1);
  }

  let bestDim = 0, bestCount = 0;
  for (const [dim, count] of dimCount) {
    if (count > bestCount) { bestCount = count; bestDim = dim; }
  }

  if (bestCount < Math.max(2, Math.floor(pieces.length * threshold))) return pieces;

  const oriented: Array<Piece & { origH: number }> = [];
  const others: Piece[] = [];
  for (const p of pieces) {
    if (p.w === bestDim) {
      oriented.push({ ...p, origH: p.h });
    } else if (p.h === bestDim) {
      oriented.push({ ...p, w: p.h, h: p.w, origH: p.w });
    } else {
      others.push(p);
    }
  }

  oriented.sort((a, b) => b.origH - a.origH);

  const cols: Array<typeof oriented> = [];
  const colHeights: number[] = [];

  for (const p of oriented) {
    let bestColIdx = -1;
    let bestRemaining = Infinity;
    for (let c = 0; c < cols.length; c++) {
      const rem = usableH - colHeights[c];
      if (p.origH <= rem && rem < bestRemaining) {
        bestRemaining = rem;
        bestColIdx = c;
      }
    }
    if (bestColIdx >= 0) {
      cols[bestColIdx].push(p);
      colHeights[bestColIdx] += p.origH;
    } else {
      cols.push([p]);
      colHeights.push(p.origH);
    }
  }

  const result: Piece[] = [];
  for (let c = 0; c < cols.length; c++) {
    if (cols[c].length >= 2) {
      const groupLabels = cols[c].filter(p => p.label).map(p => p.label!);
      result.push({
        w: bestDim,
        h: colHeights[c],
        area: bestDim * cols[c][0].origH,
        count: cols[c].length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "h",
        individualDims: cols[c].map(p => p.origH),
      });
    } else {
      const p = cols[c][0];
      result.push({
        w: bestDim,
        h: p.origH,
        area: bestDim * p.origH,
        count: 1,
        label: p.label,
      });
    }
  }

  result.push(...others);
  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

// ========== KNAPSACK DP UTILITIES ==========

/**
 * 0-1 Knapsack: seleciona subconjunto de itens que maximiza o preenchimento
 * sem exceder a capacidade.
 */
export function knapsackSelectItems(weights: number[], capacity: number): number[] {
  const n = weights.length;
  const cap = Math.floor(capacity);
  if (cap <= 0 || n === 0) return [];

  const scale = cap > 10000 ? Math.ceil(cap / 10000) : 1;
  const scaledCap = Math.floor(cap / scale);
  const scaledWeights = weights.map(w => Math.floor(w / scale));

  const dp = new Float64Array(scaledCap + 1);
  const keep = new Uint8Array(n * (scaledCap + 1));

  for (let i = 0; i < n; i++) {
    const w = scaledWeights[i];
    if (w <= 0 || w > scaledCap) continue;
    for (let j = scaledCap; j >= w; j--) {
      const newVal = dp[j - w] + weights[i];
      if (newVal > dp[j]) {
        dp[j] = newVal;
        keep[i * (scaledCap + 1) + j] = 1;
      }
    }
  }

  const result: number[] = [];
  let j = scaledCap;
  for (let i = n - 1; i >= 0; i--) {
    if (j >= 0 && keep[i * (scaledCap + 1) + j]) {
      result.push(i);
      j -= scaledWeights[i];
    }
  }

  return result;
}

// ========== STRIP PACKING COM DP ==========

/**
 * STRIP PACKING COM PROGRAMAÇÃO DINÂMICA
 *
 * @param tolerance - tolerância em mm para agrupar alturas similares (default 5mm)
 * @param orient - "auto" normaliza w>h, "raw" usa dimensões originais
 */
export function groupStripPackingDP(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  tolerance: number = 5,
  orient: "auto" | "raw" = "auto",
): Piece[] {
  if (pieces.length < 2) return pieces;

  const normalized = pieces.map((p, idx) => ({
    ...p,
    nw: orient === "raw" ? p.w : Math.max(p.w, p.h),
    nh: orient === "raw" ? p.h : Math.min(p.w, p.h),
    origIdx: idx,
  }));

  const sorted = [...normalized].sort((a, b) => a.nh - b.nh);

  const heightGroups: (typeof sorted)[] = [];
  let currentGroup: typeof sorted = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].nh - currentGroup[0].nh <= tolerance) {
      currentGroup.push(sorted[i]);
    } else {
      heightGroups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  heightGroups.push(currentGroup);

  const strips: Array<{
    height: number;
    totalWidth: number;
    pieces: typeof sorted;
  }> = [];

  const unassigned: typeof sorted = [];

  for (const group of heightGroups) {
    if (group.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const stripHeight = Math.max(...group.map(p => p.nh));
    const widths = group.map(p => p.nw);

    const selected = knapsackSelectItems(widths, usableW);

    if (selected.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const selectedPieces = selected.map(i => group[i]);
    const totalWidth = selected.reduce((sum, i) => sum + widths[i], 0);

    strips.push({ height: stripHeight, totalWidth, pieces: selectedPieces });

    const selectedSet = new Set(selected);
    for (let i = 0; i < group.length; i++) {
      if (!selectedSet.has(i)) unassigned.push(group[i]);
    }
  }

  if (strips.length === 0) return pieces;

  const stripHeights = strips.map(s => s.height);
  const selectedStrips = knapsackSelectItems(stripHeights, usableH);

  const result: Piece[] = [];
  const usedStripSet = new Set(selectedStrips);

  for (const si of selectedStrips) {
    const strip = strips[si];
    if (strip.pieces.length >= 2) {
      const groupLabels = strip.pieces.filter(p => p.label).map(p => p.label!);
      result.push({
        w: strip.totalWidth,
        h: strip.height,
        area: strip.pieces[0].nw * strip.height,
        count: strip.pieces.length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "w",
        individualDims: strip.pieces.map(p => p.nw),
      });
    } else {
      const p = strip.pieces[0];
      result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
    }
  }

  for (let i = 0; i < strips.length; i++) {
    if (!usedStripSet.has(i)) {
      for (const p of strips[i].pieces) unassigned.push(p);
    }
  }

  for (const p of unassigned) {
    result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
  }

  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * Variante do Strip Packing DP com orientação invertida (transposed).
 * Agrupa por largura similar e empilha verticalmente.
 */
export function groupStripPackingDPTransposed(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  tolerance: number = 5,
): Piece[] {
  if (pieces.length < 2) return pieces;

  const normalized = pieces.map((p, idx) => ({
    ...p,
    nw: Math.min(p.w, p.h),
    nh: Math.max(p.w, p.h),
    origIdx: idx,
  }));

  const sorted = [...normalized].sort((a, b) => a.nw - b.nw);

  const widthGroups: (typeof sorted)[] = [];
  let currentGroup: typeof sorted = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].nw - currentGroup[0].nw <= tolerance) {
      currentGroup.push(sorted[i]);
    } else {
      widthGroups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  widthGroups.push(currentGroup);

  const strips: Array<{
    width: number;
    totalHeight: number;
    pieces: typeof sorted;
  }> = [];

  const unassigned: typeof sorted = [];

  for (const group of widthGroups) {
    if (group.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const stripWidth = Math.max(...group.map(p => p.nw));
    const heights = group.map(p => p.nh);

    const selected = knapsackSelectItems(heights, usableH);

    if (selected.length < 2) {
      unassigned.push(...group);
      continue;
    }

    const selectedPieces = selected.map(i => group[i]);
    const totalHeight = selected.reduce((sum, i) => sum + heights[i], 0);

    strips.push({ width: stripWidth, totalHeight, pieces: selectedPieces });

    const selectedSet = new Set(selected);
    for (let i = 0; i < group.length; i++) {
      if (!selectedSet.has(i)) unassigned.push(group[i]);
    }
  }

  if (strips.length === 0) return pieces;

  const stripWidths = strips.map(s => s.width);
  const selectedStrips = knapsackSelectItems(stripWidths, usableW);

  const result: Piece[] = [];
  const usedStripSet = new Set(selectedStrips);

  for (const si of selectedStrips) {
    const strip = strips[si];
    if (strip.pieces.length >= 2) {
      const groupLabels = strip.pieces.filter(p => p.label).map(p => p.label!);
      result.push({
        w: strip.width,
        h: strip.totalHeight,
        area: strip.width * strip.pieces[0].nh,
        count: strip.pieces.length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "h",
        individualDims: strip.pieces.map(p => p.nh),
      });
    } else {
      const p = strip.pieces[0];
      result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
    }
  }

  for (let i = 0; i < strips.length; i++) {
    if (!usedStripSet.has(i)) {
      for (const p of strips[i].pieces) unassigned.push(p);
    }
  }

  for (const p of unassigned) {
    result.push({ w: p.nw, h: p.nh, area: p.nw * p.nh, count: 1, label: p.label });
  }

  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}

/**
 * Common Dimension Binding + Knapsack DP
 * Encontra a dimensão mais frequente, orienta peças e usa DP para empacotar.
 */
export function groupCommonDimensionDP(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  threshold: number = 0.3,
): Piece[] {
  if (pieces.length < 2) return pieces;

  const dimCount = new Map<number, number>();
  for (const p of pieces) {
    dimCount.set(p.w, (dimCount.get(p.w) || 0) + 1);
    if (p.h !== p.w) dimCount.set(p.h, (dimCount.get(p.h) || 0) + 1);
  }

  let bestDim = 0, bestCount = 0;
  for (const [dim, count] of dimCount) {
    if (count > bestCount) { bestCount = count; bestDim = dim; }
  }

  if (bestCount < Math.max(2, Math.floor(pieces.length * threshold))) return pieces;

  const oriented: Array<Piece & { origW: number }> = [];
  const others: Piece[] = [];
  for (const p of pieces) {
    if (p.h === bestDim) {
      oriented.push({ ...p, origW: p.w });
    } else if (p.w === bestDim) {
      oriented.push({ ...p, w: p.h, h: p.w, origW: p.h });
    } else {
      others.push(p);
    }
  }

  const widths = oriented.map(p => p.origW);
  const selected = knapsackSelectItems(widths, usableW);

  if (selected.length < 2) return pieces;

  const selectedPieces = selected.map(i => oriented[i]);
  const selectedSet = new Set(selected);
  const unselected = oriented.filter((_, i) => !selectedSet.has(i));

  const rows: Array<typeof selectedPieces> = [];
  const rowWidths: number[] = [];

  selectedPieces.sort((a, b) => b.origW - a.origW);

  for (const p of selectedPieces) {
    let placed = false;
    for (let r = 0; r < rows.length; r++) {
      if (rowWidths[r] + p.origW <= usableW) {
        rows[r].push(p);
        rowWidths[r] += p.origW;
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([p]);
      rowWidths.push(p.origW);
    }
  }

  const result: Piece[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].length >= 2) {
      const groupLabels = rows[r].filter(p => p.label).map(p => p.label!);
      result.push({
        w: rowWidths[r],
        h: bestDim,
        area: rows[r][0].origW * bestDim,
        count: rows[r].length,
        labels: groupLabels.length > 0 ? groupLabels : undefined,
        groupedAxis: "w",
        individualDims: rows[r].map(p => p.origW),
      });
    } else {
      const p = rows[r][0];
      result.push({ w: p.origW, h: bestDim, area: p.origW * bestDim, count: 1, label: p.label });
    }
  }

  for (const p of unselected) {
    result.push({ w: p.origW, h: bestDim, area: p.origW * bestDim, count: 1, label: p.label });
  }
  result.push(...others);

  result.sort((a, b) => b.area - a.area);
  ensureLargestIndividualFirst(result);
  return result;
}
