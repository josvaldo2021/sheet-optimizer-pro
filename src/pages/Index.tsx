import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  TreeNode, PieceItem,
  createRoot, cloneTree, findNode, findParentOfType,
  insertNode, deleteNode, calcAllocation, calcPlacedArea, optimizeV6
} from '@/lib/cnc-engine';

const Index = () => {
  const [chapaW, setChapaW] = useState(6000);
  const [chapaH, setChapaH] = useState(3210);
  const [ml, setMl] = useState(10);
  const [mr, setMr] = useState(10);
  const [mt, setMt] = useState(10);
  const [mb, setMb] = useState(10);

  const usableW = chapaW - ml - mr;
  const usableH = chapaH - mt - mb;

  const [tree, setTree] = useState<TreeNode>(() => createRoot(usableW, usableH));
  const [selectedId, setSelectedId] = useState('root');
  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [status, setStatus] = useState({ msg: 'Pronto', type: 'info' });

  const viewportRef = useRef<HTMLDivElement>(null);
  const [vpSize, setVpSize] = useState({ w: 800, h: 600 });

  const scale = useMemo(() => {
    const vW = vpSize.w - 60, vH = vpSize.h - 60;
    if (vW <= 0 || vH <= 0) return 1;
    return Math.min(vW / chapaW, vH / chapaH);
  }, [vpSize, chapaW, chapaH]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setVpSize({ w: r.width, h: r.height });
    });
    obs.observe(viewportRef.current);
    return () => obs.disconnect();
  }, []);

  const applySetup = useCallback(() => {
    setTree(createRoot(usableW, usableH));
    setSelectedId('root');
    setStatus({ msg: 'Setup aplicado', type: 'success' });
  }, [usableW, usableH]);

  const processCommand = useCallback((text: string) => {
    if (text === 'U') {
      if (selectedId === 'root') return;
      const t = cloneTree(tree);
      deleteNode(t, selectedId);
      setTree(t);
      setSelectedId('root');
      return;
    }
    let multi = 1, cmd = text;
    const m = text.match(/^M(\d+)(.+)$/);
    if (m) { multi = parseInt(m[1]); cmd = m[2]; }
    const tipo = cmd.charAt(0) as any;
    const valor = parseFloat(cmd.substring(1));
    if (isNaN(valor) || !['X', 'Y', 'Z', 'W'].includes(tipo)) return;

    const res = calcAllocation(tree, selectedId, tipo, valor, multi, usableW, usableH);
    if (res.allocated > 0) {
      const t = cloneTree(tree);
      const nid = insertNode(t, selectedId, tipo, valor, res.allocated);
      setTree(t);
      setSelectedId(nid);
    } else {
      setStatus({ msg: res.error || 'Sem espaço', type: 'error' });
    }
  }, [tree, selectedId, usableW, usableH]);

  const optimize = useCallback(() => {
    const inv: { w: number; h: number; area: number }[] = [];
    pieces.forEach(p => {
      for (let i = 0; i < p.qty; i++) {
        if (p.w > 0 && p.h > 0) inv.push({ w: p.w, h: p.h, area: p.w * p.h });
      }
    });
    if (inv.length === 0) { setStatus({ msg: 'Inventário vazio!', type: 'error' }); return; }
    setStatus({ msg: 'Otimizando...', type: 'warn' });
    setTimeout(() => {
      const result = optimizeV6(inv, usableW, usableH);
      setTree(result);
      setSelectedId('root');
      setStatus({ msg: 'Plano de Corte Otimizado V6!', type: 'success' });
    }, 50);
  }, [pieces, usableW, usableH]);

  const handleExcel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
      const items: PieceItem[] = json
        .map((row, i) => ({
          id: `p${Date.now()}_${i}`,
          qty: row.Qtd || row.Quantidade || row.Qtde || 1,
          w: row.Largura || row.Width || row.L || 0,
          h: row.Altura || row.Height || row.H || row.Comprimento || 0,
        }))
        .filter(p => p.w > 0 && p.h > 0);
      setPieces(items);
      setStatus({ msg: 'Lista importada!', type: 'success' });
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }, []);

  const utilization = useMemo(() => {
    const area = calcPlacedArea(tree);
    return usableW > 0 && usableH > 0 ? (area / (usableW * usableH)) * 100 : 0;
  }, [tree, usableW, usableH]);

  const currentNode = useMemo(() => findNode(tree, selectedId), [tree, selectedId]);

  // Render action tree
  const renderActionTree = (node: TreeNode, depth = 0): JSX.Element[] =>
    node.filhos.map(child => (
      <div key={child.id}>
        <div
          className={`cnc-action-item ${selectedId === child.id ? 'cnc-action-active' : ''}`}
          style={{ paddingLeft: depth * 12 + 6 }}
          onClick={e => { e.stopPropagation(); setSelectedId(child.id); }}
        >
          <b>{child.tipo}{child.valor}</b> (x{child.multi})
        </div>
        {renderActionTree(child, depth + 1)}
      </div>
    ));

  // Render cut plan
  const renderCutPlan = () => {
    const els: JSX.Element[] = [];
    let xOff = 0;

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
                  wEls.push(
                    <div key="final" className="cnc-piece-final">
                      <div className="cnc-label">{Math.round(zNode.valor)}x{Math.round(yNode.valor)}</div>
                    </div>
                  );
                } else {
                  let wOff = 0;
                  zNode.filhos.forEach(wNode => {
                    for (let iw = 0; iw < wNode.multi; iw++) {
                      wEls.push(
                        <div
                          key={`w-${wNode.id}-${iw}`}
                          className={`cnc-piece-w ${selectedId === wNode.id ? 'cnc-selected' : ''}`}
                          style={{ height: wNode.valor * scale }}
                          onClick={e => { e.stopPropagation(); setSelectedId(wNode.id); }}
                        >
                          <div className="cnc-piece-final">
                            <div className="cnc-label">{Math.round(zNode.valor)}x{Math.round(wNode.valor)}</div>
                          </div>
                        </div>
                      );
                      wOff += wNode.valor;
                    }
                  });
                  if (wOff < yNode.valor && (yNode.valor - wOff) * scale >= 5) {
                    wEls.push(
                      <div
                        key="sobra-w"
                        className={`cnc-waste ${selectedId === zNode.id ? 'cnc-selected' : ''}`}
                        style={{ left: 0, bottom: wOff * scale, width: zNode.valor * scale, height: (yNode.valor - wOff) * scale }}
                        onClick={e => { e.stopPropagation(); setSelectedId(zNode.id); }}
                      >
                        <div className="cnc-waste-label">S.W<br />{Math.round(zNode.valor)}x{Math.round(yNode.valor - wOff)}</div>
                      </div>
                    );
                  }
                }

                zEls.push(
                  <div
                    key={`z-${zNode.id}-${iz}`}
                    className={`cnc-piece-z ${selectedId === zNode.id ? 'cnc-selected' : ''}`}
                    style={{ width: zNode.valor * scale }}
                    onClick={e => { e.stopPropagation(); setSelectedId(zNode.id); }}
                  >
                    {wEls}
                  </div>
                );
                zOff += zNode.valor;
              }
            });

            if (zOff < xNode.valor && (xNode.valor - zOff) * scale >= 5) {
              zEls.push(
                <div
                  key="sobra-z"
                  className={`cnc-waste ${selectedId === yNode.id ? 'cnc-selected' : ''}`}
                  style={{ left: zOff * scale, bottom: 0, width: (xNode.valor - zOff) * scale, height: yNode.valor * scale }}
                  onClick={e => { e.stopPropagation(); setSelectedId(yNode.id); }}
                >
                  <div className="cnc-waste-label">S.Z<br />{Math.round(xNode.valor - zOff)}x{Math.round(yNode.valor)}</div>
                </div>
              );
            }

            strips.push(
              <div
                key={`y-${yNode.id}-${iy}`}
                className={`cnc-strip ${selectedId === yNode.id ? 'cnc-selected' : ''}`}
                style={{ bottom: cy * scale, height: yNode.valor * scale }}
                onClick={e => { e.stopPropagation(); setSelectedId(yNode.id); }}
              >
                {zEls}
              </div>
            );
            yOff += yNode.valor;
          }
        });

        if (yOff < usableH && (usableH - yOff) * scale >= 5) {
          strips.push(
            <div
              key="sobra-y"
              className={`cnc-waste ${selectedId === xNode.id ? 'cnc-selected' : ''}`}
              style={{ left: 0, bottom: yOff * scale, width: xNode.valor * scale, height: (usableH - yOff) * scale }}
              onClick={e => { e.stopPropagation(); setSelectedId(xNode.id); }}
            >
              <div className="cnc-waste-label">S.Y<br />{Math.round(xNode.valor)}x{Math.round(usableH - yOff)}</div>
            </div>
          );
        }

        els.push(
          <div
            key={`x-${xNode.id}-${ix}`}
            className={`cnc-col ${selectedId === xNode.id ? 'cnc-selected' : ''}`}
            style={{ left: cx * scale, width: xNode.valor * scale }}
            onClick={e => { e.stopPropagation(); setSelectedId(xNode.id); }}
          >
            {strips}
          </div>
        );
        xOff += xNode.valor;
      }
    });

    if (xOff < usableW && (usableW - xOff) * scale >= 5) {
      els.push(
        <div
          key="sobra-x"
          className={`cnc-waste ${selectedId === 'root' ? 'cnc-selected' : ''}`}
          style={{ left: xOff * scale, bottom: 0, width: (usableW - xOff) * scale, height: usableH * scale }}
          onClick={e => { e.stopPropagation(); setSelectedId('root'); }}
        >
          <div className="cnc-waste-label">SOBRA<br />{Math.round(usableW - xOff)}x{Math.round(usableH)}</div>
        </div>
      );
    }

    return els;
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      {/* SIDEBAR */}
      <div className="w-80 min-w-[320px] flex flex-col h-screen" style={{ background: 'hsl(0 0% 10%)', borderRight: '2px solid hsl(0 0% 20%)' }}>
        <h3 className="p-3 m-0 text-xs text-center uppercase tracking-widest font-semibold" style={{ background: 'hsl(0 0% 17%)', borderBottom: '1px solid hsl(0 0% 20%)' }}>
          Setup Chapa
        </h3>
        <div className="p-4 text-xs flex-shrink-0" style={{ background: 'hsl(0 0% 13%)', borderBottom: '2px solid hsl(0 0% 20%)' }}>
          <div className="flex justify-between items-center mb-2 gap-1">
            <span>Chapa:</span>
            <input type="number" value={chapaW} onChange={e => setChapaW(+e.target.value)} className="cnc-input w-16" />
            <span>x</span>
            <input type="number" value={chapaH} onChange={e => setChapaH(+e.target.value)} className="cnc-input w-16" />
          </div>
          <div className="flex justify-between items-center mb-2 gap-1">
            <span>Refilo L/R:</span>
            <input type="number" value={ml} onChange={e => setMl(+e.target.value)} className="cnc-input w-16" />
            <span>/</span>
            <input type="number" value={mr} onChange={e => setMr(+e.target.value)} className="cnc-input w-16" />
          </div>
          <div className="flex justify-between items-center mb-2 gap-1">
            <span>Refilo T/B:</span>
            <input type="number" value={mt} onChange={e => setMt(+e.target.value)} className="cnc-input w-16" />
            <span>/</span>
            <input type="number" value={mb} onChange={e => setMb(+e.target.value)} className="cnc-input w-16" />
          </div>
          <button onClick={applySetup} className="cnc-btn-success w-full mt-1">APLICAR SETUP</button>
        </div>

        <h3 className="p-3 m-0 text-xs text-center uppercase tracking-widest font-semibold" style={{ background: 'hsl(0 0% 17%)', borderBottom: '1px solid hsl(0 0% 20%)' }}>
          Lista de Peças
        </h3>
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'hsl(0 0% 7%)' }}>
          <div className="p-2.5 flex-shrink-0" style={{ background: 'hsl(0 0% 10%)', borderBottom: '1px solid hsl(0 0% 20%)' }}>
            <input type="file" id="excelInput" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcel} />
            <button className="cnc-btn-excel w-full mb-2" onClick={() => document.getElementById('excelInput')?.click()}>
              📂 IMPORTAR EXCEL
            </button>
            <button onClick={() => setPieces(p => [...p, { id: `p${Date.now()}`, qty: 1, w: 1000, h: 1000 }])} className="cnc-btn-secondary w-full">
              + ADICIONAR MANUAL
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 cnc-scroll">
            {pieces.map(p => (
              <div key={p.id} className="cnc-inv-item">
                <input type="number" value={p.qty} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, qty: +e.target.value } : x))} className="cnc-input" />
                <input type="number" value={p.w} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, w: +e.target.value } : x))} className="cnc-input" />
                <span className="text-center text-[10px]" style={{ color: 'hsl(0 0% 53%)' }}>x</span>
                <input type="number" value={p.h} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, h: +e.target.value } : x))} className="cnc-input" />
              </div>
            ))}
          </div>

          <div className="p-3 flex-shrink-0" style={{ background: 'hsl(0 0% 10%)', borderTop: '1px solid hsl(0 0% 20%)' }}>
            <button className="cnc-btn-primary w-full" onClick={optimize}>IA: OTIMIZAR V6</button>
          </div>
        </div>

        <h3 className="p-3 m-0 text-xs text-center uppercase tracking-widest font-semibold" style={{ background: 'hsl(0 0% 17%)', borderBottom: '1px solid hsl(0 0% 20%)' }}>
          Estrutura de Corte
        </h3>
        <div className="h-[150px] overflow-y-auto p-2 flex-shrink-0 cnc-scroll" style={{ background: 'hsl(0 0% 4%)', borderTop: '2px solid hsl(0 0% 20%)' }}>
          {renderActionTree(tree)}
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col" style={{ background: 'hsl(0 0% 0%)' }}>
        <div className="flex justify-around p-2.5 px-5 text-xs font-bold" style={{ background: 'hsl(0 0% 10%)', borderBottom: '1px solid hsl(0 0% 20%)' }}>
          <div>APROVEITAMENTO: <span style={{ color: 'hsl(120 100% 63%)' }}>{utilization.toFixed(2)}%</span></div>
          <div style={{ color: 'hsl(60 100% 50%)' }}>Contexto: {currentNode?.tipo || 'ROOT'}</div>
          <div>ÚTIL: {Math.round(usableW)} x {Math.round(usableH)}</div>
        </div>

        <div ref={viewportRef} className="flex-1 flex justify-center items-center p-5 overflow-hidden" style={{ background: 'hsl(0 0% 3%)' }}>
          <div
            className="relative"
            style={{
              width: chapaW * scale, height: chapaH * scale,
              background: 'hsl(0 0% 10%)', border: '1px solid hsl(0 0% 33%)',
              boxShadow: '0 0 30px rgba(0,0,0,0.5)'
            }}
          >
            <div
              className="absolute"
              style={{
                width: usableW * scale, height: usableH * scale,
                left: ml * scale, bottom: mb * scale,
                background: 'hsl(0 0% 0%)'
              }}
            >
              {renderCutPlan()}
            </div>
          </div>
        </div>

        <div className="flex flex-col p-2 px-4" style={{ height: 80, background: 'hsl(0 0% 13%)', borderTop: '4px solid hsl(0 0% 20%)' }}>
          <div
            className="text-xs font-bold h-5 mb-1"
            style={{ color: status.type === 'error' ? 'hsl(0 73% 63%)' : status.type === 'success' ? 'hsl(134 53% 40%)' : 'hsl(40 100% 50%)' }}
          >
            Status: {status.msg}
          </div>
          <input
            type="text"
            autoFocus
            autoComplete="off"
            placeholder="X, Y, Z, W OU U (UNDO)"
            className="cnc-command-input flex-1"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                processCommand(e.currentTarget.value.trim().toUpperCase());
                e.currentTarget.value = '';
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
