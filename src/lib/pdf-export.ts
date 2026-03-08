import jsPDF from 'jspdf';
import { TreeNode } from './cnc-engine';
import { LayoutGroup } from './layout-utils';

interface PdfExportOptions {
  chapas: Array<{ tree: TreeNode; usedArea: number }>;
  layoutGroups: LayoutGroup[];
  chapaW: number;
  chapaH: number;
  usableW: number;
  usableH: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
  utilization: number;
}

interface ExtractedPiece {
  w: number;
  h: number;
  label?: string;
}

function extractPiecesFromTree(node: TreeNode, parents: TreeNode[] = []): ExtractedPiece[] {
  const pieces: ExtractedPiece[] = [];
  const yAncestor = [...parents].reverse().find(p => p.tipo === 'Y');
  const zAncestor = [...parents].reverse().find(p => p.tipo === 'Z');
  const wAncestor = [...parents].reverse().find(p => p.tipo === 'W');

  let pieceW = 0, pieceH = 0, isLeaf = false;

  if (node.tipo === 'Z' && node.filhos.length === 0) {
    pieceW = node.valor; pieceH = yAncestor?.valor || 0; isLeaf = true;
  } else if (node.tipo === 'W' && node.filhos.length === 0) {
    pieceW = zAncestor?.valor || 0; pieceH = node.valor; isLeaf = true;
  } else if (node.tipo === 'Q') {
    pieceW = node.valor; pieceH = wAncestor?.valor || 0; isLeaf = true;
  }

  if (isLeaf && pieceW > 0 && pieceH > 0) {
    for (let m = 0; m < node.multi; m++) {
      pieces.push({ w: pieceW, h: pieceH, label: node.label });
    }
  }

  node.filhos.forEach(f => {
    pieces.push(...extractPiecesFromTree(f, [...parents, node]));
  });

  return pieces;
}

function drawSheetMiniature(
  doc: jsPDF,
  tree: TreeNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  usableW: number,
  usableH: number,
  chapaW: number,
  chapaH: number,
  ml: number,
  mb: number,
) {
  const scale = Math.min(maxW / chapaW, maxH / chapaH);
  const sheetW = chapaW * scale;
  const sheetH = chapaH * scale;

  // Sheet border
  doc.setDrawColor(150);
  doc.setFillColor(240, 240, 240);
  doc.rect(x, y, sheetW, sheetH, 'FD');

  // Usable area
  const ux = x + ml * scale;
  const uy = y + (chapaH - usableH - mb) * scale; // top-down in PDF
  const uw = usableW * scale;
  const uh = usableH * scale;
  doc.setFillColor(255, 255, 255);
  doc.rect(ux, uy, uw, uh, 'FD');

  // Draw pieces recursively
  drawTreePieces(doc, tree, ux, uy + uh, scale, usableW, usableH);

  return { w: sheetW, h: sheetH };
}

