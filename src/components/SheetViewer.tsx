import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { TreeNode, findNode } from '@/lib/cnc-engine';
import { LayoutGroup } from '@/lib/export/layout-utils';

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

  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });

  // Reset zoom when switching sheets
  useEffect(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, [activeIndex]);

  // Calculate base scale to fit the sheet in the container
  const baseScale = useMemo(() => {
    const padding = 40;
    const availW = containerSize.w - padding;
    const availH = containerSize.h - padding;
    if (availW <= 0 || availH <= 0) return 1;
    return Math.min(availW / chapaW, availH / chapaH);
  }, [containerSize, chapaW, chapaH]);

  const scale = baseScale * zoomLevel;

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomLevel(prev => Math.min(10, Math.max(0.5, prev * delta)));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOffsetStart.current = { ...panOffset };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  }, [zoomLevel, panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPanOffset({
      x: panOffsetStart.current.x + (e.clientX - panStart.current.x),
      y: panOffsetStart.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isPanning.current = false;
    (e.currentTarget as HTMLElement).style.cursor = zoomLevel > 1 ? 'grab' : 'default';
  }, [zoomLevel]);

  // Count pieces for color assignment
  const pieceIndex = useRef(0);

  const renderSheet = useCallback((tree: TreeNode) => {
    const els: JSX.Element[] = [];
    let xOff = 0;
    let colorIdx = 0;
    const T = tree.transposed || false;

    // Helper: get real-space piece label (width × height)
    const dimLabel = (d1: number, d2: number) => T
      ? `${Math.round(d2)}×${Math.round(d1)}`
      : `${Math.round(d1)}×${Math.round(d2)}`;

    // Dynamic font sizing that adapts to piece box + text length
    const dynamicFontSize = (
      pxW: number,
      pxH: number,
      dimText: string,
      idText?: string,
      vertical = false,
    ) => {
      const lines = idText ? 2 : 1;
      const availW = Math.max(4, pxW - 6);
      const availH = Math.max(4, pxH - 6);
      const shortSide = Math.min(availW, availH);
      const longSide = Math.max(availW, availH);

      const byBox = Math.min(availW * 0.32, availH * 0.36);

      const fs = vertical
        ? Math.min(
          byBox,
          (longSide * 0.92) / Math.max(dimText.length, idText?.length || 1),
          (shortSide * 0.9) / (lines * 1.1),
        )
        : Math.min(
          byBox,
          availW / (Math.max(dimText.length, idText?.length || 0) * 0.58),
          availH / (lines * 1.2),
        );

      return Math.max(6, Math.min(26, fs));
    };

    // Collect Y-waste metadata for merging across adjacent X columns
    type YWasteInfo = { xStart: number; xWidth: number; yStart: number; wasteH: number; xNodeValor: number };
    const yWastes: YWasteInfo[] = [];

    tree.filhos.forEach(xNode => {
      for (let ix = 0; ix < xNode.multi; ix++) {
        const cx = xOff;
        let yOff = 0;
        const strips: JSX.Element[] = [];

        xNode.filhos.forEach(yNode => {
          for (let iy = 0; iy < yNode.multi; iy++) {
            const cy = yOff;
            const zEls: JSX.Element[] = [];
            let zOff = 0;

            yNode.filhos.forEach(zNode => {
              for (let iz = 0; iz < zNode.multi; iz++) {
                const wEls: JSX.Element[] = [];

                if (zNode.filhos.length === 0) {
                  const isWasteZ = !zNode.label;
                  if (!isWasteZ) colorIdx++;
                  const realW = T ? yNode.valor : zNode.valor;
                  const realH = T ? zNode.valor : yNode.valor;
                  const isVertical = realH > realW;
                  const pxW = (T ? yNode.valor : zNode.valor) * scale;
                  const pxH = (T ? zNode.valor : yNode.valor) * scale;
                  const dim = dimLabel(zNode.valor, yNode.valor);
                  const fs = dynamicFontSize(pxW, pxH, dim, zNode.label, isVertical);
                  wEls.push(
                    <div key="final" className={isWasteZ ? 'sv-waste' : 'sv-piece'} style={isWasteZ ? {} : { background: PIECE_BG, borderColor: PIECE_BORDER }}>
                      <span className={`sv-piece-label ${isVertical ? 'sv-label-vertical' : ''}`} style={{ fontSize: fs, lineHeight: 1.15 }}>
                        {zNode.label && <span className="sv-piece-id" style={{ fontSize: fs * 0.75 }}>{zNode.label}</span>}
                        {dim}
                      </span>
                    </div>
                  );
                } else {
                  let wOff = 0;
                  zNode.filhos.forEach(wNode => {
                    for (let iw = 0; iw < wNode.multi; iw++) {
                      if (wNode.filhos.length === 0) {
                        const isWasteW = !wNode.label;
                        if (!isWasteW) colorIdx++;
                        const realW = T ? wNode.valor : zNode.valor;
                        const realH = T ? zNode.valor : wNode.valor;
                        const pxW = realW * scale;
                        const pxH = realH * scale;
                        const isVertical = realH > realW;
                        const dim = dimLabel(zNode.valor, wNode.valor);
                        const fs = dynamicFontSize(pxW, pxH, dim, wNode.label, isVertical);
                        wEls.push(
                          <div
                            key={`w-${wNode.id}-${iw}`}
                            className={`${isWasteW ? 'sv-waste' : ''} ${!isWasteW && selectedId === wNode.id ? 'sv-selected' : ''}`}
                            style={{
                              ...(T
                                ? { width: wNode.valor * scale, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '0.5px solid hsl(0 0% 40%)', boxSizing: 'border-box' as const, cursor: isWasteW ? 'default' : 'pointer', ...(isWasteW ? {} : { background: PIECE_BG }) }
                                : { width: '100%', height: wNode.valor * scale, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '0.5px solid hsl(0 0% 40%)', boxSizing: 'border-box' as const, cursor: isWasteW ? 'default' : 'pointer', ...(isWasteW ? {} : { background: PIECE_BG }) }
                              ),
                            }}
                            onClick={isWasteW ? undefined : (e => { e.stopPropagation(); onSelectNode(wNode.id); })}
                          >
                            <span className={`sv-piece-label ${isVertical ? 'sv-label-vertical' : ''}`} style={{ fontSize: fs, lineHeight: 1.15 }}>
                              {wNode.label && <span className="sv-piece-id" style={{ fontSize: fs * 0.75 }}>{wNode.label}</span>}
                              {dim}
                            </span>
                          </div>
                        );
                      } else {
                        // W with Q children
                        let qOff = 0;
                        const qEls: JSX.Element[] = [];
                        wNode.filhos.forEach(qNode => {
                          for (let iq = 0; iq < qNode.multi; iq++) {
                            if (qNode.filhos.length === 0) {
                              // Q is a leaf piece (or waste if no label)
                              const isWasteQ = !qNode.label;
                              if (!isWasteQ) colorIdx++;
                              const realW = T ? wNode.valor : qNode.valor;
                              const realH = T ? qNode.valor : wNode.valor;
                              const pxW = realW * scale;
                              const pxH = realH * scale;
                              const isVertical = realH > realW;
                              const dim = dimLabel(qNode.valor, wNode.valor);
                              const fs = dynamicFontSize(pxW, pxH, dim, qNode.label, isVertical);
                              qEls.push(
                                <div
                                  key={`q-${qNode.id}-${iq}`}
                                  className={`${isWasteQ ? 'sv-waste' : ''} ${!isWasteQ && selectedId === qNode.id ? 'sv-selected' : ''}`}
                                  style={{
                                    position: 'absolute',
                                    ...(T
                                      ? { left: 0, bottom: qOff * scale, width: wNode.valor * scale, height: qNode.valor * scale }
                                      : { left: qOff * scale, bottom: 0, width: qNode.valor * scale, height: wNode.valor * scale }
                                    ),
                                    ...(isWasteQ ? {} : { background: PIECE_BG }),
                                    border: '0.5px solid hsl(0 0% 40%)',
                                    boxSizing: 'border-box' as const,
                                    cursor: isWasteQ ? 'default' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                  onClick={isWasteQ ? undefined : (e => { e.stopPropagation(); onSelectNode(qNode.id); })}
                                >
                                  <span className={`sv-piece-label ${isVertical ? 'sv-label-vertical' : ''}`} style={{ fontSize: fs, lineHeight: 1.15 }}>
                                    {qNode.label && <span className="sv-piece-id" style={{ fontSize: fs * 0.75 }}>{qNode.label}</span>}
                                    {dim}
                                  </span>
                                </div>
                              );
                            } else {
                              // Q with R children
                              let rOff = 0;
                              const rEls: JSX.Element[] = [];
                              qNode.filhos.forEach(rNode => {
                                for (let ir = 0; ir < rNode.multi; ir++) {
                                  const isWasteR = !rNode.label;
                                  if (!isWasteR) colorIdx++;
                                  const realW = T ? rNode.valor : qNode.valor;
                                  const realH = T ? qNode.valor : rNode.valor;
                                  const pxW = realW * scale;
                                  const pxH = realH * scale;
                                  const isVertical = realH > realW;
                                  const dim = dimLabel(qNode.valor, rNode.valor);
                                  const fs = dynamicFontSize(pxW, pxH, dim, rNode.label, isVertical);
                                  rEls.push(
                                    <div
                                      key={`r-${rNode.id}-${ir}`}
                                      className={`${isWasteR ? 'sv-waste' : ''} ${!isWasteR && selectedId === rNode.id ? 'sv-selected' : ''}`}
                                      style={{
                                        position: 'absolute',
                                        ...(T
                                          ? { left: rOff * scale, bottom: 0, width: rNode.valor * scale, height: qNode.valor * scale }
                                          : { left: 0, bottom: rOff * scale, width: qNode.valor * scale, height: rNode.valor * scale }
                                        ),
                                        ...(isWasteR ? {} : { background: PIECE_BG }),
                                        border: '0.5px solid hsl(0 0% 40%)',
                                        boxSizing: 'border-box' as const,
                                        cursor: isWasteR ? 'default' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                      onClick={isWasteR ? undefined : (e => { e.stopPropagation(); onSelectNode(rNode.id); })}
                                    >
                                      <span className={`sv-piece-label ${isVertical ? 'sv-label-vertical' : ''}`} style={{ fontSize: fs, lineHeight: 1.15 }}>
                                        {rNode.label && <span className="sv-piece-id" style={{ fontSize: fs * 0.75 }}>{rNode.label}</span>}
                                        {dim}
                                      </span>
                                    </div>
                                  );
                                  rOff += rNode.valor;
                                }
                              });

                              // R waste
                              const rWaste = wNode.valor - rOff;
                              if (rWaste > 0 && rWaste * scale >= 4) {
                                rEls.push(
                                  <div key="sr" className="sv-waste" style={{
                                    position: 'absolute',
                                    ...(T
                                      ? { left: rOff * scale, bottom: 0, width: rWaste * scale, height: qNode.valor * scale }
                                      : { left: 0, bottom: rOff * scale, width: qNode.valor * scale, height: rWaste * scale }
                                    ),
                                  }}>
                                    <span className="sv-waste-label">{dimLabel(qNode.valor, rWaste)}</span>
                                  </div>
                                );
                              }

                              qEls.push(
                                <div
                                  key={`q-${qNode.id}-${iq}`}
                                  className={`${selectedId === qNode.id ? 'sv-selected' : ''}`}
                                  style={{
                                    overflow: 'hidden',
                                    ...(T
                                      ? { width: wNode.valor * scale, height: qNode.valor * scale }
                                      : { width: qNode.valor * scale, height: wNode.valor * scale }
                                    ),
                                    position: 'absolute',
                                    ...(T
                                      ? { left: 0, bottom: qOff * scale }
                                      : { left: qOff * scale, bottom: 0 }
                                    ),
                                    background: PIECE_BG, boxSizing: 'border-box' as const,
                                    border: '0.5px solid hsl(0 0% 40%)',
                                  }}
                                  onClick={e => { e.stopPropagation(); onSelectNode(qNode.id); }}
                                >
                                  {rEls}
                                </div>
                              );
                            }
                            qOff += qNode.valor;
                          }
                        });

                        // Q waste
                        const qParentDim = T ? zNode.valor : zNode.valor;
                        const qWaste = qParentDim - qOff;
                        if (qWaste > 0 && qWaste * scale >= 4) {
                          qEls.push(
                            <div key="sq" className="sv-waste" style={{
                              position: 'absolute',
                              ...(T
                                ? { left: 0, bottom: qOff * scale, width: wNode.valor * scale, height: qWaste * scale }
                                : { left: qOff * scale, bottom: 0, width: qWaste * scale, height: wNode.valor * scale }
                              ),
                            }}>
                              <span className="sv-waste-label">{dimLabel(qWaste, wNode.valor)}</span>
                            </div>
                          );
                        }

                        wEls.push(
                          <div
                            key={`w-${wNode.id}-${iw}`}
                            className={`${selectedId === wNode.id ? 'sv-selected' : ''}`}
                            style={{
                              position: 'relative', overflow: 'hidden',
                              ...(T
                                ? { width: wNode.valor * scale, height: '100%', borderRight: '0.5px solid hsl(0 0% 40%)' }
                                : { width: '100%', height: wNode.valor * scale, borderTop: '0.5px solid hsl(0 0% 40%)' }
                              ),
                              background: PIECE_BG, boxSizing: 'border-box' as const,
                            }}
                            onClick={e => { e.stopPropagation(); onSelectNode(wNode.id); }}
                          >
                            {qEls}
                          </div>
                        );
                      }
                      wOff += wNode.valor;
                    }
                  });

                  // W waste (remaining dimension in strip)
                  const wWaste = yNode.valor - wOff;
                  if (wWaste > 0 && wWaste * scale >= 4) {
                    wEls.push(
                      <div key="sw" className="sv-waste" style={{
                        ...(T
                          ? { width: wWaste * scale, height: '100%' }
                          : { width: '100%', height: wWaste * scale }
                        ),
                      }}>
                        <span className="sv-waste-label">{dimLabel(zNode.valor, wWaste)}</span>
                      </div>
                    );
                  }
                }

                zEls.push(
                  <div
                    key={`z-${zNode.id}-${iz}`}
                    className={`${selectedId === zNode.id ? 'sv-selected' : ''}`}
                    style={{
                      position: 'relative', boxSizing: 'border-box' as const,
                      ...(T
                        ? { width: '100%', height: zNode.valor * scale, display: 'flex', flexDirection: 'row' as const, borderTop: '0.5px solid hsl(0 0% 40%)' }
                        : { height: '100%', width: zNode.valor * scale, display: 'flex', flexDirection: 'column-reverse' as const, borderRight: '0.5px solid hsl(0 0% 40%)' }
                      ),
                    }}
                    onClick={e => { e.stopPropagation(); onSelectNode(zNode.id); }}
                  >
                    {wEls}
                  </div>
                );
                zOff += zNode.valor;
              }
            });

            // Z waste (remaining dimension in strip)
            const zWaste = xNode.valor - zOff;
            if (zWaste > 0 && zWaste * scale >= 4) {
              zEls.push(
                <div key="sz" className="sv-waste" style={{
                  ...(T
                    ? { width: '100%', height: zWaste * scale }
                    : { width: zWaste * scale, height: '100%' }
                  ),
                }}>
                  <span className="sv-waste-label">{dimLabel(zWaste, yNode.valor)}</span>
                </div>
              );
            }

            strips.push(
              <div
                key={`y-${yNode.id}-${iy}`}
                className={`${selectedId === yNode.id ? 'sv-selected' : ''}`}
                style={{
                  position: 'absolute', boxSizing: 'border-box' as const,
                  ...(T
                    ? { bottom: 0, left: cy * scale, width: yNode.valor * scale, height: '100%', display: 'flex', flexDirection: 'column-reverse' as const }
                    : { left: 0, bottom: cy * scale, width: '100%', height: yNode.valor * scale, display: 'flex' }
                  ),
                }}
                onClick={e => { e.stopPropagation(); onSelectNode(yNode.id); }}
              >
                {zEls}
              </div>
            );
            yOff += yNode.valor;
          }
        });

        // Y waste - collect for merging instead of rendering individually
        const yDimTotal = T ? usableW : usableH;
        const yWaste = yDimTotal - yOff;
        if (yWaste > 0 && yWaste * scale >= 4) {
          yWastes.push({ xStart: cx, xWidth: xNode.valor, yStart: yOff, wasteH: yWaste, xNodeValor: xNode.valor });
        }

        els.push(
          <div
            key={`x-${xNode.id}-${ix}`}
            className={`${selectedId === xNode.id ? 'sv-selected' : ''}`}
            style={{
              position: 'absolute', boxSizing: 'border-box' as const,
              ...(T
                ? { left: 0, bottom: cx * scale, width: usableW * scale, height: xNode.valor * scale }
                : { bottom: 0, left: cx * scale, width: xNode.valor * scale, height: usableH * scale }
              ),
            }}
            onClick={e => { e.stopPropagation(); onSelectNode(xNode.id); }}
          >
            {strips}
          </div>
        );
        xOff += xNode.valor;
      }
    });

    // Merge adjacent Y-wastes with same yStart and wasteH into unified blocks
    if (yWastes.length > 0) {
      const merged: Array<{ xStart: number; totalWidth: number; yStart: number; wasteH: number }> = [];
      let current = { xStart: yWastes[0].xStart, totalWidth: yWastes[0].xWidth, yStart: yWastes[0].yStart, wasteH: yWastes[0].wasteH };

      for (let i = 1; i < yWastes.length; i++) {
        const w = yWastes[i];
        const adjacent = Math.abs((current.xStart + current.totalWidth) - w.xStart) < 1;
        const sameYStart = Math.abs(current.yStart - w.yStart) < 1;
        const sameWasteH = Math.abs(current.wasteH - w.wasteH) < 1;

        if (adjacent && sameYStart && sameWasteH) {
          current.totalWidth += w.xWidth;
        } else {
          merged.push({ ...current });
          current = { xStart: w.xStart, totalWidth: w.xWidth, yStart: w.yStart, wasteH: w.wasteH };
        }
      }
      merged.push(current);

      merged.forEach((m, mi) => {
        els.push(
          <div key={`yw-merged-${mi}`} className="sv-waste sv-waste-large" style={{
            position: 'absolute',
            ...(T
              ? { bottom: m.xStart * scale, left: m.yStart * scale, width: m.wasteH * scale, height: m.totalWidth * scale }
              : { left: m.xStart * scale, bottom: m.yStart * scale, width: m.totalWidth * scale, height: m.wasteH * scale }
            ),
          }}>
            <span className="sv-waste-label">{dimLabel(m.totalWidth, m.wasteH)}</span>
          </div>
        );
      });
    }

    // X waste (remaining dimension)
    const xDimTotal = T ? usableH : usableW;
    const xWaste = xDimTotal - xOff;
    if (xWaste > 0 && xWaste * scale >= 4) {
      els.push(
        <div key="sx" className="sv-waste sv-waste-large" style={{
          position: 'absolute',
          ...(T
            ? { left: 0, bottom: xOff * scale, width: usableW * scale, height: xWaste * scale }
            : { left: xOff * scale, bottom: 0, width: xWaste * scale, height: usableH * scale }
          ),
        }}>
          <span className="sv-waste-label">SOBRA<br />{T ? `${Math.round(usableW)}×${Math.round(xWaste)}` : `${Math.round(xWaste)}×${Math.round(usableH)}`}</span>
        </div>
      );
    }

    return els;
  }, [scale, selectedId, onSelectNode, usableW, usableH]);

  // Calculate per-sheet utilization
  const sheetUtil = useMemo(() => {
    if (!chapas.length) return 0;
    const chapa = chapas[activeIndex];
    if (!chapa) return 0;
    return usableW > 0 && usableH > 0 ? (chapa.usedArea / (usableW * usableH)) * 100 : 0;
  }, [chapas, activeIndex, usableW, usableH]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'hsl(210 25% 95%)' }}>
      {/* Sheet viewport */}
      <div
        ref={containerRef}
        className="flex-1 flex justify-center items-center overflow-hidden p-4 relative"
        style={{
          background: 'hsl(210 25% 90%)',
          backgroundImage: 'linear-gradient(hsl(210 20% 58% / 0.8) 1px, transparent 1px), linear-gradient(90deg, hsl(210 20% 58% / 0.8) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          cursor: zoomLevel > 1 ? 'grab' : 'default',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {tree ? (
          <div
            className="sv-sheet"
            style={{
              width: chapaW * scale,
              height: chapaH * scale,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transition: isPanning.current ? 'none' : 'transform 0.1s ease-out',
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
        {zoomLevel !== 1 && (
          <div
            className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono"
            style={{ background: 'hsl(222 47% 15% / 0.88)', color: 'hsl(210 30% 82%)', backdropFilter: 'blur(6px)' }}
          >
            <span>{Math.round(zoomLevel * 100)}%</span>
            <button
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-white/10 transition-colors"
              style={{ color: 'hsl(210 25% 65%)' }}
              onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
