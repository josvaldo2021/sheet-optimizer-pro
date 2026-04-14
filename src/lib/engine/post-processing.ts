// CNC Cut Plan Engine — Post-Processing (Waste Unification, Collapse, Regrouping, Clamping)

import { TreeNode, Piece } from './types';
import { gid, insertNode, findNode, isWasteSubtree, calculateZArea, calculateWArea, calculateNodeArea } from './tree-utils';
import { oris, scoreFit, canResidualFitAnyPiece, zResidualViolatesMinBreak, getAllZCutPositionsInColumn, violatesZMinBreak } from './scoring';
import { createPieceNodes } from './placement';

interface AbsRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

// ========== UNIFY COLUMN WASTE ==========

export function unifyColumnWaste(
  tree: TreeNode,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
): number {
  let addedArea = 0;
  if (remaining.length === 0) return 0;

  const fillArea = (
    parentNode: TreeNode,
    parentType: "X" | "Y" | "Z",
    areaW: number,
    areaH: number,
  ): number => {
    let filled = 0;
    let freeH = areaH;

    for (let i = 0; i < remaining.length && freeH > 0; i++) {
      const pc = remaining[i];
      let bestOri: { w: number; h: number } | null = null;
      let bestScore = Infinity;

      for (const o of oris(pc)) {
        if (o.w <= areaW && o.h <= freeH) {
          if (minBreak > 0 && zResidualViolatesMinBreak(areaW, o.w, minBreak)) continue;
          const score = (areaW - o.w) + (freeH - o.h) * 0.1;
          if (score < bestScore) {
            bestScore = score;
            bestOri = o;
          }
        }
      }

      if (bestOri) {
        let effectiveH = bestOri.h;
        const residualH = freeH - bestOri.h;
        if (residualH > 0) {
          const canFitMore = remaining.slice(i + 1).some(p =>
            oris(p).some(o => o.w <= areaW && o.h <= residualH)
          );
          if (!canFitMore) effectiveH = freeH;
        }

        if (parentType === "X") {
          const yId = insertNode(tree, parentNode.id, "Y", effectiveH, 1);
          const yNode = findNode(tree, yId)!;
          filled += createPieceNodes(tree, yNode, pc, bestOri.w, bestOri.h, bestOri.w !== pc.w);

          let freeZW = areaW - bestOri.w;
          for (let j = 0; j < remaining.length && freeZW > 0; j++) {
            if (j === i) continue;
            const lpc = remaining[j];
            for (const o of oris(lpc)) {
              if (o.w <= freeZW && o.h <= effectiveH) {
                if (minBreak > 0 && zResidualViolatesMinBreak(freeZW, o.w, minBreak)) continue;
                filled += createPieceNodes(tree, yNode, lpc, o.w, o.h, o.w !== lpc.w);
                freeZW -= o.w;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }
        } else if (parentType === "Y") {
          const zId = insertNode(tree, parentNode.id, "Z", bestOri.w, 1);
          const zNode = findNode(tree, zId)!;
          const wId = insertNode(tree, zId, "W", bestOri.h, 1);
          const wNode = findNode(tree, wId)!;
          if (pc.label) { zNode.label = pc.label; wNode.label = pc.label; }
          filled += bestOri.w * bestOri.h;

          let freeWH = effectiveH - bestOri.h;
          for (let j = 0; j < remaining.length && freeWH > 0; j++) {
            if (j === i) continue;
            const lpc = remaining[j];
            for (const o of oris(lpc)) {
              if (o.w <= bestOri.w && o.h <= freeWH) {
                const wId2 = insertNode(tree, zNode.id, "W", o.h, 1);
                const wNode2 = findNode(tree, wId2)!;
                if (lpc.label) wNode2.label = lpc.label;
                // Create Q node when piece is narrower than the Z slot so that
                // extractUsedPiecesWithContext reads the correct piece width (not Z.valor).
                if (o.w < bestOri.w) {
                  const qId2 = insertNode(tree, wId2, "Q", o.w, 1);
                  const qNode2 = findNode(tree, qId2)!;
                  if (lpc.label) qNode2.label = lpc.label;
                }
                filled += o.w * o.h;
                freeWH -= o.h;
                remaining.splice(j, 1);
                if (j < i) i--;
                j--;
                break;
              }
            }
          }
        } else {
          const wId = insertNode(tree, parentNode.id, "W", bestOri.h, 1);
          const wNode = findNode(tree, wId)!;
          if (pc.label) wNode.label = pc.label;

          if (bestOri.w < areaW) {
            const qId = insertNode(tree, wId, "Q", bestOri.w, 1);
            const qNode = findNode(tree, qId)!;
            if (pc.label) qNode.label = pc.label;
          }
          filled += bestOri.w * bestOri.h;
        }

        freeH -= effectiveH;
        remaining.splice(i, 1);
        i--;
      }
    }
    return filled;
  };

  // LEVEL 1: X→Y level
  const columnsToProcess = [...tree.filhos];
  for (const colX of columnsToProcess) {
    if (remaining.length === 0) break;
    if (colX.filhos.length < 2) continue;

    const yWastes = colX.filhos.map(yNode => {
      const usedZ = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      return colX.valor - usedZ;
    });
    const minWaste = Math.min(...yWastes);
    if (minWaste < 50) continue;

    const totalH = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
    const canFit = remaining.some(p =>
      (p.w <= minWaste && p.h <= totalH) || (p.h <= minWaste && p.w <= totalH)
    );
    if (!canFit) continue;

    colX.valor -= minWaste;
    const newColId = insertNode(tree, "root", "X", minWaste, 1);
    const newCol = findNode(tree, newColId)!;

    const filled = fillArea(newCol, "X", minWaste, usableH);
    addedArea += filled;

    if (newCol.filhos.length === 0) {
      colX.valor += minWaste;
      tree.filhos = tree.filhos.filter(x => x.id !== newCol.id);
    }
  }

  // LEVEL 2: Y→Z level
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of [...colX.filhos]) {
      if (remaining.length === 0) break;
      if (yNode.filhos.length < 2) continue;

      const zWastes = yNode.filhos.map(zNode => {
        const usedW = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        return yNode.valor - usedW;
      });
      const minWaste = Math.min(...zWastes);
      if (minWaste < 50) continue;

      const totalW = yNode.filhos.reduce((a, z) => a + z.valor * z.multi, 0);
      const canFit = remaining.some(p =>
        (p.w <= totalW && p.h <= minWaste) || (p.h <= totalW && p.w <= minWaste)
      );
      if (!canFit) continue;

      yNode.valor -= minWaste;

      const newYId = insertNode(tree, colX.id, "Y", minWaste, 1);
      const newYNode = findNode(tree, newYId)!;

      const filled = fillArea(newYNode, "Y", colX.valor, minWaste);
      addedArea += filled;

      if (newYNode.filhos.length === 0) {
        yNode.valor += minWaste;
        colX.filhos = colX.filhos.filter(y => y.id !== newYNode.id);
      }
    }
  }

  // LEVEL 3: Z→W level
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of colX.filhos) {
      if (remaining.length === 0) break;
      for (const zNode of [...yNode.filhos]) {
        if (remaining.length === 0) break;
        if (zNode.filhos.length < 2) continue;

        const wWastes = zNode.filhos.map(wNode => {
          const usedQ = wNode.filhos.reduce((a, q) => a + q.valor * q.multi, 0);
          return usedQ > 0 ? zNode.valor - usedQ : 0;
        });
        const minWaste = Math.min(...wWastes);
        if (minWaste < 50) continue;

        const totalH = zNode.filhos.reduce((a, w) => a + w.valor * w.multi, 0);
        const canFit = remaining.some(p =>
          (p.w <= minWaste && p.h <= totalH) || (p.h <= minWaste && p.w <= totalH)
        );
        if (!canFit) continue;

        zNode.valor -= minWaste;

        const newZId = insertNode(tree, yNode.id, "Z", minWaste, 1);
        const newZNode = findNode(tree, newZId)!;

        const filled = fillArea(newZNode, "Z", minWaste, yNode.valor);
        addedArea += filled;

        if (newZNode.filhos.length === 0) {
          zNode.valor += minWaste;
          yNode.filhos = yNode.filhos.filter(z => z.id !== newZNode.id);
        }
      }
    }
  }

  return addedArea;
}

