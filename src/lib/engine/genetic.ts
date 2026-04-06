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

interface GAIndividual {
  genome: number[];
  rotations: boolean[];
  groupingMode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
  transposed: boolean;
}

function simulateSheets(
  workPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  maxSheets: number,
): {
  fitness: number;
  firstTree: TreeNode;
  firstSheetRemainingCount: number;
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
  let firstSheetRemCount = workPieces.reduce((s, p) => s + (p.count || 1), 0);

  for (let s = 0; s < maxSheets; s++) {
    if (currentRemaining.length === 0) break;

    const countBefore = currentRemaining.length;
    const res = runPlacement(currentRemaining, usableW, usableH, minBreak);
    if (s === 0) {
      firstTree = res.tree;
      firstSheetRemCount = res.remaining.reduce((acc, p) => acc + (p.count || 1), 0);
    }

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
    if (piecesPlaced === 0) rejectedCount++;

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
    firstSheetRemainingCount: firstSheetRemCount,
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
  const mutationRate = 0.05;

  const numPieces = pieces.length;

  const largestIdx = pieces.reduce((best, p, i) => {
    const area = p.w * p.h;
    const bestArea = pieces[best].w * pieces[best].h;
    return area > bestArea ? i : best;
  }, 0);

  function randomIndividual(): GAIndividual {
    const rest = Array.from({ length: numPieces }, (_, i) => i).filter((i) => i !== largestIdx);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const genome = [largestIdx, ...rest];
    return {
      genome,
      rotations: Array.from({ length: numPieces }, () => Math.random() > 0.5),
      groupingMode: ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const)[Math.floor(Math.random() * 15)] as GAIndividual['groupingMode'],
      transposed: Math.random() > 0.5,
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

    if (ind.groupingMode === 1) {
      work = groupPiecesByHeight(work);
    } else if (ind.groupingMode === 2) {
      work = groupPiecesByWidth(work);
    } else if (ind.groupingMode === 3) {
      work = groupPiecesFillRow(work, usableW);
    } else if (ind.groupingMode === 4) {
      work = groupPiecesFillRow(work, usableW, true);
    } else if (ind.groupingMode === 5) {
      work = groupPiecesFillCol(work, usableH);
    } else if (ind.groupingMode === 6) {
      work = groupPiecesFillCol(work, usableH, true);
    } else if (ind.groupingMode === 7) {
      work = groupPiecesColumnWidth(work, usableW);
    } else if (ind.groupingMode === 8) {
      work = groupPiecesColumnHeight(work, usableH);
    } else if (ind.groupingMode === 9) {
      work = groupByCommonDimension(work, usableW, usableH);
    } else if (ind.groupingMode === 10) {
      work = groupByCommonDimensionTransposed(work, usableW, usableH);
    } else if (ind.groupingMode === 11) {
      work = groupStripPackingDP(work, usableW, usableH, 5);
    } else if (ind.groupingMode === 12) {
      work = groupStripPackingDPTransposed(work, usableW, usableH, 5);
    } else if (ind.groupingMode === 13) {
      work = groupCommonDimensionDP(work, usableW, usableH);
    } else if (ind.groupingMode === 14) {
      work = groupStripPackingDP(work, usableW, usableH, 100);
    }

    return work;
  }

  function evaluate(ind: GAIndividual): { tree: TreeNode; fitness: number; transposed: boolean; remainingCount: number } {
    const work = buildPieces(ind);
    const totalPieces = work.reduce((s, p) => s + (p.count || 1), 0);
    const lookahead = Math.min(3, Math.ceil(work.length / 5));
    const eW = ind.transposed ? usableH : usableW;
    const eH = ind.transposed ? usableW : usableH;
    const result = simulateSheets(work, eW, eH, minBreak, lookahead || 1);
    // Combine: prioritize placing more pieces on the first sheet, then utilization
    const placedOnFirst = totalPieces - result.firstSheetRemainingCount;
    const combinedFitness = placedOnFirst * 10 + result.fitness;
    return { tree: result.firstTree, fitness: combinedFitness, transposed: ind.transposed, remainingCount: result.firstSheetRemainingCount };
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

    const lIdx = childGenome.indexOf(largestIdx);
    if (lIdx > 0) {
      [childGenome[0], childGenome[lIdx]] = [childGenome[lIdx], childGenome[0]];
    }

    return {
      genome: childGenome,
      rotations: childRotations,
      groupingMode: childGrouping,
      transposed: Math.random() > 0.5 ? pA.transposed : pB.transposed,
    };
  }

  function mutate(ind: GAIndividual): GAIndividual {
    const c = {
      genome: [...ind.genome],
      rotations: [...ind.rotations],
      groupingMode: ind.groupingMode,
      transposed: ind.transposed,
    };

    const r = Math.random();
    if (r < 0.25) {
      if (c.genome.length > 2) {
        const a = 1 + Math.floor(Math.random() * (c.genome.length - 1));
        const b = 1 + Math.floor(Math.random() * (c.genome.length - 1));
        [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
      }
    } else if (r < 0.5) {
      if (c.genome.length > 4) {
        const tail = c.genome.splice(1);
        const blockSize = Math.floor(Math.random() * Math.min(5, tail.length / 2)) + 2;
        const start = Math.floor(Math.random() * Math.max(1, tail.length - blockSize));
        const segment = tail.splice(start, blockSize);
        const target = Math.floor(Math.random() * tail.length);
        tail.splice(target, 0, ...segment);
        c.genome = [c.genome[0], ...tail];
      }
    } else if (r < 0.7) {
      const count = Math.max(1, Math.floor(c.rotations.length * 0.1));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * c.rotations.length);
        c.rotations[idx] = !c.rotations[idx];
      }
    } else if (r < 0.85) {
      c.groupingMode = ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const)[Math.floor(Math.random() * 15)] as GAIndividual['groupingMode'];
    } else {
      c.transposed = !c.transposed;
    }

    return c;
  }

  // --- Seeding ---
  const initialPop: GAIndividual[] = [];
  const strategies = getSortStrategies();
  strategies.forEach((sortFn) => {
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

    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: 0,
      transposed: false,
    });
    initialPop.push({
      genome: [...sortedIndices],
      rotations: Array.from({ length: numPieces }, () => false),
      groupingMode: 0,
      transposed: true,
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

  // Helper to build a preview-ready tree from the current best
  const buildPreviewTree = (): TreeNode => {
    let preview = JSON.parse(JSON.stringify(bestTree || createRoot(usableW, usableH)));
    if (bestTransposed) {
      preview.transposed = true;
      preview = normalizeTree(preview, usableW, usableH);
    }
    return preview;
  };

  const v6Result = optimizeV6(pieces, usableW, usableH, minBreak);
  const v6PlacedCount = pieces.length - v6Result.remaining.reduce((s, p) => s + (p.count || 1), 0);
  const v6Util = calcPlacedArea(v6Result.tree) / (usableW * usableH);
  // Combined fitness: prioritize piece count, then utilization
  const v6Fitness = v6PlacedCount * 10 + v6Util;
  let bestDisplayUtil = v6Util * 100;
  if (v6Fitness > bestFitness) {
    bestFitness = v6Fitness;
    bestDisplayUtil = v6Util * 100;
    bestTree = JSON.parse(JSON.stringify(v6Result.tree));
    bestTransposed = false;
  }

  if (onProgress) {
    onProgress({ phase: "Heurísticas V6 concluídas", current: 0, total: Math.max(1, generations), bestUtil: bestDisplayUtil, bestTree: buildPreviewTree() });
  }

  if (onProgress && generations > 0) {
    onProgress({ phase: "Semeando População...", current: 0, total: generations, bestUtil: bestDisplayUtil, bestTree: buildPreviewTree() });
  }

  if (generations === 0) {
    if (onProgress) {
      onProgress({ phase: "Apenas Heurísticas (sem evolução)", current: 1, total: 1, bestUtil: bestDisplayUtil });
    }
    let finalTree = bestTree || createRoot(usableW, usableH);
    if (bestTransposed) {
      finalTree.transposed = true;
      finalTree = normalizeTree(finalTree, usableW, usableH);
    }

    if (onProgress)
      onProgress({ phase: "Pós-análise de reagrupamento...", current: 1, total: 1, bestUtil: bestDisplayUtil });
    const postResult = postOptimizeRegroup(
      finalTree,
      calcPlacedArea(finalTree),
      pieces,
      usableW,
      usableH,
      minBreak,
      getSortStrategies,
      runPlacement,
      normalizeTree,
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

  for (let g = 0; g < generations; g++) {
    const currentLookahead = Math.min(8, 3 + Math.floor(g / 20));

    const evaluated = population.map((ind) => {
      const work = buildPieces(ind);
      const totalPieces = work.reduce((s, p) => s + (p.count || 1), 0);
      const eW = ind.transposed ? usableH : usableW;
      const eH = ind.transposed ? usableW : usableH;
      const res = simulateSheets(work, eW, eH, minBreak, currentLookahead);
      const placedOnFirst = totalPieces - res.firstSheetRemainingCount;
      const combinedFitness = placedOnFirst * 10 + res.fitness;
      return { ind, tree: res.firstTree, fitness: combinedFitness, util: res.fitness };
    });

    evaluated.sort((a, b) => b.fitness - a.fitness);

    const improved = evaluated[0].fitness > bestFitness;
    if (improved) {
      bestFitness = evaluated[0].fitness;
      bestDisplayUtil = evaluated[0].util * 100;
      bestTree = JSON.parse(JSON.stringify(evaluated[0].tree));
      bestTransposed = evaluated[0].ind.transposed;
    }

    if (onProgress) {
      onProgress({
        phase: "Otimização Evolutiva Global",
        current: g + 1,
        total: generations,
        bestUtil: bestDisplayUtil,
        ...(improved ? { bestTree: buildPreviewTree() } : {}),
      });
    }

    if (g % 5 === 0) await new Promise((r) => setTimeout(r, 0));

    const nextPop: GAIndividual[] = evaluated.slice(0, eliteCount).map((e) => e.ind);
    const seenGenomes = new Set(nextPop.map((i) => i.genome.join(",") + (i.transposed ? "T" : "N")));

    while (nextPop.length < populationSize) {
      const pA = tournament(evaluated);
      const pB = tournament(evaluated);
      let child = crossover(pA, pB);
      if (Math.random() < mutationRate) child = mutate(child);

      const key = child.genome.join(",") + (child.transposed ? "T" : "N");
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
    finalTree = normalizeTree(finalTree, usableW, usableH);
  }

  if (onProgress)
    onProgress({
      phase: "Pós-análise de reagrupamento...",
      current: generations,
      total: generations,
      bestUtil: bestDisplayUtil,
    });
  const postResult = postOptimizeRegroup(
    finalTree,
    calcPlacedArea(finalTree),
    pieces,
    usableW,
    usableH,
    minBreak,
    getSortStrategies,
    runPlacement,
    normalizeTree,
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
