import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  TreeNode,
  PieceItem,
  OptimizationProgress,
  Lot,
  LotPieceEntry,
  createRoot,
  cloneTree,
  findNode,
  findParentOfType,
  insertNode,
  deleteNode,
  calcAllocation,
  calcPlacedArea,
  calcPlanUtilization,
  getLastLeftover,
  optimizeGeneticV1,
  optimizeGeneticAsync,
} from "@/lib/cnc-engine";
import { groupIdenticalLayouts, LayoutGroup } from "@/lib/export/layout-utils";
import { exportPdf } from "@/lib/export/pdf-export";
import { exportLayoutsToExcel } from "@/lib/export/excel-export";
import SheetViewer from "@/components/SheetViewer";
import SidebarSection from "@/components/SidebarSection";
import SheetSetupPanel from "@/features/sheet-setup/SheetSetupPanel";
import PieceListSection from "@/features/piece-list/PieceListSection";
import OptimizationPanel from "@/features/optimization/OptimizationPanel";
import LotsSection from "@/features/lots/LotsSection";
import CommandBar from "@/features/command-bar/CommandBar";

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
  const [chapas, setChapas] = useState<Array<{ tree: TreeNode; usedArea: number; manual?: boolean; deductions?: Array<{ id: string; qty: number }> }>>([]);
  const [activeChapa, setActiveChapa] = useState(0);
  const [progress, setProgress] = useState<OptimizationProgress | null>(null);
  const [globalProgress, setGlobalProgress] = useState<{ current: number; total: number } | null>(null);
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
  const [optimizationGroups, setOptimizationGroups] = useState<Array<{ label: string; chapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean; deductions?: Array<{ id: string; qty: number }> }> }> | null>(null);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [pieceFilter, setPieceFilter] = useState("");
  const [cmdInput, setCmdInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [lots, setLots] = useState<Lot[]>([]);
  const [expandedLotId, setExpandedLotId] = useState<string | null>(null);
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

  

  // ─── Actions ───
  const applySetup = useCallback(() => {
    setTree(createRoot(usableW, usableH));
    setSelectedId("root");
    setChapas([]);
    setFilterActiveLabels(null);
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
      if (isNaN(valor) || !["X", "Y", "Z", "W", "Q", "R"].includes(tipo)) return;

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
    (node: TreeNode, requireLabel = true): Array<{ w: number; h: number; label?: string }> => {
      const used: Array<{ w: number; h: number; label?: string }> = [];
      const traverse = (n: TreeNode, parents: TreeNode[], parentMultiplier: number) => {
        const xAncestor = parents.find((p) => p.tipo === "X");
        const yAncestor = parents.find((p) => p.tipo === "Y");
        const zAncestor = parents.find((p) => p.tipo === "Z");
        const wAncestor = parents.find((p) => p.tipo === "W");
        let pieceW = 0,
          pieceH = 0,
          isLeaf = false;

        // Cumulative multiplier: parent chain × this node's own multi
        const totalMulti = parentMultiplier * n.multi;

        if (n.tipo === "Y" && n.filhos.length === 0) {
          pieceW = xAncestor?.valor || 0;
          pieceH = n.valor;
          isLeaf = true;
        } else if (n.tipo === "Z" && n.filhos.length === 0) {
          pieceW = n.valor;
          pieceH = yAncestor?.valor || 0;
          isLeaf = true;
        } else if (n.tipo === "W" && n.filhos.length === 0) {
          pieceW = zAncestor?.valor || 0;
          pieceH = n.valor;
          isLeaf = true;
        } else if (n.tipo === "Q" && n.filhos.length === 0) {
          pieceW = n.valor;
          pieceH = wAncestor?.valor || 0;
          isLeaf = true;
        } else if (n.tipo === "R") {
          const qAncestor = parents.find((p) => p.tipo === "Q");
          pieceW = qAncestor?.valor || 0;
          pieceH = n.valor;
          isLeaf = true;
        }

        if (isLeaf && pieceW > 0 && pieceH > 0 && (!requireLabel || n.label)) {
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

    const runAllSheets = async (sortFn?: (a: PieceItem, b: PieceItem) => number, label?: string) => {
      const chapaList: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }> = [];
      const hasPriority = pieces.some((p) => p.priority);
      const remaining = (hasPriority ? pieces.filter((p) => p.priority) : pieces).map((p) => ({ ...p }));
      if (sortFn) remaining.sort(sortFn);
      let sheetCount = 0;
      const totalPieces = remaining.reduce((sum, p) => sum + Math.max(p.qty, 1), 0);
      const maxSheets = Math.max(100, totalPieces * 2);

      while (remaining.length > 0 && sheetCount < maxSheets) {
        sheetCount++;

        // Build inv with a unique label per instance so every piece is trackable in the tree.
        // uidToRef maps uid → the remaining item it came from (by reference, not index).
        // uidToOrig maps uid → original user label, restored before display/export.
        const inv: { w: number; h: number; area: number; label?: string }[] = [];
        const uidToRef = new Map<string, typeof remaining[0]>();
        const uidToOrig = new Map<string, string | undefined>();
        let uidSeq = 0;
        remaining.forEach((p) => {
          for (let i = 0; i < p.qty; i++) {
            if (p.w > 0 && p.h > 0) {
              const uid = `__${uidSeq++}`;
              inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: uid });
              uidToRef.set(uid, p);
              uidToOrig.set(uid, p.label);
            }
          }
        });
        if (inv.length === 0) break;

        setProgress({
          phase: `Chapa ${sheetCount} (${label ?? "padrão"})`,
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

        // Extract before restoring labels so we still have uid labels for exact deduction.
        const usedPieces = extractUsedPiecesWithContext(result);
        if (usedPieces.length === 0) break;

        // Build per-item deduction map keyed by PieceItem.id (not UID) for confirmAutoPlan.
        const firstSheetDeductMap = new Map<string, number>();
        usedPieces.forEach((used) => {
          if (used.label) {
            const item = uidToRef.get(used.label);
            if (item) firstSheetDeductMap.set(item.id, (firstSheetDeductMap.get(item.id) || 0) + 1);
          }
        });
        const firstDeductions = Array.from(firstSheetDeductMap.entries()).map(([id, qty]) => ({ id, qty }));

        // Restore original user labels in the tree (uid labels are internal only).
        const restoreLabels = (n: TreeNode) => {
          if (n.label && uidToOrig.has(n.label)) n.label = uidToOrig.get(n.label);
          n.filhos.forEach(restoreLabels);
        };
        restoreLabels(result);

        chapaList.push({ tree: result, usedArea, manual: false, deductions: firstDeductions });

        // --- Layout Replication Optimization ---
        // Build BOM by dimensions (replications don't need unique labels).
        const layoutBOM = new Map<string, { w: number; h: number; count: number }>();
        usedPieces.forEach((used) => {
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
          let available = 0;
          remaining.forEach((p) => {
            if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) {
              available += p.qty;
            }
          });
          const additionalAvailable = available - count;
          const possibleCopies = Math.floor(additionalAvailable / count);
          maxReplications = Math.min(maxReplications, possibleCopies);
        });

        if (!isFinite(maxReplications) || maxReplications < 0) maxReplications = 0;
        maxReplications = Math.min(maxReplications, maxSheets - chapaList.length);

        // Deduct first sheet by exact reference via uid (no dimension ambiguity).
        usedPieces.forEach((used) => {
          if (used.label) {
            const item = uidToRef.get(used.label);
            if (item) {
              item.qty--;
              if (item.qty <= 0) {
                const idx = remaining.indexOf(item);
                if (idx >= 0) remaining.splice(idx, 1);
              }
            }
          }
        });

        // Replicate the layout for additional copies
        if (maxReplications > 0) {
          for (let rep = 0; rep < maxReplications; rep++) {
            const repDeductMap = new Map<string, number>();
            layoutBOM.forEach(({ w, h, count }) => {
              let toDeduct = count;
              for (let i = 0; i < remaining.length && toDeduct > 0; i++) {
                const p = remaining[i];
                if ((p.w === w && p.h === h) || (p.w === h && p.h === w)) {
                  const deducted = Math.min(toDeduct, p.qty);
                  p.qty -= deducted;
                  toDeduct -= deducted;
                  if (deducted > 0) repDeductMap.set(p.id, (repDeductMap.get(p.id) || 0) + deducted);
                  if (p.qty <= 0) { remaining.splice(i, 1); i--; }
                }
              }
            });
            const repDeductions = Array.from(repDeductMap.entries()).map(([id, qty]) => ({ id, qty }));
            chapaList.push({ tree: cloneTree(result), usedArea, manual: false, deductions: repDeductions });
          }
          sheetCount += maxReplications;
        }
      }

      return chapaList;
    };

    await new Promise((r) => setTimeout(r, 20));

    // Each entry: [sortFn, label] — different piece orderings to explore the multi-sheet space
    const sortVariants: Array<[(a: PieceItem, b: PieceItem) => number, string] | [undefined, string]> = [
      [undefined, "ordem original"],
      [(a, b) => (b.w * b.h) - (a.w * a.h), "área desc"],
      [(a, b) => (a.w * a.h) - (b.w * b.h), "área asc"],
      [(a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h), "maior dim desc"],
      [(a, b) => (b.w + b.h) - (a.w + a.h), "perímetro desc"],
      [(a, b) => b.h - a.h, "altura desc"],
    ];

    const candidateGroups: Array<{ label: string; chapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }> }> = [];
    setGlobalProgress({ current: 0, total: sortVariants.length });
    for (let vi = 0; vi < sortVariants.length; vi++) {
      const [sortFn, label] = sortVariants[vi];
      setProgress({
        phase: `Testando variante ${vi + 1}/${sortVariants.length}: ${label}...`,
        current: vi,
        total: sortVariants.length,
      });
      const result = await runAllSheets(sortFn ?? undefined, label);
      if (result && result.length > 0) candidateGroups.push({ label, chapas: result });
      setGlobalProgress({ current: vi + 1, total: sortVariants.length });
    }

    const sheetArea = usableW * usableH;
    const treeFingerprint = (node: TreeNode): string =>
      `${node.tipo}:${node.valor}:${node.multi}[${node.filhos.map(treeFingerprint).join(',')}]`;
    const uniqueLayoutCount = (chapas: typeof candidateGroups[0]['chapas']) =>
      new Set(chapas.map(c => treeFingerprint(c.tree))).size;

    // Find the best group index by criteria: 1) fewer sheets, 2) fewer unique layouts, 3) lower last-sheet utilization
    let bestIdx = 0;
    for (let i = 1; i < candidateGroups.length; i++) {
      const a = candidateGroups[bestIdx].chapas;
      const b = candidateGroups[i].chapas;
      if (b.length < a.length) { bestIdx = i; continue; }
      if (b.length > a.length) continue;
      const uA = uniqueLayoutCount(a), uB = uniqueLayoutCount(b);
      if (uB < uA) { bestIdx = i; continue; }
      if (uB > uA) continue;
      const lastUtilA = a[a.length - 1].usedArea / sheetArea;
      const lastUtilB = b[b.length - 1].usedArea / sheetArea;
      if (lastUtilB < lastUtilA) bestIdx = i;
    }

    const best = candidateGroups[bestIdx]?.chapas || [];
    setOptimizationGroups(candidateGroups);
    setActiveGroupIdx(bestIdx);
    setChapas(best);
    setFilterActiveLabels(null);
    if (best.length > 0) {
      setTree(best[0].tree);
      setSelectedId("root");
    }
    setActiveChapa(0);
    setProgress(null);
    setGlobalProgress(null);
    setIsOptimizing(false);
    setStatus({ msg: `✅ ${best.length} chapa(s) gerada(s)! Grupo ${bestIdx + 1} selecionado automaticamente.`, type: "success" });
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

  // Global plan utilization — uses the aproveitamento.md formula when a plan
  // with multiple chapas exists; falls back to simple per-sheet calculation
  // while the user is still building a layout manually.
  const utilization = useMemo(() => {
    if (usableW <= 0 || usableH <= 0) return 0;
    if (chapas.length > 0) {
      return calcPlanUtilization(chapas, usableW, usableH);
    }
    // Editing mode (no confirmed chapas): simple ratio for the current tree
    return (calcPlacedArea(tree) / (usableW * usableH)) * 100;
  }, [chapas, tree, usableW, usableH]);

  // Last leftover of the last chapa — used for display in the UI
  const lastLeftoverInfo = useMemo(() => {
    if (chapas.length === 0) return null;
    return getLastLeftover(chapas[chapas.length - 1].tree, usableW, usableH);
  }, [chapas, usableW, usableH]);

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
    if (selected.tipo === "Q" || findParentOfType(tree, selectedId, "Q")) {
      const wNode = findParentOfType(tree, selectedId, "W");
      if (wNode) {
        uniquePieces.forEach(({ w, h, label }) => {
          if (w === selected.valor || (selected.tipo !== "Q" && findParentOfType(tree, selectedId, "Q"))) {
            const qNode = selected.tipo === "Q" ? selected : findParentOfType(tree, selectedId, "Q");
            if (qNode) {
              if (w === qNode.valor) {
                addSuggestion("R", h, `Sub-R ${h}mm → peça ${w}×${h}${label ? ` (${label})` : ""}`);
              }
              if (h === qNode.valor) {
                addSuggestion("R", w, `Sub-R ${w}mm → peça ${h}×${w} (rot.)${label ? ` (${label})` : ""}`);
              }
            }
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
    const m = upper.match(/^(?:M\d+)?([XYZWQRR])(\d+)$/);
    if (m) {
      const tipo = m[1];
      const valor = Number(m[2]);
      const lookAhead: CommandSuggestion[] = [];
      const seenLA = new Set<string>();

      // Hierarchy: X→Y, Y→Z, Z→W, W→Q
      const nextTipoMap: Record<string, string> = { X: "Y", Y: "Z", Z: "W", W: "Q", Q: "R" };
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
      if (suggestion.kind === "lookahead" && /^(?:M\d+)?[XYZWQRR]\d+$/.test(typed) && typed !== suggestion.cmd) {
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
    const usedPieces = extractUsedPiecesWithContext(tree, false);
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

  // Confirm auto plan: deduct pieces from inventory, mark chapas as confirmed, and create a lot
  const confirmAutoPlan = useCallback(() => {
    const autoChapas = chapas.filter((c) => !c.manual);
    if (autoChapas.length === 0) {
      setStatus({ msg: "Nenhuma chapa automática para confirmar.", type: "error" });
      return;
    }

    // Collect all used pieces for this lot
    const allUsedPieces: Array<{ w: number; h: number; label?: string }> = [];
    const updatedPieces = pieces.map((p) => ({ ...p }));
    autoChapas.forEach((chapa) => {
      // Always extract for lot summary (uses restored labels for display).
      const usedPieces = extractUsedPiecesWithContext(chapa.tree, false);
      allUsedPieces.push(...usedPieces);

      if (chapa.deductions && chapa.deductions.length > 0) {
        // Use pre-computed PieceItem.id deductions recorded during runAllSheets.
        // This is exact and immune to label/dimension ambiguity.
        chapa.deductions.forEach(({ id, qty }) => {
          const p = updatedPieces.find((x) => x.id === id);
          if (p) p.qty -= qty;
        });
      } else {
        // Fallback for manual chapas: label+dim match, then dim-only.
        usedPieces.forEach((used) => {
          if (used.label) {
            for (let j = 0; j < updatedPieces.length; j++) {
              const p = updatedPieces[j];
              if (
                p.label === used.label &&
                ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) &&
                p.qty > 0
              ) {
                p.qty--;
                return;
              }
            }
          }
          for (let j = 0; j < updatedPieces.length; j++) {
            const p = updatedPieces[j];
            if ((p.w === used.w && p.h === used.h) || (p.w === used.h && p.h === used.w)) {
              if (p.qty > 0) { p.qty--; break; }
            }
          }
        });
      }
    });

    // Aggregate pieces used into lot summary (keyed by label+dimensions to keep IDs separate)
    const pieceMap = new Map<string, LotPieceEntry>();
    allUsedPieces.forEach((u) => {
      const key = `${u.label || ""}|${u.w}x${u.h}`;
      const existing = pieceMap.get(key);
      if (existing) {
        existing.qty++;
      } else {
        pieceMap.set(key, { w: u.w, h: u.h, qty: 1, label: u.label });
      }
    });

    const sortedPieces = Array.from(pieceMap.values()).sort((a, b) =>
      (a.label || "").localeCompare(b.label || "", undefined, { numeric: true, sensitivity: "base" })
    );

    // Create lot
    const newLot: Lot = {
      id: `lot_${Date.now()}`,
      number: lots.length + 1,
      date: new Date().toISOString(),
      chapas: autoChapas.map((c) => ({ tree: c.tree, usedArea: c.usedArea })),
      piecesUsed: sortedPieces,
      sheetW: chapaW,
      sheetH: chapaH,
      totalSheets: autoChapas.length,
    };
    setLots((prev) => [...prev, newLot]);

    const filteredPieces = updatedPieces.filter((p) => p.qty > 0);
    setPieces(filteredPieces);

    // Mark all auto chapas as confirmed (manual) so they won't be confirmed again
    setChapas((prev) => prev.map((c) => (c.manual ? c : { ...c, manual: true })));

    const remaining = filteredPieces.reduce((s, p) => s + p.qty, 0);
    setStatus({
      msg: `✅ Lote #${newLot.number} criado! ${autoChapas.length} chapa(s) aplicadas ao inventário. ${remaining} peça(s) restante(s).`,
      type: "success",
    });
  }, [chapas, pieces, lots, chapaW, chapaH, extractUsedPiecesWithContext]);

  const selectGroup = useCallback((idx: number) => {
    if (!optimizationGroups || !optimizationGroups[idx]) return;
    const group = optimizationGroups[idx];
    setActiveGroupIdx(idx);
    setChapas(group.chapas);
    setFilterActiveLabels(null);
    if (group.chapas.length > 0) {
      setTree(group.chapas[0].tree);
      setSelectedId("root");
    }
    setActiveChapa(0);
    setStatus({ msg: `Grupo ${idx + 1} selecionado: ${group.label} (${group.chapas.length} chapa(s))`, type: "info" });
  }, [optimizationGroups]);

  const saveLayout = useCallback(
    (reps?: number) => {
      const usedPieces = extractUsedPiecesWithContext(tree, false);
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

  // ─── Lot helpers ───

  const returnLotToInventory = useCallback(
    (lot: Lot) => {
      setPieces((prev) => {
        const updated = prev.map((p) => ({ ...p }));
        lot.piecesUsed.forEach((entry) => {
          // Try to find an existing piece with matching dimensions (either orientation)
          const match = updated.find(
            (p) =>
              (p.w === entry.w && p.h === entry.h) ||
              (p.w === entry.h && p.h === entry.w),
          );
          if (match) {
            match.qty += entry.qty;
          } else {
            updated.push({
              id: `p${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              qty: entry.qty,
              w: entry.w,
              h: entry.h,
              label: entry.label,
            });
          }
        });
        return updated;
      });
      setLots((prev) => prev.filter((l) => l.id !== lot.id));
      if (expandedLotId === lot.id) setExpandedLotId(null);
      const total = lot.piecesUsed.reduce((s, p) => s + p.qty, 0);
      setStatus({
        msg: `↩ Lote #${lot.number} devolvido ao inventário. ${total} peça(s) restaurada(s).`,
        type: "success",
      });
    },
    [expandedLotId],
  );

  const printLayout = useCallback((chapaIdx: number, layoutNum: number, count: number) => {
    const chapa = chapas[chapaIdx];
    if (!chapa) return;

    const T = chapa.tree.transposed || false;
    type PP = { x: number; y: number; w: number; h: number; label?: string; isWaste: boolean; dim: string };
    const pieces: PP[] = [];

    const dLabel = (d1: number, d2: number) =>
      T ? `${Math.round(d2)}×${Math.round(d1)}` : `${Math.round(d1)}×${Math.round(d2)}`;

    let xOff = 0;
    chapa.tree.filhos.forEach((xNode) => {
      for (let ix = 0; ix < xNode.multi; ix++) {
        const cx = xOff;
        let yOff = 0;
        xNode.filhos.forEach((yNode) => {
          for (let iy = 0; iy < yNode.multi; iy++) {
            const cy = yOff;
            // Y leaf: no Z children → full-column piece
            if (yNode.filhos.length === 0) {
              pieces.push({ x: T ? cy : cx, y: T ? cx : cy, w: T ? yNode.valor : xNode.valor, h: T ? xNode.valor : yNode.valor, label: yNode.label, isWaste: false, dim: dLabel(xNode.valor, yNode.valor) });
            }
            let zOff = 0;
            yNode.filhos.forEach((zNode) => {
              for (let iz = 0; iz < zNode.multi; iz++) {
                if (zNode.filhos.length === 0) {
                  pieces.push({ x: T ? cy : cx + zOff, y: T ? cx + zOff : cy, w: T ? yNode.valor : zNode.valor, h: T ? zNode.valor : yNode.valor, label: zNode.label, isWaste: false, dim: dLabel(zNode.valor, yNode.valor) });
                } else {
                  let wOff = 0;
                  zNode.filhos.forEach((wNode) => {
                    for (let iw = 0; iw < wNode.multi; iw++) {
                      if (wNode.filhos.length === 0) {
                        pieces.push({ x: T ? cy + wOff : cx + zOff, y: T ? cx + zOff : cy + wOff, w: T ? wNode.valor : zNode.valor, h: T ? zNode.valor : wNode.valor, label: wNode.label, isWaste: false, dim: dLabel(zNode.valor, wNode.valor) });
                      } else {
                        let qOff = 0;
                        wNode.filhos.forEach((qNode) => {
                          for (let iq = 0; iq < qNode.multi; iq++) {
                            if (qNode.filhos.length === 0) {
                              pieces.push({ x: T ? cy + wOff : cx + zOff + qOff, y: T ? cx + zOff + qOff : cy + wOff, w: T ? wNode.valor : qNode.valor, h: T ? qNode.valor : wNode.valor, label: qNode.label, isWaste: false, dim: dLabel(qNode.valor, wNode.valor) });
                            } else {
                              let rOff = 0;
                              qNode.filhos.forEach((rNode) => {
                                for (let ir = 0; ir < rNode.multi; ir++) {
                                  pieces.push({ x: T ? cy + wOff + rOff : cx + zOff + qOff, y: T ? cx + zOff + qOff : cy + wOff + rOff, w: T ? rNode.valor : qNode.valor, h: T ? qNode.valor : rNode.valor, label: rNode.label, isWaste: false, dim: dLabel(qNode.valor, rNode.valor) });
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

    const SVG_W = 760;
    const sc = SVG_W / chapaW;
    const SVG_H = Math.round(chapaH * sc);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const piecesSvg = pieces.map((p) => {
      const px = (ml + p.x) * sc;
      const py = (chapaH - mb - p.y - p.h) * sc;
      const pw = p.w * sc;
      const ph = p.h * sc;
      if (p.isWaste) {
        const fs = Math.max(7, Math.min(11, Math.min(pw, ph) * 0.12));
        return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#e0e0e0" stroke="#bbb" stroke-width="0.5"/>
<text x="${(px+pw/2).toFixed(1)}" y="${(py+ph/2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#aaa" font-size="${fs}" font-family="Arial">SOBRA</text>`;
      }
      const fs = Math.max(9, Math.min(28, Math.min(pw, ph) * 0.22));
      const idFs = Math.max(8, fs * 0.78);
      const hasId = !!p.label;
      const textCX = (px + pw / 2).toFixed(1);
      const midY = py + ph / 2;
      const dimY = hasId ? (midY + idFs * 0.6).toFixed(1) : midY.toFixed(1);
      const idY = hasId ? (midY - fs * 0.6).toFixed(1) : "";
      return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="white" stroke="#2a2a2a" stroke-width="1.5"/>
${hasId ? `<text x="${textCX}" y="${idY}" text-anchor="middle" dominant-baseline="middle" fill="#0f2d6e" font-size="${idFs.toFixed(1)}" font-weight="bold" font-family="Arial,sans-serif">${esc(p.label!)}</text>` : ""}
<text x="${textCX}" y="${dimY}" text-anchor="middle" dominant-baseline="middle" fill="#1a1a1a" font-size="${fs.toFixed(1)}" font-family="Arial,monospace">${p.dim}</text>`;
    }).join("\n");

    const usableLeft = ml * sc;
    const usableTop = mt * sc;
    const usableW_px = usableW * sc;
    const usableH_px = usableH * sc;
    const pieceCount = pieces.filter((p) => !p.isWaste).length;
    const util = usableW > 0 && usableH > 0 ? ((chapa.usedArea / (usableW * usableH)) * 100).toFixed(1) : "0";
    const utilColor = parseFloat(util) > 80 ? "#16a34a" : parseFloat(util) > 60 ? "#d97706" : "#dc2626";
    const dateStr = new Date().toLocaleString("pt-BR");

    const legendRows = pieces
      .filter((p) => !p.isWaste)
      .reduce<Array<{ id: string; dim: string; qty: number }>>((acc, p) => {
        const key = `${p.label || ""}||${p.dim}`;
        const existing = acc.find((r) => `${r.id}||${r.dim}` === key);
        if (existing) existing.qty++;
        else acc.push({ id: p.label || "—", dim: p.dim, qty: 1 });
        return acc;
      }, []);

    const legendHtml = legendRows.map((r, i) =>
      `<tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"}">
        <td style="padding:5px 10px;font-weight:bold;color:#0f2d6e">${r.id}</td>
        <td style="padding:5px 10px;font-family:monospace">${r.dim} mm</td>
        <td style="padding:5px 10px;text-align:center;font-weight:bold">${r.qty}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Layout ${layoutNum} — Sheet Optimizer</title>
  <style>
    @media print { .no-print { display:none; } body { margin:0; padding:12px; } }
    body { font-family:Arial,sans-serif; color:#111; padding:24px; max-width:900px; margin:0 auto; }
    h1 { font-size:24px; margin:0 0 4px; color:#0f2d6e; letter-spacing:-0.02em; }
    .sub { color:#555; font-size:13px; margin-bottom:16px; }
    .meta { display:flex; flex-wrap:wrap; gap:20px; margin-bottom:20px; padding:12px 16px; background:#f0f4ff; border-radius:8px; border:1px solid #c8d4f0; }
    .meta-item { display:flex; flex-direction:column; }
    .meta-label { font-size:9px; text-transform:uppercase; color:#888; letter-spacing:.06em; margin-bottom:2px; }
    .meta-value { font-size:18px; font-weight:bold; color:#0f2d6e; }
    .sheet-wrap { text-align:center; margin:20px 0; }
    svg { border:2px solid #888; border-radius:4px; background:#ccc; max-width:100%; }
    .sheet-caption { font-size:11px; color:#888; margin-top:6px; }
    h2 { font-size:14px; color:#333; margin:24px 0 8px; border-bottom:1px solid #e5e7eb; padding-bottom:4px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    thead tr { background:#1e3a6e; color:#fff; }
    thead th { padding:7px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.05em; }
    .footer { margin-top:28px; border-top:1px solid #e5e7eb; padding-top:10px; font-size:10px; color:#aaa; }
    .print-btn { background:#1e3a6e; color:white; border:none; padding:10px 24px; font-size:14px; border-radius:6px; cursor:pointer; margin-bottom:16px; }
    .print-btn:hover { background:#2a4e8e; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <h1>Layout ${layoutNum}${count > 1 ? ` <span style="font-size:16px;color:#e67e00;font-weight:600">(×${count} chapas idênticas)</span>` : ""}</h1>
  <div class="sub">Sheet Optimizer Pro — Plano de Corte</div>
  <div class="meta">
    <div class="meta-item"><span class="meta-label">Data / Hora</span><span class="meta-value">${dateStr}</span></div>
    <div class="meta-item"><span class="meta-label">Chapa</span><span class="meta-value">${chapaW} × ${chapaH} mm</span></div>
    <div class="meta-item"><span class="meta-label">Área útil</span><span class="meta-value">${usableW} × ${usableH} mm</span></div>
    <div class="meta-item"><span class="meta-label">Aproveitamento</span><span class="meta-value" style="color:${utilColor}">${util}%</span></div>
    <div class="meta-item"><span class="meta-label">Peças alocadas</span><span class="meta-value">${pieceCount}</span></div>
  </div>
  <div class="sheet-wrap">
    <svg width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
      <rect x="0" y="0" width="${SVG_W}" height="${SVG_H}" fill="#cccccc" stroke="#555" stroke-width="2"/>
      <rect x="${usableLeft.toFixed(1)}" y="${usableTop.toFixed(1)}" width="${usableW_px.toFixed(1)}" height="${usableH_px.toFixed(1)}" fill="#f0f0f0" stroke="#999" stroke-width="1" stroke-dasharray="5,3"/>
      ${piecesSvg}
    </svg>
    <div class="sheet-caption">Chapa ${chapaW}×${chapaH} mm · Margem L${ml} R${mr} T${mt} B${mb} mm · Área útil ${usableW}×${usableH} mm</div>
  </div>
  <h2>Peças neste layout (${pieceCount} no total)</h2>
  <table>
    <thead><tr><th>ID / Referência</th><th>Dimensão</th><th style="text-align:center">Qtd</th></tr></thead>
    <tbody>${legendHtml}</tbody>
  </table>
  <div class="footer">Gerado em ${dateStr} · Sheet Optimizer Pro</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=960,height=800");
    if (win) { win.document.write(html); win.document.close(); }
  }, [chapas, chapaW, chapaH, usableW, usableH, ml, mr, mt, mb]);

  const printLot = useCallback((lot: Lot) => {
    const totalPieces = lot.piecesUsed.reduce((s, p) => s + p.qty, 0);
    const dateStr = new Date(lot.date).toLocaleString("pt-BR");
    const rows = [...lot.piecesUsed]
      .sort((a, b) => (a.label || "").localeCompare(b.label || "", undefined, { numeric: true, sensitivity: "base" }))
      .map(
        (p, i) =>
          `<tr style="border-top:1px solid #e5e7eb;${i % 2 === 0 ? "background:#f9fafb;" : ""}">
            <td style="padding:6px 10px;font-family:monospace">${p.w} × ${p.h} mm</td>
            <td style="padding:6px 10px;text-align:center;font-weight:bold">${p.qty}</td>
            <td style="padding:6px 10px">${p.label || "—"}</td>
          </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Lote #${lot.number} — Sheet Optimizer</title>
  <style>
    @media print { body { margin: 0; } }
    body { font-family: Arial, sans-serif; color: #111; font-size: 13px; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #555; font-size: 12px; margin-bottom: 20px; }
    .meta { display: flex; gap: 32px; margin-bottom: 20px; }
    .meta-item { display: flex; flex-direction: column; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: .05em; }
    .meta-value { font-size: 15px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e293b; color: #fff; }
    thead th { padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing:.05em; }
    .total { margin-top: 16px; text-align: right; font-size: 12px; color: #555; }
    .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 10px; color: #aaa; }
  </style>
</head>
<body>
  <h1>Sheet Optimizer — Lote #${lot.number}</h1>
  <div class="sub">Plano de Corte CNC</div>
  <div class="meta">
    <div class="meta-item"><span class="meta-label">Data / Hora</span><span class="meta-value">${dateStr}</span></div>
    <div class="meta-item"><span class="meta-label">Chapa</span><span class="meta-value">${lot.sheetW} × ${lot.sheetH} mm</span></div>
    <div class="meta-item"><span class="meta-label">Chapas usadas</span><span class="meta-value">${lot.totalSheets}</span></div>
    <div class="meta-item"><span class="meta-label">Total de peças</span><span class="meta-value">${totalPieces}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Dimensão</th>
        <th style="text-align:center">Qtd</th>
        <th>ID / Referência</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">${totalPieces} peça(s) em ${lot.totalSheets} chapa(s)</div>
  <div class="footer">Gerado em ${dateStr} · Sheet Optimizer Pro</div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=800,height=600");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }, []);

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
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {/* SIDEBAR */}
      <div
        className="w-[420px] min-w-[420px] flex flex-col h-screen overflow-y-auto cnc-scroll"
        style={{ background: "white", borderRight: "2px solid hsl(222 47% 22%)" }}
      >
        {/* ─── BRAND HEADER ─── */}
        <div className="cnc-brand-header">
          <div className="cnc-brand-icon">✂</div>
          <div>
            <div className="cnc-brand-title">Sheet Optimizer</div>
            <div className="cnc-brand-sub">CNC Cutting Planner</div>
          </div>
        </div>

        {/* ─── SECTION 1: Setup da Chapa ─── */}
        <SheetSetupPanel
          chapaW={chapaW} setChapaW={setChapaW}
          chapaH={chapaH} setChapaH={setChapaH}
          ml={ml} setMl={setMl}
          mr={mr} setMr={setMr}
          mt={mt} setMt={setMt}
          mb={mb} setMb={setMb}
          minBreak={minBreak} setMinBreak={setMinBreak}
          usableW={usableW} usableH={usableH}
          onApply={applySetup}
        />

        {/* ─── SECTION 2: Lista de Peças ─── */}
        <PieceListSection
          pieces={pieces}
          setPieces={setPieces}
          pieceFilter={pieceFilter}
          setPieceFilter={setPieceFilter}
          totalPieces={totalPieces}
          onImportExcel={handleExcel}
        />

                {/* ─── SECTION 3: Execução ─── */}
        <OptimizationPanel
          priorityIds={priorityIds}
          setPriorityIds={setPriorityIds}
          filterActiveLabels={filterActiveLabels}
          setFilterActiveLabels={setFilterActiveLabels}
          gaPopSize={gaPopSize}
          setGaPopSize={setGaPopSize}
          gaGens={gaGens}
          setGaGens={setGaGens}
          isOptimizing={isOptimizing}
          onOptimize={optimizeAllSheets}
          progress={progress}
          globalProgress={globalProgress}
          layoutGroups={layoutGroups}
          filteredLayoutGroups={filteredLayoutGroups}
          chapas={chapas}
          onConfirmPlan={confirmAutoPlan}
          optimizationGroups={optimizationGroups}
          activeGroupIdx={activeGroupIdx}
          onSelectGroup={selectGroup}
          pdfFilename={pdfFilename}
          setPdfFilename={setPdfFilename}
          onExport={() => {
            exportPdf({ chapas, layoutGroups, chapaW, chapaH, usableW, usableH, ml, mr, mt, mb, utilization, filename: pdfFilename });
            exportLayoutsToExcel(layoutGroups, pdfFilename);
          }}
          activeChapa={activeChapa}
          usableW={usableW}
          usableH={usableH}
          utilization={utilization}
          lastLeftoverInfo={lastLeftoverInfo}
          setStatus={setStatus}
          onSelectLayout={(idx, t) => { setActiveChapa(idx); setTree(t); setSelectedId("root"); }}
          onDeleteLayout={deleteLayout}
          onPrintLayout={printLayout}
        />

                {/* ─── SECTION 4: Estrutura de Corte (advanced) ─── */}
        <SidebarSection title="Estrutura de Corte" icon="🌳" defaultOpen={false}>
          <div className="max-h-[200px] overflow-y-auto p-2 cnc-scroll" style={{ background: "hsl(222 47% 9%)" }}>
            {renderActionTree(tree)}
            {tree.filhos.length === 0 && (
              <div className="text-center text-[11px] py-4" style={{ color: "hsl(210 25% 52%)" }}>
                Nenhum nó na árvore
              </div>
            )}
          </div>
        </SidebarSection>

        {/* ─── SECTION 5: Lotes ─── */}
        <LotsSection
          lots={lots}
          setLots={setLots}
          expandedLotId={expandedLotId}
          setExpandedLotId={setExpandedLotId}
          onPrint={printLot}
          onReturn={returnLotToInventory}
        />
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col" style={{ background: "hsl(210 25% 95%)" }}>
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

        <CommandBar
          status={status}
          cmdInput={cmdInput}
          setCmdInput={setCmdInput}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          selectedSuggestionIdx={selectedSuggestionIdx}
          setSelectedSuggestionIdx={setSelectedSuggestionIdx}
          filteredSuggestions={filteredSuggestions}
          applySuggestion={applySuggestion}
          processCommand={processCommand}
          replicationInfo={replicationInfo}
          setReplicationInfo={setReplicationInfo}
          onSaveLayout={saveLayout}
          onClear={() => {
            setTree(createRoot(usableW, usableH));
            setSelectedId("root");
            setEditingExistingChapa(false);
            setReplicationInfo(null);
          }}
          onCalcReplication={calcReplication}
          usableW={usableW}
          usableH={usableH}
          setTree={setTree}
          setSelectedId={setSelectedId}
          setEditingExistingChapa={setEditingExistingChapa}
          cmdInputRef={cmdInputRef}
        />
      </div>
    </div>
  );
};

export default Index;

