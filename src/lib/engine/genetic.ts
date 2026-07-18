// CNC Cut Plan Engine — Genetic Algorithm

import { TreeNode, Piece, OptimizationProgress } from './types';
import { mulberry32, DEFAULT_GA_SEED } from './rng';
import { createRoot, calcPlacedArea, insertNode, findNode, consolidateColumns } from './tree-utils';
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

/**
 * Causa 2 (inflação de dimensão fantasma): algumas folhas de peça acabam com a
 * dimensão do CONTÊINER em vez da real — ex.: uma peça 400×380 numa coluna Z de
 * 1600 é renderizada como 1600×380 porque falta o nó de corte (Q) que limita a
 * largura. A inflação tem múltiplas fontes no placement/pós-processamento e cresce
 * com a busca. Em vez de corrigir cada sítio, esta passada FINAL é source-agnostic:
 * usa o mapa label→(w,h) real das peças de entrada e, para cada folha cuja dimensão
 * herdada do contêiner excede a real da peça, insere o nó de corte que falta
 * (W sob Z, Q sob W, R sob Q), deixando o excedente como sobra legítima.
 *
 * Segura: só age quando a dimensão renderizada > real e quando a outra dimensão
 * da folha casa com uma das dimensões reais da peça (rotação-agnóstico). Idempotente.
 *
 * Spec 012 (T029 — avaliado, MANTIDO): a hipótese era que, com a expansão correta
 * (T008-T010) e a validação no limite (T011), esta passada viraria remendo morto.
 * NÃO é o caso: o T011 valida/descarta apenas candidatos do `optimizeV6`, mas o
 * caminho de PRODUÇÃO é o GA, e seus indivíduos EVOLUÍDOS (buildPieces →
 * simulateSheets → runPlacement) chegam ao vencedor SEM passar por aquela fronteira.
 * `capPhantomLeaves` continua sendo a defesa de fantasma desse ramo. Com o T013, o
 * `labelDims` passa a guardar a medida REAL de cada peça de um grupo (antes era a do
 * agregado), então quando ele age em folha rotulada de grupo, corrige para a medida
 * certa — não mais para a do contêiner.
 */