// ========== STRUCTURAL WASTE COLLAPSE ==========

export function collapseTreeWaste(
  tree: TreeNode,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
): number {
  if (remaining.length === 0) return 0;
  let addedArea = 0;

  function isWasteNode(node: TreeNode): boolean {
    if (node.filhos.length === 0) return !node.label;
    return node.filhos.every(c => isWasteNode(c));
  }

  function collapseLevel(
    parent: TreeNode,
    getSpaceW: (totalVal: number) => number,
    getSpaceH: (totalVal: number) => number,
    childType: "X" | "Y" | "Z" | "W" | "Q" | "R",
    fillFn: (collapsedNode: TreeNode, spaceW: number, spaceH: number) => number,
  ): number {
    let levelArea = 0;
    let modified = true;

    while (modified && remaining.length > 0) {
      modified = false;

      for (let i = 0; i < parent.filhos.length && remaining.length > 0; i++) {
        if (!isWasteNode(parent.filhos[i])) continue;

        let j = i;
        let totalVal = 0;
        while (j < parent.filhos.length && isWasteNode(parent.filhos[j])) {
          totalVal += parent.filhos[j].valor * parent.filhos[j].multi;
          j++;
        }

        const runLength = j - i;
        if (runLength < 2 || totalVal < 50) {
          i = j - 1;
          continue;
        }

        const spaceW = getSpaceW(totalVal);
        const spaceH = getSpaceH(totalVal);

        const canFit = remaining.some(p =>
          oris(p).some(o => o.w <= spaceW && o.h <= spaceH)
        );

        if (!canFit) {
          i = j - 1;
          continue;
        }

        console.log(
          `[COLLAPSE] ${childType} level: merging ${runLength} waste nodes (total=${totalVal}mm) → space ${spaceW}×${spaceH}mm`
        );

        const removed = parent.filhos.splice(i, runLength);

        const collapsedId = gid();
        const collapsed: TreeNode = {
          id: collapsedId,
          tipo: childType,
          valor: totalVal,
          multi: 1,
          filhos: [],
        };
        parent.filhos.splice(i, 0, collapsed);

        const filled = fillFn(collapsed, spaceW, spaceH);
        levelArea += filled;

        if (filled > 0) {
          modified = true;
          console.log(
            `[COLLAPSE] Filled ${filled.toFixed(0)}mm² in collapsed ${childType} node`
          );
        } else {
          parent.filhos.splice(i, 1);
          parent.filhos.splice(i, 0, ...removed);
        }

        break;
      }
    }

    return levelArea;
  }

  // LEVEL Y: Collapse consecutive waste Y nodes
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;

    addedArea += collapseLevel(
      colX,
      (_totalVal) => colX.valor,
      (totalVal) => totalVal,
      'Y',
      (collapsedY, spaceW, spaceH) => {
        let filled = 0;
        let freeH = spaceH;

        while (freeH > 0 && remaining.length > 0) {
          let bestIdx = -1;
          let bestO: { w: number; h: number } | null = null;
          let bestArea = 0;

          for (let i = 0; i < remaining.length; i++) {
            for (const o of oris(remaining[i])) {
              if (o.w <= spaceW && o.h <= freeH && o.w * o.h > bestArea) {
                if (minBreak > 0 && zResidualViolatesMinBreak(spaceW, o.w, minBreak)) continue;
                bestArea = o.w * o.h;
                bestIdx = i;
                bestO = o;
              }
            }
          }

          if (bestIdx < 0 || !bestO) break;

          const pc = remaining[bestIdx];
          let consumed = bestO.h;
          const residualH = freeH - bestO.h;
          if (residualH > 0 && !canResidualFitAnyPiece(spaceW, residualH, remaining, minBreak)) {
            consumed = freeH;
          }

          const zNode: TreeNode = {
            id: gid(),
            tipo: 'Z',
            valor: bestO.w,
            multi: 1,
            filhos: [],
            label: pc.label,
          };
          // Always create W child so the viewer shows correct piece height
          const wNodePiece: TreeNode = {
            id: gid(),
            tipo: 'W',
            valor: bestO.h,
            multi: 1,
            filhos: [],
            label: pc.label,
          };
          zNode.filhos.push(wNodePiece);
          collapsedY.filhos.push(zNode);

          if (bestO.w < spaceW) {
            let freeZW = spaceW - bestO.w;
            for (let k = 0; k < remaining.length && freeZW > 0; k++) {
              if (k === bestIdx) continue;
              const lpc = remaining[k];
              for (const o of oris(lpc)) {
                if (o.w <= freeZW && o.h <= consumed) {
                  if (minBreak > 0 && zResidualViolatesMinBreak(freeZW, o.w, minBreak)) continue;
                  const latZ: TreeNode = {
                    id: gid(),
                    tipo: 'Z',
                    valor: o.w,
                    multi: 1,
                    filhos: [],
                    label: lpc.label,
                  };
                  // Always create W child for correct dimension display
                  const latW: TreeNode = {
                    id: gid(),
                    tipo: 'W',
                    valor: o.h,
                    multi: 1,
                    filhos: [],
                    label: lpc.label,
                  };
                  latZ.filhos.push(latW);
                  collapsedY.filhos.push(latZ);
                  filled += o.w * o.h;
                  freeZW -= o.w;
                  remaining.splice(k, 1);
                  if (k < bestIdx) bestIdx--;
                  k--;
                  break;
                }
              }
            }
          }

          filled += bestO.w * bestO.h;
          freeH -= consumed;
          remaining.splice(bestIdx, 1);
        }

        return filled;
      }
    );
  }

  // LEVEL Z: Collapse consecutive waste Z nodes
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of colX.filhos) {
      if (remaining.length === 0) break;

      addedArea += collapseLevel(
        yNode,
        (totalVal) => totalVal,
        (_totalVal) => yNode.valor,
        'Z',
        (collapsedZ, spaceW, spaceH) => {
          let filled = 0;
          let freeH = spaceH;

          while (freeH > 0 && remaining.length > 0) {
            let bestIdx = -1;
            let bestO: { w: number; h: number } | null = null;
            let bestArea = 0;

            for (let i = 0; i < remaining.length; i++) {
              for (const o of oris(remaining[i])) {
                if (o.w <= spaceW && o.h <= freeH && o.w * o.h > bestArea) {
                  bestArea = o.w * o.h;
                  bestIdx = i;
                  bestO = o;
                }
              }
            }

            if (bestIdx < 0 || !bestO) break;

            const pc = remaining[bestIdx];
            const wNode: TreeNode = {
              id: gid(),
              tipo: 'W',
              valor: bestO.h,
              multi: 1,
              filhos: [],
              label: pc.label,
            };

            if (bestO.w < spaceW) {
              const qNode: TreeNode = {
                id: gid(),
                tipo: 'Q',
                valor: bestO.w,
                multi: 1,
                filhos: [],
                label: pc.label,
              };
              wNode.filhos.push(qNode);
              wNode.label = undefined;
            }

            collapsedZ.filhos.push(wNode);
            filled += spaceW * bestO.h;
            freeH -= bestO.h;
            remaining.splice(bestIdx, 1);
          }

          return filled;
        }
      );
    }
  }

  // LEVEL W: Collapse consecutive waste W nodes
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of colX.filhos) {
      if (remaining.length === 0) break;
      for (const zNode of yNode.filhos) {
        if (remaining.length === 0) break;

        addedArea += collapseLevel(
          zNode,
          (_totalVal) => zNode.valor,
          (totalVal) => totalVal,
          'W',
          (collapsedW, spaceW, _spaceH) => {
            let filled = 0;
            let freeW = spaceW;

            while (freeW > 0 && remaining.length > 0) {
              let bestIdx = -1;
              let bestO: { w: number; h: number } | null = null;
              let bestArea = 0;

              for (let i = 0; i < remaining.length; i++) {
                for (const o of oris(remaining[i])) {
                  if (o.w <= freeW && o.h <= collapsedW.valor && o.w * o.h > bestArea) {
                    bestArea = o.w * o.h;
                    bestIdx = i;
                    bestO = o;
                  }
                }
              }

              if (bestIdx < 0 || !bestO) break;

              const pc = remaining[bestIdx];
              const qNode: TreeNode = {
                id: gid(),
                tipo: 'Q',
                valor: bestO.w,
                multi: 1,
                filhos: [],
                label: pc.label,
              };

              if (bestO.h < collapsedW.valor) {
                const rNode: TreeNode = {
                  id: gid(),
                  tipo: 'R',
                  valor: bestO.h,
                  multi: 1,
                  filhos: [],
                  label: pc.label,
                };
                qNode.filhos.push(rNode);
              }

              collapsedW.filhos.push(qNode);
              filled += bestO.w * collapsedW.valor;
              freeW -= bestO.w;
              remaining.splice(bestIdx, 1);
            }

            return filled;
          }
        );
      }
    }
  }

  // LEVEL Q: Collapse consecutive waste Q nodes
  for (const colX of tree.filhos) {
    if (remaining.length === 0) break;
    for (const yNode of colX.filhos) {
      if (remaining.length === 0) break;
      for (const zNode of yNode.filhos) {
        if (remaining.length === 0) break;
        for (const wNode of zNode.filhos) {
          if (remaining.length === 0) break;

          addedArea += collapseLevel(
            wNode,
            (totalVal) => totalVal,
            (_totalVal) => wNode.valor,
            'Q',
            (collapsedQ, spaceW, spaceH) => {
              let filled = 0;
              let freeH = spaceH;

              while (freeH > 0 && remaining.length > 0) {
                let bestIdx = -1;
                let bestO: { w: number; h: number } | null = null;
                let bestArea = 0;

                for (let i = 0; i < remaining.length; i++) {
                  for (const o of oris(remaining[i])) {
                    if (o.w <= spaceW && o.h <= freeH && o.w * o.h > bestArea) {
                      bestArea = o.w * o.h;
                      bestIdx = i;
                      bestO = o;
                    }
                  }
                }

                if (bestIdx < 0 || !bestO) break;

                const pc = remaining[bestIdx];
                const rNode: TreeNode = {
                  id: gid(),
                  tipo: 'R',
                  valor: bestO.h,
                  multi: 1,
                  filhos: [],
                  label: pc.label,
                };
                collapsedQ.filhos.push(rNode);
                filled += spaceW * bestO.h;
                freeH -= bestO.h;
                remaining.splice(bestIdx, 1);
              }

              return filled;
            }
          );
        }
      }
    }
  }

  return addedArea;
}