function drawTreePieces(
  doc: jsPDF,
  tree: TreeNode,
  baseX: number,
  baseY: number, // bottom of usable area (PDF y increases downward, so this is the max y)
  scale: number,
  usableW: number,
  usableH: number,
) {
  const T = tree.transposed || false;

  const dimLabel = (d1: number, d2: number) =>
    T ? `${Math.round(d2)}×${Math.round(d1)}` : `${Math.round(d1)}×${Math.round(d2)}`;

  const drawPiece = (
    localX: number,
    localY: number,
    localW: number,
    localH: number,
    pieceLabel: string | undefined,
    dimW: number,
    dimH: number,
  ) => {
    const px = baseX + localX * scale;
    const py = baseY - (localY + localH) * scale;
    const pw = localW * scale;
    const ph = localH * scale;

    doc.setFillColor(220, 235, 255);
    doc.setDrawColor(100, 130, 180);
    doc.rect(px, py, pw, ph, 'FD');

    if (pw > 4 && ph > 3) {
      // Font scales proportionally to piece size
      const maxFontByW = pw * 0.35;
      const maxFontByH = ph * (pieceLabel ? 0.3 : 0.5);
      const fontSize = Math.max(3, Math.min(14, maxFontByW, maxFontByH));
      doc.setFontSize(fontSize);
      doc.setTextColor(30, 60, 100);

      const dim = dimLabel(dimW, dimH);
      if (pieceLabel && ph > fontSize * 1.2) {
        const lineGap = fontSize * 0.5;
        doc.setFontSize(fontSize);
        doc.text(pieceLabel, px + pw / 2, py + ph / 2 - lineGap, { align: 'center', baseline: 'middle' });
        doc.setFontSize(fontSize * 0.75);
        doc.text(dim, px + pw / 2, py + ph / 2 + lineGap, { align: 'center', baseline: 'middle' });
      } else {
        doc.text(pieceLabel ? `${pieceLabel} ${dim}` : dim, px + pw / 2, py + ph / 2, { align: 'center', baseline: 'middle' });
      }
    }
  };

  let xOff = 0;

  tree.filhos.forEach(xNode => {
    for (let ix = 0; ix < xNode.multi; ix++) {
      const xBase = T ? 0 : xOff;
      const xBottom = T ? xOff : 0;
      let yOff = 0;

      xNode.filhos.forEach(yNode => {
        for (let iy = 0; iy < yNode.multi; iy++) {
          const yBase = T ? yOff : 0;
          const yBottom = T ? 0 : yOff;
          let zOff = 0;

          yNode.filhos.forEach(zNode => {
            for (let iz = 0; iz < zNode.multi; iz++) {
              if (zNode.filhos.length === 0) {
                if (T) {
                  // Transposed: piece = yNode (width) × zNode (height)
                  drawPiece(
                    xBase + yBase,
                    xBottom + yBottom + zOff,
                    yNode.valor,
                    zNode.valor,
                    zNode.label,
                    zNode.valor,
                    yNode.valor,
                  );
                } else {
                  drawPiece(
                    xBase + zOff,
                    xBottom + yBottom,
                    zNode.valor,
                    yNode.valor,
                    zNode.label,
                    zNode.valor,
                    yNode.valor,
                  );
                }
              } else {
                let wOff = 0;
                zNode.filhos.forEach(wNode => {
                  for (let iw = 0; iw < wNode.multi; iw++) {
                    if (wNode.filhos.length === 0) {
                      if (T) {
                        // Transposed: piece = wNode (width) × zNode (height)
                        drawPiece(
                          xBase + yBase + wOff,
                          xBottom + yBottom + zOff,
                          wNode.valor,
                          zNode.valor,
                          wNode.label,
                          zNode.valor,
                          wNode.valor,
                        );
                      } else {
                        drawPiece(
                          xBase + zOff,
                          xBottom + yBottom + wOff,
                          zNode.valor,
                          wNode.valor,
                          wNode.label,
                          zNode.valor,
                          wNode.valor,
                        );
                      }
                    } else {
                      let qOff = 0;
                      wNode.filhos.forEach(qNode => {
                        for (let iq = 0; iq < qNode.multi; iq++) {
                          if (T) {
                            // Transposed: piece = wNode (width) × qNode (height)
                            drawPiece(
                              xBase + yBase + wOff,
                              xBottom + yBottom + zOff + qOff,
                              wNode.valor,
                              qNode.valor,
                              qNode.label,
                              qNode.valor,
                              wNode.valor,
                            );
                          } else {
                            drawPiece(
                              xBase + zOff + qOff,
                              xBottom + yBottom + wOff,
                              qNode.valor,
                              wNode.valor,
                              qNode.label,
                              qNode.valor,
                              wNode.valor,
                            );
                          }
                          qOff += qNode.valor;
                        }
                      });
                    }
                    wOff += wNode.valor;
                  }
                });
              }
              zOff += zNode.valor;
            }
          });
          yOff += yNode.valor;
        }
      });
      xOff += xNode.valor;
    }
  });

  // Draw X-level waste
  const totalX = tree.filhos.reduce((a, x) => {
    let s = 0;
    for (let i = 0; i < x.multi; i++) s += x.valor;
    return a + s;
  }, 0);

  const xDimTotal = T ? usableH : usableW;
  const xWaste = xDimTotal - totalX;

  if (xWaste > 0) {
    const localX = T ? 0 : totalX;
    const localY = T ? totalX : 0;
    const localW = T ? usableW : xWaste;
    const localH = T ? xWaste : usableH;

    const px = baseX + localX * scale;
    const py = baseY - (localY + localH) * scale;
    const pw = localW * scale;
    const ph = localH * scale;

    doc.setFillColor(200, 220, 240);
    doc.setDrawColor(150, 180, 210);
    doc.rect(px, py, pw, ph, 'FD');

    if (pw > 10 && ph > 5) {
      doc.setFontSize(5);
      doc.setTextColor(100, 140, 180);
      doc.text('SOBRA', px + pw / 2, py + ph / 2, { align: 'center', baseline: 'middle' });
    }
  }
}

