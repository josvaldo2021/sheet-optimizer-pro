// CNC Cut Plan Engine — Genetic Algorithm

import { TreeNode, Piece, OptimizationProgress } from './types';
import { createRoot, calcPlacedArea } from './tree-utils';
import { normalizeTree } from './normalization';
import { runPlacement } from './placement';
import { postOptimizeRegroup } from './post-processing';
import { optimizeV6, getSortStrategies } from './optimizer';
import {
  groupPiecesByHeight,
  groupPiecesByWidth,
  groupPiecesFillRow,
  groupPiecesFillCol,
  groupPiecesColumnWidth,
  groupPiecesColumnHeight,
  groupByCommonDimension,
  groupByCommonDimensionTransposed,
  groupStripPackingDP,
  groupStripPackingDPTransposed,
  groupCommonDimensionDP,
} from './grouping';

/**
 * Strip mode controls how the first cut is made:
 * 'V' = vertical strip (default): X = piece width, standard behavior
 * 'H' = horizontal strip: X = full sheet width (neutral), Y = piece height
 */
type StripMode = 'V' | 'H';

interface GAIndividual {
  genome: number[];
  rotations: boolean[];
  groupingMode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
  transposed: boolean;
  /** Controls whether the first strip is vertical or horizontal */
  stripMode: StripMode;
}

function applyGrouping(work: Piece[], mode: number, usableW: number, usableH: number): Piece[] {
  switch (mode) {
    case 1: return groupPiecesByHeight(work);
    case 2: return groupPiecesByWidth(work);
    case 3: return groupPiecesFillRow(work, usableW);
    case 4: return groupPiecesFillRow(work, usableW, true);
    case 5: return groupPiecesFillCol(work, usableH);
    case 6: return groupPiecesFillCol(work, usableH, true);
    case 7: return groupPiecesColumnWidth(work, usableW);
    case 8: return groupPiecesColumnHeight(work, usableH);
    case 9: return groupByCommonDimension(work, usableW, usableH);
    case 10: return groupByCommonDimensionTransposed(work, usableW, usableH);
    case 11: return groupStripPackingDP(work, usableW, usableH, 5);
    case 12: return groupStripPackingDPTransposed(work, usableW, usableH, 5);
    case 13: return groupCommonDimensionDP(work, usableW, usableH);
    case 14: return groupStripPackingDP(work, usableW, usableH, 100);
    default: return work;
  }
}

