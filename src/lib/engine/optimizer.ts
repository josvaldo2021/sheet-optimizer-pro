// CNC Cut Plan Engine — Main Optimizer V6

import { TreeNode, Piece } from './types';
import { createRoot, calcPlacedArea, physicalCount, physicalMeasureSet, validatePlacementCandidate, largestFreeRect, cloneTree, consolidateColumns } from './tree-utils';
import { normalizeTree } from './normalization';
import { runPlacement } from './placement';
import { postOptimizeRegroup } from './post-processing';
import {
  groupPiecesBySameWidth,
  groupPiecesBySameHeight,
  groupPiecesByHeight,
  groupPiecesByWidth,
  groupPiecesFillRow,
  groupPiecesFillCol,
  groupPiecesColumnWidth,
  groupPiecesColumnHeight,
  groupPiecesBandFirst,
  groupPiecesBandLast,
  groupByCommonDimension,
  groupByCommonDimensionTransposed,
  groupStripPackingDP,
  groupStripPackingDPTransposed,
  groupCommonDimensionDP,
  groupIdenticalPieces2D,
} from './grouping';

export function getSortStrategies(): ((a: Piece, b: Piece) => number)[] {
  return [
    (a, b) => b.area - a.area || Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => b.w + b.h - (a.w + a.h),
    (a, b) => b.w / b.h - a.w / a.h,
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    (a, b) => {
      const ra = Math.max(a.w, a.h) / Math.min(a.w, a.h);
      const rb = Math.max(b.w, b.h) / Math.min(b.w, b.h);
      return rb - ra;
    },
    (a, b) => b.area - a.area || b.w - a.w,
    (a, b) => b.area - a.area || b.h - a.h,
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => (b.w * b.h) / (b.w + b.h) - (a.w * a.h) / (a.w + a.h),
    // idx 12 — H1: altura ascendente (peça de menor altura primeiro), desempate largura asc.
    // "Menor dimensão primeiro" — arranjo ausente no conjunto (todos os anteriores são desc).
    (a, b) => a.h - b.h || a.w - b.w,
    // idx 13 — H2: largura ascendente (simétrico de H1 no eixo horizontal), desempate altura asc.
    (a, b) => a.w - b.w || a.h - b.h,
  ];
}

