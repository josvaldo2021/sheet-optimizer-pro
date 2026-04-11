// CNC Cut Plan Engine — Piece Node Creation & Main Placement Loop

import { TreeNode, Piece } from './types';
import { gid, createRoot, findNode, insertNode } from './tree-utils';
import { oris, scoreFit, canResidualFitAnyPiece, getAllZCutPositionsInColumn, violatesZMinBreak } from './scoring';
import { fillVoids } from './void-filling';
import { unifyColumnWaste, collapseTreeWaste, regroupAdjacentStrips, clampTreeHeights } from './post-processing';

/**
 * Internal helper to create the necessary nodes (Z, W, Q) for a piece placement.
 */
export function createPieceNodes(
  tree: TreeNode,
  yNode: TreeNode,
  piece: Piece,
  placedW: number,
  placedH: number,
  rotated: boolean,
  zNodeToUse?: TreeNode,
): number {
  const isGrouped = piece.count && piece.count > 1;
  let addedArea = 0;

  if (isGrouped) {
    const originalAxis = piece.groupedAxis || "w";
    let splitAxis: "Z" | "W" | "Q";

    if (originalAxis === "w" && !rotated) {
      splitAxis = "Z";
    } else if ((originalAxis === "h" && !rotated) || (originalAxis === "w" && rotated)) {
      splitAxis = "W";
    } else {
      splitAxis = "Q";
    }

    if (zNodeToUse && splitAxis === "Z") splitAxis = "W";

    if (splitAxis === "Z") {
      for (let i = 0; i < piece.count!; i++) {
        const dimW = piece.individualDims ? piece.individualDims[i] : Math.round(placedW / piece.count!);
        const zId = insertNode(tree, yNode.id, "Z", dimW, 1);
        const zNode = findNode(tree, zId)!;
        if (piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
        const wId = insertNode(tree, zId, "W", placedH, 1);
        const wNode = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode.label = piece.labels[i];
      }
    } else if (splitAxis === "W") {
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
      for (let i = 0; i < piece.count!; i++) {
        const dimH = piece.individualDims ? piece.individualDims[i] : Math.round(placedH / piece.count!);
        const wId = insertNode(tree, zNode.id, "W", dimH, 1);
        const wNode_f = findNode(tree, wId)!;
        if (piece.labels && piece.labels[i]) wNode_f.label = piece.labels[i];
        if (i === 0 && piece.labels && piece.labels[i]) zNode.label = piece.labels[i];
      }
    } else {
      const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
      const wId = insertNode(tree, zNode.id, "W", placedH, 1);
      const wNode = findNode(tree, wId)!;
      for (let i = 0; i < piece.count!; i++) {
        const dimW = piece.individualDims ? piece.individualDims[i] : Math.round(placedW / piece.count!);
        const qId = insertNode(tree, wId, "Q", dimW, 1);
        const qNode = findNode(tree, qId)!;
        if (piece.labels && piece.labels[i]) {
          qNode.label = piece.labels[i];
          if (i === 0) {
            wNode.label = piece.labels[i];
            zNode.label = piece.labels[i];
          }
        }
      }
    }
  } else {
    const zNode = zNodeToUse || findNode(tree, insertNode(tree, yNode.id, "Z", placedW, 1))!;
    if (piece.label) zNode.label = piece.label;

    const wId = insertNode(tree, zNode.id, "W", placedH, 1);
    const wNode = findNode(tree, wId)!;
    if (piece.label) wNode.label = piece.label;

    const actualPieceW = rotated ? piece.h : piece.w;
    if (actualPieceW < placedW) {
      const qId = insertNode(tree, wId, "Q", actualPieceW, 1);
      const qNode = findNode(tree, qId)!;
      if (piece.label) qNode.label = piece.label;
    }
  }

  addedArea = placedW * placedH;
  return addedArea;
}

/**
 * Main placement loop: places pieces into columns/strips one at a time.
 */
/**
 * @param horizontalStrip - When provided, the first column uses X = full sheet width
 *   (neutral cut) and a Y strip of baseH, simulating a horizontal-first cut.
 *   baseW is used to place the base piece as a Z subdivision within that Y strip.
 */
export function runPlacement(
  inventory: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number = 0,
  horizontalStrip?: { baseW: number; baseH: number },
): { tree: TreeNode; area: number; remaining: Piece[] } {
  const tree = createRoot(usableW, usableH);
  let placedArea = 0;
  const remaining = [...inventory];

  // === Horizontal strip mode: pre-seed the tree with X=fullWidth, Y=baseH ===
  if (horizontalStrip && remaining.length > 0) {
    const { baseW, baseH } = horizontalStrip;
    // X = full sheet width (neutral vertical cut)
    const xId = insertNode(tree, "root", "X", usableW, 1);
    const xNode = findNode(tree, xId)!;
    // Y = base piece height (first effective horizontal cut)
    const yId = insertNode(tree, xNode.id, "Y", baseH, 1);
    const yNode = findNode(tree, yId)!;

    // Place the base piece as a Z column within the Y strip
    const basePiece = remaining[0];
    placedArea += createPieceNodes(tree, yNode, basePiece, baseW, baseH, baseW !== basePiece.w);
    remaining.shift();

    // Fill remaining width in the Y strip with other pieces
    let freeZW = usableW - baseW;
    for (let i = 0; i < remaining.length && freeZW > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (o.w <= freeZW && o.h <= baseH) {
          const score = (baseH - o.h) * 2 + (freeZW - o.w);
          if (score < bestScore) {
            bestScore = score;
            bestOri = o;
          }
        }
      }

      if (bestOri) {
        placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);
        freeZW -= bestOri.w;
        remaining.splice(i, 1);
        i--;
      }
    }
  }

  while (remaining.length > 0) {
    const piece = remaining[0];
    let bestFit: {
      type: "EXISTING" | "NEW";
      col?: TreeNode;
      w: number;
      h: number;
      pieceW: number;
      pieceH: number;
      score: number;
      rotated: boolean;
    } | null = null;

    // 1. Try existing columns
    for (const colX of tree.filhos) {
      const usedH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      const freeH = usableH - usedH;

      for (const o of oris(piece)) {
        if (minBreak > 0) {
          if (o.h < minBreak) continue;
          const allZPositions = getAllZCutPositionsInColumn(colX);
          if (violatesZMinBreak([o.w], allZPositions, minBreak)) continue;
        }
        if (o.w <= colX.valor && o.h <= freeH) {
          let effectiveH = o.h;
          const residualH = freeH - o.h;
          if (residualH > 0) {
            const ySibValues = colX.filhos.map((y) => y.valor);
            // Only expand to fill remaining height if NO piece could use that space
            // Check both: fitting within this Y strip's residual AND as a separate Y strip
            const canFitInResidual = canResidualFitAnyPiece(colX.valor, residualH, remaining.slice(1), minBreak, ySibValues, "h");
            const canFitAsSeparateY = remaining.slice(1).some(p =>
              oris(p).some(po => po.w <= colX.valor && po.h <= residualH)
            );
            if (!canFitInResidual && !canFitAsSeparateY) {
              effectiveH = freeH;
            }
          }
          const widthRatio = o.w / colX.valor;
          const heightRatio = o.h / freeH;
          // Base penalty for width mismatch (lower = better)
          const widthPenalty = (1 - widthRatio) * 1.0;
          const heightPenalty = (1 - heightRatio) * 0.3;
          // Strong bonus for reusing existing column instead of consuming new X-width
          // This is the key: placing in an existing column is FREE in X-axis,
          // while a new column costs precious sheet width
          const reuseBonus = 2.0;
          const baseScore = widthPenalty + heightPenalty - reuseBonus;

          let lookBonus = 0;
          const remH = freeH - o.h;
          const remW = colX.valor - o.w;

          for (const r of remaining.slice(1)) {
            for (const ro of oris(r)) {
              if (ro.w <= colX.valor && ro.h <= remH) {
                lookBonus -= 0.5;
                break;
              }
              if (ro.w <= remW && ro.h <= o.h) {
                lookBonus -= 0.3;
                break;
              }
            }
            if (lookBonus < -1) break;
          }

          const score = baseScore + lookBonus;
          if (!bestFit || score < bestFit.score) {
            bestFit = {
              type: "EXISTING",
              col: colX,
              w: o.w,
              h: effectiveH,
              pieceW: o.w,
              pieceH: o.h,
              score,
              rotated: o.w !== piece.w,
            };
          }
        }
      }
    }

    // 2. Try new column
    const usedW = tree.filhos.reduce((a, x) => a + x.valor * x.multi, 0);
    const freeW = usableW - usedW;

    if (freeW > 0) {
      for (const o of oris(piece)) {
        if (minBreak > 0) {
          const violatesX = tree.filhos.some((x) => {
            const diff = Math.abs(x.valor - o.w);
            return diff > 0 && diff < minBreak;
          });
          if (violatesX) continue;
        }
        if (o.w <= freeW && o.h <= usableH) {
          let effectiveW = o.w;
          const residualW = freeW - o.w;
          if (residualW > 0) {
            const xSibValues = tree.filhos.map((x) => x.valor);
            if (!canResidualFitAnyPiece(residualW, usableH, remaining.slice(1), minBreak, xSibValues, "w")) {
              effectiveW = freeW;
            }
          }
          const score = ((freeW - effectiveW) / usableW) * 0.5;
          if (!bestFit || score < bestFit.score) {
            bestFit = { type: "NEW", w: effectiveW, h: o.h, pieceW: o.w, pieceH: o.h, score, rotated: o.w !== piece.w };
          }
        }
      }
    }

    if (!bestFit) {
      remaining.shift();
      continue;
    }

    let col: TreeNode;
    if (bestFit.type === "NEW") {
      insertNode(tree, "root", "X", bestFit.w, 1);
      col = tree.filhos[tree.filhos.length - 1];
    } else {
      col = bestFit.col!;
    }

    // Safety: verify column height before inserting Y strip
    {
      const currentUsedH = col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
      if (currentUsedH + bestFit.h > usableH + 0.5) {
        console.warn(
          `[CNC-ENGINE] Main loop: Y insertion would overflow column. usedH=${currentUsedH}, newY=${bestFit.h}, usableH=${usableH}. Skipping piece.`,
        );
        remaining.shift();
        continue;
      }
    }

    // === PRE-CHECK: Vertical stacking opportunity ===
    const colFreeH = usableH - col.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const isGroupedPiece = piece.count && piece.count > 1;

    const stackCandidateIndices: number[] = [];
    if (!isGroupedPiece) {
      for (let i = 1; i < remaining.length; i++) {
        const pc = remaining[i];
        if (pc.count && pc.count > 1) continue;
        if (oris(pc).some(o => o.w === bestFit.pieceW && o.h === bestFit.pieceH)) {
          stackCandidateIndices.push(i);
        }
      }
    }

    let maxPossibleStack = Math.min(
      1 + stackCandidateIndices.length,
      Math.floor(colFreeH / bestFit.pieceH)
    );

    // Limit stacking if it would prevent other (different) pieces from fitting in this column.
    // Check: if we stack N pieces, would the remaining column height still fit any other piece?
    if (maxPossibleStack >= 2 && !isGroupedPiece) {
      const otherPieces = remaining.filter((p, idx) => {
        if (idx === 0) return false; // current piece
        if (p.count && p.count > 1) return false;
        // Skip pieces that are same-dimension stack candidates
        return !oris(p).some(o => o.w === bestFit.pieceW && o.h === bestFit.pieceH);
      });

      if (otherPieces.length > 0) {
        // Find the optimal stack count that leaves room for other pieces
        for (let tryStack = maxPossibleStack; tryStack >= 2; tryStack--) {
          const usedAfterStack = tryStack * bestFit.pieceH;
          const freeAfterStack = colFreeH - usedAfterStack;
          const canFitOther = otherPieces.some(p =>
            oris(p).some(o => o.w <= col.valor && o.h <= freeAfterStack)
          );
          if (canFitOther) {
            maxPossibleStack = tryStack;
            break;
          }
          // If even stacking 1 less doesn't help, try fewer
          if (tryStack === 2) {
            // Check if NOT stacking at all (1 piece) leaves room
            const freeWith1 = colFreeH - bestFit.pieceH;
            const canFitWith1 = otherPieces.some(p =>
              oris(p).some(o => o.w <= col.valor && o.h <= freeWith1)
            );
            if (canFitWith1) {
              maxPossibleStack = 1; // disable combined Y
            }
          }
        }
      }
    }

    let stackViolatesMinBreak = false;
    if (minBreak > 0 && maxPossibleStack >= 2) {
      const ySibValues = col.filhos.map(y => y.valor);
      stackViolatesMinBreak = ySibValues.some(yv => {
        const diff = Math.abs(yv - bestFit.pieceH);
        return diff > 0 && diff < minBreak;
      });
      if (!stackViolatesMinBreak) {
        const allZPositions = getAllZCutPositionsInColumn(col);
        if (violatesZMinBreak([bestFit.pieceW], allZPositions, minBreak, col.filhos.length)) {
          stackViolatesMinBreak = true;
        }
      }
    }

    const useCombinedY = maxPossibleStack >= 2 && !stackViolatesMinBreak && !isGroupedPiece;

    if (useCombinedY) {
      // === COMBINED Y STRIP STRATEGY ===
      const stackCount = maxPossibleStack;
      const combinedH_raw = stackCount * bestFit.pieceH;
      let combinedH = combinedH_raw;

      const residualH = colFreeH - combinedH_raw;
      if (residualH > 0) {
        const canFitResidual = remaining.some(p =>
          oris(p).some(o => o.w <= col.valor && o.h <= residualH)
        );
        if (!canFitResidual) combinedH = colFreeH;
      }

      const combYId = insertNode(tree, col.id, "Y", combinedH, 1);
      const combYNode = findNode(tree, combYId)!;

      const zId = insertNode(tree, combYNode.id, "Z", bestFit.pieceW, 1);
      const zNode = findNode(tree, zId)!;

      {
        const wId = insertNode(tree, zNode.id, "W", bestFit.pieceH, 1);
        const wNode = findNode(tree, wId)!;
        if (piece.label) { wNode.label = piece.label; zNode.label = piece.label; }
        placedArea += bestFit.pieceW * bestFit.pieceH;
        remaining.shift();
      }

      let placedCount = 1;
      const indicesToRemove: number[] = [];
      for (const origIdx of stackCandidateIndices) {
        if (placedCount >= stackCount) break;
        const adjIdx = origIdx - 1;
        if (adjIdx < 0 || adjIdx >= remaining.length) continue;
        const pc = remaining[adjIdx];
        const wId = insertNode(tree, zNode.id, "W", bestFit.pieceH, 1);
        const wNode = findNode(tree, wId)!;
        if (pc.label) wNode.label = pc.label;
        placedArea += bestFit.pieceW * bestFit.pieceH;
        indicesToRemove.push(adjIdx);
        placedCount++;
      }
      indicesToRemove.sort((a, b) => b - a).forEach(idx => remaining.splice(idx, 1));

      let freeZW = col.valor - bestFit.pieceW;

      for (let i = 0; i < remaining.length && freeZW > 0; ) {
        const pc = remaining[i];
        let lateralOri: { w: number; h: number } | null = null;

        for (const o of oris(pc)) {
          if (o.w <= freeZW && o.h <= bestFit.pieceH) {
            if (!lateralOri || o.w > lateralOri.w) lateralOri = o;
          }
        }

        if (lateralOri) {
          const latZId = insertNode(tree, combYNode.id, "Z", lateralOri.w, 1);
          const latZNode = findNode(tree, latZId)!;
          const latWId = insertNode(tree, latZNode.id, "W", lateralOri.h, 1);
          const latWNode = findNode(tree, latWId)!;
          if (pc.label) { latWNode.label = pc.label; latZNode.label = pc.label; }
          placedArea += lateralOri.w * lateralOri.h;
          remaining.splice(i, 1);

          let latUsedH = lateralOri.h;
          for (let j = 0; j < remaining.length && latUsedH < combinedH; ) {
            const lpc = remaining[j];
            let stackOri: { w: number; h: number } | null = null;
            for (const o of oris(lpc)) {
              if (o.w <= lateralOri.w && o.h <= combinedH - latUsedH) {
                if (!stackOri || o.w * o.h > stackOri.w * stackOri.h) stackOri = o;
              }
            }
            if (stackOri) {
              const swId = insertNode(tree, latZNode.id, "W", stackOri.h, 1);
              const swNode = findNode(tree, swId)!;
              if (lpc.label) swNode.label = lpc.label;
              placedArea += lateralOri.w * stackOri.h;
              latUsedH += stackOri.h;
              remaining.splice(j, 1);
            } else {
              j++;
            }
          }

          freeZW -= lateralOri.w;
        } else {
          i++;
        }
      }
    } else {
      // === SINGLE Y STRIP ===
      const yId = insertNode(tree, col.id, "Y", bestFit.h, 1);
      const yNode = findNode(tree, yId)!;

      placedArea += createPieceNodes(tree, yNode, piece, bestFit.pieceW, bestFit.pieceH, bestFit.rotated);
      remaining.shift();

      let freeZW = col.valor - bestFit.pieceW;

      // Pass 1: exact height matches
      for (let i = 0; i < remaining.length && freeZW > 0; i++) {
        const pc = remaining[i];
        let bestOri: { w: number; h: number } | null = null;
        let bestScore = Infinity;

        for (const o of oris(pc)) {
          if (o.h !== bestFit.pieceH) continue;
          if (minBreak > 0) {
            const allZPositions = getAllZCutPositionsInColumn(col);
            const yIndex = col.filhos.indexOf(yNode);
            const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
            const newCutPos = currentOffset + o.w;
            if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
          }
          if (o.w <= freeZW) {
            const score = freeZW - o.w;
            if (score < bestScore) {
              bestScore = score;
              bestOri = o;
            }
          }
        }

        if (bestOri) {
          placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);
          freeZW -= bestOri.w;
          remaining.splice(i, 1);
          i--;
        }
      }

      // Pass 2: shorter pieces
      for (let i = 0; i < remaining.length && freeZW > 0; i++) {
        const pc = remaining[i];
        let bestOri: { w: number; h: number } | null = null;
        let bestScore = Infinity;

        for (const o of oris(pc)) {
          if (minBreak > 0) {
            const allZPositions = getAllZCutPositionsInColumn(col);
            const yIndex = col.filhos.indexOf(yNode);
            const currentOffset = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
            const newCutPos = currentOffset + o.w;
            if (violatesZMinBreak([newCutPos], allZPositions, minBreak, yIndex)) continue;
          }
          if (o.w <= freeZW && o.h <= bestFit.h) {
            const score = (bestFit.h - o.h) * 2 + (freeZW - o.w);
            if (score < bestScore) {
              bestScore = score;
              bestOri = o;
            }
          }
        }

        if (bestOri) {
          placedArea += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);

          const zNodeCurrent = yNode.filhos[yNode.filhos.length - 1];
          let freeWH_remaining = bestFit.h - bestOri.h;

          for (let j = 0; j < remaining.length && freeWH_remaining > 0; j++) {
            if (j === i) continue;
            const pw = remaining[j];
            for (const wo of oris(pw)) {
              if (minBreak > 0) {
                const violatesW = zNodeCurrent.filhos.some((w) => {
                  const diff = Math.abs(w.valor - wo.h);
                  return diff > 0 && diff < minBreak;
                });
                if (violatesW) continue;
              }
              if (wo.w <= zNodeCurrent.valor && wo.h <= freeWH_remaining) {
                const actualRotated = wo.w !== pw.w;
                createPieceNodes(tree, yNode, pw, wo.w, wo.h, actualRotated, zNodeCurrent);

                placedArea += zNodeCurrent.valor * wo.h;
                freeWH_remaining -= wo.h;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }

          freeZW -= bestOri.w;
          remaining.splice(i, 1);
          i--;
        }
      }
    }
    // Void filling
    if (remaining.length > 0) {
      placedArea += fillVoids(tree, remaining, usableW, usableH, minBreak);
    }
  }

  // Post-processing pipeline
  if (remaining.length > 0) {
    placedArea += unifyColumnWaste(tree, remaining, usableW, usableH, minBreak);
  }

  if (remaining.length > 0) {
    placedArea += collapseTreeWaste(tree, remaining, usableW, usableH, minBreak);
  }

  placedArea += regroupAdjacentStrips(tree, remaining, usableW, usableH, minBreak);

  if (remaining.length > 0) {
    placedArea += fillVoids(tree, remaining, usableW, usableH, minBreak);
  }

  placedArea = clampTreeHeights(tree, usableW, usableH, placedArea);

  return { tree, area: placedArea, remaining };
}