function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  maxSheets: number,
  horizontalStrip?: { baseW: number; baseH: number },
): {
  fitness: number;
  firstTree: TreeNode;
  stat_rejectedByMinBreak: number;
  stat_fragmentCount: number;
  stat_continuity: number;
} {
  let currentRemaining = [...workPieces];
  let totalUtil = 0;
  let firstTree: TreeNode | null = null;
  let sheetsActuallySimulated = 0;
  const sheetArea = usableW * usableH;

  const initialLargeArea = workPieces
    .filter(p => !p.count || p.count === 1)
    .filter(p => (p.w * p.h) > (sheetArea * 0.2))
    .reduce((a, b) => a + b.w * b.h, 0);

  const initialSmallArea = workPieces
    .reduce((a, b) => a + b.area * (b.count || 1), 0) - initialLargeArea;

  let largeAreaPlaced = 0;
  let smallAreaPlaced = 0;
  let rejectedCount = 0;
  let continuityScore = 0;
  let fragmentCount = 0;

  for (let s = 0; s < maxSheets; s++) {
    if (currentRemaining.length === 0) break;

    const countBefore = currentRemaining.length;
    // Only apply horizontal strip hint on the first sheet
    const stripHint = s === 0 ? horizontalStrip : undefined;
    const res = runPlacement(currentRemaining, usableW, usableH, minBreak, stripHint);
    if (s === 0) firstTree = res.tree;

    const placedArea = res.area;
    totalUtil += placedArea / sheetArea;

    const largeRemaining = res.remaining
      .filter(p => !p.count || p.count === 1)
      .filter(p => (p.w * p.h) > (sheetArea * 0.2))
      .reduce((a, b) => a + b.w * b.h, 0);

    const currentLargePlaced = Math.max(0, (initialLargeArea - largeAreaPlaced) - largeRemaining);
    largeAreaPlaced += currentLargePlaced;
    smallAreaPlaced += Math.max(0, placedArea - currentLargePlaced);

    const usedW = res.tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
    const freeW = usableW - usedW;
    if (freeW > 50) continuityScore += freeW / usableW;

    const piecesPlaced = countBefore - res.remaining.length;
    if (piecesPlaced === 0) { rejectedCount++; break; }

    currentRemaining = res.remaining;
    sheetsActuallySimulated++;
  }

  let fitness = sheetsActuallySimulated > 0 ? totalUtil / sheetsActuallySimulated : 0;

  if (initialLargeArea > 0) {
    const largePlacementRatio = largeAreaPlaced / initialLargeArea;
    const smallPlacementRatio = initialSmallArea > 0 ? smallAreaPlaced / initialSmallArea : 1;

    if (smallPlacementRatio > largePlacementRatio * 1.5) {
      fitness *= 0.8;
    } else {
      fitness += largePlacementRatio * 0.1;
    }
  }

  fitness -= rejectedCount * 0.05;
  fitness += (continuityScore * 0.01) / (sheetsActuallySimulated || 1);

  return {
    fitness: Math.max(0, fitness),
    firstTree: firstTree || createRoot(usableW, usableH),
    stat_rejectedByMinBreak: rejectedCount,
    stat_fragmentCount: fragmentCount,
    stat_continuity: continuityScore,
  };
}