export function exportPdf(options: PdfExportOptions) {
  const { chapas, layoutGroups, chapaW, chapaH, usableW, usableH, ml, mb, utilization } = options;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const margin = 12;

  // ─── Cover page ───
  doc.setFontSize(28);
  doc.setTextColor(30, 30, 30);
  doc.text('Plano de Corte', margin, 28);

  doc.setFontSize(13);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, 38);

  let cy = 52;
  doc.setFontSize(14);
  doc.setTextColor(40);
  doc.text(`Chapa: ${chapaW} × ${chapaH} mm`, margin, cy); cy += 9;
  doc.text(`Área útil: ${usableW} × ${usableH} mm`, margin, cy); cy += 9;
  doc.text(`Refilos: E=${options.ml} D=${options.mr} S=${options.mt} I=${options.mb} mm`, margin, cy); cy += 9;
  doc.text(`Total de chapas: ${chapas.length}`, margin, cy); cy += 9;
  doc.text(`Layouts únicos: ${layoutGroups.length}`, margin, cy); cy += 9;
  doc.text(`Aproveitamento total: ${utilization.toFixed(1)}%`, margin, cy); cy += 14;

  // Summary table
  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text('Resumo dos Layouts', margin, cy); cy += 10;

  doc.setFontSize(12);
  doc.setTextColor(80);
  doc.text('Layout', margin, cy);
  doc.text('Qtd. Chapas', margin + 35, cy);
  doc.text('Aproveitamento', margin + 75, cy);
  doc.text('Peças', margin + 115, cy);
  cy += 6;

  doc.setDrawColor(200);
  doc.line(margin, cy - 1, margin + 140, cy - 1);
  cy += 3;

  doc.setFontSize(12);
  layoutGroups.forEach((group, gIdx) => {
    const util = usableW > 0 && usableH > 0 ? (group.usedArea / (usableW * usableH)) * 100 : 0;
    const pieces = extractPiecesFromTree(group.tree);

    doc.setTextColor(40);
    doc.text(`Layout ${gIdx + 1}`, margin, cy);
    doc.text(`×${group.count}`, margin + 35, cy);
    doc.text(`${util.toFixed(1)}%`, margin + 75, cy);
    doc.text(`${pieces.length}`, margin + 115, cy);
    cy += 8;
  });

  // ─── One page per layout ───
  layoutGroups.forEach((group, gIdx) => {
    doc.addPage();
    const util = usableW > 0 && usableH > 0 ? (group.usedArea / (usableW * usableH)) * 100 : 0;
    const pieces = extractPiecesFromTree(group.tree);

    // Header
    doc.setFontSize(20);
    doc.setTextColor(30);
    doc.text(`Layout ${gIdx + 1}`, margin, 20);

    doc.setFontSize(14);
    doc.setTextColor(80);
    doc.text(`Quantidade de chapas a cortar: ${group.count}`, margin + 55, 20);

    doc.setFontSize(13);
    doc.setTextColor(60);
    let hy = 30;
    doc.text(`Aproveitamento: ${util.toFixed(1)}%  •  Peças: ${pieces.length}  •  Chapa: ${chapaW}×${chapaH} mm`, margin, hy);
    hy += 10;

    // Miniature drawing
    const miniMaxW = pageW - margin * 2;
    const miniMaxH = 90;
    const { h: drawnH } = drawSheetMiniature(doc, group.tree, margin, hy, miniMaxW, miniMaxH, usableW, usableH, chapaW, chapaH, ml, mb);

    // Pieces table
    let ty = hy + drawnH + 12;
    doc.setFontSize(15);
    doc.setTextColor(30);
    doc.text('Lista de Peças', margin, ty); ty += 9;

    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text('#', margin, ty);
    doc.text('ID', margin + 10, ty);
    doc.text('Largura', margin + 50, ty);
    doc.text('Altura', margin + 80, ty);
    ty += 5;
    doc.setDrawColor(200);
    doc.line(margin, ty, margin + 100, ty);
    ty += 5;

    doc.setFontSize(11);
    doc.setTextColor(40);
    pieces.forEach((p, pIdx) => {
      if (ty > pageH - 15) {
        doc.addPage();
        ty = 18;
      }
      doc.text(`${pIdx + 1}`, margin, ty);
      doc.text(p.label || '-', margin + 10, ty);
      doc.text(`${Math.round(p.w)}`, margin + 50, ty);
      doc.text(`${Math.round(p.h)}`, margin + 80, ty);
      ty += 7;
    });
  });

  doc.save('plano-de-corte.pdf');
}
