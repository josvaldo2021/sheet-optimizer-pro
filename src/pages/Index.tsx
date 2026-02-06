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
  const [chapas, setChapas] = useState<Array<{ tree: TreeNode; usedArea: number }>>([]);
  const [remainingPieces, setRemainingPieces] = useState<PieceItem[]>([]);

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
    
    console.log('Comando:', { texto: text, tipo, valor, selectedId, multi });
    
    if (isNaN(valor) || !['X', 'Y', 'Z', 'W', 'Q'].includes(tipo)) {
      console.log('Tipo ou valor inválido!');
      return;
    }

    const res = calcAllocation(tree, selectedId, tipo, valor, multi, usableW, usableH);
    console.log('Alocação:', res);
    
    if (res.allocated > 0) {
      const t = cloneTree(tree);
      const nid = insertNode(t, selectedId, tipo, valor, res.allocated);
      setTree(t);
      setSelectedId(nid);
      setStatus({ msg: `${tipo}${valor} criado!`, type: 'success' });
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

  // Extrai todas as peças finais (folhas) da árvore de corte
  const extractUsedPieces = useCallback((node: TreeNode): Array<{ w: number; h: number }> => {
    const used: Array<{ w: number; h: number }> = [];

    const traverse = (n: TreeNode) => {
      // Se é folha (Z ou W sem filhos, ou Q), extrai a peça
      if ((n.tipo === 'Z' || n.tipo === 'W' || n.tipo === 'Q') && n.filhos.length === 0) {
        // Para Z/W sem filhos: dimensões são (valor da Z) x (valor do Y acima)
        // Para Q: dimensões são (valor de Q) x (valor de W acima)
        // Precisamos rastrear os valores dos ancestrais
        used.push({ w: n.valor, h: n.valor }); // placeholder, será calculado corretamente
      }

      if (n.filhos.length > 0) {
        n.filhos.forEach(f => traverse(f));
      }
    };

    traverse(node);
    return used;
  }, []);

  // Versão melhorada que rastreia contexto com stack
  const extractUsedPiecesWithContext = useCallback((node: TreeNode): Array<{ w: number; h: number }> => {
    const used: Array<{ w: number; h: number }> = [];

    const traverse = (n: TreeNode, parents: TreeNode[]) => {
      // Encontra Y, Z, W ancestrais para recuperar dimensões
      const yAncestor = parents.find(p => p.tipo === 'Y');
      const zAncestor = parents.find(p => p.tipo === 'Z');
      const wAncestor = parents.find(p => p.tipo === 'W');

      // Z sem filhos: dimensão é (Z.valor x Y.valor)
      if (n.tipo === 'Z' && n.filhos.length === 0) {
        const h = yAncestor?.valor || 0;
        used.push({ w: n.valor, h });
      }
      // W sem filhos (final piece): dimensão é (Z.valor x W.valor)
      else if (n.tipo === 'W' && n.filhos.length === 0) {
        const w = zAncestor?.valor || 0;
        used.push({ w, h: n.valor });
      }
      // Q (final piece): dimensão é (Q.valor x W.valor)
      else if (n.tipo === 'Q') {
        const h = wAncestor?.valor || 0;
        used.push({ w: n.valor, h });
      }

      if (n.filhos.length > 0) {
        n.filhos.forEach(f => {
          traverse(f, [...parents, n]);
        });
      }
    };

    traverse(node, []);
    return used;
  }, []);

  // Loop de otimização múltiplas chapas
  const optimizeAllSheets = useCallback(() => {
    if (pieces.length === 0) { 
      setStatus({ msg: 'Inventário vazio!', type: 'error' }); 
      return; 
    }

    setStatus({ msg: 'Processando todas as chapas...', type: 'warn' });
    
    const chapaList: Array<{ tree: TreeNode; usedArea: number }> = [];
    let remaining = [...pieces];
    let sheetCount = 0;

    while (remaining.length > 0 && sheetCount < 100) { // máximo 100 chapas para evitar loop infinito
      sheetCount++;

      // Cria inventário para esta chapa
      const inv: { w: number; h: number; area: number }[] = [];
      remaining.forEach(p => {
        for (let i = 0; i < p.qty; i++) {
          if (p.w > 0 && p.h > 0) inv.push({ w: p.w, h: p.h, area: p.w * p.h });
        }
      });

      if (inv.length === 0) break;

      // Otimiza para esta chapa
      const result = optimizeV6(inv, usableW, usableH);
      const usedArea = calcPlacedArea(result);

      chapaList.push({ tree: result, usedArea });

      // Extrai peças usadas
      const usedPieces = extractUsedPiecesWithContext(result);

      // Remove peças usadas do inventário
      const tempRemaining = [...remaining];
      usedPieces.forEach(used => {
        for (let i = 0; i < tempRemaining.length; i++) {
          const p = tempRemaining[i];
          if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
            p.qty--;
            if (p.qty <= 0) {
              tempRemaining.splice(i, 1);
            }
            break;
          }
        }
      });
      remaining = tempRemaining;
    }

    setChapas(chapaList);
    if (chapaList.length > 0) {
      setTree(chapaList[0].tree);
      setSelectedId('root');
    }
    setStatus({ msg: `✅ ${sheetCount} chapa(s) gerada(s)!`, type: 'success' });
  }, [pieces, usableW, usableH, extractUsedPiecesWithContext]);

  const handleExcel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setStatus({ msg: 'Nenhum arquivo selecionado', type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      setStatus({ msg: 'Erro ao ler arquivo', type: 'error' });
    };
    reader.onload = (evt) => {
      try {
        const result = evt.target?.result;
        if (!result) {
          setStatus({ msg: 'Falha ao ler arquivo', type: 'error' });
          return;
        }
        const wb = XLSX.read(result, { type: 'binary' });
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          setStatus({ msg: 'Arquivo Excel vazio', type: 'error' });
          return;
        }
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (!Array.isArray(json) || json.length === 0) {
          setStatus({ msg: 'Nenhuma linha encontrada no Excel', type: 'error' });
          return;
        }
        
        // Debug: mostrar primeira linha e colunas
        console.log('Primeira linha do Excel:', json[0]);
        console.log('Colunas encontradas:', Object.keys(json[0] || {}));
        
        // Função para encontrar valor por múltiplos nomes (case-insensitive, sem espaços)
        const getValue = (row: any, names: string[]): number => {
          const rowKey = Object.keys(row).find(k => 
            names.some(n => k.toLowerCase().trim() === n.toLowerCase().trim())
          );
          const value = rowKey ? row[rowKey] : null;
          return Number(value) || 0;
        };
        
        const items: PieceItem[] = json
          .map((row, i) => {
            const qty = getValue(row, ['qtd', 'quantidade', 'qtde', 'qty', 'q']);
            const w = getValue(row, ['largura', 'width', 'l', 'w']);
            const h = getValue(row, ['altura', 'height', 'h']);
            
            return {
              id: `p${Date.now()}_${i}`,
              qty: qty > 0 ? qty : 1,
              w: w,
              h: h,
            };
          })
          .filter(p => p.w > 0 && p.h > 0);
        
        console.log('Peças processadas:', items);
        
        if (items.length === 0) {
          setStatus({ msg: 'Nenhuma peça válida. Verifique ALTURA, LARGURA, qtd no console.', type: 'error' });
          return;
        }
        
        setPieces(items);
        setStatus({ msg: `${items.length} peças importadas!`, type: 'success' });
      } catch (err) {
        console.error('Erro ao processar Excel:', err);
        setStatus({ msg: `Erro: ${(err as Error).message}`, type: 'error' });
      }
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
                      // Se W tem filhos (Q), renderiza Q's
                      if (wNode.filhos.length === 0) {
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
                      } else {
                        // W com filhos Q - Q's são colocados horizontalmente DENTRO de W
                        let qOff = 0;
                        const qEls: JSX.Element[] = [];
                        
                        wNode.filhos.forEach(qNode => {
                          for (let iq = 0; iq < qNode.multi; iq++) {
                            qEls.push(
                              <div
                                key={`q-${qNode.id}-${iq}`}
                                className={`cnc-piece-q ${selectedId === qNode.id ? 'cnc-selected' : ''}`}
                                style={{ 
                                  position: 'absolute',
                                  left: qOff * scale,
                                  bottom: 0,
                                  width: qNode.valor * scale,
                                  height: wNode.valor * scale,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                onClick={e => { e.stopPropagation(); setSelectedId(qNode.id); }}
                              >
                                <div className="cnc-piece-final">
                                  <div className="cnc-label">{Math.round(qNode.valor)}x{Math.round(wNode.valor)}</div>
                                </div>
                              </div>
                            );
                            qOff += qNode.valor;
                          }
                        });
                        
                        // Sobra em Q (horizontal)
                        if (qOff < wNode.valor && (wNode.valor - qOff) * scale >= 5) {
                          qEls.push(
                            <div
                              key={`sobra-q-${wNode.id}`}
                              className={`cnc-waste ${selectedId === wNode.id ? 'cnc-selected' : ''}`}
                              style={{ 
                                position: 'absolute',
                                left: qOff * scale, 
                                bottom: 0, 
                                width: (wNode.valor - qOff) * scale, 
                                height: wNode.valor * scale 
                              }}
                              onClick={e => { e.stopPropagation(); setSelectedId(wNode.id); }}
                            >
                              <div className="cnc-waste-label">S.Q<br />{Math.round(wNode.valor - qOff)}x{Math.round(wNode.valor)}</div>
                            </div>
                          );
                        }
                        
                        wEls.push(
                          <div
                            key={`w-${wNode.id}-${iw}`}
                            className={`cnc-piece-w ${selectedId === wNode.id ? 'cnc-selected' : ''}`}
                            style={{ 
                              height: wNode.valor * scale,
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                            onClick={e => { e.stopPropagation(); setSelectedId(wNode.id); }}
                          >
                            {qEls}
                          </div>
                        );
                      }
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
            <div style={{ fontSize: '9px', color: 'hsl(0 0% 60%)', marginBottom: '8px', lineHeight: '1.3' }}>
              Colunas esperadas: Qtd/Quantidade, Largura/Width/L, Altura/Height/H/Comprimento
            </div>
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
            <button className="cnc-btn-primary w-full mb-2" onClick={optimize}>IA: OTIMIZAR V6</button>
            <button className="cnc-btn-primary w-full" onClick={optimizeAllSheets} style={{ background: 'hsl(240 100% 50%)' }}>📋 TODAS AS CHAPAS</button>
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

        {chapas.length > 0 && (
          <div className="flex gap-1 p-2 bg-gray-900 border-b border-gray-800 overflow-x-auto">
            {chapas.map((chapa, idx) => (
              <button
                key={idx}
                onClick={() => { setTree(chapa.tree); setSelectedId('root'); }}
                className="px-3 py-1 text-xs rounded whitespace-nowrap"
                style={{
                  background: tree === chapa.tree ? 'hsl(240 100% 50%)' : 'hsl(0 0% 30%)',
                  color: tree === chapa.tree ? 'white' : 'hsl(0 0% 60%)',
                  border: '1px solid hsl(0 0% 50%)'
                }}
              >
                Chapa {idx + 1}
              </button>
            ))}
          </div>
        )}

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
            placeholder="X, Y, Z, W, Q ou U (UNDO). Ex: X100 Y200 Z50 W30 Q15"
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