export async function optimizeGeneticAsync(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  onProgress?: (p: OptimizationProgress) => void,
  priorityLabels?: string[],
  gaPopulationSize: number = 10,
  gaGenerations: number = 10,
): Promise<TreeNode> {
  const populationSize = Math.max(10, gaPopulationSize);
  const generations = Math.max(0, gaGenerations);
  const eliteCount = Math.max(2, Math.floor(populationSize * 0.1));

  const numPieces = pieces.length;

  const GROUPING_MODES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

  function randomIndividual(): GAIndividual {
    const genome = Array.from({ length: numPieces }, (_, i) => i);
    for (let i = genome.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [genome[i], genome[j]] = [genome[j], genome[i]];
    }
    return {
      genome,
      rotations: Array.from({ length: numPieces }, () => Math.random() > 0.5),
      groupingMode: GROUPING_MODES[Math.floor(Math.random() * GROUPING_MODES.length)] as GAIndividual['groupingMode'],
      transposed: Math.random() > 0.5,
      stripMode: Math.random() > 0.5 ? 'V' : 'H',
    };
  }

  function buildPieces(ind: GAIndividual): Piece[] {
    let work = ind.genome.map((idx) => ({ ...pieces[idx] }));

    work = work.map((p, i) => {
      if (ind.rotations[i]) {
        return { ...p, w: p.h, h: p.w };
      }
      return p;
    });

    const eW = ind.transposed ? usableH : usableW;
    const eH = ind.transposed ? usableW : usableH;
    work = applyGrouping(work, ind.groupingMode, eW, eH);

    return work;
  }

  /**
   * Build the horizontal strip hint for an individual.
   * In 'H' mode, X = full sheet width (neutral cut), Y = base piece height.
   * The base piece is the first piece in the genome after grouping/rotation.
   */
  function getHorizontalStripHint(ind: GAIndividual, work: Piece[], eW: number, eH: number): { baseW: number; baseH: number } | undefined {
    if (ind.stripMode !== 'H') return undefined;
    if (work.length === 0) return undefined;
    const basePiece = work[0];
    // In horizontal mode, the base piece's height defines the Y strip
    // and its width will be placed as a Z subdivision within that strip
    if (basePiece.h <= eH && basePiece.w <= eW) {
      return { baseW: basePiece.w, baseH: basePiece.h };
    }
    return undefined;
  }

  function evaluate(ind: GAIndividual): { tree: TreeNode; fitness: number; transposed: boolean } {
    const work = buildPieces(ind);
    const lookahead = Math.min(3, Math.ceil(work.length / 5));
    const eW = ind.transposed ? usableH : usableW;
    const eH = ind.transposed ? usableW : usableH;
    const horizontalHint = getHorizontalStripHint(ind, work, eW, eH);
    const result = simulateSheets(work, eW, eH, minBreak, lookahead || 1, horizontalHint);
    return { tree: result.firstTree, fitness: result.fitness, transposed: ind.transposed };
  }

  function tournament(pop: { ind: GAIndividual; fitness: number }[]): GAIndividual {
    const k = 4;
    let best = pop[Math.floor(Math.random() * pop.length)];
    for (let i = 1; i < k; i++) {
      const c = pop[Math.floor(Math.random() * pop.length)];
      if (c.fitness > best.fitness) best = c;
    }
    return best.ind;
  }

  function crossover(pA: GAIndividual, pB: GAIndividual): GAIndividual {
    const size = pA.genome.length;
    const start = Math.floor(Math.random() * size);
    const end = Math.floor(Math.random() * (size - start)) + start;

    const childGenome = new Array(size).fill(-1);
    for (let i = start; i <= end; i++) {
      childGenome[i] = pA.genome[i];
    }

    let current = 0;
    for (let i = 0; i < size; i++) {
      const parentGene = pB.genome[i];
      if (!childGenome.includes(parentGene)) {
        while (childGenome[current] !== -1) current++;
        childGenome[current] = parentGene;
      }
    }

    const childRotations = pA.rotations.map((r, i) => (Math.random() > 0.5 ? r : pB.rotations[i]));
    const childGrouping = (Math.random() > 0.5 ? pA.groupingMode : pB.groupingMode) as GAIndividual['groupingMode'];

    return {
      genome: childGenome,
      rotations: childRotations,
      groupingMode: childGrouping,
      transposed: Math.random() > 0.5 ? pA.transposed : pB.transposed,
      stripMode: Math.random() > 0.5 ? pA.stripMode : pB.stripMode,
    };
  }

  function mutate(ind: GAIndividual): GAIndividual {
    const c: GAIndividual = {
      genome: [...ind.genome],
      rotations: [...ind.rotations],
      groupingMode: ind.groupingMode,
      transposed: ind.transposed,
      stripMode: ind.stripMode,
    };

    const r = Math.random();
    if (r < 0.20) {
      // Swap two positions in genome
      if (c.genome.length > 2) {
        const a = 1 + Math.floor(Math.random() * (c.genome.length - 1));
        const b = 1 + Math.floor(Math.random() * (c.genome.length - 1));
        [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
      }
    } else if (r < 0.40) {
      // Block move in genome
      if (c.genome.length > 4) {
        const tail = c.genome.splice(1);
        const blockSize = Math.floor(Math.random() * Math.min(5, tail.length / 2)) + 2;
        const start = Math.floor(Math.random() * Math.max(1, tail.length - blockSize));
        const segment = tail.splice(start, blockSize);
        const target = Math.floor(Math.random() * tail.length);
        tail.splice(target, 0, ...segment);
        c.genome = [c.genome[0], ...tail];
      }
    } else if (r < 0.55) {
      // Flip rotations
      const count = Math.max(1, Math.floor(c.rotations.length * 0.1));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * c.rotations.length);
        c.rotations[idx] = !c.rotations[idx];
      }
    } else if (r < 0.70) {
      // Change grouping mode
      c.groupingMode = GROUPING_MODES[Math.floor(Math.random() * GROUPING_MODES.length)] as GAIndividual['groupingMode'];
    } else if (r < 0.82) {
      // Toggle transposed
      c.transposed = !c.transposed;
    } else {
      // Toggle strip mode (V <-> H)
      c.stripMode = c.stripMode === 'V' ? 'H' : 'V';
    }

    return c;
  }

  // Estimate total sheets needed (used as full lookahead for fitness evaluation)
  const totalPieceArea = pieces.reduce((s, p) => s + (p.area || p.w * p.h) * (p.count || 1), 0);
  const estimatedSheets = Math.min(60, Math.max(5, Math.ceil(totalPieceArea / (usableW * usableH * 0.65))));

  // --- Seeding ---
  const initialPop: GAIndividual[] = [];
  const strategies = getSortStrategies();
  strategies.forEach((sortFn, stratIdx) => {
    const sortedIndices = Array.from({ length: numPieces }, (_, i) => i).sort((a, b) => {
      const pA = pieces[a];
      const pB = pieces[b];
      return sortFn(pA, pB);
    });

    let bestIdx = 0;
    let bestArea = 0;
    for (let i = 0; i < sortedIndices.length; i++) {
      const p = pieces[sortedIndices[i]];
      const area = p.w * p.h;
      if (area > bestArea) {
        bestArea = area;
        bestIdx = i;
      }
    }
    if (bestIdx > 0) {
      const tmp = sortedIndices[bestIdx];
      sortedIndices.splice(bestIdx, 1);
      sortedIndices.unshift(tmp);
    }

    // Rotating groupingMode ensures non-zero modes appear in the initial population
    const rotatingMode = GROUPING_MODES[1 + (stratIdx % (GROUPING_MODES.length - 1))] as GAIndividual['groupingMode'];

    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: 0,
      transposed: false,
      stripMode: 'V',
    });
    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: 0,
      transposed: false,
      stripMode: 'H',
    });
    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: rotatingMode,
      transposed: false,
      stripMode: 'V',
    });
    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: rotatingMode,
      transposed: true,
      stripMode: 'V',
    });
  });

  if (initialPop.length > populationSize) {
    initialPop.length = populationSize;
  }
  while (initialPop.length < populationSize) {
    initialPop.push(randomIndividual());
  }

  let population = initialPop;
  let bestTree: TreeNode | null = null;
  let bestFitness = -1;
  let bestTransposed = false;

  // --- Run V6 heuristic as baseline ---
  if (onProgress) {
    onProgress({ phase: "Rodando heurísticas V6...", current: 0, total: Math.max(1, generations) });
  }
  const v6Result = optimizeV6(pieces, usableW, usableH, minBreak);
  const v6Util = calcPlacedArea(v6Result.tree) / (usableW * usableH);
  if (v6Util > bestFitness) {
    bestFitness = v6Util;
    bestTree = JSON.parse(JSON.stringify(v6Result.tree));
    bestTransposed = false;
  }
  const v6T = optimizeV6(pieces, usableH, usableW, minBreak);
  const v6TUtil = calcPlacedArea(v6T.tree) / (usableW * usableH);
  if (v6TUtil > bestFitness) {
    bestFitness = v6TUtil;
    bestTree = JSON.parse(JSON.stringify(v6T.tree));
    bestTransposed = true;
  }

  if (onProgress && generations > 0) {
    onProgress({ phase: "Semeando População...", current: 0, total: generations, bestUtil: bestFitness * 100 });
  }

  if (generations === 0) {
    if (onProgress) {
      onProgress({ phase: "Apenas Heurísticas (sem evolução)", current: 1, total: 1, bestUtil: bestFitness * 100 });
    }
    let finalTree = bestTree || createRoot(usableW, usableH);
    if (bestTransposed) {
      finalTree.transposed = true;
      finalTree = normalizeTree(finalTree, usableW, usableH, minBreak);
    }

    if (onProgress)
      onProgress({ phase: "Pós-análise de reagrupamento...", current: 1, total: 1, bestUtil: bestFitness * 100 });
    const postResult = postOptimizeRegroup(
      finalTree,
      bestFitness * usableW * usableH,
      pieces,
      usableW,
      usableH,
      minBreak,
      getSortStrategies,
      runPlacement,
      (t, w, h) => normalizeTree(t, w, h, minBreak),
    );
    if (postResult.improved) {
      finalTree = postResult.tree;
      if (onProgress)
        onProgress({
          phase: "Pós-análise: layout melhorado!",
          current: 1,
          total: 1,
          bestUtil: (postResult.area / (usableW * usableH)) * 100,
        });
    }

    return finalTree;
  }

  const totalEvals = generations * populationSize;

  for (let g = 0; g < generations; g++) {
    const currentLookahead = estimatedSheets;
    // High mutation early (exploration), low mutation late (refinement)
    const adaptiveMutationRate = 0.25 - (g / Math.max(1, generations - 1)) * 0.20;

    const evaluated: Array<{ ind: GAIndividual; tree: TreeNode; fitness: number }> = [];
    for (let i = 0; i < population.length; i++) {
      const ind = population[i];
      const work = buildPieces(ind);
      const eW = ind.transposed ? usableH : usableW;
      const eH = ind.transposed ? usableW : usableH;
      const horizontalHint = getHorizontalStripHint(ind, work, eW, eH);
      const res = simulateSheets(work, eW, eH, minBreak, currentLookahead, horizontalHint);
      evaluated.push({ ind, tree: res.firstTree, fitness: res.fitness });

      if (onProgress) {
        onProgress({
          phase: `Evolução Gen ${g + 1}/${generations} · Pop ${i + 1}/${populationSize}`,
          current: g * populationSize + i + 1,
          total: totalEvals,
          bestUtil: bestFitness * 100,
        });
      }

      if ((g * populationSize + i) % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    evaluated.sort((a, b) => b.fitness - a.fitness);

    if (evaluated[0].fitness > bestFitness) {
      bestFitness = evaluated[0].fitness;
      bestTree = JSON.parse(JSON.stringify(evaluated[0].tree));
      bestTransposed = evaluated[0].ind.transposed;
    }

    const nextPop: GAIndividual[] = evaluated.slice(0, eliteCount).map((e) => e.ind);
    const seenGenomes = new Set(nextPop.map((i) => i.genome.join(",") + i.groupingMode + i.stripMode + (i.transposed ? "T" : "N")));

    while (nextPop.length < populationSize) {
      const pA = tournament(evaluated);
      const pB = tournament(evaluated);
      let child = crossover(pA, pB);
      if (Math.random() < adaptiveMutationRate) child = mutate(child);

      const key = child.genome.join(",") + child.groupingMode + child.stripMode + (child.transposed ? "T" : "N");
      if (!seenGenomes.has(key)) {
        nextPop.push(child);
        seenGenomes.add(key);
      } else if (Math.random() < 0.2) {
        nextPop.push(randomIndividual());
      }
    }
    population = nextPop;
  }

  let finalTree = bestTree || createRoot(usableW, usableH);
  if (bestTransposed) {
    finalTree.transposed = true;
    finalTree = normalizeTree(finalTree, usableW, usableH, minBreak);
  }

  if (onProgress)
    onProgress({
      phase: "Pós-análise de reagrupamento...",
      current: generations,
      total: generations,
      bestUtil: bestFitness * 100,
    });
  const postResult = postOptimizeRegroup(
    finalTree,
    bestFitness * usableW * usableH,
    pieces,
    usableW,
    usableH,
    minBreak,
    getSortStrategies,
    runPlacement,
    (t, w, h) => normalizeTree(t, w, h, minBreak),
  );
  if (postResult.improved) {
    finalTree = postResult.tree;
    if (onProgress)
      onProgress({
        phase: "Pós-análise: layout melhorado!",
        current: generations,
        total: generations,
        bestUtil: (postResult.area / (usableW * usableH)) * 100,
      });
  }

  return finalTree;
}

export function optimizeGeneticV1(pieces: Piece[], usableW: number, usableH: number, minBreak: number = 0): TreeNode {
  return optimizeV6(pieces, usableW, usableH, minBreak).tree;
}
