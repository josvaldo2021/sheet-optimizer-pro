import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  TreeNode,
  PieceItem,
  OptimizationProgress,
  createRoot,
  cloneTree,
  findNode,
  findParentOfType,
  insertNode,
  deleteNode,
  calcAllocation,
  calcPlacedArea,
  optimizeGeneticV1,
  optimizeGeneticAsync,
} from "@/lib/cnc-engine";
import { groupIdenticalLayouts, LayoutGroup } from "@/lib/layout-utils";
import { exportPdf } from "@/lib/pdf-export";
import { exportLayoutsToExcel } from "@/lib/excel-export";
import SheetViewer from "@/components/SheetViewer";
import SidebarSection from "@/components/SidebarSection";

type CommandSuggestion = { cmd: string; label: string; desc: string; kind?: "direct" | "lookahead" };

const Index = () => {
  // ─── Sheet setup ───
  const [chapaW, setChapaW] = useState(6000);
  const [chapaH, setChapaH] = useState(3210);
  const [ml, setMl] = useState(10);
  const [mr, setMr] = useState(10);
  const [mt, setMt] = useState(10);
  const [mb, setMb] = useState(10);
  const [minBreak, setMinBreak] = useState(0);

  const usableW = chapaW - ml - mr;
  const usableH = chapaH - mt - mb;

  // ─── State ───
  const [tree, setTree] = useState<TreeNode>(() => createRoot(usableW, usableH));
  const [selectedId, setSelectedId] = useState("root");
  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [status, setStatus] = useState({ msg: "Pronto", type: "info" });
  const [chapas, setChapas] = useState<Array<{ tree: TreeNode; usedArea: number; manual?: boolean }>>([]);
  const [activeChapa, setActiveChapa] = useState(0);
  const [progress, setProgress] = useState<OptimizationProgress | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [priorityIds, setPriorityIds] = useState("");
  const [filterActiveLabels, setFilterActiveLabels] = useState<string[] | null>(null);
  const [replicationInfo, setReplicationInfo] = useState<{
    count: number;
    bom: Array<{ w: number; h: number; need: number; available: number }>;
  } | null>(null);
  const [gaPopSize, setGaPopSize] = useState(10);
  const [gaGens, setGaGens] = useState(10);
  const [pdfFilename, setPdfFilename] = useState("plano-de-corte");
  const [pieceFilter, setPieceFilter] = useState("");
  const [cmdInput, setCmdInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [vpSize, setVpSize] = useState({ w: 800, h: 600 });

  const scale = useMemo(() => {
    const vW = vpSize.w - 60,
      vH = vpSize.h - 60;
    if (vW <= 0 || vH <= 0) return 1;
    return Math.min(vW / chapaW, vH / chapaH);
  }, [vpSize, chapaW, chapaH]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const obs = new ResizeObserver((entries) => {
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

  // filteredLayoutGroups moved after extractUsedPiecesWithContext

  // ─── Actions ───
  const applySetup = useCallback(() => {
    setTree(createRoot(usableW, usableH));
    setSelectedId("root");
    setChapas([]);
    setActiveChapa(0);
    setStatus({ msg: "Setup aplicado", type: "success" });
  }, [usableW, usableH]);

  // Track whether we're editing a saved chapa or drawing a fresh layout
  const [editingExistingChapa, setEditingExistingChapa] = useState(false);

  // Helper to sync tree changes to chapas after manual edits (only when editing an existing chapa)
  const updateTreeAndChapas = useCallback(
    (newTree: TreeNode) => {
      setTree(newTree);
      if (editingExistingChapa) {
        setChapas((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[activeChapa] = { tree: newTree, usedArea: calcPlacedArea(newTree) };
          return updated;
        });
      }
    },
    [activeChapa, editingExistingChapa],
  );

  const processCommand = useCallback(
    (text: string) => {
      if (text === "U") {
        if (selectedId === "root") return;
        const t = cloneTree(tree);
        deleteNode(t, selectedId);
        updateTreeAndChapas(t);
        setSelectedId("root");
        return;
      }
      let multi = 1,
        cmd = text;
      const m = text.match(/^M(\d+)(.+)$/);
      if (m) {
        multi = parseInt(m[1]);
        cmd = m[2];
      }
      const tipo = cmd.charAt(0) as any;
      let valor = parseFloat(cmd.substring(1));
      if (isNaN(valor) || !["X", "Y", "Z", "W", "Q"].includes(tipo)) return;

      // For X nodes, multiply value instead of creating separate columns
      // e.g. m4x818 → single X of 3272 instead of 4 separate X818
      if (tipo === "X" && multi > 1) {
        valor = valor * multi;
        multi = 1;
      }

      // If inserting Z and the Y parent has a single auto-created full-width Z, remove it first
      if (tipo === "Z") {
        const t = cloneTree(tree);
        const target = findNode(t, selectedId);
        const yParent = target?.tipo === "Y" ? target : findParentOfType(t, selectedId, "Y");
        const xParent = yParent ? findParentOfType(t, yParent.id, "X") : null;
        if (
          yParent &&
          xParent &&
          yParent.filhos.length === 1 &&
          yParent.filhos[0].tipo === "Z" &&
          yParent.filhos[0].filhos.length === 0 &&
          yParent.filhos[0].valor === xParent.valor
        ) {
          // Remove the auto-created full-width Z
          deleteNode(t, yParent.filhos[0].id);
          const res2 = calcAllocation(t, yParent.id, "Z", valor, multi, usableW, usableH, minBreak);
          if (res2.allocated > 0) {
            const nid = insertNode(t, yParent.id, "Z", valor, res2.allocated);
            updateTreeAndChapas(t);
            setSelectedId(nid);
            setStatus({ msg: `Z${valor} criado!`, type: "success" });
            return;
          }
        }
      }

      const res = calcAllocation(tree, selectedId, tipo, valor, multi, usableW, usableH, minBreak);
      if (res.allocated > 0) {
        const t = cloneTree(tree);
        const nid = insertNode(t, selectedId, tipo, valor, res.allocated);

        updateTreeAndChapas(t);
        setSelectedId(nid);
        setStatus({ msg: `${tipo}${valor} criado!`, type: "success" });
      } else {
        setStatus({ msg: res.error || "Sem espaço", type: "error" });
      }
    },
    [tree, selectedId, usableW, usableH, minBreak, updateTreeAndChapas],
  );

  const extractUsedPiecesWithContext = useCallback(
    (node: TreeNode): Array<{ w: number; h: number; label?: string }> => {
      const used: Array<{ w: number; h: number; label?: string }> = [];
      const traverse = (n: TreeNode, parents: TreeNode[], parentMultiplier: number) => {
        const yAncestor = parents.find((p) => p.tipo === "Y");
        const zAncestor = parents.find((p) => p.tipo === "Z");
        const wAncestor = parents.find((p) => p.tipo === "W");
        let pieceW = 0,
          pieceH = 0,
          isLeaf = false;

        // Cumulative multiplier: parent chain × this node's own multi
        const totalMulti = parentMultiplier * n.multi;

        if (n.tipo === "Z" && n.filhos.length === 0) {
          pieceW = n.valor;
          pieceH = yAncestor?.valor || 0;
          isLeaf = true;
        } else if (n.tipo === "W" && n.filhos.length === 0) {
          pieceW = zAncestor?.valor || 0;
          pieceH = n.valor;
          isLeaf = true;
        } else if (n.tipo === "Q") {
          pieceW = n.valor;
          pieceH = wAncestor?.valor || 0;
          isLeaf = true;
        }

        if (isLeaf && pieceW > 0 && pieceH > 0) {
          for (let m = 0; m < totalMulti; m++) {
            used.push({ w: pieceW, h: pieceH, label: n.label });
          }
        }
        n.filhos.forEach((f) => traverse(f, [...parents, n], totalMulti));
      };
      traverse(node, [], 1);
      return used;
    },
    [],
  );

  // ─── Filtered layout groups (visual filter by priority IDs) ───
  const filteredLayoutGroups = useMemo(() => {
    if (!filterActiveLabels || filterActiveLabels.length === 0) return layoutGroups;
    return layoutGroups.filter((group) => {
      const chapaIdx = group.indices[0];
      const usedPieces = extractUsedPiecesWithContext(chapas[chapaIdx].tree);
      return usedPieces.some((p) => p.label && filterActiveLabels.includes(p.label.toUpperCase()));
    });
  }, [layoutGroups, filterActiveLabels, chapas, extractUsedPiecesWithContext]);

  const optimize = useCallback(async () => {
    const hasPriority = pieces.some((p) => p.priority);
    const activePieces = hasPriority ? pieces.filter((p) => p.priority) : pieces;
    const inv: { w: number; h: number; area: number; label?: string }[] = [];
    activePieces.forEach((p) => {
      for (let i = 0; i < p.qty; i++) {
        if (p.w > 0 && p.h > 0) inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: p.label });
      }
    });
    if (inv.length === 0) {
      setStatus({ msg: "Inventário vazio!", type: "error" });
      return;
    }
    setIsOptimizing(true);
    setProgress({ phase: "Iniciando...", current: 0, total: 1 });
    setStatus({ msg: "Otimizando com Algoritmo Genético...", type: "warn" });

    await new Promise((r) => setTimeout(r, 20));
    const priorityLabels = priorityIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await optimizeGeneticAsync(
      inv,
      usableW,
      usableH,
      minBreak,
      setProgress,
      priorityLabels.length > 0 ? priorityLabels : undefined,
      gaPopSize,
      gaGens,
    );
    setTree(result);
    setChapas([{ tree: result, usedArea: calcPlacedArea(result), manual: false }]);
    setActiveChapa(0);
    setSelectedId("root");
    setProgress(null);
    setIsOptimizing(false);
    setStatus({ msg: "Plano de Corte Otimizado!", type: "success" });
  }, [pieces, usableW, usableH, minBreak, priorityIds, gaPopSize, gaGens]);

  const optimizeAllSheets = useCallback(async () => {
    if (pieces.length === 0) {
      setStatus({ msg: "Inventário vazio!", type: "error" });
      return;
    }
    setIsOptimizing(true);
    setStatus({ msg: "Processando todas as chapas...", type: "warn" });

    const runAllSheets = async (useGrouping?: boolean) => {
      const chapaList: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }> = [];
      const hasPriority = pieces.some((p) => p.priority);
      const remaining = (hasPriority ? pieces.filter((p) => p.priority) : pieces).map((p) => ({ ...p }));
      let sheetCount = 0;
      const totalPieces = remaining.reduce((sum, p) => sum + Math.max(p.qty, 1), 0);
      const maxSheets = Math.max(100, totalPieces * 2);

      while (remaining.length > 0 && sheetCount < maxSheets) {
        sheetCount++;
        const inv: { w: number; h: number; area: number; label?: string }[] = [];
        remaining.forEach((p) => {
          for (let i = 0; i < p.qty; i++) {
            if (p.w > 0 && p.h > 0) inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: p.label });
          }
        });
        if (inv.length === 0) break;

        setProgress({
          phase: `Chapa ${sheetCount} (variante ${useGrouping === undefined ? "auto" : useGrouping ? "agrupado" : "normal"})`,
          current: sheetCount,
          total: sheetCount + 1,
        });

        await new Promise((r) => setTimeout(r, 0));
        const priorityLabels = priorityIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await optimizeGeneticAsync(
          inv,
          usableW,
          usableH,
          minBreak,
          (p) => {
            setProgress({
              phase: `Chapa ${sheetCount} - ${p.phase}`,
              current: p.current,
              total: p.total,
              bestUtil: p.bestUtil,
            });
          },
          priorityLabels.length > 0 ? priorityLabels : undefined,
          gaPopSize,
          gaGens,
        );
        const usedArea = calcPlacedArea(result);
        chapaList.push({ tree: result, usedArea, manual: false });

        const usedPieces = extractUsedPiecesWithContext(result);

        // --- Layout Replication Optimization ---
        // Count how many times this exact layout can be replicated with remaining pieces
        // Build a "bill of materials" for this layout: how many of each piece type it uses
        const layoutBOM = new Map<string, { w: number; h: number; count: number }>();
        usedPieces.forEach((used) => {
          // Normalize key: smaller dimension first
          const key = `${Math.min(used.w, used.h)}x${Math.max(used.w, used.h)}`;
          const existing = layoutBOM.get(key);
          if (existing) {
            existing.count++;
          } else {
            layoutBOM.set(key, { w: used.w, h: used.h, count: 1 });
          }
        });

        // Calculate how many full replications are possible
        let maxReplications = Infinity;
        layoutBOM.forEach(({ w, h, count }) => {
          // Find total available qty in remaining for this piece type
          let available = 0;
          remaining.forEach((p) => {
            if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) {
              available += p.qty;
            }
          });
          // First sheet already uses 'count' pieces, so available includes those
          // We want how many ADDITIONAL full copies we can make
          const additionalAvailable = available - count; // subtract what the first sheet uses
          const possibleCopies = Math.floor(additionalAvailable / count);
          maxReplications = Math.min(maxReplications, possibleCopies);
        });

        if (!isFinite(maxReplications) || maxReplications < 0) maxReplications = 0;
        // Cap to avoid runaway
        maxReplications = Math.min(maxReplications, maxSheets - chapaList.length);

        // Deduct first sheet's pieces from remaining
        usedPieces.forEach((used) => {
          for (let i = 0; i < remaining.length; i++) {
            const p = remaining[i];
            if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
              p.qty--;
              if (p.qty <= 0) remaining.splice(i, 1);
              break;
            }
          }
        });

        // Replicate the layout for additional copies
        if (maxReplications > 0) {
          for (let rep = 0; rep < maxReplications; rep++) {
            chapaList.push({ tree: cloneTree(result), usedArea, manual: false });
            // Deduct pieces for this replicated sheet
            layoutBOM.forEach(({ w, h, count }) => {
              let toDeduct = count;
              for (let i = 0; i < remaining.length && toDeduct > 0; i++) {
                const p = remaining[i];
                if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) {
                  const deducted = Math.min(toDeduct, p.qty);
                  p.qty -= deducted;
                  toDeduct -= deducted;
                  if (p.qty <= 0) {
                    remaining.splice(i, 1);
                    i--;
                  }
                }
              }
            });
          }
          sheetCount += maxReplications;
        }
      }

      return chapaList;
    };

    await new Promise((r) => setTimeout(r, 20));

    const candidates = [];
    for (const variant of [false, true, undefined] as const) {
      setProgress({
        phase: `Testando variante ${variant === undefined ? "auto" : variant ? "agrupado" : "normal"}...`,
        current: 0,
        total: 1,
      });
      const result = await runAllSheets(variant);
      if (result.length > 0) candidates.push(result);
    }

    const sheetArea = usableW * usableH;
    candidates.sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      const avgA = a.reduce((s, c) => s + c.usedArea / sheetArea, 0) / a.length;
      const avgB = b.reduce((s, c) => s + c.usedArea / sheetArea, 0) / b.length;
      return avgB - avgA;
    });

    const best = candidates[0] || [];
    setChapas(best);
    if (best.length > 0) {
      setTree(best[0].tree);
      setSelectedId("root");
    }
    setActiveChapa(0);
    setProgress(null);
    setIsOptimizing(false);
    setStatus({ msg: `✅ ${best.length} chapa(s) gerada(s)!`, type: "success" });
  }, [pieces, usableW, usableH, extractUsedPiecesWithContext, minBreak, priorityIds, gaPopSize, gaGens]);

  const handleExcel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setStatus({ msg: "Nenhum arquivo selecionado", type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setStatus({ msg: "Erro ao ler arquivo", type: "error" });
    reader.onload = (evt) => {
      try {
        const result = evt.target?.result;
        if (!result) {
          setStatus({ msg: "Falha ao ler arquivo", type: "error" });
          return;
        }
        const wb = XLSX.read(result, { type: "binary" });
        if (!wb.SheetNames?.length) {
          setStatus({ msg: "Arquivo Excel vazio", type: "error" });
          return;
        }
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (!Array.isArray(json) || json.length === 0) {
          setStatus({ msg: "Nenhuma linha encontrada", type: "error" });
          return;
        }

        const getValue = (row: any, names: string[]): number => {
          const rowKey = Object.keys(row).find((k) =>
            names.some((n) => k.toLowerCase().trim() === n.toLowerCase().trim()),
          );
          return Number(rowKey ? row[rowKey] : null) || 0;
        };
        const getString = (row: any, names: string[]): string => {
          const rowKey = Object.keys(row).find((k) =>
            names.some((n) => k.toLowerCase().trim() === n.toLowerCase().trim()),
          );
          return rowKey ? String(row[rowKey] || "").trim() : "";
        };

        const items: PieceItem[] = json
          .map((row, i) => ({
            id: `p${Date.now()}_${i}`,
            qty: getValue(row, ["qtd", "quantidade", "qtde", "qty", "q"]) || 1,
            w: getValue(row, ["largura", "width", "l", "w"]),
            h: getValue(row, ["altura", "height", "h"]),
            label:
              getString(row, [
                "id",
                "identificação",
                "identificacao",
                "nome",
                "name",
                "código",
                "codigo",
                "cod",
                "ref",
              ]) || undefined,
          }))
          .filter((p) => p.w > 0 && p.h > 0);

        if (items.length === 0) {
          setStatus({ msg: "Nenhuma peça válida encontrada.", type: "error" });
          return;
        }
        setPieces(items);
        setStatus({ msg: `${items.length} peças importadas!`, type: "success" });
      } catch (err) {
        setStatus({ msg: `Erro: ${(err as Error).message}`, type: "error" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }, []);

  const utilization = useMemo(() => {
    const area = calcPlacedArea(tree);
    return usableW > 0 && usableH > 0 ? (area / (usableW * usableH)) * 100 : 0;
  }, [tree, usableW, usableH]);

  // ─── Auto-suggestion logic ───
  const commandSuggestions = useMemo<CommandSuggestion[]>(() => {
    if (pieces.length === 0) return [];
    const selected = findNode(tree, selectedId);
    if (!selected) return [];

    const suggestions: CommandSuggestion[] = [];
    const seen = new Set<string>();

    // Determine what the next expected node type is based on selection
    const addSuggestion = (tipo: string, valor: number, desc: string) => {
      const key = `${tipo}${valor}`;
      if (seen.has(key)) return;
      seen.add(key);
      // Verify it fits
      const res = calcAllocation(tree, selectedId, tipo as any, valor, 1, usableW, usableH, minBreak);
      if (res.allocated > 0) {
        suggestions.push({ cmd: key, label: key, desc, kind: "direct" });
      }
    };

    // Get unique piece dimensions from inventory
    const uniquePieces = new Map<string, { w: number; h: number; qty: number; label?: string }>();
    pieces.forEach((p) => {
      if (p.qty <= 0 || p.w <= 0 || p.h <= 0) return;
      const k1 = `${p.w}x${p.h}`;
      if (!uniquePieces.has(k1)) uniquePieces.set(k1, { w: p.w, h: p.h, qty: p.qty, label: p.label });
      else uniquePieces.get(k1)!.qty += p.qty;
    });

    if (selectedId === "root") {
      // Suggest X values = piece widths and heights (could be rotated)
      uniquePieces.forEach(({ w, h, label }) => {
        addSuggestion("X", w, `Coluna ${w}mm${label ? ` (${label})` : ""}`);
        addSuggestion("X", h, `Coluna ${h}mm (rotacionado)${label ? ` (${label})` : ""}`);
      });
    }

    if (selected.tipo === "X" || findParentOfType(tree, selectedId, "X")) {
      const xNode = selected.tipo === "X" ? selected : findParentOfType(tree, selectedId, "X");
      if (xNode) {
        // Suggest Y values = piece heights where piece width matches X value
        uniquePieces.forEach(({ w, h, label }) => {
          if (w === xNode.valor) {
            addSuggestion("Y", h, `Fita ${h}mm → peça ${w}×${h}${label ? ` (${label})` : ""}`);
          }
          if (h === xNode.valor) {
            addSuggestion("Y", w, `Fita ${w}mm → peça ${h}×${w} (rot.)${label ? ` (${label})` : ""}`);
          }
        });
        // Also suggest new X for another column
        if (selected.tipo !== "X") {
          uniquePieces.forEach(({ w, h, label }) => {
            addSuggestion("X", w, `Nova coluna ${w}mm${label ? ` (${label})` : ""}`);
            addSuggestion("X", h, `Nova coluna ${h}mm (rot.)${label ? ` (${label})` : ""}`);
          });
        }
      }
    }

    if (selected.tipo === "Y" || selected.tipo === "Z") {
      // If at Z level (auto-created), suggest another Y for the same X
      const xNode = findParentOfType(tree, selectedId, "X");
      if (xNode) {
        uniquePieces.forEach(({ w, h, label }) => {
          if (w === xNode.valor) {
            addSuggestion("Y", h, `Fita ${h}mm → peça ${w}×${h}${label ? ` (${label})` : ""}`);
          }
          if (h === xNode.valor) {
            addSuggestion("Y", w, `Fita ${w}mm → peça ${h}×${w} (rot.)${label ? ` (${label})` : ""}`);
          }
        });
      }
      // Suggest Z subdivisions
      const yNode = selected.tipo === "Y" ? selected : findParentOfType(tree, selectedId, "Y");
      if (yNode) {
        uniquePieces.forEach(({ w, h, label }) => {
          if (h === yNode.valor) {
            addSuggestion("Z", w, `Subdivisão ${w}mm → peça ${w}×${h}${label ? ` (${label})` : ""}`);
          }
          if (w === yNode.valor) {
            addSuggestion("Z", h, `Subdivisão ${h}mm → peça ${h}×${w} (rot.)${label ? ` (${label})` : ""}`);
          }
        });
      }
      // Suggest W subdivisions when Z is selected
      if (selected.tipo === "Z") {
        uniquePieces.forEach(({ w, h, label }) => {
          if (w === selected.valor) {
            addSuggestion("W", h, `Sub-H ${h}mm → peça ${w}×${h}${label ? ` (${label})` : ""}`);
          }
          if (h === selected.valor) {
            addSuggestion("W", w, `Sub-H ${w}mm → peça ${h}×${w} (rot.)${label ? ` (${label})` : ""}`);
          }
        });
      }
    }

    if (selected.tipo === "W" || findParentOfType(tree, selectedId, "W")) {
      const zNode = findParentOfType(tree, selectedId, "Z");
      if (zNode) {
        uniquePieces.forEach(({ w, h, label }) => {
          if (w === zNode.valor) {
            addSuggestion("W", h, `Sub-H ${h}mm → peça ${w}×${h}${label ? ` (${label})` : ""}`);
          }
          if (h === zNode.valor) {
            addSuggestion("W", w, `Sub-H ${w}mm → peça ${h}×${w} (rot.)${label ? ` (${label})` : ""}`);
          }
        });
      }
    }

    return suggestions;
  }, [tree, selectedId, pieces, usableW, usableH, minBreak]);

  // Filter suggestions based on current input + look-ahead for next coordinate
  const filteredSuggestions = useMemo<CommandSuggestion[]>(() => {
    if (!cmdInput) return commandSuggestions;
    const upper = cmdInput.toUpperCase();
    const directMatches = commandSuggestions.filter((s) => s.cmd.startsWith(upper));

    // Look-ahead: parse ANY typed command (doesn't need to be in suggestion list)
    const m = upper.match(/^(?:M\d+)?([XYZWQ])(\d+)$/);
    if (m) {
      const tipo = m[1];
      const valor = Number(m[2]);
      const lookAhead: CommandSuggestion[] = [];
      const seenLA = new Set<string>();

      // Hierarchy: X→Y, Y→Z, Z→W, W→Q
      const nextTipoMap: Record<string, string> = { X: "Y", Y: "Z", Z: "W", W: "Q" };
      const nextTipo = nextTipoMap[tipo];

      if (nextTipo) {
        pieces.forEach((p) => {
          if (p.qty <= 0 || p.w <= 0 || p.h <= 0) return;
          let nextVal: number | null = null;
          let descText = "";

          if (p.w === valor) {
            nextVal = p.h;
            descText = `→ próximo: ${nextTipo}${p.h} (peça ${p.w}×${p.h}${p.label ? " - " + p.label : ""})`;
          } else if (p.h === valor) {
            nextVal = p.w;
            descText = `→ próximo: ${nextTipo}${p.w} (peça ${p.w}×${p.h} rot.${p.label ? " - " + p.label : ""})`;
          }

          if (nextVal !== null) {
            const key = `${nextTipo}${nextVal}`;
            if (!seenLA.has(key)) {
              seenLA.add(key);
              lookAhead.push({ cmd: key, label: `⟶ ${key}`, desc: descText, kind: "lookahead" });
            }
          }
        });
      }

      if (lookAhead.length > 0) {
        return [...directMatches, ...lookAhead];
      }
    }

    return directMatches;
  }, [commandSuggestions, cmdInput, pieces]);

  const applySuggestion = useCallback(
    (suggestion: CommandSuggestion) => {
      const typed = cmdInput.trim().toUpperCase();

      // If user clicked a look-ahead suggestion (e.g. Z after typing Y),
      // execute current command first, then preload next command.
      if (suggestion.kind === "lookahead" && /^(?:M\d+)?[XYZWQ]\d+$/.test(typed) && typed !== suggestion.cmd) {
        processCommand(typed);
        setCmdInput(suggestion.cmd);
        setShowSuggestions(true);
        setSelectedSuggestionIdx(-1);
        cmdInputRef.current?.focus();
        return;
      }

      processCommand(suggestion.cmd);
      setCmdInput("");
      // Keep open to immediately suggest the next level after insertion
      setShowSuggestions(true);
      setSelectedSuggestionIdx(-1);
      cmdInputRef.current?.focus();
    },
    [processCommand, cmdInput],
  );

  const calcReplication = useCallback(() => {
    const usedPieces = extractUsedPiecesWithContext(tree);
    if (usedPieces.length === 0) {
      setStatus({ msg: "Desenhe um layout primeiro!", type: "error" });
      return;
    }
    if (pieces.length === 0) {
      setStatus({ msg: "Adicione peças na lista primeiro!", type: "error" });
      return;
    }

    // Build BOM from the current layout
    const layoutBOM = new Map<string, { w: number; h: number; count: number }>();
    usedPieces.forEach((used) => {
      const key = `${Math.min(used.w, used.h)}x${Math.max(used.w, used.h)}`;
      const existing = layoutBOM.get(key);
      if (existing) existing.count++;
      else layoutBOM.set(key, { w: used.w, h: used.h, count: 1 });
    });

    // Check inventory availability
    const bomDetails: Array<{ w: number; h: number; need: number; available: number }> = [];
    let maxReps = Infinity;

    layoutBOM.forEach(({ w, h, count }) => {
      let available = 0;
      pieces.forEach((p) => {
        if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) {
          available += p.qty;
        }
      });
      const reps = Math.floor(available / count);
      maxReps = Math.min(maxReps, reps);
      bomDetails.push({ w, h, need: count, available });
    });

    if (!isFinite(maxReps)) maxReps = 0;

    setReplicationInfo({ count: maxReps, bom: bomDetails });
    setStatus({ msg: `Layout pode ser repetido ${maxReps}×`, type: maxReps > 0 ? "success" : "error" });
  }, [tree, pieces, extractUsedPiecesWithContext]);

  const deleteLayout = useCallback(
    (groupIndex: number) => {
      const group = layoutGroups[groupIndex];
      if (!group) return;

      // Check if any chapa in this group is manual
      const hasManualChapas = group.indices.some((idx) => chapas[idx]?.manual === true);

      // Only restore pieces to inventory if chapas were manually created
      if (hasManualChapas) {
        const updatedPieces = pieces.map((p) => ({ ...p }));
        group.indices.forEach((chapaIdx) => {
          const chapa = chapas[chapaIdx];
          if (!chapa || !chapa.manual) return; // only restore manual ones
          const usedPieces = extractUsedPiecesWithContext(chapa.tree);
          usedPieces.forEach((used) => {
            const existing = updatedPieces.find(
              (p) => (p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w),
            );
            if (existing) {
              existing.qty++;
            } else {
              updatedPieces.push({
                id: `p${Date.now()}_${Math.random().toString(36).slice(2)}`,
                qty: 1,
                w: used.w,
                h: used.h,
                label: used.label,
              });
            }
          });
        });
        setPieces(updatedPieces);
      }

      // Remove chapas at group indices
      const indicesToRemove = new Set(group.indices);
      const newChapas = chapas.filter((_, i) => !indicesToRemove.has(i));
      setChapas(newChapas);

      // Adjust active chapa
      if (newChapas.length === 0) {
        setTree(createRoot(usableW, usableH));
        setSelectedId("root");
        setActiveChapa(0);
        setEditingExistingChapa(false);
      } else {
        const newIdx = Math.min(activeChapa, newChapas.length - 1);
        setActiveChapa(newIdx);
        setTree(newChapas[newIdx].tree);
        setSelectedId("root");
      }

      const msg = hasManualChapas
        ? `🗑️ Layout excluído (×${group.count}). Peças manuais devolvidas ao inventário.`
        : `🗑️ Layout excluído (×${group.count}).`;
      setStatus({ msg, type: "success" });
    },
    [layoutGroups, chapas, pieces, extractUsedPiecesWithContext, usableW, usableH, activeChapa],
  );

  // Confirm auto plan: deduct pieces from inventory and mark chapas as confirmed
  const confirmAutoPlan = useCallback(() => {
    const autoChapas = chapas.filter((c) => !c.manual);
    if (autoChapas.length === 0) {
      setStatus({ msg: "Nenhuma chapa automática para confirmar.", type: "error" });
      return;
    }

    const updatedPieces = pieces.map((p) => ({ ...p }));
    autoChapas.forEach((chapa) => {
      const usedPieces = extractUsedPiecesWithContext(chapa.tree);
      usedPieces.forEach((used) => {
        for (let j = 0; j < updatedPieces.length; j++) {
          const p = updatedPieces[j];
          if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
            if (p.qty > 0) {
              p.qty--;
              break;
            }
          }
        }
      });
    });

    const filteredPieces = updatedPieces.filter((p) => p.qty > 0);
    setPieces(filteredPieces);

    // Mark all auto chapas as confirmed (manual) so they won't be confirmed again
    setChapas((prev) => prev.map((c) => (c.manual ? c : { ...c, manual: true })));

    const remaining = filteredPieces.reduce((s, p) => s + p.qty, 0);
    setStatus({
      msg: `✅ Plano confirmado! ${autoChapas.length} chapa(s) aplicadas ao inventário. ${remaining} peça(s) restante(s).`,
      type: "success",
    });
  }, [chapas, pieces, extractUsedPiecesWithContext]);

  const saveLayout = useCallback(
    (reps?: number) => {
      const usedPieces = extractUsedPiecesWithContext(tree);
      if (usedPieces.length === 0) {
        setStatus({ msg: "Desenhe um layout primeiro!", type: "error" });
        return;
      }

      const count = reps && reps > 0 ? reps : 1;
      const newChapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }> = [];
      const usedArea = calcPlacedArea(tree);

      for (let i = 0; i < count; i++) {
        newChapas.push({ tree: cloneTree(tree), usedArea, manual: true });
      }

      // Deduct pieces from inventory
      const updatedPieces = pieces.map((p) => ({ ...p }));
      for (let i = 0; i < count; i++) {
        usedPieces.forEach((used) => {
          for (let j = 0; j < updatedPieces.length; j++) {
            const p = updatedPieces[j];
            if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
              if (p.qty > 0) {
                p.qty--;
                break;
              }
            }
          }
        });
      }

      // Remove pieces with qty <= 0
      const filteredPieces = updatedPieces.filter((p) => p.qty > 0);
      setPieces(filteredPieces);

      // Add to chapas list
      setChapas((prev) => [...prev, ...newChapas]);
      setActiveChapa((prev) => (prev === 0 && chapas.length === 0 ? 0 : chapas.length));

      // Reset tree for next layout
      const freshTree = createRoot(usableW, usableH);
      setTree(freshTree);
      setSelectedId("root");
      setEditingExistingChapa(false);
      setReplicationInfo(null);

      setStatus({
        msg: `✅ Layout salvo (×${count})! ${filteredPieces.reduce((s, p) => s + p.qty, 0)} peças restantes.`,
        type: "success",
      });
    },
    [tree, pieces, chapas, extractUsedPiecesWithContext, usableW, usableH],
  );

  // ─── Render helpers ───
  type ActionItem = { id: string; tipo: string; valor: number; multi: number; depth: number; label?: string; active: boolean };

  const getDescendantLabel = (n: TreeNode): string | undefined => {
    if (n.label) return n.label;
    if (n.filhos.length === 1 && n.multi === 1) return getDescendantLabel(n.filhos[0]);
    return undefined;
  };

  const buildActionItems = (node: TreeNode, depth: number, items: ActionItem[], pX?: TreeNode, pY?: TreeNode) => {
    const nextPX = node.tipo === "X" ? node : pX;
    const nextPY = node.tipo === "Y" ? node : pY;

    for (const child of node.filhos) {
      let isHidden = false;

      // Z é redundante se preenche toda a largura da coluna X
      if (child.tipo === "Z" && nextPX && child.valor === nextPX.valor && child.filhos.length <= 1) {
        isHidden = true;
      }
      // W é redundante se preenche toda a altura da faixa Y
      if (child.tipo === "W" && nextPY && child.valor === nextPY.valor && child.filhos.length <= 1) {
        isHidden = true;
      }
      // Q é redundante se preenche toda a largura da coluna X
      if (child.tipo === "Q" && child.filhos.length === 0 && nextPX && child.valor === nextPX.valor) {
        isHidden = true;
      }

      const labelToDisplay = getDescendantLabel(child);

      if (!isHidden) {
        items.push({
          id: child.id,
          tipo: child.tipo,
          valor: child.valor,
          multi: child.multi,
          depth: depth,
          label: labelToDisplay,
          active: selectedId === child.id
        });
        buildActionItems(child, depth + 1, items, nextPX, nextPY);
      } else {
        // Se escondido, passamos para os filhos sem aumentar a profundidade visual
        buildActionItems(child, depth, items, nextPX, nextPY);
      }
    }
  };

  const renderActionTree = (node: TreeNode): JSX.Element[] => {
    const items: ActionItem[] = [];
    buildActionItems(node, 0, items);
    
    return items.map((item, idx) => (
      <div key={item.id + idx}>
        <div
          className={`cnc-action-item ${item.active ? "cnc-action-active" : ""}`}
          style={{ paddingLeft: item.depth * 12 + 6 }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(item.id);
          }}
        >
          <b>
            {item.tipo}
            {item.valor}
          </b>{" "}
          (x{item.multi}) {item.label && <span style={{ color: "hsl(120 70% 55%)", marginLeft: "4px" }}>[{item.label}]</span>}
        </div>
      </div>
    ));
  };

  const totalPieces = useMemo(() => pieces.reduce((sum, p) => sum + p.qty, 0), [pieces]);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}
    >
      {/* SIDEBAR */}
      <div
        className="w-[420px] min-w-[420px] flex flex-col h-screen overflow-y-auto cnc-scroll"
        style={{ background: "hsl(0 0% 10%)", borderRight: "2px solid hsl(0 0% 20%)" }}
      >
        {/* ─── SECTION 1: Setup da Chapa ─── */}
        <SidebarSection title="Setup da Chapa" icon="📐" defaultOpen={true}>
          <div className="p-4 text-xs" style={{ background: "hsl(0 0% 13%)" }}>
            <div className="flex justify-between items-center mb-2 gap-1">
              <span>Chapa:</span>
              <input
                type="number"
                value={chapaW}
                onChange={(e) => setChapaW(+e.target.value)}
                className="cnc-input w-16"
              />
              <span>x</span>
              <input
                type="number"
                value={chapaH}
                onChange={(e) => setChapaH(+e.target.value)}
                className="cnc-input w-16"
              />
            </div>
            <div className="flex justify-between items-center mb-2 gap-1">
              <span>Refilo L/R:</span>
              <input type="number" value={ml} onChange={(e) => setMl(+e.target.value)} className="cnc-input w-16" />
              <span>/</span>
              <input type="number" value={mr} onChange={(e) => setMr(+e.target.value)} className="cnc-input w-16" />
            </div>
            <div className="flex justify-between items-center mb-2 gap-1">
              <span>Refilo T/B:</span>
              <input type="number" value={mt} onChange={(e) => setMt(+e.target.value)} className="cnc-input w-16" />
              <span>/</span>
              <input type="number" value={mb} onChange={(e) => setMb(+e.target.value)} className="cnc-input w-16" />
            </div>
            <div className="flex justify-between items-center mb-2 gap-1">
              <span>Dist. Quebra:</span>
              <input
                type="number"
                value={minBreak}
                onChange={(e) => setMinBreak(+e.target.value)}
                className="cnc-input w-16"
              />
              <span className="text-[9px]" style={{ color: "hsl(0 0% 50%)" }}>
                mm
              </span>
            </div>
            <div className="mt-2 text-[10px]" style={{ color: "hsl(0 0% 50%)" }}>
              Área útil: {usableW} × {usableH} mm
            </div>
            <button onClick={applySetup} className="cnc-btn-success w-full mt-2">
              APLICAR SETUP
            </button>
          </div>
        </SidebarSection>

        {/* ─── SECTION 2: Lista de Peças ─── */}
        <SidebarSection title={`Lista de Peças (${totalPieces})`} icon="📦" defaultOpen={true}>
          <div className="flex flex-col" style={{ background: "hsl(0 0% 7%)" }}>
            <div
              className="p-2.5 flex-shrink-0 space-y-2"
              style={{ background: "hsl(0 0% 10%)", borderBottom: "1px solid hsl(0 0% 20%)" }}
            >
              <input type="file" id="excelInput" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcel} />
              <button
                className="cnc-btn-excel w-full"
                onClick={() => document.getElementById("excelInput")?.click()}
              >
                📂 IMPORTAR EXCEL
              </button>
              
              <div className="flex flex-col gap-1 mt-2">
                <input
                  type="text"
                  placeholder="Filtrar peças (ID, L ou A)..."
                  className="cnc-input w-full bg-zinc-900 border-zinc-800 text-xs h-8"
                  value={pieceFilter}
                  onChange={(e) => setPieceFilter(e.target.value)}
                />
                <div className="flex gap-1">
                  <button
                    className="text-[9px] uppercase font-bold py-1 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors flex-1"
                    onClick={() => {
                      const lower = pieceFilter.toLowerCase();
                      setPieces(ps => ps.map(p => {
                        const matches = p.label?.toLowerCase().includes(lower) || 
                                       String(p.w).includes(lower) || 
                                       String(p.h).includes(lower);
                        return matches ? { ...p, priority: true } : p;
                      }));
                    }}
                  >
                    Marcar Visíveis
                  </button>
                  <button
                    className="text-[9px] uppercase font-bold py-1 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors flex-1"
                    onClick={() => setPieces(ps => ps.map(p => ({ ...p, priority: false })))}
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setPieces((p) => [...p, { id: `p${Date.now()}`, qty: 1, w: 1000, h: 1000 }])}
                  className="cnc-btn-secondary flex-1"
                >
                  + ADICIONAR
                </button>
                {pieces.length > 0 && (
                  <button
                    onClick={() => {
                      setPieces([]);
                      setPieceFilter("");
                    }}
                    className="cnc-btn-secondary flex-1"
                    style={{ background: "hsl(0 40% 25%)" }}
                  >
                    LIMPAR LISTA
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto p-2.5 cnc-scroll">
              {/* Header */}
              {pieces.length > 0 && (
                <div
                  className="grid gap-1 mb-1 text-[9px] font-bold uppercase"
                  style={{ gridTemplateColumns: "20px 70px 70px 15px 70px 70px 20px", color: "hsl(0 0% 45%)" }}
                >
                  <span className="text-center" title="Prioridade">
                    🚩
                  </span>
                  <span className="text-center">Qtd</span>
                  <span className="text-center">Larg</span>
                  <span></span>
                  <span className="text-center">Alt</span>
                  <span className="text-center">ID</span>
                  <span></span>
                </div>
              )}
              {pieces
                .filter(p => {
                  if (!pieceFilter) return true;
                  const lower = pieceFilter.toLowerCase();
                  return p.label?.toLowerCase().includes(lower) || 
                         String(p.w).includes(lower) || 
                         String(p.h).includes(lower);
                })
                .map((p) => (
                  <div
                    key={p.id}
                    className="cnc-inv-item"
                    style={{ gridTemplateColumns: "20px 70px 70px 15px 70px 70px 20px" }}
                  >
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={!!p.priority}
                      onChange={(e) =>
                        setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, priority: e.target.checked } : x)))
                      }
                      title="Processar somente este pedido"
                      style={{ accentColor: "hsl(45 100% 50%)", cursor: "pointer", width: "12px", height: "12px" }}
                    />
                  </div>
                  <input
                    type="number"
                    value={p.qty}
                    onChange={(e) =>
                      setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, qty: +e.target.value } : x)))
                    }
                    className="cnc-input"
                  />
                  <input
                    type="number"
                    value={p.w}
                    onChange={(e) =>
                      setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, w: +e.target.value } : x)))
                    }
                    className="cnc-input"
                  />
                  <span className="text-center text-[8px]" style={{ color: "hsl(0 0% 53%)" }}>
                    ×
                  </span>
                  <input
                    type="number"
                    value={p.h}
                    onChange={(e) =>
                      setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, h: +e.target.value } : x)))
                    }
                    className="cnc-input"
                  />
                  <input
                    type="text"
                    value={p.label || ""}
                    onChange={(e) =>
                      setPieces((ps) =>
                        ps.map((x) => (x.id === p.id ? { ...x, label: e.target.value || undefined } : x)),
                      )
                    }
                    className="cnc-input"
                    placeholder="ID"
                  />
                  <button
                    onClick={() => setPieces((ps) => ps.filter((x) => x.id !== p.id))}
                    className="text-[12px] cursor-pointer hover:text-red-400 transition-colors"
                    style={{ color: "hsl(0 0% 40%)", background: "none", border: "none", padding: 0 }}
                    title="Remover peça"
                  >
                    ×
                  </button>
                </div>
              ))}
              {pieces.length === 0 && (
                <div className="text-center text-[11px] py-6" style={{ color: "hsl(0 0% 35%)" }}>
                  Nenhuma peça adicionada
                </div>
              )}
            </div>
          </div>
        </SidebarSection>

        {/* ─── SECTION 3: Execução ─── */}
        <SidebarSection title="Execução" icon="🚀" defaultOpen={true}>
          <div className="p-3" style={{ background: "hsl(0 0% 10%)" }}>
            <div className="mb-3">
              <label
                className="text-[9px] uppercase tracking-wider font-bold block mb-1"
                style={{ color: "hsl(0 0% 50%)" }}
              >
                IDs Prioritários
              </label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={priorityIds}
                  onChange={(e) => setPriorityIds(e.target.value)}
                  className="cnc-input flex-1"
                  placeholder="Ex: A1, A2, B3"
                  style={{ fontSize: "10px" }}
                />
                <button
                  onClick={() => {
                    const labels = priorityIds
                      .split(",")
                      .map((s) => s.trim().toUpperCase())
                      .filter(Boolean);
                    if (labels.length === 0) {
                      setStatus({ msg: "Preencha os IDs prioritários primeiro!", type: "error" });
                      return;
                    }
                    const toRemove: number[] = [];
                    chapas.forEach((chapa, idx) => {
                      const usedPieces = extractUsedPiecesWithContext(chapa.tree);
                      const hasAny = usedPieces.some((p) => p.label && labels.includes(p.label.toUpperCase()));
                      if (!hasAny) toRemove.push(idx);
                    });
                    if (toRemove.length === 0) {
                      setStatus({ msg: "Todos os layouts já contêm IDs prioritários.", type: "success" });
                      return;
                    }
                    setChapas((prev) => prev.filter((_, idx) => !toRemove.includes(idx)));
                    if (activeChapa >= chapas.length - toRemove.length) setActiveChapa(0);
                    setStatus({
                      msg: `🗑️ ${toRemove.length} layout(s) sem IDs prioritários removido(s).`,
                      type: "success",
                    });
                  }}
                  className="cnc-btn text-[8px] px-2 whitespace-nowrap"
                  title="Remover layouts que NÃO contêm os IDs listados"
                  style={{ background: "hsl(0 70% 40%)", color: "white", fontSize: "9px" }}
                >
                  🗑️ Filtrar
                </button>
              </div>
              <div style={{ fontSize: "8px", color: "hsl(0 0% 45%)", marginTop: "3px" }}>
                Separe por vírgula. Peças priorizadas ficam nas primeiras chapas. Botão remove chapas sem esses IDs.
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label
                  className="text-[9px] uppercase tracking-wider font-bold block mb-1"
                  style={{ color: "hsl(0 0% 50%)" }}
                >
                  População
                </label>
                <input
                  type="number"
                  value={gaPopSize}
                  onChange={(e) => setGaPopSize(Math.max(10, parseInt(e.target.value) || 10))}
                  className="cnc-input w-full"
                  min={10}
                  style={{ fontSize: "10px" }}
                />
              </div>
              <div className="flex-1">
                <label
                  className="text-[9px] uppercase tracking-wider font-bold block mb-1"
                  style={{ color: "hsl(0 0% 50%)" }}
                >
                  Gerações
                </label>
                <input
                  type="number"
                  value={gaGens}
                  onChange={(e) => setGaGens(Math.max(0, parseInt(e.target.value) || 0))}
                  className="cnc-input w-full"
                  min={0}
                  style={{ fontSize: "10px" }}
                />
              </div>
            </div>
            <button className="cnc-btn-primary w-full mb-2" onClick={optimize} disabled={isOptimizing}>
              ⚡ OTIMIZAR (1 CHAPA)
            </button>
            <button
              className="cnc-btn-primary w-full"
              onClick={optimizeAllSheets}
              disabled={isOptimizing}
              style={{ background: "hsl(240 100% 50%)" }}
            >
              📋 OTIMIZAR TODAS AS CHAPAS
            </button>

            {/* Progress bar */}
            {progress && (
              <div
                className="mt-3 p-2 rounded"
                style={{ background: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 25%)" }}
              >
                <div className="text-[10px] font-bold mb-1" style={{ color: "hsl(45 100% 60%)" }}>
                  {progress.phase}
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "hsl(0 0% 20%)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-150"
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                      background: "linear-gradient(90deg, hsl(200 80% 50%), hsl(160 80% 50%))",
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px]" style={{ color: "hsl(0 0% 50%)" }}>
                    {progress.current}/{progress.total}
                  </span>
                  {progress.bestUtil !== undefined && (
                    <span className="text-[9px] font-bold" style={{ color: "hsl(120 70% 55%)" }}>
                      Melhor: {progress.bestUtil.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {layoutGroups.length > 0 && chapas.some((c) => !c.manual) && (
              <button
                className="cnc-btn-success w-full mt-2"
                style={{ padding: "10px", fontSize: "12px", fontWeight: "bold" }}
                onClick={confirmAutoPlan}
              >
                ✅ CONFIRMAR PLANO (ATUALIZAR INVENTÁRIO)
              </button>
            )}

            {layoutGroups.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-bold px-1">Nome do PDF</label>
                  <input
                    type="text"
                    className="cnc-input bg-zinc-900 border-zinc-800 text-zinc-300 h-9"
                    value={pdfFilename}
                    onChange={(e) => setPdfFilename(e.target.value)}
                    placeholder="Nome do arquivo..."
                  />
                </div>
                <button
                  className="cnc-btn-success w-full"
                  style={{ background: "hsl(211 60% 35%)", border: "1px solid hsl(211 60% 45%)", padding: "12px", fontSize: "14px", fontWeight: "bold" }}
                  onClick={() => {
                    // Export PDF
                    exportPdf({
                      chapas,
                      layoutGroups,
                      chapaW,
                      chapaH,
                      usableW,
                      usableH,
                      ml,
                      mr,
                      mt,
                      mb,
                      utilization,
                      filename: pdfFilename,
                    });
                    // Export Excel
                    exportLayoutsToExcel(layoutGroups, pdfFilename);
                  }}
                >
                  📥 EXPORTAR ARQUIVOS
                </button>
              </div>
            )}

            {/* Layout summary */}
            {layoutGroups.length > 0 && (
              <div
                className="mt-3 p-2 rounded"
                style={{ background: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 18%)" }}
              >
                <div className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: "hsl(0 0% 50%)" }}>
                  Resumo dos Layouts
                </div>
                <div className="text-[11px] mb-2" style={{ color: "hsl(0 0% 70%)" }}>
                  {chapas.length} chapa(s) total • {layoutGroups.length} layout(s) único(s)
                </div>
                {layoutGroups.map((group, gIdx) => {
                  const util = usableW > 0 && usableH > 0 ? (group.usedArea / (usableW * usableH)) * 100 : 0;
                  return (
                    <div key={gIdx} className="flex items-center gap-1 mb-1">
                      <button
                        className="flex-1 flex items-center justify-between p-2 rounded cursor-pointer transition-all text-left"
                        style={{
                          background: group.indices.includes(activeChapa) ? "hsl(211 60% 25%)" : "hsl(0 0% 12%)",
                          border: `1px solid ${group.indices.includes(activeChapa) ? "hsl(211 60% 40%)" : "hsl(0 0% 20%)"}`,
                        }}
                        onClick={() => {
                          const idx = group.indices[0];
                          setActiveChapa(idx);
                          setTree(chapas[idx].tree);
                          setSelectedId("root");
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold" style={{ color: "white" }}>
                            Layout {gIdx + 1}
                          </span>
                          {group.count > 1 && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: "hsl(30 100% 45%)", color: "white" }}
                            >
                              ×{group.count}
                            </span>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-semibold"
                          style={{
                            color: util > 80 ? "hsl(120 70% 55%)" : util > 50 ? "hsl(45 80% 55%)" : "hsl(0 60% 55%)",
                          }}
                        >
                          {util.toFixed(1)}%
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLayout(gIdx);
                        }}
                        className="p-1.5 rounded transition-colors cursor-pointer"
                        style={{ background: "hsl(0 50% 25%)", border: "1px solid hsl(0 40% 35%)" }}
                        title={`Excluir layout ${gIdx + 1} (×${group.count}) e devolver peças ao inventário`}
                      >
                        <span className="text-[10px]">🗑️</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SidebarSection>

        {/* ─── SECTION 4: Estrutura de Corte (advanced) ─── */}
        <SidebarSection title="Estrutura de Corte" icon="🌳" defaultOpen={false}>
          <div className="max-h-[200px] overflow-y-auto p-2 cnc-scroll" style={{ background: "hsl(0 0% 4%)" }}>
            {renderActionTree(tree)}
            {tree.filhos.length === 0 && (
              <div className="text-center text-[11px] py-4" style={{ color: "hsl(0 0% 35%)" }}>
                Nenhum nó na árvore
              </div>
            )}
          </div>
        </SidebarSection>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col" style={{ background: "hsl(0 0% 0%)" }}>
        <SheetViewer
          chapas={editingExistingChapa && chapas.length > 0 ? chapas : [{ tree, usedArea: calcPlacedArea(tree) }]}
          activeIndex={editingExistingChapa && chapas.length > 0 ? activeChapa : 0}
          onSelectSheet={(idx) => {
            setActiveChapa(idx);
            if (chapas[idx]) {
              setTree(chapas[idx].tree);
              setSelectedId("root");
              setEditingExistingChapa(true);
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

        <div
          className="flex flex-col p-2 px-4"
          style={{ height: "auto", minHeight: 80, background: "hsl(0 0% 13%)", borderTop: "4px solid hsl(0 0% 20%)" }}
        >
          <div
            className="text-xs font-bold h-5 mb-1"
            style={{
              color:
                status.type === "error"
                  ? "hsl(0 73% 63%)"
                  : status.type === "success"
                    ? "hsl(134 53% 40%)"
                    : "hsl(40 100% 50%)",
            }}
          >
            Status: {status.msg}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={cmdInputRef}
                type="text"
                autoFocus
                autoComplete="off"
                value={cmdInput}
                onChange={(e) => {
                  setCmdInput(e.target.value);
                  setShowSuggestions(true);
                  setSelectedSuggestionIdx(-1);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="X, Y, Z, W, Q ou U (UNDO). Ex: X100 Y200 Z50 W30 Q15"
                className="cnc-command-input w-full"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (selectedSuggestionIdx >= 0 && filteredSuggestions[selectedSuggestionIdx]) {
                      applySuggestion(filteredSuggestions[selectedSuggestionIdx]);
                    } else {
                      const typed = cmdInput.trim().toUpperCase();
                      const lookAhead = filteredSuggestions.find((s) => s.kind === "lookahead");
                      processCommand(typed);
                      setCmdInput("");
                      setShowSuggestions(true);
                    }
                    setSelectedSuggestionIdx(-1);
                    e.preventDefault();
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedSuggestionIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedSuggestionIdx((i) => Math.max(i - 1, -1));
                  } else if (e.key === "Escape") {
                    setShowSuggestions(false);
                  } else if (e.key === "Tab" && filteredSuggestions.length > 0) {
                    e.preventDefault();
                    const idx = selectedSuggestionIdx >= 0 ? selectedSuggestionIdx : 0;
                    if (filteredSuggestions[idx]) {
                      setCmdInput(filteredSuggestions[idx].cmd);
                      setSelectedSuggestionIdx(idx);
                    }
                  }
                }}
              />
              {/* Suggestions dropdown */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 max-h-[240px] overflow-y-auto rounded cnc-scroll"
                  style={{
                    background: "hsl(0 0% 8%)",
                    border: "1px solid hsl(0 0% 25%)",
                    boxShadow: "0 -4px 20px hsla(0 0% 0% / 0.5)",
                    zIndex: 1000,
                  }}
                >
                  <div
                    className="px-2 py-1 text-[8px] uppercase tracking-wider font-bold"
                    style={{ color: "hsl(0 0% 40%)", borderBottom: "1px solid hsl(0 0% 18%)" }}
                  >
                    Sugestões do inventário ({filteredSuggestions.length})
                  </div>
                  {filteredSuggestions.map((s, i) => (
                    <div
                      key={s.cmd + i}
                      className="flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors"
                      style={{
                        background: i === selectedSuggestionIdx ? "hsl(211 60% 25%)" : "transparent",
                        borderBottom: "1px solid hsl(0 0% 12%)",
                      }}
                      onMouseEnter={() => setSelectedSuggestionIdx(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applySuggestion(s);
                      }}
                    >
                      <span className="text-[12px] font-bold font-mono" style={{ color: "hsl(120 80% 60%)" }}>
                        {s.cmd}
                      </span>
                      <span className="text-[10px] ml-2" style={{ color: "hsl(0 0% 55%)" }}>
                        {s.desc}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => saveLayout(replicationInfo?.count || 1)}
              className="cnc-btn-secondary text-[10px] px-3 whitespace-nowrap"
              style={{ background: "hsl(120 60% 25%)", fontWeight: "bold" }}
              title="Salvar layout atual na lista de chapas e deduzir peças do inventário"
            >
              💾 SALVAR LAYOUT
            </button>
            <button
              onClick={() => {
                setTree(createRoot(usableW, usableH));
                setSelectedId("root");
                setEditingExistingChapa(false);
                setReplicationInfo(null);
              }}
              className="cnc-btn-secondary text-[10px] px-3 whitespace-nowrap"
              style={{ background: "hsl(0 50% 30%)", fontWeight: "bold" }}
              title="Limpar a chapa atual e começar um novo layout do zero"
            >
              🧹 LIMPAR
            </button>
            <button
              onClick={calcReplication}
              className="cnc-btn-secondary text-[10px] px-3 whitespace-nowrap"
              style={{ background: "hsl(270 60% 35%)", fontWeight: "bold" }}
              title="Calcular quantas vezes o layout atual pode ser repetido com o inventário disponível"
            >
              🔄 REPETIÇÕES
            </button>
          </div>

          {/* Replication info */}
          {replicationInfo && (
            <div
              className="mt-2 p-2 rounded text-[10px]"
              style={{ background: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 25%)" }}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold uppercase tracking-wider" style={{ color: "hsl(0 0% 50%)" }}>
                  Repetições possíveis
                </span>
                <span
                  className="text-[14px] font-bold"
                  style={{ color: replicationInfo.count > 0 ? "hsl(120 70% 55%)" : "hsl(0 70% 55%)" }}
                >
                  ×{replicationInfo.count}
                </span>
                <button
                  onClick={() => setReplicationInfo(null)}
                  className="text-[10px] cursor-pointer"
                  style={{ color: "hsl(0 0% 40%)", background: "none", border: "none" }}
                >
                  ✕
                </button>
              </div>
              <div className="flex gap-2 mb-2 items-center">
                <span style={{ color: "hsl(0 0% 60%)" }}>Salvar</span>
                <input
                  type="number"
                  min={1}
                  max={replicationInfo.count}
                  defaultValue={replicationInfo.count}
                  id="saveRepCount"
                  className="cnc-input w-14 text-center"
                />
                <span style={{ color: "hsl(0 0% 60%)" }}>cópias</span>
                <button
                  onClick={() => {
                    const val = parseInt((document.getElementById("saveRepCount") as HTMLInputElement)?.value || "1");
                    saveLayout(Math.max(1, Math.min(val, replicationInfo?.count || 1)));
                  }}
                  className="cnc-btn-secondary flex-1 text-[10px]"
                  style={{ background: "hsl(120 60% 25%)", fontWeight: "bold" }}
                >
                  💾 SALVAR ×{replicationInfo.count}
                </button>
              </div>
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "hsl(0 0% 45%)", fontSize: "8px" }}>
                    <th className="text-left py-0.5">Peça</th>
                    <th className="text-center py-0.5">Precisa</th>
                    <th className="text-center py-0.5">Disponível</th>
                    <th className="text-center py-0.5">Máx Rep.</th>
                  </tr>
                </thead>
                <tbody>
                  {replicationInfo.bom.map((item, i) => {
                    const maxRep = Math.floor(item.available / item.need);
                    return (
                      <tr key={i} style={{ color: "hsl(0 0% 70%)", borderTop: "1px solid hsl(0 0% 15%)" }}>
                        <td className="py-0.5">
                          {item.w}×{item.h}
                        </td>
                        <td className="text-center py-0.5">{item.need}</td>
                        <td className="text-center py-0.5">{item.available}</td>
                        <td
                          className="text-center py-0.5 font-bold"
                          style={{ color: maxRep > 0 ? "hsl(120 60% 50%)" : "hsl(0 60% 50%)" }}
                        >
                          {maxRep}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
