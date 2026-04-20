import { TreeNode } from '../cnc-engine';
import { LayoutGroup } from './layout-utils';

export interface PrintLayoutOptions {
  group: LayoutGroup;
  groupIdx: number;
  chapaW: number;
  chapaH: number;
  usableW: number;
  usableH: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
}

interface Piece {
  w: number;
  h: number;
  label?: string;
}

function extractPieces(node: TreeNode, parents: TreeNode[] = []): Piece[] {
  const pieces: Piece[] = [];
  const yAnc = [...parents].reverse().find(p => p.tipo === 'Y');
  const zAnc = [...parents].reverse().find(p => p.tipo === 'Z');
  const wAnc = [...parents].reverse().find(p => p.tipo === 'W');

  let pieceW = 0, pieceH = 0, isLeaf = false;

  if (node.tipo === 'Z' && node.filhos.length === 0) {
    pieceW = node.valor; pieceH = yAnc?.valor || 0; isLeaf = true;
  } else if (node.tipo === 'W' && node.filhos.length === 0) {
    pieceW = zAnc?.valor || 0; pieceH = node.valor; isLeaf = true;
  } else if (node.tipo === 'Q' && node.filhos.length === 0) {
    pieceW = node.valor; pieceH = wAnc?.valor || 0; isLeaf = true;
  } else if (node.tipo === 'R') {
    const qAnc = [...parents].reverse().find(p => p.tipo === 'Q');
    pieceW = qAnc?.valor || 0; pieceH = node.valor; isLeaf = true;
  }

  if (isLeaf && pieceW > 0 && pieceH > 0) {
    for (let m = 0; m < node.multi; m++) pieces.push({ w: pieceW, h: pieceH, label: node.label });
  }

  node.filhos.forEach(f => pieces.push(...extractPieces(f, [...parents, node])));
  return pieces;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSvg(tree: TreeNode, usableW: number, usableH: number): string {
  const MAX_W = 1100;
  const MAX_H = 660;
  const scale = Math.min(MAX_W / usableW, MAX_H / usableH);
  const svgW = Math.round(usableW * scale);
  const svgH = Math.round(usableH * scale);
  const T = tree.transposed || false;
  const els: string[] = [];

  els.push(`<rect width="${svgW}" height="${svgH}" fill="#f4f6fa" stroke="#8a9ab8" stroke-width="1.5" rx="3"/>`);

  const drawPiece = (lx: number, ly: number, lw: number, lh: number, label: string | undefined, dw: number, dh: number) => {
    const px = lx * scale;
    const py = svgH - (ly + lh) * scale;
    const pw = lw * scale;
    const ph = lh * scale;
    const dim = T ? `${Math.round(dh)}×${Math.round(dw)}` : `${Math.round(dw)}×${Math.round(dh)}`;

    els.push(`<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#d8ecff" stroke="#4a72b0" stroke-width="0.9"/>`);

    if (pw < 10 || ph < 8) return;

    const cx = px + pw / 2;
    const cy = py + ph / 2;

    // Fit font to available space; char width ≈ 0.6 × font-size
    const fitFs = (text: string, maxW: number, maxH: number, fMax: number) =>
      Math.max(6, Math.min(fMax, maxW / (text.length * 0.6), maxH));

    if (label) {
      const fsId  = fitFs(label, pw - 6, ph * 0.45, 20);
      const fsDim = fitFs(dim,   pw - 6, ph * 0.32, 15);
      const gap   = Math.max(1, ph * 0.04);
      const totalH = fsId + gap + fsDim;

      if (totalH <= ph - 4) {
        // Two lines centered as a block
        const y1 = cy - totalH / 2 + fsId / 2;   // middle of line 1
        const y2 = cy - totalH / 2 + fsId + gap + fsDim / 2; // middle of line 2
        els.push(`<text x="${cx.toFixed(1)}" y="${y1.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fsId.toFixed(1)}" font-weight="bold" font-family="Arial,sans-serif" fill="#0f2d66">${esc(label)}</text>`);
        els.push(`<text x="${cx.toFixed(1)}" y="${y2.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fsDim.toFixed(1)}" font-family="Arial,sans-serif" fill="#2c5098">${esc(dim)}</text>`);
      } else {
        // Single line — show whichever fits better
        const fsOne = fitFs(label, pw - 6, ph - 4, 18);
        els.push(`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fsOne.toFixed(1)}" font-weight="bold" font-family="Arial,sans-serif" fill="#0f2d66">${esc(label)}</text>`);
      }
    } else {
      const fsDim = fitFs(dim, pw - 6, ph - 4, 18);
      els.push(`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fsDim.toFixed(1)}" font-family="Arial,sans-serif" fill="#2c5098">${esc(dim)}</text>`);
    }
  };

  const drawWaste = (lx: number, ly: number, lw: number, lh: number, label: string) => {
    const px = lx * scale;
    const py = svgH - (ly + lh) * scale;
    const pw = lw * scale;
    const ph = lh * scale;
    els.push(`<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="url(#hatch)" stroke="#b0b8c8" stroke-width="0.5"/>`);
    if (pw > 28 && ph > 12) {
      const fs = Math.max(6, Math.min(12, pw * 0.09, ph * 0.22));
      els.push(`<text x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs.toFixed(1)}" font-family="Arial,sans-serif" fill="#8898b8">${esc(label)}</text>`);
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
                  drawPiece(xBase + yBase, xBottom + yBottom + zOff, yNode.valor, zNode.valor, zNode.label, zNode.valor, yNode.valor);
                } else {
                  drawPiece(xBase + zOff, xBottom + yBottom, zNode.valor, yNode.valor, zNode.label, zNode.valor, yNode.valor);
                }
              } else {
                let wOff = 0;
                zNode.filhos.forEach(wNode => {
                  for (let iw = 0; iw < wNode.multi; iw++) {
                    if (wNode.filhos.length === 0) {
                      if (T) {
                        drawPiece(xBase + yBase + wOff, xBottom + yBottom + zOff, wNode.valor, zNode.valor, wNode.label, zNode.valor, wNode.valor);
                      } else {
                        drawPiece(xBase + zOff, xBottom + yBottom + wOff, zNode.valor, wNode.valor, wNode.label, zNode.valor, wNode.valor);
                      }
                    } else {
                      let qOff = 0;
                      wNode.filhos.forEach(qNode => {
                        for (let iq = 0; iq < qNode.multi; iq++) {
                          if (qNode.filhos.length === 0) {
                            if (T) {
                              drawPiece(xBase + yBase + wOff, xBottom + yBottom + zOff + qOff, wNode.valor, qNode.valor, qNode.label, qNode.valor, wNode.valor);
                            } else {
                              drawPiece(xBase + zOff + qOff, xBottom + yBottom + wOff, qNode.valor, wNode.valor, qNode.label, qNode.valor, wNode.valor);
                            }
                          } else {
                            let rOff = 0;
                            qNode.filhos.forEach(rNode => {
                              for (let ir = 0; ir < rNode.multi; ir++) {
                                if (T) {
                                  drawPiece(xBase + yBase + wOff + rOff, xBottom + yBottom + zOff + qOff, rNode.valor, qNode.valor, rNode.label, qNode.valor, rNode.valor);
                                } else {
                                  drawPiece(xBase + zOff + qOff, xBottom + yBottom + wOff + rOff, qNode.valor, rNode.valor, rNode.label, qNode.valor, rNode.valor);
                                }
                                rOff += rNode.valor;
                              }
                            });
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

  const totalX = tree.filhos.reduce((a, x) => a + x.multi * x.valor, 0);
  const xWaste = (T ? usableH : usableW) - totalX;
  if (xWaste > 0) {
    if (T) {
      drawWaste(0, totalX, usableW, xWaste, `SOBRA ${Math.round(usableW)}×${Math.round(xWaste)}`);
    } else {
      drawWaste(totalX, 0, xWaste, usableH, `SOBRA ${Math.round(xWaste)}×${Math.round(usableH)}`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="max-width:100%;height:auto;display:block;">
  <defs>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#e8ebf2"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="#c0c8d8" stroke-width="2"/>
    </pattern>
  </defs>
  ${els.join('\n  ')}
</svg>`;
}

function buildPieceTable(pieces: Piece[]): string {
  const map = new Map<string, { w: number; h: number; label?: string; count: number }>();
  pieces.forEach(p => {
    const key = `${p.label || ''}|${Math.round(p.w)}|${Math.round(p.h)}`;
    const existing = map.get(key);
    if (existing) { existing.count++; } else { map.set(key, { ...p, count: 1 }); }
  });

  const sorted = Array.from(map.values()).sort((a, b) => {
    if (a.label && b.label) return a.label.localeCompare(b.label);
    if (a.label) return -1;
    if (b.label) return 1;
    return 0;
  });

  const totalQty = sorted.reduce((s, p) => s + p.count, 0);

  const rows = sorted.map((p, i) =>
    `<tr>
      <td>${i + 1}</td>
      <td><b>${esc(p.label || '—')}</b></td>
      <td>${Math.round(p.w)}</td>
      <td>${Math.round(p.h)}</td>
      <td>${p.count}</td>
    </tr>`
  ).join('');

  const footer = `<tr style="background:#e8edf8;font-weight:700;">
    <td colspan="4" style="text-align:right;padding-right:12px;">Total de peças</td>
    <td>${totalQty}</td>
  </tr>`;

  return `<table>
    <thead><tr><th>#</th><th>ID</th><th>Largura (mm)</th><th>Altura (mm)</th><th>Qtd</th></tr></thead>
    <tbody>${rows}${footer}</tbody>
  </table>`;
}

export function printLayout(options: PrintLayoutOptions): void {
  const { group, groupIdx, chapaW, chapaH, usableW, usableH, ml, mr, mt, mb } = options;
  const pieces = extractPieces(group.tree);
  const util = usableW > 0 && usableH > 0 ? (group.usedArea / (usableW * usableH)) * 100 : 0;
  const svg = buildSvg(group.tree, usableW, usableH);
  const table = buildPieceTable(pieces);
  const date = new Date().toLocaleString('pt-BR');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Layout ${groupIdx + 1} — Plano de Corte</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 14mm; }
    @media print { .no-print { display: none !important; } body { padding: 0; } }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a2e; padding: 14px 22px; margin: 0; background: #fff; }
    h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #0f2d66; letter-spacing: -0.3px; }
    .meta {
      display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 11px; color: #444;
      margin-bottom: 14px; padding: 8px 12px; background: #f0f4ff;
      border: 1px solid #c8d4f0; border-radius: 6px;
    }
    .meta span { display: flex; align-items: center; gap: 4px; }
    .meta b { color: #0f2d66; font-weight: 700; }
    .badge {
      display: inline-block; padding: 1px 7px; border-radius: 10px;
      font-size: 11px; font-weight: 700;
    }
    .badge-blue  { background: #d0e4ff; color: #0f2d66; }
    .badge-green { background: #d0f0e0; color: #0a5c2e; }
    .sheet-wrap { margin-bottom: 18px; border: 1px solid #c8d4f0; border-radius: 6px; overflow: hidden; background: #fff; }
    h2 { margin: 0 0 8px; font-size: 14px; font-weight: 700; color: #0f2d66; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    thead tr { background: #0f2d66; color: #fff; }
    th { padding: 5px 10px; text-align: left; font-weight: 600; letter-spacing: 0.3px; }
    td { border-bottom: 1px solid #e0e6f0; padding: 4px 10px; }
    tr:nth-child(even) td { background: #f5f8ff; }
    tr:last-child td { border-bottom: none; }
    td:nth-child(3), td:nth-child(4), td:nth-child(5) { text-align: right; font-variant-numeric: tabular-nums; }
    th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align: right; }
    .print-btn { margin-bottom: 14px; padding: 7px 20px; background: #0f2d66; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .print-btn:hover { background: #1a4a99; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">&#128438; Imprimir</button>
  <h1>Layout ${groupIdx + 1}</h1>
  <div class="meta">
    <span>Chapas: <span class="badge badge-blue">×${group.count}</span></span>
    <span>Aproveitamento: <b>${util.toFixed(1)}%</b></span>
    <span>Tipos de peça: <b>${pieces.length}</b></span>
    <span>Chapa: <b>${chapaW}×${chapaH} mm</b></span>
    <span>Área útil: <b>${usableW}×${usableH} mm</b></span>
    <span>Refilos: E=${ml} D=${mr} S=${mt} I=${mb} mm</span>
    <span>Gerado em: ${date}</span>
  </div>
  <div class="sheet-wrap">${svg}</div>
  <h2>Lista de Peças</h2>
  ${table}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