function capPhantomLeaves(tree: TreeNode, labelDims: Map<string, [number, number]>): void {
  const TOL = 1;
  const realOther = (label: string, known: number): number | null => {
    const d = labelDims.get(label);
    if (!d) return null;
    if (Math.abs(d[0] - known) <= TOL) return d[1];
    if (Math.abs(d[1] - known) <= TOL) return d[0];
    return null;
  };

  const walk = (n: TreeNode, yV: number, zV: number, wV: number, qN: TreeNode | null): void => {
    // Só corrige folhas de peça única (multi===1). Nós com multi>1 representam
    // várias peças idênticas — inserir um único filho bagunçaria contagem/labels.
    if (n.filhos.length === 0 && n.label && n.multi === 1) {
      if (n.tipo === "Z") {
        // renderizada (w=Z.valor, h=Y.valor): limita altura com W
        const realH = realOther(n.label, n.valor);
        if (realH !== null && yV - realH > TOL) {
          const id = insertNode(tree, n.id, "W", realH, 1);
          findNode(tree, id)!.label = n.label;
        }
      } else if (n.tipo === "W") {
        // renderizada (w=Z.valor, h=W.valor): limita largura com Q
        const realW = realOther(n.label, n.valor);
        if (realW !== null && zV - realW > TOL) {
          const id = insertNode(tree, n.id, "Q", realW, 1);
          findNode(tree, id)!.label = n.label;
        }
      } else if (n.tipo === "Q") {
        // renderizada (w=Q.valor, h=W.valor): limita altura com R
        const realH = realOther(n.label, n.valor);
        if (realH !== null && wV - realH > TOL) {
          const id = insertNode(tree, n.id, "R", realH, 1);
          findNode(tree, id)!.label = n.label;
        }
      } else if (n.tipo === "R" && qN) {
        // renderizada (w=Q.valor, h=R.valor): nível mais profundo, não há filho
        // para limitar. Se o Q pai tem um único filho (esta peça), encolher
        // Q.valor para a largura real é seguro (não desloca irmãos) e o excedente
        // vira sobra.
        const realW = realOther(n.label, n.valor);
        if (realW !== null && qN.filhos.length === 1 && qN.valor - realW > TOL) {
          qN.valor = realW;
        }
      }
      return;
    }
    // Q com vários filhos R (peças empilhadas que compartilham a largura do Q):
    // se todas resolvem para a MESMA largura real menor que Q.valor, encolher é
    // seguro (uniforme, não desloca nada lateralmente).
    if (n.tipo === "Q" && n.filhos.length > 0 &&
        n.filhos.every((c) => c.tipo === "R" && c.filhos.length === 0 && c.label && c.multi === 1)) {
      const widths = n.filhos.map((c) => realOther(c.label!, c.valor));
      const w0 = widths[0];
      if (w0 !== null && widths.every((x) => x !== null && Math.abs(x - w0) <= TOL) && n.valor - w0 > TOL) {
        n.valor = w0;
      }
    }
    for (const c of n.filhos) {
      walk(
        c,
        n.tipo === "Y" ? n.valor : yV,
        n.tipo === "Z" ? n.valor : zV,
        n.tipo === "W" ? n.valor : wV,
        n.tipo === "Q" ? n : qN,
      );
    }
  };

  for (const x of tree.filhos) walk(x, 0, 0, 0, null);
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
} {
  let currentRemaining = [...workPieces];
  let totalUtil = 0;
  let firstTree: TreeNode | null = null;
  let firstSheetUtil = 0;
  let sheetsActuallySimulated = 0;
  const sheetArea = usableW * usableH;

  const initialLargeArea = workPieces
    .filter(p => !p.count || p.count === 1)
    .filter(p => (p.w * p.h) > (sheetArea * 0.2))
    .reduce((a, b) => a + b.w * b.h, 0);

  let largeAreaPlaced = 0;
  let rejectedCount = 0;

  for (let s = 0; s < maxSheets; s++) {
    if (currentRemaining.length === 0) break;

    const countBefore = currentRemaining.length;
    // Only apply horizontal strip hint on the first sheet
    const stripHint = s === 0 ? horizontalStrip : undefined;
    const res = runPlacement(currentRemaining, usableW, usableH, minBreak, stripHint);

    // IMPORTANTE: res.area do runPlacement é uma medida incremental NÃO confiável
    // (pode vir negativa ou inflada — os passos de pós-processamento somam deltas que
    // não batem com as folhas reais da árvore). Usamos calcPlacedArea, a área
    // geométrica verdadeira da árvore — a mesma fonte de verdade que runAllSheets usa
    // (Index.tsx:401). Sem isso, o GA otimiza um sinal quebrado e seleciona layouts
    // com área espúria (ver benchmark seed 144: res.area=97.72 vs real=63.57).
    const placedArea = calcPlacedArea(res.tree);
    if (s === 0) {
      firstTree = res.tree;
      firstSheetUtil = placedArea / sheetArea;
    }

    totalUtil += placedArea / sheetArea;

    const largeRemaining = res.remaining
      .filter(p => !p.count || p.count === 1)
      .filter(p => (p.w * p.h) > (sheetArea * 0.2))
      .reduce((a, b) => a + b.w * b.h, 0);

    const currentLargePlaced = Math.max(0, (initialLargeArea - largeAreaPlaced) - largeRemaining);
    largeAreaPlaced += currentLargePlaced;

    const piecesPlaced = countBefore - res.remaining.length;
    if (piecesPlaced === 0) { rejectedCount++; break; }

    currentRemaining = res.remaining;
    sheetsActuallySimulated++;
  }

  // O objetivo REAL do loop multi-chapa é MINIMIZAR o total de chapas, o que equivale
  // a MAXIMIZAR o aproveitamento médio sobre as chapas necessárias. Por isso a média
  // multi-chapa (avgUtil, com lookahead = estimatedSheets) é o termo PRIMÁRIO — otimizar
  // só a 1ª chapa de forma gananciosa fragmenta o restante e usa MAIS chapas.
  // Crucial: avgUtil agora deriva de calcPlacedArea (área honesta), não de res.area.
  const avgUtil = sheetsActuallySimulated > 0 ? totalUtil / sheetsActuallySimulated : 0;
  let fitness = avgUtil;

  // Desempate: leve incentivo a alocar peças grandes cedo (reduz fragmentação).
  if (initialLargeArea > 0) {
    fitness += 0.001 * (largeAreaPlaced / initialLargeArea);
  }

  // Desempate fraco a favor de 1ª chapas mais cheias (entre médias equivalentes).
  fitness += 0.0001 * firstSheetUtil;

  // Penalidade real: ordenação degenerada que não coloca nenhuma peça numa chapa.
  fitness -= 0.01 * rejectedCount;
  // Removido o bônus de continuityScore: ele somava fitness por LARGURA SOBRANDO na
  // chapa, ou seja, premiava NÃO preencher — anti-objetivo direto.

  return {
    fitness: Math.max(0, fitness),
    firstTree: firstTree || createRoot(usableW, usableH),
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
  seed: number = DEFAULT_GA_SEED,
): Promise<TreeNode> {
  // Spec 007 (C1): toda a aleatoriedade do GA vem de um PRNG semeado —
  // mesmo input (e mesma semente) → mesmo plano de corte (Princípio V).
  const rand = mulberry32(seed);
  const populationSize = Math.max(10, gaPopulationSize);
  const generations = Math.max(0, gaGenerations);
  const eliteCount = Math.max(2, Math.floor(populationSize * 0.1));

  const numPieces = pieces.length;

  // Mapa label→(w,h) real das peças de entrada, para corrigir folhas fantasma no
  // final (ver capPhantomLeaves). No fluxo do runAllSheets cada instância tem um
  // label uid único; agrupamentos internos preservam esses labels nas folhas.
  //
  // Spec 012 (T013): num GRUPO (`count > 1`), `p.w`/`p.h` são as medidas do
  // AGREGADO — NÃO de peça alguma. Mapear cada rótulo do grupo para `[p.w,p.h]`
  // ensinava o capPhantomLeaves a "corrigir" para a medida errada. A medida real
  // de cada membro vem de `individualDims` × a medida transversal (ver
  // data-model.md, "Piece — sobrecarregada"):
  //   groupedAxis "w" → membro i = [individualDims[i], p.h]
  //   groupedAxis "h" → membro i = [p.w, individualDims[i]]
  //   groupedAxis "2d" → individualDims = [cols, rows]; membro = [p.w/cols, p.h/rows]
  const labelDims = new Map<string, [number, number]>();
  for (const p of pieces) {
    if (p.label) labelDims.set(p.label, [p.w, p.h]);
    if (!p.labels) continue;

    const n = p.count ?? 1;
    if (n <= 1 || !p.groupedAxis || !p.individualDims) {
      // singleton rotulado ou grupo não decodificável: cai no agregado (é o
      // melhor disponível e casa quando a peça ocupa o contêiner inteiro).
      p.labels.forEach((lb) => { if (lb) labelDims.set(lb, [p.w, p.h]); });
      continue;
    }

    if (p.groupedAxis === "2d") {
      const [cols, rows] = p.individualDims;
      const pw = cols > 0 ? p.w / cols : p.w;
      const ph = rows > 0 ? p.h / rows : p.h;
      p.labels.forEach((lb) => { if (lb) labelDims.set(lb, [pw, ph]); });
    } else {
      const transverse = p.groupedAxis === "w" ? p.h : p.w;
      p.labels.forEach((lb, i) => {
        if (!lb) return;
        const along = p.individualDims![i] ?? (p.groupedAxis === "w" ? p.w : p.h);
        labelDims.set(lb, p.groupedAxis === "w" ? [along, transverse] : [transverse, along]);
      });
    }
  }

  const GROUPING_MODES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

  function randomIndividual(): GAIndividual {
    const genome = Array.from({ length: numPieces }, (_, i) => i);
    for (let i = genome.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [genome[i], genome[j]] = [genome[j], genome[i]];
    }
    return {
      genome,
      rotations: Array.from({ length: numPieces }, () => rand() > 0.5),
      groupingMode: GROUPING_MODES[Math.floor(rand() * GROUPING_MODES.length)] as GAIndividual['groupingMode'],
      transposed: rand() > 0.5,
      stripMode: rand() > 0.5 ? 'V' : 'H',
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
    // Lookahead reduced from min(3, n/5) to 1 for ~3× speedup. The next
    // sheet will be re-optimized in the next outer iteration anyway.
    const lookahead = 1;
    const eW = ind.transposed ? usableH : usableW;
    const eH = ind.transposed ? usableW : usableH;
    const horizontalHint = getHorizontalStripHint(ind, work, eW, eH);
    const result = simulateSheets(work, eW, eH, minBreak, lookahead, horizontalHint);
    return { tree: result.firstTree, fitness: result.fitness, transposed: ind.transposed };
  }

  function tournament(pop: { ind: GAIndividual; fitness: number }[]): GAIndividual {
    const k = 4;
    let best = pop[Math.floor(rand() * pop.length)];
    for (let i = 1; i < k; i++) {
      const c = pop[Math.floor(rand() * pop.length)];
      if (c.fitness > best.fitness) best = c;
    }
    return best.ind;
  }

  function crossover(pA: GAIndividual, pB: GAIndividual): GAIndividual {
    const size = pA.genome.length;
    const start = Math.floor(rand() * size);
    const end = Math.floor(rand() * (size - start)) + start;

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

    const childRotations = pA.rotations.map((r, i) => (rand() > 0.5 ? r : pB.rotations[i]));
    const childGrouping = (rand() > 0.5 ? pA.groupingMode : pB.groupingMode) as GAIndividual['groupingMode'];

    return {
      genome: childGenome,
      rotations: childRotations,
      groupingMode: childGrouping,
      transposed: rand() > 0.5 ? pA.transposed : pB.transposed,
      stripMode: rand() > 0.5 ? pA.stripMode : pB.stripMode,
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

    const r = rand();
    if (r < 0.20) {
      // Swap two positions in genome
      if (c.genome.length > 2) {
        const a = 1 + Math.floor(rand() * (c.genome.length - 1));
        const b = 1 + Math.floor(rand() * (c.genome.length - 1));
        [c.genome[a], c.genome[b]] = [c.genome[b], c.genome[a]];
      }
    } else if (r < 0.40) {
      // Block move in genome
      if (c.genome.length > 4) {
        const tail = c.genome.splice(1);
        const blockSize = Math.floor(rand() * Math.min(5, tail.length / 2)) + 2;
        const start = Math.floor(rand() * Math.max(1, tail.length - blockSize));
        const segment = tail.splice(start, blockSize);
        const target = Math.floor(rand() * tail.length);
        tail.splice(target, 0, ...segment);
        c.genome = [c.genome[0], ...tail];
      }
    } else if (r < 0.55) {
      // Flip rotations
      const count = Math.max(1, Math.floor(c.rotations.length * 0.1));
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(rand() * c.rotations.length);
        c.rotations[idx] = !c.rotations[idx];
      }
    } else if (r < 0.70) {
      // Change grouping mode
      c.groupingMode = GROUPING_MODES[Math.floor(rand() * GROUPING_MODES.length)] as GAIndividual['groupingMode'];
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
    // Cap fantasma na árvore CRUA (antes da normalização) — assim os retângulos
    // extraídos já saem corretos e a normalização não "assa" a inflação.
    capPhantomLeaves(finalTree, labelDims);
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

    capPhantomLeaves(finalTree, labelDims);
    consolidateColumns(finalTree); // spec 013 — cortar até o final primeiro
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
      if (rand() < adaptiveMutationRate) child = mutate(child);

      const key = child.genome.join(",") + child.groupingMode + child.stripMode + (child.transposed ? "T" : "N");
      if (!seenGenomes.has(key)) {
        nextPop.push(child);
        seenGenomes.add(key);
      } else if (rand() < 0.2) {
        nextPop.push(randomIndividual());
      }
    }
    population = nextPop;
  }

  let finalTree = bestTree || createRoot(usableW, usableH);
  // Cap fantasma na árvore CRUA (antes da normalização) — ver capPhantomLeaves.
  capPhantomLeaves(finalTree, labelDims);
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

  capPhantomLeaves(finalTree, labelDims);
  consolidateColumns(finalTree); // spec 013 — cortar até o final primeiro
  return finalTree;
}

export function optimizeGeneticV1(pieces: Piece[], usableW: number, usableH: number, minBreak: number = 0): TreeNode {
  return optimizeV6(pieces, usableW, usableH, minBreak).tree;
}