// ========== REGROUP ADJACENT STRIPS ==========

export function regroupAdjacentStrips(
  tree: TreeNode,
  remaining: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
): number {
  let totalAdded = 0;

  for (const colX of tree.filhos) {
    if (colX.filhos.length < 2) continue;

    let modified = true;
    while (modified) {
      modified = false;

      for (let i = 0; i < colX.filhos.length - 1; i++) {
        for (let groupSize = Math.min(colX.filhos.length - i, 5); groupSize >= 2; groupSize--) {
          const yGroup = colX.filhos.slice(i, i + groupSize);
          const combinedH = yGroup.reduce((s, y) => s + y.valor * y.multi, 0);

          if (combinedH > usableH) continue;

          const extractedPieces: Piece[] = [];

          let yOff = 0;
          for (const yNode of yGroup) {
            for (let iy = 0; iy < yNode.multi; iy++) {
              let zOff = 0;
              for (const zNode of yNode.filhos) {
                for (let iz = 0; iz < zNode.multi; iz++) {
                  if (zNode.filhos.length === 0) {
                    if (zNode.label) {
                      extractedPieces.push({ w: zNode.valor, h: yNode.valor, area: zNode.valor * yNode.valor, label: zNode.label });
                    }
                  } else {
                    for (const wNode of zNode.filhos) {
                      for (let iw = 0; iw < wNode.multi; iw++) {
                        if (wNode.filhos.length === 0) {
                          if (wNode.label) {
                            extractedPieces.push({ w: zNode.valor, h: wNode.valor, area: zNode.valor * wNode.valor, label: wNode.label });
                          }
                        } else {
                          for (const qNode of wNode.filhos) {
                            for (let iq = 0; iq < qNode.multi; iq++) {
                              if (qNode.filhos.length === 0) {
                                if (qNode.label) {
                                  extractedPieces.push({ w: qNode.valor, h: wNode.valor, area: qNode.valor * wNode.valor, label: qNode.label });
                                }
                              } else {
                                for (const rNode of qNode.filhos) {
                                  for (let ir = 0; ir < rNode.multi; ir++) {
                                    if (rNode.label) {
                                      extractedPieces.push({ w: qNode.valor, h: rNode.valor, area: qNode.valor * rNode.valor, label: rNode.label });
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  zOff += zNode.valor;
                }
              }
              yOff += yNode.valor;
            }
          }

          if (extractedPieces.length === 0) continue;

          const colW = colX.valor;
          const oldArea = extractedPieces.reduce((s, p) => s + p.area, 0);

          const wasteArea = colW * combinedH - oldArea;
          const hasWasteToConsolidate = yGroup.length >= 2 && yGroup.some(y => {
            const yPieceW = y.filhos.reduce((s, z) => s + z.valor * z.multi, 0);
            return yPieceW < colW;
          });
          const canFitNew = remaining.length > 0 && remaining.some(p =>
            oris(p).some(o => o.w * o.h <= wasteArea && o.w <= colW && o.h <= combinedH)
          );

          if (!canFitNew && !hasWasteToConsolidate) continue;

          const candidateRemaining = [...remaining];
          const allPieces: Piece[] = [...extractedPieces];

          const newYNode: TreeNode = { id: gid(), tipo: 'Y', valor: combinedH, multi: 1, filhos: [] };
          let freeH = combinedH;
          const placed: Piece[] = [];
          const usedFromRemaining: number[] = [];

          const allCandidates = [
            ...allPieces.map((p, idx) => ({ piece: p, source: 'extracted' as const, idx })),
            ...candidateRemaining.map((p, idx) => ({ piece: p, source: 'remaining' as const, idx })),
          ];

          let usedW = 0;

          while (usedW < colW && allCandidates.length > 0) {
            let bestCandidate: typeof allCandidates[0] | null = null;
            let bestOri: { w: number; h: number } | null = null;
            let bestScore = Infinity;

            for (const c of allCandidates) {
              if (c.source === 'remaining' && usedFromRemaining.includes(c.idx)) continue;
              if (c.source === 'extracted' && placed.some(pp => pp === c.piece)) continue;

              for (const o of oris(c.piece)) {
                if (o.w <= colW - usedW && o.h <= combinedH) {
                  const score = scoreFit(colW - usedW, combinedH, o.w, o.h, []);
                  if (score < bestScore) {
                    bestScore = score;
                    bestCandidate = c;
                    bestOri = o;
                  }
                }
              }
            }

            if (!bestCandidate || !bestOri) break;

            const zNode: TreeNode = { id: gid(), tipo: 'Z', valor: bestOri.w, multi: 1, filhos: [] };

            let usedH = 0;
            const wNode: TreeNode = { id: gid(), tipo: 'W', valor: bestOri.h, multi: 1, filhos: [], label: bestCandidate.piece.label };

            // Always add W child to preserve correct piece dimensions in display
            zNode.filhos.push(wNode);
            if (bestOri.w >= colW - usedW && bestOri.h >= combinedH) {
              zNode.label = bestCandidate.piece.label;
            }

            if (bestCandidate.source === 'remaining') {
              usedFromRemaining.push(bestCandidate.idx);
            }
            placed.push(bestCandidate.piece);
            usedH += bestOri.h;

            const zWidth = bestOri.w;
            while (usedH < combinedH) {
              let bestFill: typeof allCandidates[0] | null = null;
              let bestFillOri: { w: number; h: number } | null = null;
              let bestFillArea = 0;

              for (const c of allCandidates) {
                if (c === bestCandidate) continue;
                if (c.source === 'remaining' && usedFromRemaining.includes(c.idx)) continue;
                if (c.source === 'extracted' && placed.some(pp => pp === c.piece)) continue;

                for (const o of oris(c.piece)) {
                  if (o.w <= zWidth && o.h <= combinedH - usedH && o.w * o.h > bestFillArea) {
                    bestFillArea = o.w * o.h;
                    bestFill = c;
                    bestFillOri = o;
                  }
                }
              }

              if (!bestFill || !bestFillOri) break;

              const fillW: TreeNode = { id: gid(), tipo: 'W', valor: bestFillOri.h, multi: 1, filhos: [], label: bestFill.piece.label };

              if (bestFillOri.w < zWidth) {
                const qNode: TreeNode = { id: gid(), tipo: 'Q', valor: bestFillOri.w, multi: 1, filhos: [], label: bestFill.piece.label };
                fillW.filhos.push(qNode);
                fillW.label = undefined;
              }

              zNode.filhos.push(fillW);

              if (bestFill.source === 'remaining') {
                usedFromRemaining.push(bestFill.idx);
              }
              placed.push(bestFill.piece);
              usedH += bestFillOri.h;
            }

            newYNode.filhos.push(zNode);
            usedW += zWidth;

            const allExtractedPlaced = allPieces.every(ep => placed.includes(ep));
            if (allExtractedPlaced && usedFromRemaining.length === 0) {
              // Keep going to try to fit remaining pieces
            }
          }

          const allExtractedPlaced = allPieces.every(ep => placed.includes(ep));
          if (!allExtractedPlaced) continue;

          const wasteConsolidated = groupSize > 1;
          if (usedFromRemaining.length === 0 && !wasteConsolidated) continue;

          console.log(
            `[REGROUP] Merged ${groupSize} Y strips (${yGroup.map(y => `Y${y.valor}`).join('+')} = Y${combinedH}) in X${colX.valor}, ` +
            `fitted ${usedFromRemaining.length} new piece(s)`
          );

          colX.filhos.splice(i, groupSize, newYNode);

          const sortedIndices = [...usedFromRemaining].sort((a, b) => b - a);
          let addedArea = 0;
          for (const idx of sortedIndices) {
            addedArea += remaining[idx].area;
            remaining.splice(idx, 1);
          }

          totalAdded += addedArea;
          modified = true;
          break;
        }

        if (modified) break;
      }
    }
  }

  // Z-level regrouping
  for (const colX of tree.filhos) {
    for (const yNode of colX.filhos) {
      if (yNode.filhos.length < 2) continue;

      let modified = true;
      while (modified) {
        modified = false;

        for (let i = 0; i < yNode.filhos.length - 1; i++) {
          for (let groupSize = Math.min(yNode.filhos.length - i, 4); groupSize >= 2; groupSize--) {
            const zGroup = yNode.filhos.slice(i, i + groupSize);

            const hasWaste = zGroup.some(z => isWasteSubtree(z));
            if (!hasWaste) continue;

            const combinedW = zGroup.reduce((s, z) => s + z.valor * z.multi, 0);
            if (combinedW > colX.valor) continue;

            const stripH = yNode.valor;

            const canFit = remaining.some(p =>
              oris(p).some(o => o.w <= combinedW && o.h <= stripH)
            );
            if (!canFit) continue;

            const piecesInGroup: Piece[] = [];
            for (const zNode of zGroup) {
              if (zNode.filhos.length === 0 && zNode.label) {
                piecesInGroup.push({ w: zNode.valor, h: stripH, area: zNode.valor * stripH, label: zNode.label });
              } else {
                for (const wNode of zNode.filhos) {
                  if (wNode.filhos.length === 0 && wNode.label) {
                    piecesInGroup.push({ w: zNode.valor, h: wNode.valor, area: zNode.valor * wNode.valor, label: wNode.label });
                  } else {
                    for (const qNode of wNode.filhos) {
                      if (qNode.filhos.length === 0) {
                        if (qNode.label) {
                          piecesInGroup.push({ w: qNode.valor, h: wNode.valor, area: qNode.valor * wNode.valor, label: qNode.label });
                        }
                      } else {
                        for (const rNode of qNode.filhos) {
                          if (rNode.label) {
                            piecesInGroup.push({ w: qNode.valor, h: rNode.valor, area: qNode.valor * rNode.valor, label: rNode.label });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            const mergedZ: TreeNode = { id: gid(), tipo: 'Z', valor: combinedW, multi: 1, filhos: [] };
            let usedH = 0;
            const allToPlace = [...piecesInGroup];
            const newFromRemaining: number[] = [];

            for (let ri = 0; ri < remaining.length; ri++) {
              for (const o of oris(remaining[ri])) {
                if (o.w <= combinedW && o.h <= stripH) {
                  allToPlace.push(remaining[ri]);
                  break;
                }
              }
            }

            const placedHere: Piece[] = [];
            while (usedH < stripH) {
              let bestIdx = -1;
              let bestO: { w: number; h: number } | null = null;
              let bestArea = 0;

              for (let k = 0; k < allToPlace.length; k++) {
                if (placedHere.includes(allToPlace[k])) continue;
                for (const o of oris(allToPlace[k])) {
                  if (o.w <= combinedW && o.h <= stripH - usedH && o.w * o.h > bestArea) {
                    bestArea = o.w * o.h;
                    bestIdx = k;
                    bestO = o;
                  }
                }
              }

              if (bestIdx < 0 || !bestO) break;

              const wNode: TreeNode = { id: gid(), tipo: 'W', valor: bestO.h, multi: 1, filhos: [], label: allToPlace[bestIdx].label };
              if (bestO.w < combinedW) {
                const qNode: TreeNode = { id: gid(), tipo: 'Q', valor: bestO.w, multi: 1, filhos: [], label: allToPlace[bestIdx].label };
                wNode.filhos.push(qNode);
                wNode.label = undefined;
              }
              mergedZ.filhos.push(wNode);
              placedHere.push(allToPlace[bestIdx]);

              const remIdx = remaining.indexOf(allToPlace[bestIdx]);
              if (remIdx >= 0) {
                newFromRemaining.push(remIdx);
              }
              usedH += bestO.h;
            }

            const allOrigPlaced = piecesInGroup.every(p => placedHere.includes(p));
            if (!allOrigPlaced) continue;
            const zWasteConsolidated = groupSize > 1 && hasWaste;
            if (newFromRemaining.length === 0 && !zWasteConsolidated) continue;

            console.log(
              `[REGROUP-Z] Merged ${groupSize} Z nodes (${zGroup.map(z => `Z${z.valor}`).join('+')} = Z${combinedW}) in Y${yNode.valor}, ` +
              `fitted ${newFromRemaining.length} new piece(s)`
            );

            yNode.filhos.splice(i, groupSize, mergedZ);

            const sortedIndices = [...newFromRemaining].sort((a, b) => b - a);
            let addedArea = 0;
            for (const idx of sortedIndices) {
              addedArea += remaining[idx].area;
              remaining.splice(idx, 1);
            }
            totalAdded += addedArea;
            modified = true;
            break;
          }
          if (modified) break;
        }
      }
    }
  }

  // W-level regrouping
  for (const colX of tree.filhos) {
    for (const yNode of colX.filhos) {
      for (const zNode of yNode.filhos) {
        if (zNode.filhos.length < 2) continue;

        let wModified = true;
        while (wModified) {
          wModified = false;

          for (let i = 0; i < zNode.filhos.length - 1; i++) {
            for (let groupSize = Math.min(zNode.filhos.length - i, 4); groupSize >= 2; groupSize--) {
              const wGroup = zNode.filhos.slice(i, i + groupSize);

              const hasWaste = wGroup.some(w => isWasteSubtree(w));
              if (!hasWaste) continue;

              const combinedH = wGroup.reduce((s, w) => s + w.valor * w.multi, 0);
              if (combinedH > yNode.valor) continue;

              const zWidth = zNode.valor;

              const canFit = remaining.some(p =>
                oris(p).some(o => o.w <= zWidth && o.h <= combinedH)
              );
              if (!canFit) continue;

              const piecesInGroup: Piece[] = [];
              for (const wNode of wGroup) {
                if (wNode.filhos.length === 0 && wNode.label) {
                  piecesInGroup.push({ w: zWidth, h: wNode.valor, area: zWidth * wNode.valor, label: wNode.label });
                } else {
                  for (const qNode of wNode.filhos) {
                    if (qNode.filhos.length === 0) {
                      if (qNode.label) {
                        piecesInGroup.push({ w: qNode.valor, h: wNode.valor, area: qNode.valor * wNode.valor, label: qNode.label });
                      }
                    } else {
                      for (const rNode of qNode.filhos) {
                        if (rNode.label) {
                          piecesInGroup.push({ w: qNode.valor, h: rNode.valor, area: qNode.valor * rNode.valor, label: rNode.label });
                        }
                      }
                    }
                  }
                }
              }

              const canUseMergedW = (piece: Piece) =>
                oris(piece).some(o => o.w <= zWidth && Math.abs(o.h - combinedH) < 0.5);

              if (!piecesInGroup.every(canUseMergedW)) continue;

              const mergedW: TreeNode = { id: gid(), tipo: 'W', valor: combinedH, multi: 1, filhos: [] };
              let usedW = 0;
              const allToPlace = [...piecesInGroup];
              const newFromRemaining: number[] = [];

              for (let ri = 0; ri < remaining.length; ri++) {
                for (const o of oris(remaining[ri])) {
                  if (o.w <= zWidth && Math.abs(o.h - combinedH) < 0.5) {
                    allToPlace.push(remaining[ri]);
                    break;
                  }
                }
              }

              const placedHere: Piece[] = [];
              while (usedW < zWidth) {
                let bestIdx = -1;
                let bestO: { w: number; h: number } | null = null;
                let bestArea = 0;

                for (let k = 0; k < allToPlace.length; k++) {
                  if (placedHere.includes(allToPlace[k])) continue;
                  for (const o of oris(allToPlace[k])) {
                    if (Math.abs(o.h - combinedH) > 0.5) continue;
                    if (o.w <= zWidth - usedW && o.w * o.h > bestArea) {
                      bestArea = o.w * o.h;
                      bestIdx = k;
                      bestO = o;
                    }
                  }
                }

                if (bestIdx < 0 || !bestO) break;

                const qNode: TreeNode = { id: gid(), tipo: 'Q', valor: bestO.w, multi: 1, filhos: [], label: allToPlace[bestIdx].label };
                mergedW.filhos.push(qNode);
                placedHere.push(allToPlace[bestIdx]);

                const remIdx = remaining.indexOf(allToPlace[bestIdx]);
                if (remIdx >= 0 && !newFromRemaining.includes(remIdx)) {
                  newFromRemaining.push(remIdx);
                }
                usedW += bestO.w;
              }

              const allOrigPlaced = piecesInGroup.every(p => placedHere.includes(p));
              if (!allOrigPlaced) continue;

              const wWasteConsolidated = groupSize > 1 && hasWaste;
              if (newFromRemaining.length === 0 && !wWasteConsolidated) continue;

              console.log(
                `[REGROUP-W] Merged ${groupSize} W nodes (${wGroup.map(w => `W${w.valor}`).join('+')} = W${combinedH}) in Z${zNode.valor}, ` +
                `fitted ${newFromRemaining.length} new piece(s)`
              );

              zNode.filhos.splice(i, groupSize, mergedW);

              const sortedIndices = [...new Set(newFromRemaining)].sort((a, b) => b - a);
              let addedArea = 0;
              for (const idx of sortedIndices) {
                addedArea += remaining[idx].area;
                remaining.splice(idx, 1);
              }
              totalAdded += addedArea;

              wModified = true;
              break;
            }
            if (wModified) break;
          }
        }
      }
    }
  }

  return totalAdded;
}

// ========== CLAMP TREE HEIGHTS ==========

export function clampTreeHeights(tree: TreeNode, usableW: number, usableH: number, placedArea: number): number {
  for (const colX of tree.filhos) {
    let totalH = 0;
    const validChildren: TreeNode[] = [];

    for (const yNode of colX.filhos) {
      const yHeight = yNode.valor * yNode.multi;
      if (totalH + yHeight <= usableH + 0.5) {
        validChildren.push(yNode);
        totalH += yHeight;
      } else {
        if (yNode.multi > 1) {
          const canFit = Math.floor((usableH - totalH) / yNode.valor);
          if (canFit > 0) {
            yNode.multi = canFit;
            validChildren.push(yNode);
            totalH += yNode.valor * canFit;
          }
        } else if (totalH + yNode.valor <= usableH + 0.5) {
          validChildren.push(yNode);
          totalH += yNode.valor;
        }
        if (validChildren.length < colX.filhos.length) {
          const originalTotal = colX.filhos.reduce((a, y) => a + y.valor * y.multi, 0);
          console.warn(
            `[CNC-ENGINE] Column overflow detected: ${originalTotal.toFixed(0)}mm > ${usableH}mm usableH. Clamped to ${totalH.toFixed(0)}mm.`,
          );
        }
      }
    }

    if (validChildren.length < colX.filhos.length) {
      const removedYNodes = colX.filhos.filter((y) => !validChildren.includes(y));
      for (const ry of removedYNodes) {
        placedArea -= calculateNodeArea(ry);
      }
      colX.filhos = validChildren;
    }

    for (const yNode of colX.filhos) {
      let totalZ = 0;
      const validZ: TreeNode[] = [];
      for (const zNode of yNode.filhos) {
        const zWidth = zNode.valor * zNode.multi;
        if (totalZ + zWidth <= colX.valor + 0.5) {
          validZ.push(zNode);
          totalZ += zWidth;
        } else {
          if (zNode.multi > 1) {
            const canFit = Math.floor((colX.valor - totalZ) / zNode.valor);
            if (canFit > 0) {
              zNode.multi = canFit;
              validZ.push(zNode);
              totalZ += zNode.valor * canFit;
            }
          } else if (totalZ + zNode.valor <= colX.valor + 0.5) {
            validZ.push(zNode);
            totalZ += zNode.valor;
          }
        }
      }
      if (validZ.length < yNode.filhos.length) {
        const removedZ = yNode.filhos.filter((z) => !validZ.includes(z));
        for (const rz of removedZ) {
          placedArea -= calculateZArea(rz, yNode.valor);
        }
        yNode.filhos = validZ;
        console.warn(`[CNC-ENGINE] Z overflow in Y strip: clamped to ${totalZ.toFixed(0)}mm / ${colX.valor}mm`);
      }

      for (const zNode of yNode.filhos) {
        let totalW = 0;
        const validW: TreeNode[] = [];
        for (const wNode of zNode.filhos) {
          const wHeight = wNode.valor * wNode.multi;
          if (totalW + wHeight <= yNode.valor + 0.5) {
            validW.push(wNode);
            totalW += wHeight;
          } else {
            if (wNode.multi > 1) {
              const canFit = Math.floor((yNode.valor - totalW) / wNode.valor);
              if (canFit > 0) {
                wNode.multi = canFit;
                validW.push(wNode);
                totalW += wNode.valor * canFit;
              }
            } else if (totalW + wNode.valor <= yNode.valor + 0.5) {
              validW.push(wNode);
              totalW += wNode.valor;
            }
          }
        }
        if (validW.length < zNode.filhos.length) {
          const removedW = zNode.filhos.filter((w) => !validW.includes(w));
          for (const rw of removedW) {
            placedArea -= calculateWArea(rw, zNode.valor);
          }
          zNode.filhos = validW;
          console.warn(`[CNC-ENGINE] W overflow in Z node: clamped to ${totalW.toFixed(0)}mm / ${yNode.valor}mm`);
        }

        for (const wNode of zNode.filhos) {
          let totalQ = 0;
          const validQ: TreeNode[] = [];
          for (const qNode of wNode.filhos) {
            const qWidth = qNode.valor * qNode.multi;
            if (totalQ + qWidth <= zNode.valor + 0.5) {
              validQ.push(qNode);
              totalQ += qWidth;
            } else {
              if (qNode.multi > 1) {
                const canFit = Math.floor((zNode.valor - totalQ) / qNode.valor);
                if (canFit > 0) {
                  qNode.multi = canFit;
                  validQ.push(qNode);
                  totalQ += qNode.valor * canFit;
                }
              } else if (totalQ + qNode.valor <= zNode.valor + 0.5) {
                validQ.push(qNode);
                totalQ += qNode.valor;
              }
            }
          }
          if (validQ.length < wNode.filhos.length) {
            const removedQ = wNode.filhos.filter((q) => !validQ.includes(q));
            for (const rq of removedQ) {
              placedArea -= rq.valor * wNode.valor * rq.multi;
            }
            wNode.filhos = validQ;
            console.warn(`[CNC-ENGINE] Q overflow in W node: clamped to ${totalQ.toFixed(0)}mm / ${zNode.valor}mm`);
          }

          // Clamp R nodes inside Q
          for (const qNode of wNode.filhos) {
            let totalR = 0;
            const validR: TreeNode[] = [];
            for (const rNode of qNode.filhos) {
              const rHeight = rNode.valor * rNode.multi;
              if (totalR + rHeight <= wNode.valor + 0.5) {
                validR.push(rNode);
                totalR += rHeight;
              } else {
                if (rNode.multi > 1) {
                  const canFit = Math.floor((wNode.valor - totalR) / rNode.valor);
                  if (canFit > 0) {
                    rNode.multi = canFit;
                    validR.push(rNode);
                    totalR += rNode.valor * canFit;
                  }
                } else if (totalR + rNode.valor <= wNode.valor + 0.5) {
                  validR.push(rNode);
                  totalR += rNode.valor;
                }
              }
            }
            if (validR.length < qNode.filhos.length) {
              const removedR = qNode.filhos.filter((r) => !validR.includes(r));
              for (const rr of removedR) {
                placedArea -= rr.valor * qNode.valor * rr.multi;
              }
              qNode.filhos = validR;
              console.warn(`[CNC-ENGINE] R overflow in Q node: clamped to ${totalR.toFixed(0)}mm / ${wNode.valor}mm`);
            }
          }
        }
      }
    }
  }

  return placedArea;
}

// ========== POST-OPTIMIZATION REGROUPING ANALYSIS ==========

function extractPlacedPieces(
  tree: TreeNode,
): Array<{ w: number; h: number; label?: string; colIndex: number; yIndex: number }> {
  const pieces: Array<{ w: number; h: number; label?: string; colIndex: number; yIndex: number }> = [];
  const T = tree.transposed || false;

  tree.filhos.forEach((colX, ci) => {
    colX.filhos.forEach((yNode, yi) => {
      for (const zNode of yNode.filhos) {
        if (zNode.filhos.length === 0) {
          const pw = T ? yNode.valor : zNode.valor;
          const ph = T ? zNode.valor : yNode.valor;
          pieces.push({ w: pw, h: ph, label: zNode.label, colIndex: ci, yIndex: yi });
        } else {
          for (const wNode of zNode.filhos) {
            if (wNode.filhos.length === 0) {
              const pw = T ? wNode.valor : zNode.valor;
              const ph = T ? zNode.valor : wNode.valor;
              pieces.push({ w: pw, h: ph, label: wNode.label, colIndex: ci, yIndex: yi });
            } else {
              for (const qNode of wNode.filhos) {
                if (qNode.filhos.length === 0) {
                  const pw = T ? wNode.valor : qNode.valor;
                  const ph = T ? qNode.valor : wNode.valor;
                  pieces.push({ w: pw, h: ph, label: qNode.label, colIndex: ci, yIndex: yi });
                } else {
                  for (const rNode of qNode.filhos) {
                    const pw = T ? rNode.valor : qNode.valor;
                    const ph = T ? qNode.valor : rNode.valor;
                    pieces.push({ w: pw, h: ph, label: rNode.label, colIndex: ci, yIndex: yi });
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  return pieces;
}

export function postOptimizeRegroup(
  originalTree: TreeNode,
  originalArea: number,
  allPieces: Piece[],
  usableW: number,
  usableH: number,
  minBreak: number,
  getSortStrategies: () => ((a: Piece, b: Piece) => number)[],
  runPlacementFn: (inventory: Piece[], usableW: number, usableH: number, minBreak: number) => { tree: TreeNode; area: number; remaining: Piece[] },
  normalizeTreeFn: (tree: TreeNode, usableW: number, usableH: number) => TreeNode,
): { tree: TreeNode; area: number; improved: boolean } {
  const placedPieces = extractPlacedPieces(originalTree);

  const heightMap = new Map<number, typeof placedPieces>();
  for (const p of placedPieces) {
    const h = Math.min(p.w, p.h);
    if (!heightMap.has(h)) heightMap.set(h, []);
    heightMap.get(h)!.push(p);
  }

  const regroupOpportunities: Array<{ height: number; pieces: typeof placedPieces }> = [];
  for (const [h, group] of heightMap) {
    const cols = new Set(group.map((p) => p.colIndex));
    if (cols.size > 1 && group.length >= 2) {
      const totalW = group.reduce((sum, p) => sum + Math.max(p.w, p.h), 0);
      if (totalW <= usableW) {
        regroupOpportunities.push({ height: h, pieces: group });
      }
    }
  }

  if (regroupOpportunities.length === 0) {
    return { tree: originalTree, area: originalArea, improved: false };
  }

  console.log(
    `[CNC-ENGINE] Pós-análise: ${regroupOpportunities.length} oportunidade(s) de reagrupamento encontrada(s)`,
  );

  let bestTree = originalTree;
  let bestArea = originalArea;
  let improved = false;

  for (const opp of regroupOpportunities) {
    const forcedPieces: Piece[] = [];
    const usedLabels = new Set<string>();

    const groupLabels: string[] = [];
    let sumW = 0;
    for (const p of opp.pieces) {
      const w = Math.max(p.w, p.h);
      sumW += w;
      if (p.label) {
        groupLabels.push(p.label);
        usedLabels.add(p.label);
      }
    }

    forcedPieces.unshift({
      w: sumW,
      h: opp.height,
      area: sumW * opp.height,
      count: opp.pieces.length,
      labels: groupLabels.length > 0 ? groupLabels : undefined,
      groupedAxis: "w",
    });

    for (const p of allPieces) {
      if (p.label && usedLabels.has(p.label)) continue;
      forcedPieces.push({ ...p });
    }

    const strategies = getSortStrategies();
    for (const transposed of [false, true]) {
      const eW = transposed ? usableH : usableW;
      const eH = transposed ? usableW : usableH;

      for (const sortFn of strategies) {
        const grouped = forcedPieces.slice(0, 1);
        const rest = [...forcedPieces.slice(1)].sort(sortFn);
        const sorted = [...grouped, ...rest];

        const result = runPlacementFn(sorted, eW, eH, minBreak);
        if (result.area > bestArea) {
          bestArea = result.area;
          bestTree = result.tree;
          if (transposed) {
            bestTree.transposed = true;
            bestTree = normalizeTreeFn(bestTree, usableW, usableH);
          }
          improved = true;
        }
      }
    }
  }

  if (regroupOpportunities.length >= 2) {
    const forcedPieces: Piece[] = [];
    const usedLabels = new Set<string>();

    for (const opp of regroupOpportunities) {
      const groupLabels: string[] = [];
      let sumW = 0;
      for (const p of opp.pieces) {
        sumW += Math.max(p.w, p.h);
        if (p.label) {
          groupLabels.push(p.label);
          usedLabels.add(p.label);
        }
      }
      if (sumW <= usableW) {
        forcedPieces.push({
          w: sumW,
          h: opp.height,
          area: sumW * opp.height,
          count: opp.pieces.length,
          labels: groupLabels.length > 0 ? groupLabels : undefined,
          groupedAxis: "w",
        });
      }
    }

    for (const p of allPieces) {
      if (p.label && usedLabels.has(p.label)) continue;
      forcedPieces.push({ ...p });
    }

    const strategies = getSortStrategies();
    for (const transposed of [false, true]) {
      const eW = transposed ? usableH : usableW;
      const eH = transposed ? usableW : usableH;
      for (const sortFn of strategies) {
        const grouped = forcedPieces.filter((p) => (p.count || 1) > 1);
        const rest = forcedPieces.filter((p) => (p.count || 1) <= 1).sort(sortFn);
        const sorted = [...grouped, ...rest];
        const result = runPlacementFn(sorted, eW, eH, minBreak);
        if (result.area > bestArea) {
          bestArea = result.area;
          bestTree = result.tree;
          if (transposed) {
            bestTree.transposed = true;
            bestTree = normalizeTreeFn(bestTree, usableW, usableH);
          }
          improved = true;
        }
      }
    }
  }

  return { tree: bestTree, area: bestArea, improved };
}
