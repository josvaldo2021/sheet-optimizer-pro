import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  TreeNode, PieceItem,

  createRoot, cloneTree, findNode, findParentOfType,
  insertNode, deleteNode, calcAllocation, calcPlacedArea, optimizeV6
} from '@/lib/cnc-engine';
import { groupIdenticalLayouts, LayoutGroup } from '@/lib/layout-utils';
import { exportPdf } from '@/lib/pdf-export';
import SheetViewer from '@/components/SheetViewer';
import SidebarSection from '@/components/SidebarSection';

const Index = () => {
  // ─── Sheet setup ───
  const [chapaW, setChapaW] = useState(6000);
  const [chapaH, setChapaH] = useState(3210);
  const [ml, setMl] = useState(10);
  const [mr, setMr] = useState(10);
  const [mt, setMt] = useState(10);
  const [mb, setMb] = useState(10);

  const usableW = chapaW - ml - mr;
  const usableH = chapaH - mt - mb;

  // ─── State ───
  const [tree, setTree] = useState<TreeNode>(() => createRoot(usableW, usableH));
  const [selectedId, setSelectedId] = useState('root');
  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [status, setStatus] = useState({ msg: 'Pronto', type: 'info' });
  const [chapas, setChapas] = useState<Array<{ tree: TreeNode; usedArea: number }>>([]);
  const [activeChapa, setActiveChapa] = useState(0);

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

  // ─── Layout groups (deduplicated) ───
  const layoutGroups = useMemo(() => {
    if (chapas.length === 0) return [];
    return groupIdenticalLayouts(chapas);
  }, [chapas]);

  // ─── Actions ───
  const applySetup = useCallback(() => {
    setTree(createRoot(usableW, usableH));
    setSelectedId('root');
    setChapas([]);
    setActiveChapa(0);
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
    if (isNaN(valor) || !['X', 'Y', 'Z', 'W', 'Q'].includes(tipo)) return;

    // If inserting Z and the Y parent has a single auto-created full-width Z, remove it first
    if (tipo === 'Z') {
      const t = cloneTree(tree);
      const target = findNode(t, selectedId);
      const yParent = target?.tipo === 'Y' ? target : findParentOfType(t, selectedId, 'Y');
      const xParent = yParent ? findParentOfType(t, yParent.id, 'X') : null;
      if (yParent && xParent && yParent.filhos.length === 1 && yParent.filhos[0].tipo === 'Z' && yParent.filhos[0].filhos.length === 0 && yParent.filhos[0].valor === xParent.valor) {
        // Remove the auto-created full-width Z
        deleteNode(t, yParent.filhos[0].id);
        const res2 = calcAllocation(t, yParent.id, 'Z', valor, multi, usableW, usableH);
        if (res2.allocated > 0) {
          const nid = insertNode(t, yParent.id, 'Z', valor, res2.allocated);
          setTree(t);
          setSelectedId(nid);
          setStatus({ msg: `Z${valor} criado!`, type: 'success' });
          return;
        }
      }
    }

    const res = calcAllocation(tree, selectedId, tipo, valor, multi, usableW, usableH);
    if (res.allocated > 0) {
      const t = cloneTree(tree);
      const nid = insertNode(t, selectedId, tipo, valor, res.allocated);

      // Auto-create Z node when Y is inserted to complete the piece
      if (tipo === 'Y') {
        const yNode = findNode(t, nid);
        const xParent = findParentOfType(t, nid, 'X');
        if (yNode && xParent) {
          const zId = insertNode(t, nid, 'Z', xParent.valor, 1);
          setTree(t);
          setSelectedId(zId);
          setStatus({ msg: `Peça ${xParent.valor}×${valor} criada!`, type: 'success' });
          return;
        }
      }

      setTree(t);
      setSelectedId(nid);
      setStatus({ msg: `${tipo}${valor} criado!`, type: 'success' });
    } else {
      setStatus({ msg: res.error || 'Sem espaço', type: 'error' });
    }
  }, [tree, selectedId, usableW, usableH]);

  const extractUsedPiecesWithContext = useCallback((node: TreeNode): Array<{ w: number; h: number; label?: string }> => {
    const used: Array<{ w: number; h: number; label?: string }> = [];
    const traverse = (n: TreeNode, parents: TreeNode[]) => {
      const yAncestor = parents.find(p => p.tipo === 'Y');
      const zAncestor = parents.find(p => p.tipo === 'Z');
      const wAncestor = parents.find(p => p.tipo === 'W');
      let pieceW = 0, pieceH = 0, isLeaf = false;

      if (n.tipo === 'Z' && n.filhos.length === 0) {
        pieceW = n.valor; pieceH = yAncestor?.valor || 0; isLeaf = true;
      } else if (n.tipo === 'W' && n.filhos.length === 0) {
        pieceW = zAncestor?.valor || 0; pieceH = n.valor; isLeaf = true;
      } else if (n.tipo === 'Q') {
        pieceW = n.valor; pieceH = wAncestor?.valor || 0; isLeaf = true;
      }

      if (isLeaf && pieceW > 0 && pieceH > 0) {
        for (let m = 0; m < n.multi; m++) {
          used.push({ w: pieceW, h: pieceH, label: n.label });
        }
      }
      n.filhos.forEach(f => traverse(f, [...parents, n]));
    };
    traverse(node, []);
    return used;
  }, []);

  const optimize = useCallback(() => {
    const inv: { w: number; h: number; area: number; label?: string }[] = [];
    pieces.forEach(p => {
      for (let i = 0; i < p.qty; i++) {
        if (p.w > 0 && p.h > 0) inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: p.label });
      }
    });
    if (inv.length === 0) { setStatus({ msg: 'Inventário vazio!', type: 'error' }); return; }
    setStatus({ msg: 'Otimizando...', type: 'warn' });
    setTimeout(() => {
      const result = optimizeV6(inv, usableW, usableH);
      setTree(result);
      setChapas([{ tree: result, usedArea: calcPlacedArea(result) }]);
      setActiveChapa(0);
      setSelectedId('root');
      setStatus({ msg: 'Plano de Corte Otimizado V6!', type: 'success' });
    }, 50);
  }, [pieces, usableW, usableH]);

  const optimizeAllSheets = useCallback(() => {
    if (pieces.length === 0) {
      setStatus({ msg: 'Inventário vazio!', type: 'error' });
      return;
    }
    setStatus({ msg: 'Processando todas as chapas...', type: 'warn' });

    const chapaList: Array<{ tree: TreeNode; usedArea: number }> = [];
    let remaining = [...pieces];
    let sheetCount = 0;

    while (remaining.length > 0 && sheetCount < 100) {
      sheetCount++;
      const inv: { w: number; h: number; area: number; label?: string }[] = [];
      remaining.forEach(p => {
        for (let i = 0; i < p.qty; i++) {
          if (p.w > 0 && p.h > 0) inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: p.label });
        }
      });
      if (inv.length === 0) break;

      const result = optimizeV6(inv, usableW, usableH);
      const usedArea = calcPlacedArea(result);
      chapaList.push({ tree: result, usedArea });

      const usedPieces = extractUsedPiecesWithContext(result);
      const tempRemaining = [...remaining];
      usedPieces.forEach(used => {
        for (let i = 0; i < tempRemaining.length; i++) {
          const p = tempRemaining[i];
          if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
            p.qty--;
            if (p.qty <= 0) tempRemaining.splice(i, 1);
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
    setActiveChapa(0);
    setStatus({ msg: `✅ ${sheetCount} chapa(s) gerada(s)!`, type: 'success' });
  }, [pieces, usableW, usableH, extractUsedPiecesWithContext]);

  const handleExcel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setStatus({ msg: 'Nenhum arquivo selecionado', type: 'error' }); return; }
    const reader = new FileReader();
    reader.onerror = () => setStatus({ msg: 'Erro ao ler arquivo', type: 'error' });
    reader.onload = (evt) => {
      try {
        const result = evt.target?.result;
        if (!result) { setStatus({ msg: 'Falha ao ler arquivo', type: 'error' }); return; }
        const wb = XLSX.read(result, { type: 'binary' });
        if (!wb.SheetNames?.length) { setStatus({ msg: 'Arquivo Excel vazio', type: 'error' }); return; }
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (!Array.isArray(json) || json.length === 0) { setStatus({ msg: 'Nenhuma linha encontrada', type: 'error' }); return; }

        const getValue = (row: any, names: string[]): number => {
          const rowKey = Object.keys(row).find(k => names.some(n => k.toLowerCase().trim() === n.toLowerCase().trim()));
          return Number(rowKey ? row[rowKey] : null) || 0;
        };
        const getString = (row: any, names: string[]): string => {
          const rowKey = Object.keys(row).find(k => names.some(n => k.toLowerCase().trim() === n.toLowerCase().trim()));
          return rowKey ? String(row[rowKey] || '').trim() : '';
        };

        const items: PieceItem[] = json
          .map((row, i) => ({
            id: `p${Date.now()}_${i}`,
            qty: getValue(row, ['qtd', 'quantidade', 'qtde', 'qty', 'q']) || 1,
            w: getValue(row, ['largura', 'width', 'l', 'w']),
            h: getValue(row, ['altura', 'height', 'h']),
            label: getString(row, ['id', 'identificação', 'identificacao', 'nome', 'name', 'código', 'codigo', 'cod', 'ref']) || undefined,
          }))
          .filter(p => p.w > 0 && p.h > 0);

        if (items.length === 0) { setStatus({ msg: 'Nenhuma peça válida encontrada.', type: 'error' }); return; }
        setPieces(items);
        setStatus({ msg: `${items.length} peças importadas!`, type: 'success' });
      } catch (err) {
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

  // ─── Render helpers ───
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

  const totalPieces = useMemo(() => pieces.reduce((sum, p) => sum + p.qty, 0), [pieces]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      {/* SIDEBAR */}
      <div className="w-80 min-w-[320px] flex flex-col h-screen overflow-y-auto cnc-scroll" style={{ background: 'hsl(0 0% 10%)', borderRight: '2px solid hsl(0 0% 20%)' }}>

        {/* ─── SECTION 1: Setup da Chapa ─── */}
        <SidebarSection title="Setup da Chapa" icon="📐" defaultOpen={true}>
          <div className="p-4 text-xs" style={{ background: 'hsl(0 0% 13%)' }}>
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
            <div className="mt-2 text-[10px]" style={{ color: 'hsl(0 0% 50%)' }}>
              Área útil: {usableW} × {usableH} mm
            </div>
            <button onClick={applySetup} className="cnc-btn-success w-full mt-2">APLICAR SETUP</button>
          </div>
        </SidebarSection>

        {/* ─── SECTION 2: Lista de Peças ─── */}
        <SidebarSection title={`Lista de Peças (${totalPieces})`} icon="📦" defaultOpen={true}>
          <div className="flex flex-col" style={{ background: 'hsl(0 0% 7%)' }}>
            <div className="p-2.5 flex-shrink-0" style={{ background: 'hsl(0 0% 10%)', borderBottom: '1px solid hsl(0 0% 20%)' }}>
              <input type="file" id="excelInput" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcel} />
              <button className="cnc-btn-excel w-full mb-2" onClick={() => document.getElementById('excelInput')?.click()}>
                📂 IMPORTAR EXCEL
              </button>
              <div style={{ fontSize: '9px', color: 'hsl(0 0% 60%)', marginBottom: '8px', lineHeight: '1.3' }}>
                Colunas: Qtd, Largura, Altura, ID (opcional)
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPieces(p => [...p, { id: `p${Date.now()}`, qty: 1, w: 1000, h: 1000 }])} className="cnc-btn-secondary flex-1">
                  + ADICIONAR
                </button>
                {pieces.length > 0 && (
                  <button onClick={() => setPieces([])} className="cnc-btn-secondary flex-1" style={{ background: 'hsl(0 40% 25%)' }}>
                    LIMPAR
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto p-2.5 cnc-scroll">
              {/* Header */}
              {pieces.length > 0 && (
                <div className="grid gap-1 mb-1 text-[9px] font-bold uppercase" style={{ gridTemplateColumns: '40px 1fr 15px 1fr 55px 20px', color: 'hsl(0 0% 45%)' }}>
                  <span className="text-center">Qtd</span>
                  <span className="text-center">Larg</span>
                  <span></span>
                  <span className="text-center">Alt</span>
                  <span className="text-center">ID</span>
                  <span></span>
                </div>
              )}
              {pieces.map(p => (
                <div key={p.id} className="cnc-inv-item" style={{ gridTemplateColumns: '40px 1fr 15px 1fr 55px 20px' }}>
                  <input type="number" value={p.qty} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, qty: +e.target.value } : x))} className="cnc-input" />
                  <input type="number" value={p.w} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, w: +e.target.value } : x))} className="cnc-input" />
                  <span className="text-center text-[10px]" style={{ color: 'hsl(0 0% 53%)' }}>×</span>
                  <input type="number" value={p.h} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, h: +e.target.value } : x))} className="cnc-input" />
                  <input type="text" value={p.label || ''} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, label: e.target.value || undefined } : x))} className="cnc-input" placeholder="ID" style={{ fontSize: '10px' }} />
                  <button
                    onClick={() => setPieces(ps => ps.filter(x => x.id !== p.id))}
                    className="text-[14px] cursor-pointer hover:text-red-400 transition-colors"
                    style={{ color: 'hsl(0 0% 40%)', background: 'none', border: 'none' }}
                    title="Remover peça"
                  >
                    ×
                  </button>
                </div>
              ))}
              {pieces.length === 0 && (
                <div className="text-center text-[11px] py-6" style={{ color: 'hsl(0 0% 35%)' }}>
                  Nenhuma peça adicionada
                </div>
              )}
            </div>
          </div>
        </SidebarSection>

        {/* ─── SECTION 3: Execução ─── */}
        <SidebarSection title="Execução" icon="🚀" defaultOpen={true}>
          <div className="p-3" style={{ background: 'hsl(0 0% 10%)' }}>
            <button className="cnc-btn-primary w-full mb-2" onClick={optimize}>
              ⚡ OTIMIZAR (1 CHAPA)
            </button>
            <button className="cnc-btn-primary w-full" onClick={optimizeAllSheets} style={{ background: 'hsl(240 100% 50%)' }}>
              📋 OTIMIZAR TODAS AS CHAPAS
            </button>

            {layoutGroups.length > 0 && (
              <button
                className="cnc-btn-secondary w-full mt-2"
                style={{ background: 'hsl(0 0% 20%)', padding: '10px', fontSize: '12px', fontWeight: 'bold' }}
                onClick={() => exportPdf({
                  chapas, layoutGroups, chapaW, chapaH,
                  usableW, usableH, ml, mr, mt, mb, utilization,
                })}
              >
                📄 EXPORTAR PDF
              </button>
            )}

            {/* Layout summary */}
            {layoutGroups.length > 0 && (
              <div className="mt-3 p-2 rounded" style={{ background: 'hsl(0 0% 6%)', border: '1px solid hsl(0 0% 18%)' }}>
                <div className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: 'hsl(0 0% 50%)' }}>
                  Resumo dos Layouts
                </div>
                <div className="text-[11px] mb-2" style={{ color: 'hsl(0 0% 70%)' }}>
                  {chapas.length} chapa(s) total • {layoutGroups.length} layout(s) único(s)
                </div>
                {layoutGroups.map((group, gIdx) => {
                  const util = usableW > 0 && usableH > 0 ? (group.usedArea / (usableW * usableH)) * 100 : 0;
                  return (
                    <button
                      key={gIdx}
                      className="w-full flex items-center justify-between p-2 mb-1 rounded cursor-pointer transition-all text-left"
                      style={{
                        background: group.indices.includes(activeChapa) ? 'hsl(211 60% 25%)' : 'hsl(0 0% 12%)',
                        border: `1px solid ${group.indices.includes(activeChapa) ? 'hsl(211 60% 40%)' : 'hsl(0 0% 20%)'}`,
                      }}
                      onClick={() => {
                        const idx = group.indices[0];
                        setActiveChapa(idx);
                        setTree(chapas[idx].tree);
                        setSelectedId('root');
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold" style={{ color: 'white' }}>
                          Layout {gIdx + 1}
                        </span>
                        {group.count > 1 && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'hsl(30 100% 45%)', color: 'white' }}
                          >
                            ×{group.count}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: util > 80 ? 'hsl(120 70% 55%)' : util > 50 ? 'hsl(45 80% 55%)' : 'hsl(0 60% 55%)' }}>
                        {util.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SidebarSection>

        {/* ─── SECTION 4: Estrutura de Corte (advanced) ─── */}
        <SidebarSection title="Estrutura de Corte" icon="🌳" defaultOpen={false}>
          <div className="max-h-[200px] overflow-y-auto p-2 cnc-scroll" style={{ background: 'hsl(0 0% 4%)' }}>
            {renderActionTree(tree)}
            {tree.filhos.length === 0 && (
              <div className="text-center text-[11px] py-4" style={{ color: 'hsl(0 0% 35%)' }}>
                Nenhum nó na árvore
              </div>
            )}
          </div>
        </SidebarSection>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col" style={{ background: 'hsl(0 0% 0%)' }}>
        <SheetViewer
          chapas={chapas.length > 0 ? chapas : [{ tree, usedArea: calcPlacedArea(tree) }]}
          activeIndex={chapas.length > 0 ? activeChapa : 0}
          onSelectSheet={(idx) => {
            setActiveChapa(idx);
            if (chapas[idx]) {
              setTree(chapas[idx].tree);
              setSelectedId('root');
            }
          }}
          selectedId={selectedId}
          onSelectNode={setSelectedId}
          usableW={usableW}
          usableH={usableH}
          chapaW={chapaW}
          chapaH={chapaH}
          ml={ml}
          mb={mb}
          utilization={utilization}
          layoutGroups={layoutGroups}
        />

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
