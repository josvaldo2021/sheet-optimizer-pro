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
    const els: JSX.Element[] = [];
    let xOff = 0;
    let colorIdx = 0;

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
                  colorIdx++;
                  const isVertical = yNode.valor > zNode.valor;
                  wEls.push(
                    <div key="final" className="sv-piece" style={{ background: PIECE_BG, borderColor: PIECE_BORDER }}>
                      <span className={`sv-piece-label ${isVertical ? 'sv-label-vertical' : ''}`}>
                        {zNode.label && <span className="sv-piece-id">{zNode.label}</span>}
                        {Math.round(zNode.valor)}×{Math.round(yNode.valor)}
                      </span>
                    </div>
                  );
                } else {
                  let wOff = 0;
                  zNode.filhos.forEach(wNode => {
                    for (let iw = 0; iw < wNode.multi; iw++) {
                      if (wNode.filhos.length === 0) {
                        colorIdx++;
                        wEls.push(
                          <div
                            key={`w-${wNode.id}-${iw}`}
                            className={`sv-piece-w ${selectedId === wNode.id ? 'sv-selected' : ''}`}
                            style={{ height: wNode.valor * scale, background: PIECE_BG, borderColor: PIECE_BORDER }}
                            onClick={e => { e.stopPropagation(); onSelectNode(wNode.id); }}
                          >
                            <span className={`sv-piece-label ${wNode.valor > zNode.valor ? 'sv-label-vertical' : ''}`}>
                              {wNode.label && <span className="sv-piece-id">{wNode.label}</span>}
                              {Math.round(zNode.valor)}×{Math.round(wNode.valor)}
                            </span>
                          </div>
                        );
                      } else {
                        // W with Q children
                        let qOff = 0;
                        const qEls: JSX.Element[] = [];
                        wNode.filhos.forEach(qNode => {
                          for (let iq = 0; iq < qNode.multi; iq++) {
                            colorIdx++;
                            qEls.push(
                              <div
                                key={`q-${qNode.id}-${iq}`}
                                className={`sv-piece-q ${selectedId === qNode.id ? 'sv-selected' : ''}`}
                                style={{
                                  position: 'absolute',
                                  left: qOff * scale,
                                  bottom: 0,
                                  width: qNode.valor * scale,
                                  height: wNode.valor * scale,
                                  background: PIECE_BG,
                                }}
                                onClick={e => { e.stopPropagation(); onSelectNode(qNode.id); }}
                              >
                                <span className={`sv-piece-label ${wNode.valor > qNode.valor ? 'sv-label-vertical' : ''}`}>
                                  {qNode.label && <span className="sv-piece-id">{qNode.label}</span>}
                                  {Math.round(qNode.valor)}×{Math.round(wNode.valor)}
                                </span>
                              </div>
                            );
                            qOff += qNode.valor;
                          }
                        });

                        // Q waste
                        const qWaste = zNode.valor - qOff;
                        if (qWaste > 0 && qWaste * scale >= 4) {
                          qEls.push(
                            <div key="sq" className="sv-waste" style={{
                              position: 'absolute', left: qOff * scale, bottom: 0,
                              width: qWaste * scale, height: wNode.valor * scale,
                            }}>
                              <span className="sv-waste-label">{Math.round(qWaste)}×{Math.round(wNode.valor)}</span>
                            </div>
                          );
                        }

                        wEls.push(
                          <div
                            key={`w-${wNode.id}-${iw}`}
                            className={`sv-piece-w-container ${selectedId === wNode.id ? 'sv-selected' : ''}`}
                            style={{ height: wNode.valor * scale, position: 'relative', overflow: 'hidden' }}
                            onClick={e => { e.stopPropagation(); onSelectNode(wNode.id); }}
                          >
                            {qEls}
                          </div>
                        );
                      }
                      wOff += wNode.valor;
                    }
                  });

                  // W waste (remaining height in strip)
                  const wWaste = yNode.valor - wOff;
                  if (wWaste > 0 && wWaste * scale >= 4) {
                    wEls.push(
                      <div key="sw" className="sv-waste" style={{
                        width: '100%', height: wWaste * scale,
                      }}>
                        <span className="sv-waste-label">{Math.round(zNode.valor)}×{Math.round(wWaste)}</span>
                      </div>
                    );
                  }
                }

                zEls.push(
                  <div
                    key={`z-${zNode.id}-${iz}`}
                    className={`sv-col-z ${selectedId === zNode.id ? 'sv-selected' : ''}`}
                    style={{ width: zNode.valor * scale }}
                    onClick={e => { e.stopPropagation(); onSelectNode(zNode.id); }}
                  >
                    {wEls}
                  </div>
                );
                zOff += zNode.valor;
              }
            });

            // Z waste (remaining width in strip)
            const zWaste = xNode.valor - zOff;
            if (zWaste > 0 && zWaste * scale >= 4) {
              zEls.push(
                <div key="sz" className="sv-waste" style={{
                  width: zWaste * scale, height: '100%',
                }}>
                  <span className="sv-waste-label">{Math.round(zWaste)}×{Math.round(yNode.valor)}</span>
                </div>
              );
            }

            strips.push(
              <div
                key={`y-${yNode.id}-${iy}`}
                className={`sv-strip ${selectedId === yNode.id ? 'sv-selected' : ''}`}
                style={{ bottom: cy * scale, height: yNode.valor * scale }}
                onClick={e => { e.stopPropagation(); onSelectNode(yNode.id); }}
              >
                {zEls}
              </div>
            );
            yOff += yNode.valor;
          }
        });

        // Y waste (remaining height in column)
        const yWaste = usableH - yOff;
        if (yWaste > 0 && yWaste * scale >= 4) {
          strips.push(
            <div key="sy" className="sv-waste sv-waste-large" style={{
              position: 'absolute', left: 0, bottom: yOff * scale,
              width: xNode.valor * scale, height: yWaste * scale,
            }}>
              <span className="sv-waste-label">{Math.round(xNode.valor)}×{Math.round(yWaste)}</span>
            </div>
          );
        }

        els.push(
          <div
            key={`x-${xNode.id}-${ix}`}
            className={`sv-col ${selectedId === xNode.id ? 'sv-selected' : ''}`}
            style={{ left: cx * scale, width: xNode.valor * scale }}
            onClick={e => { e.stopPropagation(); onSelectNode(xNode.id); }}
          >
            {strips}
          </div>
        );
        xOff += xNode.valor;
      }
    });

    // X waste (remaining width)
    const xWaste = usableW - xOff;
    if (xWaste > 0 && xWaste * scale >= 4) {
      els.push(
        <div key="sx" className="sv-waste sv-waste-large" style={{
          position: 'absolute', left: xOff * scale, bottom: 0,
          width: xWaste * scale, height: usableH * scale,
        }}>
          <span className="sv-waste-label">SOBRA<br />{Math.round(xWaste)}×{Math.round(usableH)}</span>
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
      <div ref={containerRef} className="flex-1 flex justify-center items-center overflow-hidden p-4">
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