export function optimizeV6(
  pieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  useGrouping?: boolean,
): { tree: TreeNode; remaining: Piece[] } {
  if (pieces.length === 0) return { tree: createRoot(usableW, usableH), remaining: [] };

  const pieceSignature = (p: Piece) => [
    p.w,
    p.h,
    p.count || 1,
    p.label || '',
    p.groupedAxis || '',
    p.labels?.join(',') || '',
    p.individualDims?.join(',') || '',
  ].join(':');

  const sequenceSignature = (arr: Piece[]) => arr.map(pieceSignature).join('|');

  const strategies = getSortStrategies();

  const rotatedPieces = pieces.map((p) => ({ w: p.h, h: p.w, area: p.area, count: p.count, label: p.label }));

  // Spec 012: peças rotuladas caíam num ramo SEM agrupamento (guard `hasLabels`),
  // perdendo as 50+ variantes abaixo. Como todo trabalho real vem rotulado do
  // relatório de OF, o motor nunca rodava com agrupamento em produção — violando
  // o Princípio III e fragmentando as sobras. O guard encobria duas falhas de
  // conservação na expansão de grupos rotulados, ambas corrigidas: o roteamento
  // do splitAxis (placement.ts) e a mistura de alturas por tolerância no
  // groupStripPackingDP (grouping.ts).
  //
  // Spec 012 (T036): o gate `skipExpensiveGrouping` (pulava as variantes de
  // agrupamento para n>50 e maxRepetition<3) foi REMOVIDO. Ele existia SÓ aqui,
  // sem espelho no Rust — divergência viva do Princípio VI. Como o app roda WASM
  // (que sempre agrupa), o gate só afetava o fallback TS, e nos dados reais do
  // usuário nunca disparava. Removê-lo faz o TS convergir para o WASM: mesma
  // qualidade nos dois motores, ao custo de CPU no fallback TS em jobs grandes de
  // baixa repetição (regime que não ocorre nos relatórios de OF reais).
  const pieceVariantBuilders: Array<() => Piece[]> =
    useGrouping === false
      ? [() => pieces, () => rotatedPieces]
      : [
          // Bug adormecido corrigido (spec 007): estas entradas eram arrays já
          // computados num Array<() => Piece[]>, e buildVariant() lançava
          // TypeError para qualquer chamada sem labels com agrupamento ligado.
          () => pieces,
          () => rotatedPieces,
          () => groupPiecesBySameWidth(pieces, usableH),
          () => groupPiecesBySameWidth(rotatedPieces, usableH),
          () => groupPiecesBySameWidth(pieces),
          () => groupPiecesBySameWidth(rotatedPieces),
          () => groupPiecesBySameHeight(pieces, usableW),
          () => groupPiecesBySameHeight(rotatedPieces, usableW),
          () => groupPiecesBySameHeight(pieces),
          () => groupPiecesBySameHeight(rotatedPieces),
          () => groupPiecesFillRow(pieces, usableW),
          () => groupPiecesFillRow(rotatedPieces, usableW),
          () => groupPiecesFillRow(pieces, usableW, true),
          () => groupPiecesFillRow(rotatedPieces, usableW, true),
          () => groupPiecesFillCol(pieces, usableH),
          () => groupPiecesFillCol(rotatedPieces, usableH),
          () => groupPiecesFillCol(pieces, usableH, true),
          () => groupPiecesFillCol(rotatedPieces, usableH, true),
          () => groupPiecesFillRow(groupPiecesBySameWidth(pieces, usableH), usableW),
          () => groupPiecesFillRow(groupPiecesBySameHeight(pieces, usableW), usableW),
          () => groupPiecesColumnWidth(pieces, usableW),
          () => groupPiecesColumnWidth(rotatedPieces, usableW),
          () => groupPiecesColumnHeight(pieces, usableH),
          () => groupPiecesColumnHeight(rotatedPieces, usableH),
          () => groupPiecesBandFirst(pieces, usableW),
          () => groupPiecesBandFirst(rotatedPieces, usableW),
          () => groupPiecesBandFirst(pieces, usableW, true),
          () => groupPiecesBandFirst(rotatedPieces, usableW, true),
          () => groupPiecesBandLast(pieces, usableW),
          () => groupPiecesBandLast(rotatedPieces, usableW),
          () => groupByCommonDimension(pieces, usableW, usableH),
          () => groupByCommonDimension(rotatedPieces, usableW, usableH),
          () => groupByCommonDimension(pieces, usableW, usableH, 0.3),
          () => groupByCommonDimension(rotatedPieces, usableW, usableH, 0.3),
          () => groupByCommonDimensionTransposed(pieces, usableW, usableH),
          () => groupByCommonDimensionTransposed(rotatedPieces, usableW, usableH),
          () => groupStripPackingDP(pieces, usableW, usableH, 0),
          () => groupStripPackingDP(rotatedPieces, usableW, usableH, 0),
          () => groupStripPackingDP(pieces, usableW, usableH, 5),
          () => groupStripPackingDP(rotatedPieces, usableW, usableH, 5),
          () => groupStripPackingDP(pieces, usableW, usableH, 30),
          () => groupStripPackingDP(rotatedPieces, usableW, usableH, 30),
          () => groupStripPackingDP(pieces, usableW, usableH, 100),
          () => groupStripPackingDP(pieces, usableW, usableH, 5, "raw"),
          () => groupStripPackingDP(rotatedPieces, usableW, usableH, 5, "raw"),
          () => groupStripPackingDPTransposed(pieces, usableW, usableH, 0),
          () => groupStripPackingDPTransposed(rotatedPieces, usableW, usableH, 0),
          () => groupStripPackingDPTransposed(pieces, usableW, usableH, 5),
          () => groupStripPackingDPTransposed(rotatedPieces, usableW, usableH, 5),
          () => groupCommonDimensionDP(pieces, usableW, usableH),
          () => groupCommonDimensionDP(rotatedPieces, usableW, usableH),
          () => groupCommonDimensionDP(pieces, usableW, usableH, 0.2),
          () => groupCommonDimensionDP(rotatedPieces, usableW, usableH, 0.2),
          () => groupIdenticalPieces2D(pieces, usableW, usableH),
          () => groupIdenticalPieces2D(rotatedPieces, usableW, usableH),
        ];

  let bestTree: TreeNode | null = null;
  let bestArea = 0;
  let bestRemaining: Piece[] = [];
  let bestTransposed = false;
  let bestCompactness = Infinity;
  let bestFreeArea = 0; // spec 011 — área do maior retângulo livre do melhor atual
  const seenVariants = new Set<string>();
  const seenSortedOrders = new Set<string>();

  // Spec 012 (T011) — validação no LIMITE candidato→plano. `pieces` é o
  // inventário físico oferecido; toda variante o reagrupa, então a conservação
  // é medida contra este total constante. `validMeasures` guarda as medidas
  // reais para barrar folhas fantasma (INV-2). Um candidato que viole os
  // invariantes é DESCARTADO antes do desempate — não pode vencer por parecer
  // mais compacto (o bug se disfarçando de qualidade, Achado 2).
  const expectedPhysical = physicalCount(pieces);
  const validMeasures = physicalMeasureSet(pieces);
  // Rede de segurança: se NENHUM candidato válido aparecer (patológico — a
  // variante trivial de peças soltas deveria sempre passar), preferimos colocar
  // peças a devolver chapa vazia. Guarda o melhor inválido só para esse caso.
  let fallbackTree: TreeNode | null = null;
  let fallbackArea = 0;
  let fallbackRemaining: Piece[] = [];
  let fallbackTransposed = false;

  /** Fewer top-level columns = more compact waste = better layout */
  function calcCompactness(tree: TreeNode): number {
    const numCols = tree.filhos.length;
    // Penalize layouts with many columns; also prefer fewer total nodes
    let totalNodes = 0;
    function countNodes(n: TreeNode) { totalNodes++; for (const c of n.filhos) countNodes(c); }
    countNodes(tree);
    return numCols * 1000 + totalNodes;
  }

  for (const transposed of [false, true]) {
    const eW = transposed ? usableH : usableW;
    const eH = transposed ? usableW : usableH;

    for (const buildVariant of pieceVariantBuilders) {
      const variant = buildVariant();
      const variantKey = `${transposed ? 'T' : 'N'}|${sequenceSignature(variant)}`;
      if (seenVariants.has(variantKey)) continue;
      seenVariants.add(variantKey);

      for (const sortFn of strategies) {
        const sorted = [...variant].sort(sortFn);
        const sortedKey = `${transposed ? 'T' : 'N'}|${sequenceSignature(sorted)}`;
        if (seenSortedOrders.has(sortedKey)) continue;
        seenSortedOrders.add(sortedKey);

        const result = runPlacement(sorted, eW, eH, minBreak);

        // T011: descartar candidato que viole conservação/fidelidade/rótulo.
        if (!validatePlacementCandidate(result.tree, result.remaining, expectedPhysical, validMeasures)) {
          if (result.area > fallbackArea) {
            fallbackArea = result.area;
            fallbackTree = result.tree;
            fallbackRemaining = result.remaining;
            fallbackTransposed = transposed;
          }
          continue;
        }

        // Área domina (objetivo primário): um candidato com menos área nunca
        // vence, então nem calculamos a consolidação dele (poda de custo).
        if (result.area < bestArea) continue;

        const compactness = calcCompactness(result.tree);

        // Spec 011 — CONSOLIDAÇÃO da sobra (desempate SUBORDINADO à área): entre
        // candidatos de mesma área, preferir o cujo MAIOR retângulo livre é MAIOR
        // — a sobra fica num bloco único reutilizável em vez de fragmentada. A
        // sobra vale por si (definição do usuário), independente de peça específica.
        //
        // CRÍTICO: mede-se na árvore COMO ELA SERÁ finalizada. `normalizeTree`
        // reestrutura os cortes e muda o maior retângulo livre; e o resultado só é
        // normalizado quando transposto (ou minBreak>0). Medir na árvore crua
        // escolheria o candidato errado (medido: âncora ficava em 991k em vez do
        // bloco consolidado). Ver research.md, "Validação empírica".
        //
        // ACHADO que trocou o critério ESCRITO (residual-fit): `runPlacement`
        // DESCARTA a peça que não cabe (`remaining.shift()`), então
        // `result.remaining` é sempre vazio e o residual-fit nunca dispararia; e no
        // cenário-âncora todas as peças cabem (sem "próxima peça") ⇒ só a
        // consolidação distingue os candidatos.
        let measuredTree = result.tree;
        if (transposed) {
          const c = cloneTree(result.tree);
          c.transposed = true;
          measuredTree = normalizeTree(c, usableW, usableH, minBreak);
        } else if (minBreak > 0) {
          measuredTree = normalizeTree(cloneTree(result.tree), usableW, usableH, minBreak);
        }
        const freeRect = largestFreeRect(measuredTree, usableW, usableH);
        const freeArea = freeRect ? freeRect.w * freeRect.h : 0;

        const better =
          result.area > bestArea ||
          (result.area === bestArea && (
            freeArea > bestFreeArea ||
            (freeArea === bestFreeArea && compactness < bestCompactness)
          ));

        if (better) {
          bestArea = result.area;
          bestTree = result.tree;
          bestRemaining = result.remaining;
          bestTransposed = transposed;
          bestCompactness = compactness;
          bestFreeArea = freeArea;
        }
      }
    }
  }

  // T011: só cai no fallback (candidato inválido) se NENHUM válido venceu —
  // colocar peças com um plano imperfeito é melhor que devolver chapa vazia.
  if (!bestTree && fallbackTree) {
    bestTree = fallbackTree;
    bestRemaining = fallbackRemaining;
    bestTransposed = fallbackTransposed;
  }

  let finalTree = bestTree || createRoot(usableW, usableH);
  if (bestTransposed) {
    finalTree.transposed = true;
    finalTree = normalizeTree(finalTree, usableW, usableH, minBreak);
  } else if (minBreak > 0) {
    finalTree = normalizeTree(finalTree, usableW, usableH, minBreak);
  }

  // Spec 013 — "cortar até o final primeiro": consolida a sobra lateral de
  // colunas com peças de mesma largura empilhadas. Não move peças; só junta os
  // retalhos laterais num bloco reutilizável.
  consolidateColumns(finalTree);

  return {
    tree: finalTree,
    remaining: bestRemaining,
  };
}
