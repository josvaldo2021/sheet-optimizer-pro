import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { TreeNode, findNode } from '@/lib/cnc-engine';
import { LayoutGroup } from '@/lib/layout-utils';

// Clean piece style
const PIECE_BG = 'hsl(0 0% 100%)';
const PIECE_BORDER = 'hsl(0 0% 70%)';

interface SheetViewerProps {
  chapas: Array<{ tree: TreeNode; usedArea: number }>;
  activeIndex: number;
  onSelectSheet: (index: number) => void;
  selectedId: string;
  onSelectNode: (id: string) => void;
  usableW: number;
  usableH: number;
  chapaW: number;
  chapaH: number;
  ml: number;
  mb: number;
  utilization: number;
  layoutGroups?: LayoutGroup[];
}

export default function SheetViewer({
  chapas, activeIndex, onSelectSheet,
  selectedId, onSelectNode,
  usableW, usableH, chapaW, chapaH,
  ml, mb, utilization, layoutGroups,
}: SheetViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setContainerSize({ w: r.width, h: r.height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const tree = chapas.length > 0 ? chapas[activeIndex]?.tree : null;

  // Calculate scale to fit the sheet in the container
  const scale = useMemo(() => {
    const padding = 40;
    const availW = containerSize.w - padding;
    const availH = containerSize.h - padding;
    if (availW <= 0 || availH <= 0) return 1;
    return Math.min(availW / chapaW, availH / chapaH);
  }, [containerSize, chapaW, chapaH]);

  // Count pieces for color assignment
  const pieceIndex = useRef(0);

  const renderSheet = useCallback((tree: TreeNode) => {
    const T = tree.transposed || false;

    // --- Piece & Waste Collection with Absolute Coordinates ---
    type AbsoluteBox = { id: string; x: number; y: number; w: number; h: number; label?: string; isPiece: boolean };
    const elements: AbsoluteBox[] = [];
    const wastes: { x: number; y: number; w: number; h: number }[] = [];

    let xOff = 0;
    tree.filhos.forEach(xNode => {
      for (let ix = 0; ix < xNode.multi; ix++) {
        const cx = xOff;
        let yOff = 0;
        xNode.filhos.forEach(yNode => {
          for (let iy = 0; iy < yNode.multi; iy++) {
            const cy = yOff;
            let zOff = 0;
            yNode.filhos.forEach(zNode => {
              for (let iz = 0; iz < zNode.multi; iz++) {
                if (zNode.filhos.length === 0) {
                  // Final Piece (Z leaf)
                  const pW = zNode.valor;
                  const pH = yNode.valor;
                  elements.push({ id: zNode.id, x: cx + zOff, y: cy, w: pW, h: pH, label: zNode.label, isPiece: true });
                } else {
                  let wOff = 0;
                  zNode.filhos.forEach(wNode => {
                    for (let iw = 0; iw < wNode.multi; iw++) {
                      if (wNode.filhos.length === 0) {
                        // W piece node
                        elements.push({ id: wNode.id, x: cx + zOff, y: cy + wOff, w: zNode.valor, h: wNode.valor, label: wNode.label, isPiece: true });
                      } else {
                        // W with Q children
                        let qOff = 0;
                        wNode.filhos.forEach(qNode => {
                          for (let iq = 0; iq < qNode.multi; iq++) {
                            elements.push({ id: qNode.id, x: cx + zOff + qOff, y: cy + wOff, w: qNode.valor, h: wNode.valor, label: qNode.label, isPiece: true });
                            qOff += qNode.valor;
                          }
                        });
                        // Q waste (horizontal space in W)
                        if (zNode.valor - qOff > 0.5) wastes.push({ x: cx + zOff + qOff, y: cy + wOff, w: zNode.valor - qOff, h: wNode.valor });
                      }
                      wOff += wNode.valor;
                    }
                  });
                  // W waste (vertical space in Z)
                  if (yNode.valor - wOff > 0.5) wastes.push({ x: cx + zOff, y: cy + wOff, w: zNode.valor, h: yNode.valor - wOff });
                }
                zOff += zNode.valor;
              }
            });
            // Z waste (horizontal space in Y strip)
            if (xNode.valor - zOff > 0.5) wastes.push({ x: cx + zOff, y: cy, w: xNode.valor - zOff, h: yNode.valor });
            yOff += yNode.valor;
          }
        });
        // Y waste (vertical space above strips)
        const totalH = T ? usableW : usableH;
        if (totalH - yOff > 0.5) wastes.push({ x: cx, y: yOff, w: xNode.valor, h: totalH - yOff });
        xOff += xNode.valor;
      }
    });
    // X waste (horizontal space right of columns)
    const totalW = T ? usableH : usableW;
    if (totalW - xOff > 0.5) wastes.push({ x: xOff, y: 0, w: totalW - xOff, h: T ? usableW : usableH });

    // --- Geometrical Merge Algorithm for Wastes ---
    const mergeRectangles = (rects: { x: number; y: number; w: number; h: number }[]) => {
      let current = [...rects];
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < current.length; i++) {
          for (let j = i + 1; j < current.length; j++) {
            const a = current[i]; const b = current[j];
            // Match vertically (same X, same W, adjacent Y)
            if (Math.abs(a.x - b.x) < 0.2 && Math.abs(a.w - b.w) < 0.2) {
              if (Math.abs(a.y + a.h - b.y) < 0.2) { current[i] = { ...a, h: a.h + b.h }; current.splice(j, 1); changed = true; break; }
              if (Math.abs(b.y + b.h - a.y) < 0.2) { current[i] = { ...b, h: a.h + b.h }; current.splice(j, 1); changed = true; break; }
            }
            // Match horizontally (same Y, same H, adjacent X)
            if (Math.abs(a.y - b.y) < 0.2 && Math.abs(a.h - b.h) < 0.2) {
              if (Math.abs(a.x + a.w - b.x) < 0.2) { current[i] = { ...a, w: a.w + b.w }; current.splice(j, 1); changed = true; break; }
              if (Math.abs(b.x + b.w - a.x) < 0.2) { current[i] = { ...b, w: a.w + b.w }; current.splice(j, 1); changed = true; break; }
            }
          }
          if (changed) break;
        }
      }
      return current;
    };
    const mergedWastes = mergeRectangles(wastes);

    // --- Render Final JSX ---
    const dimLabel = (w: number, h: number) => T ? `${Math.round(h)}×${Math.round(w)}` : `${Math.round(w)}×${Math.round(h)}`;
    
    const dynamicFontSize = (pxW: number, pxH: number, dimText: string, idText?: string, vertical = false) => {
      const lines = idText ? 2 : 1;
      const availW = Math.max(4, pxW - 6); const availH = Math.max(4, pxH - 6);
      const fs = vertical
        ? Math.min(Math.min(availW * 0.32, availH * 0.36), (Math.max(availW, availH) * 0.92) / Math.max(dimText.length, idText?.length || 1), (Math.min(availW, availH) * 0.9) / (lines * 1.1))
        : Math.min(Math.min(availW * 0.32, availH * 0.36), availW / (Math.max(dimText.length, idText?.length || 0) * 0.58), availH / (lines * 1.2));
      return Math.max(6, Math.min(26, fs));
    };

    const renderedPieces = elements.map((p, pi) => {
      const finalW = T ? p.h : p.w; const finalH = T ? p.w : p.h;
      const finalX = T ? p.y : p.x; const finalY = T ? p.x : p.y;
      const dim = dimLabel(p.w, p.h); const isV = finalH > finalW;
      const fs = dynamicFontSize(finalW * scale, finalH * scale, dim, p.label, isV);
      return (
        <div key={`p-${pi}`} className={`sv-piece ${selectedId === p.id ? 'sv-selected' : ''}`}
          style={{ position: 'absolute', left: finalX * scale, bottom: finalY * scale, width: finalW * scale, height: finalH * scale, background: PIECE_BG, border: '0.5px solid hsl(0 0% 40%)', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { e.stopPropagation(); onSelectNode(p.id); }}>
          <span className={`sv-piece-label ${isV ? 'sv-label-vertical' : ''}`} style={{ fontSize: fs, lineHeight: 1.15 }}>
            {p.label && <span className="sv-piece-id" style={{ fontSize: fs * 0.75 }}>{p.label}</span>}
            {dim}
          </span>
        </div>
      );
    });

    const renderedWastes = mergedWastes.map((w, wi) => {
      const finalW = T ? w.h : w.w; const finalH = T ? w.w : w.h;
      const finalX = T ? w.y : w.x; const finalY = T ? w.x : w.y;
      return (
        <div key={`w-${wi}`} className="sv-waste" style={{ position: 'absolute', left: finalX * scale, bottom: finalY * scale, width: finalW * scale, height: finalH * scale }}>
          <span className="sv-waste-label">{Math.round(w.w)}×{Math.round(w.h)}</span>
        </div>
      );
    });

    return [...renderedPieces, ...renderedWastes];
  }, [scale, selectedId, onSelectNode, usableW, usableH]);

  // Calculate per-sheet utilization
  const sheetUtil = useMemo(() => {
    if (!chapas.length) return 0;
    const chapa = chapas[activeIndex];
    if (!chapa) return 0;
    return usableW > 0 && usableH > 0 ? (chapa.usedArea / (usableW * usableH)) * 100 : 0;
  }, [chapas, activeIndex, usableW, usableH]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'hsl(0 0% 2%)' }}>
      {/* Header bar */}
      <div className="sv-header">
        <div className="sv-header-stat">
          <span className="sv-header-label">APROVEITAMENTO TOTAL</span>
          <span className="sv-header-value" style={{ color: utilization > 80 ? 'hsl(120 80% 55%)' : utilization > 50 ? 'hsl(45 90% 55%)' : 'hsl(0 70% 55%)' }}>
            {utilization.toFixed(1)}%
          </span>
        </div>
        <div className="sv-header-stat">
          <span className="sv-header-label">CHAPAS</span>
          <span className="sv-header-value">{chapas.length}</span>
        </div>
        {chapas.length > 0 && (
          <div className="sv-header-stat">
            <span className="sv-header-label">CHAPA {activeIndex + 1}</span>
            <span className="sv-header-value" style={{ color: 'hsl(200 80% 60%)' }}>
              {sheetUtil.toFixed(1)}%
            </span>
          </div>
        )}
        {(() => {
          const group = layoutGroups?.find(g => g.indices.includes(activeIndex));
          return group && group.count > 1 ? (
            <div className="sv-header-stat">
              <span className="sv-header-label">LAYOUT REPETIDO</span>
              <span className="sv-header-value" style={{ color: 'hsl(30 100% 55%)' }}>
                ×{group.count}
              </span>
            </div>
          ) : null;
        })()}
      </div>

      {/* Sheet tabs removed - navigation via layout summary in sidebar */}

      {/* Sheet viewport */}
      <div ref={containerRef} className="flex-1 flex justify-center items-center overflow-hidden p-4" style={{ background: 'hsl(0 0% 18%)' }}>
        {tree ? (
          <div
            className="sv-sheet"
            style={{
              width: chapaW * scale,
              height: chapaH * scale,
            }}
          >
            {/* Margin area (gray border) */}
            <div
              className="sv-usable"
              style={{
                width: usableW * scale,
                height: usableH * scale,
                left: ml * scale,
                bottom: mb * scale,
              }}
            >
              {renderSheet(tree)}
            </div>
          </div>
        ) : (
          <div className="sv-empty">
            <div className="sv-empty-icon">📐</div>
            <div className="sv-empty-text">Adicione peças e clique em OTIMIZAR</div>
          </div>
        )}
      </div>
    </div>
  );
}
