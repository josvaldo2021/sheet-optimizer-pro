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
  previewRemoval,
  getLastLeftover,
  extractLeafPieces,
  consolidateColumns,
  consolidateColumnsX,
  collapseRedundantCuts,
  normalizeTree,
  optimizeGeneticV1,
  optimizeGeneticAsync,
  optimizeV6,
} from "@/lib/cnc-engine";
import { runPlacement } from "@/lib/engine/placement";
import {
  selectByRepetition,
  homogeneousCandidates,
  bestAreaCandidate,
  type BomEntry,
} from "@/lib/pattern-repetition";
import { groupIdenticalLayouts, LayoutGroup } from "@/lib/export/layout-utils";
import { isOfReport, parseOfReport } from "@/lib/import/of-report";
import { selectedAutoChapas, applyDeductions, countAuto, countSelectedAuto, isSelectedAuto } from "@/lib/lots/lot-selection";
import { buildLayoutBom, maxRepetitions, allocateDeductions, effectiveInventory, partitionByPreserved, needsReplan } from "@/lib/lots/layout-replication";
import { pickDedicatedForSheet, dedicatedSheetInvKey, isDedicated, requiresDedicatedSheet } from "@/lib/unique-per-sheet";
import { buildJumboSheet } from "@/lib/jumbo-sheet";
import { exportPdf } from "@/lib/export/pdf-export";
import { restorePiecesToInventory } from "@/lib/inventory-utils";
import { printLayout } from "@/lib/export/print-layout";
import SheetViewer from "@/components/SheetViewer";
import SidebarSection from "@/components/SidebarSection";
import SheetSetupPanel from "@/features/sheet-setup/SheetSetupPanel";
import PieceListSection from "@/features/piece-list/PieceListSection";
import OptimizationPanel from "@/features/optimization/OptimizationPanel";
import LotsSection from "@/features/lots/LotsSection";
import CommandBar from "@/features/command-bar/CommandBar";

type CommandSuggestion = { cmd: string; label: string; desc: string; kind?: "direct" | "lookahead" };

function findParentNode(n: TreeNode, id: string): TreeNode | null {
  for (const f of n.filhos) {
    if (f.id === id) return n;
    const r = findParentNode(f, id);
    if (r) return r;
  }
  return null;
}

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
  const [chapas, setChapas] = useState<Array<{ tree: TreeNode; usedArea: number; manual?: boolean; saved?: boolean; selected?: boolean; deductions?: Array<{ id: string; qty: number }> }>>([]);
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
  // Spec 006 — priorizar repetição de padrão no plano multi-chapa.
  const [prioritizeRepetition, setPrioritizeRepetition] = useState(false);
  const [utilizationFloor, setUtilizationFloor] = useState(0.85);
  const [patternSummary, setPatternSummary] = useState<{
    distinctPatterns: number;
    perPattern: Array<{ label: string; sheets: number; util: number }>;
    floorReached: boolean;
  } | null>(null);
  const [pdfFilename, setPdfFilename] = useState("plano-de-corte");
  const [optimizationGroups, setOptimizationGroups] = useState<Array<{ label: string; chapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean; deductions?: Array<{ id: string; qty: number }> }> }> | null>(null);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [pieceFilter, setPieceFilter] = useState("");
  const [cmdInput, setCmdInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [lots, setLots] = useState<Lot[]>([]);
  const [expandedLotId, setExpandedLotId] = useState<string | null>(null);
  // Visualização somente-leitura dos layouts de um lote no visualizador principal.
  const [viewingLot, setViewingLot] = useState<Lot | null>(null);
  const [viewingLotIndex, setViewingLotIndex] = useState(0);
  // Fecha a visualização se o lote deixar de existir (removido/devolvido).
  useEffect(() => {
    if (viewingLot && !lots.some((l) => l.id === viewingLot.id)) setViewingLot(null);
  }, [lots, viewingLot]);
  // O cálculo de repetições vale para o layout que o gerou: se a árvore muda,
  // o N vira intenção obsoleta (o botão da barra o repassaria ao salvar).
  useEffect(() => setReplicationInfo(null), [tree]);
  // Navegação por teclado (←/→) entre as chapas do lote em visualização.
  useEffect(() => {
    if (!viewingLot) return;
    const total = viewingLot.chapas.length;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setViewingLotIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setViewingLotIndex((i) => Math.min(total - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewingLot]);
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

  // Unified removal handler — selection-bar button, Delete/Backspace and the "U" command all land here
  const removeSelected = useCallback(() => {
    if (selectedId === "root") return;
    const removed = previewRemoval(tree, selectedId);
    const t = cloneTree(tree);
    deleteNode(t, selectedId);
    updateTreeAndChapas(t);
    // Saved chapas already had their pieces deducted from the inventory on
    // save — give labeled pieces back. Fresh layouts deduct nothing.
    if (editingExistingChapa && removed.some((p) => p.label)) {
      setPieces((prev) => restorePiecesToInventory(prev, removed));
    }
    setSelectedId("root");
    setStatus({
      msg: removed.length > 0 ? `${removed.length} peça(s) removida(s)` : "Recorte removido",
      type: "success",
    });
  }, [tree, selectedId, updateTreeAndChapas, editingExistingChapa]);

  // Global shortcuts: Delete/Backspace removes the selection, Esc clears it.
  // Ignored while typing in inputs/textareas (CommandBar has autoFocus).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setSelectedId("root");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [removeSelected]);

  // Selection bar data: node info + how many pieces the removal would affect (derived from the tree)
  const selectionInfo = useMemo(() => {
    if (selectedId === "root") return null;
    const node = findNode(tree, selectedId);
    if (!node) return null;
    const removed = previewRemoval(tree, selectedId);
    let dims: { w: number; h: number } | undefined;
    if (node.filhos.length === 0) {
      if (node.tipo === "Y") {
        const x = findParentOfType(tree, selectedId, "X");
        if (x) dims = { w: x.valor, h: node.valor };
      } else if (node.tipo === "Z") {
        const y = findParentOfType(tree, selectedId, "Y");
        if (y) dims = { w: node.valor, h: y.valor };
      } else if (node.tipo === "W") {
        const z = findParentOfType(tree, selectedId, "Z");
        if (z) dims = { w: z.valor, h: node.valor };
      } else if (node.tipo === "Q") {
        const w = findParentOfType(tree, selectedId, "W");
        if (w) dims = { w: node.valor, h: w.valor };
      } else if (node.tipo === "R") {
        const q = findParentOfType(tree, selectedId, "Q");
        if (q) dims = { w: q.valor, h: node.valor };
      }
    }
    const label = node.label || (removed.length === 1 ? removed[0].label : undefined);
    const parent = findParentNode(tree, selectedId);
    const hasParent = !!parent && parent.tipo !== "ROOT";
    return { tipo: node.tipo, valor: node.valor, label, pieceCount: removed.length, dims, hasParent };
  }, [tree, selectedId]);

  // Clicking a node in the viewer always hits the innermost piece (children
  // cover parent cuts and stop propagation). Re-clicking the selection climbs
  // the ancestor chain so container cuts (Z/Y/X) are reachable from the layout:
  // piece → Z → Y → X → back to piece.
  const handleSelectNode = useCallback(
    (id: string) => {
      if (id === "root") {
        setSelectedId("root");
        return;
      }
      const chain: string[] = [];
      let cur: string | null = id;
      while (cur && cur !== "root") {
        chain.push(cur);
        const p = findParentNode(tree, cur);
        cur = p ? p.id : null;
      }
      const idx = chain.indexOf(selectedId);
      if (idx >= 0) {
        setSelectedId(idx < chain.length - 1 ? chain[idx + 1] : chain[0]);
      } else {
        setSelectedId(id);
      }
    },
    [tree, selectedId],
  );

  const selectParent = useCallback(() => {
    if (selectedId === "root") return;
    const parent = findParentNode(tree, selectedId);
    setSelectedId(parent ? parent.id : "root");
  }, [tree, selectedId]);

  const processCommand = useCallback(
    (text: string) => {
      if (text === "U") {
        removeSelected();
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
    [tree, selectedId, usableW, usableH, minBreak, updateTreeAndChapas, removeSelected],
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

  // Spec 008: com `piecesOverride` gera o plano a partir do inventário informado
  // (replanejamento pós-save) e preserva as chapas de `opts.baseChapas`
  // (manuais/salvas). Sem argumentos, comportamento original. Array.isArray
  // protege contra uso direto como handler de evento (onClick).
  const optimizeAllSheets = useCallback(async (
    piecesOverride?: PieceItem[],
    opts?: { baseChapas?: Array<{ tree: TreeNode; usedArea: number; manual?: boolean; saved?: boolean; selected?: boolean; deductions?: Array<{ id: string; qty: number }> }> },
  ): Promise<number> => {
    const sourcePieces = Array.isArray(piecesOverride) ? piecesOverride : pieces;
    if (sourcePieces.length === 0) {
      setStatus({ msg: "Inventário vazio!", type: "error" });
      return 0;
    }
    setIsOptimizing(true);
    setStatus({ msg: "Processando todas as chapas...", type: "warn" });

    // ── Progresso por COMBINAÇÃO (variante × chapa) ──────────────────────────
    // Sem isto a barra só anda uma vez por VARIANTE (3-4 no total) e fica imóvel
    // por minutos em trabalhos grandes. O nº real de chapas não é conhecido de
    // antemão, então estimamos pelo PISO geométrico: max(área total / área da
    // chapa, nº de peças que exigem chapa dedicada). É um limite inferior, então a
    // barra pode saturar perto do fim — bem melhor do que ficar parada.
    let estSheetsPerVariant = 1;
    let progressVariantIndex = 0;
    let progressVariantTotal = 1;
    // `sheetNo` aceita FRAÇÃO: o GA reporta progresso interno da chapa, então a
    // barra anda DURANTE a chapa e não só entre chapas. O rótulo arredonda.
    const combinationProgress = (sheetNo: number) => {
      const total = progressVariantTotal * estSheetsPerVariant;
      const done = Math.min(progressVariantIndex * estSheetsPerVariant + sheetNo, total);
      return { done, shown: Math.min(Math.ceil(done), total), total };
    };
    const reportCombination = (sheetNo: number, bestUtil?: number) => {
      const { done, shown, total } = combinationProgress(sheetNo);
      setGlobalProgress({ current: done, total });
      setProgress({ phase: `Chapa ${shown}/${total}`, current: done, total, bestUtil });
    };

    const runAllSheets = async (
      sortFn?: (a: PieceItem, b: PieceItem) => number,
      label?: string,
      engine: "ga" | "greedy" = "ga",
    ) => {
      const chapaList: Array<{ tree: TreeNode; usedArea: number; manual?: boolean; deductions?: Array<{ id: string; qty: number }> }> = [];
      const hasPriority = sourcePieces.some((p) => p.priority);
      const remaining = (hasPriority ? sourcePieces.filter((p) => p.priority) : sourcePieces).map((p) => ({ ...p }));
      if (sortFn) remaining.sort(sortFn);
      let sheetCount = 0;
      const totalPieces = remaining.reduce((sum, p) => sum + Math.max(p.qty, 1), 0);
      const maxSheets = Math.max(100, totalPieces * 2);

      // Cache: re-use the optimization result when the remaining inventory
      // has the same "shape" (same set of unique pieces with qty >= what was
      // used last time). Massive speedup on uniform inventories where the
      // best layout repeats.
      const layoutCache = new Map<string, TreeNode>();

      while (remaining.length > 0 && sheetCount < maxSheets) {
        sheetCount++;

        // Build inv with a unique label per instance so every piece is trackable in the tree.
        // uidToRef maps uid → the remaining item it came from (by reference, not index).
        // uidToOrig maps uid → original user label, restored before display/export.
        const inv: { w: number; h: number; area: number; label?: string }[] = [];
        const uidToRef = new Map<string, typeof remaining[0]>();
        const uidToOrig = new Map<string, string | undefined>();
        let uidSeq = 0;
        const pushOne = (p: typeof remaining[0]): string | undefined => {
          if (p.w > 0 && p.h > 0) {
            const uid = `__${uidSeq++}`;
            inv.push({ w: p.w, h: p.h, area: p.w * p.h, label: uid });
            uidToRef.set(uid, p);
            uidToOrig.set(uid, p.label);
            return uid;
          }
          return undefined;
        };
        // Spec 010 + 014: no máximo 1 peça DEDICADA no total por chapa, colocada
        // PRIMEIRO (prioridade → dedicadas ocupam as primeiras chapas, 1 por
        // chapa). "Dedicada" = marcada pelo usuário (specs 009/010) OU jumbo por
        // geometria (`max(w,h) > usableH` ⇒ chapa dedicada automática, spec 014).
        const markedPick = pickDedicatedForSheet(remaining, usableW, usableH);
        const markedUid = markedPick ? pushOne(markedPick) : undefined;
        remaining.forEach((p) => {
          if (isDedicated(p, usableW, usableH)) return; // dedicadas: apenas a escolhida (acima)
          for (let i = 0; i < p.qty; i++) pushOne(p);
        });
        if (inv.length === 0) break;

        reportCombination(sheetCount - 1);

        await new Promise((r) => setTimeout(r, 0));
        const priorityLabels = priorityIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        // Cache lookup: same inventory shape → same optimal layout.
        // Spec 010 + 014: chave sobre a fatia DEDICADA por chapa (≤1 dedicada
        // total — marcada ou jumbo), consistente com o `inv` realmente otimizado.
        const invKey = dedicatedSheetInvKey(remaining, usableW, usableH);
        let result: TreeNode;
        const cached = layoutCache.get(invKey);
        if (cached) {
          result = cloneTree(cached);
        } else {
          // Spec 015: TODA chapa de JUMBO (qualquer candidato — guloso OU GA) é montada
          // via `buildJumboSheet` MAIOR-PRIMEIRO. O placement direto (guloso via bandas,
          // ou GA) deixa a região ABAIXO/LATERAL do jumbo VAZIA e enterra a sobra em nível
          // fundo. `buildJumboSheet` decompõe a sobra (faixa lateral + região abaixo) e a
          // preenche com as MAIORES peças primeiro (via runPlacement área-desc, não
          // optimizeV6 — senão perde a prioridade das grandes e o nº de chapas sobe). Só
          // age em chapa de jumbo; demais chapas seguem o motor do candidato.
          const greedyOptimize = (pcs: typeof inv, w: number, h: number, mb: number) =>
            runPlacement([...pcs].sort((a, b) => b.area - a.area), w, h, mb);
          const jumboP = markedUid ? inv.find((p) => p.label === markedUid) : undefined;
          const jr = jumboP && requiresDedicatedSheet(jumboP, usableW, usableH)
            ? buildJumboSheet(jumboP, usableW, usableH, inv.filter((p) => p.label !== markedUid), minBreak, greedyOptimize)
            : null;
          if (jr) {
            reportCombination(sheetCount);
            result = jr.tree;
          } else if (engine === "greedy") {
            // Candidato MAIOR-PRIMEIRO (guloso): `inv` por área DESC ⇒ a maior peça
            // ancora a chapa. Rápido/determinístico; a seleção final fica com o de menos
            // chapas entre este e o GA.
            reportCombination(sheetCount);
            const invBigFirst = markedUid
              ? [inv[0], ...inv.slice(1).sort((a, b) => b.area - a.area)]
              : [...inv].sort((a, b) => b.area - a.area);
            result = runPlacement(invBigFirst, usableW, usableH, minBreak).tree;
          } else {
            result = await optimizeGeneticAsync(
              inv,
              usableW,
              usableH,
              minBreak,
              (p) => {
                // Progresso INTERNO do GA vira fração da chapa corrente, para a barra
                // andar durante a chapa. Antes este callback sobrescrevia o rótulo com
                // o formato do motor ("Chapa 13 - Semeando População...").
                const frac = p.total > 0 ? Math.min(p.current / p.total, 1) : 0;
                reportCombination(sheetCount - 1 + frac, p.bestUtil);
              },
              priorityLabels.length > 0 ? priorityLabels : undefined,
              gaPopSize,
              gaGens,
            );
          }
          consolidateColumns(result);
          layoutCache.set(invKey, cloneTree(result));
        }

        // Spec 010 (prioridade): garantir que a peça marcada FOI colocada nesta
        // chapa. `optimizeV6` escolhe o layout de MAIOR ÁREA e pode EXCLUIR uma
        // peça marcada pequena (que iria para `remaining` e acabaria no fim do
        // plano — quebrando a prioridade). Se a marcada não está na árvore,
        // refaz a chapa com `runPlacement` colocando a marcada PRIMEIRO
        // (colocação garantida numa chapa vazia) + preenchimento com as demais.
        if (markedUid && !extractLeafPieces(result).some((lp) => lp.label === markedUid)) {
          // Spec 014 (fase 2): se a peça forçada é JUMBO, decompor a sobra (dois
          // retângulos exatos ao lado/abaixo dela) e otimizar cada um com
          // optimizeV6 — enche a sobra do jumbo com as peças médias, muito melhor
          // que o `runPlacement` guloso. Peça marcada NÃO-jumbo mantém o fallback
          // guloso da spec 010.
          const jumboP = inv.find((p) => p.label === markedUid);
          const jr = jumboP && requiresDedicatedSheet(jumboP, usableW, usableH)
            ? buildJumboSheet(
                jumboP, usableW, usableH,
                inv.filter((p) => p.label !== markedUid), minBreak, optimizeV6,
              )
            : null;
          result = jr ? jr.tree : runPlacement(inv, usableW, usableH, minBreak).tree;
          // Spec 013: consolida a sobra lateral (o `runPlacement` não faz sozinho).
          consolidateColumns(result);
          layoutCache.set(invKey, cloneTree(result)); // reusar o layout já com a marcada
        }

        // --- Spec 006: seleção por repetição de padrão ---
        // Monta candidatos (melhor-por-área já obtido + homogêneos) e, se ligado,
        // escolhe o que mais repete sob o piso de aproveitamento. Guardado pela flag:
        // desligado (default) → caminho idêntico ao atual (não-regressão).
        if (prioritizeRepetition) {
          const remItems = remaining
            .filter((p) => p.qty > 0)
            .map((p) => ({ w: p.w, h: p.h, qty: p.qty }));
          const baseUsed = extractUsedPiecesWithContext(result);
          const bomMap = new Map<string, BomEntry>();
          baseUsed.forEach((u) => {
            const k = `${Math.min(u.w, u.h)}x${Math.max(u.w, u.h)}`;
            const e = bomMap.get(k);
            if (e) e.count++;
            else bomMap.set(k, { w: u.w, h: u.h, count: 1 });
          });
          const baseBom = Array.from(bomMap.values());
          if (baseBom.length > 0) {
            const baseUtil = calcPlacedArea(result) / (usableW * usableH);
            const bestCand = bestAreaCandidate(baseBom, baseUtil, result);
            const homoBuild = (dim: { w: number; h: number; count: number }) => {
              const subset = inv
                .filter((pc) => (pc.w === dim.w && pc.h === dim.h) || (pc.w === dim.h && pc.h === dim.w))
                .slice(0, dim.count);
              return optimizeV6(subset, usableW, usableH, minBreak).tree;
            };
            const homos = homogeneousCandidates(remItems, usableW, usableH, minBreak, homoBuild);
            const sel = selectByRepetition([bestCand, ...homos], remItems, utilizationFloor);
            if (sel.chosen.candidate.kind === "homogeneous") {
              result = sel.chosen.candidate.buildTree();
            }
          }
        }

        consolidateColumns(result); // consolidação final da sobra (spec 013)
        // Spec 015: agrupa colunas de mesma altura numa faixa E preenche a tira do topo
        // (agora rasa) com as peças restantes — maior-primeiro, como o resto do plano.
        // Spec 016: `minBreak` (campo "Quebra Mínima") entra como PISO do resíduo de
        // correção, liberando o agrupamento de colunas de alturas PRÓXIMAS.
        {
          const placedNow = new Set(extractLeafPieces(result).map((l) => l.label));
          const xPool = inv.filter((p) => p.label !== undefined && !placedNow.has(p.label));
          consolidateColumnsX(result, usableW, usableH, {
            pool: xPool,
            minBreak,
            optimize: (pcs, w, h, mb) => runPlacement([...pcs].sort((a, b) => b.area - a.area), w, h, mb),
            normalize: (t, w, h, mb) => normalizeTree(t, w, h, mb),
          }, minBreak);
        }
        collapseRedundantCuts(result, usableW, usableH); // remove coordenadas de corte redundantes

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

      const uniqueDims = new Set(
        sourcePieces
          .filter((p) => p.qty > 0)
          .map((p) => `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}`),
      ).size;
      const sortVariants: Array<[(a: PieceItem, b: PieceItem) => number, string] | [undefined, string]> = [
        [undefined, "ordem original"],
        [(a, b) => (b.w * b.h) - (a.w * a.h), "área desc"],
      ];

      if (uniqueDims <= 80) {
        sortVariants.push([(a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h), "maior lado"]);
      }

    const candidateGroups: Array<{ label: string; chapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }> }> = [];
    // "Melhor dos dois mundos": as variantes do GA (qualidade) + UM candidato guloso
    // MAIOR-PRIMEIRO (rápido, às vezes vence). A seleção abaixo fica com o plano de
    // menos chapas — então cada trabalho usa o motor que for melhor PARA ELE.
    const totalVariants = sortVariants.length + 1;
    // Estimativa de chapas por variante = piso geométrico do input (ver comentário
    // em `combinationProgress`). O(n) uma vez; custo desprezível.
    {
      const sheetAreaEst = usableW * usableH;
      let areaSum = 0;
      let dedicatedCount = 0;
      // Espelha o filtro de prioridade do `runAllSheets` (ver `hasPriority` lá):
      // sem isto a estimativa contaria peças que o plano nem vai processar, e a
      // barra ficaria sempre aquém de 100% até o salto final.
      const estPieces = sourcePieces.some((p) => p.priority)
        ? sourcePieces.filter((p) => p.priority)
        : sourcePieces;
      for (const p of estPieces) {
        const q = Math.max(p.qty, 0);
        if (q <= 0 || p.w <= 0 || p.h <= 0) continue;
        areaSum += p.w * p.h * q;
        if (requiresDedicatedSheet(p, usableW, usableH)) dedicatedCount += q;
      }
      estSheetsPerVariant = Math.max(1, Math.ceil(areaSum / Math.max(1, sheetAreaEst)), dedicatedCount);
    }
    progressVariantTotal = totalVariants;
    setGlobalProgress({ current: 0, total: totalVariants * estSheetsPerVariant });
    for (let vi = 0; vi < sortVariants.length; vi++) {
      const [sortFn, label] = sortVariants[vi];
      progressVariantIndex = vi;
      setProgress({
        phase: `Chapa ${vi * estSheetsPerVariant}/${totalVariants * estSheetsPerVariant}`,
        current: vi * estSheetsPerVariant,
        total: totalVariants * estSheetsPerVariant,
      });
      const result = await runAllSheets(sortFn ?? undefined, label);
      if (result && result.length > 0) candidateGroups.push({ label, chapas: result });
      setGlobalProgress({ current: (vi + 1) * estSheetsPerVariant, total: totalVariants * estSheetsPerVariant });
    }
    // Candidato guloso maior-primeiro (área desc no `remaining`; o motor re-ordena o
    // inv por área a cada chapa). Determinístico e barato.
    progressVariantIndex = sortVariants.length;
    setProgress({
      phase: `Chapa ${sortVariants.length * estSheetsPerVariant}/${totalVariants * estSheetsPerVariant}`,
      current: sortVariants.length * estSheetsPerVariant,
      total: totalVariants * estSheetsPerVariant,
    });
    {
      const greedy = await runAllSheets(
        (a, b) => (b.w * b.h) - (a.w * a.h),
        "maior-primeiro (guloso)",
        "greedy",
      );
      if (greedy && greedy.length > 0) candidateGroups.push({ label: "maior-primeiro (guloso)", chapas: greedy });
    }
    setGlobalProgress({ current: totalVariants * estSheetsPerVariant, total: totalVariants * estSheetsPerVariant });

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
    const baseChapas = opts?.baseChapas ?? [];
    setOptimizationGroups(candidateGroups);
    setActiveGroupIdx(bestIdx);
    setChapas([...baseChapas, ...best]);
    setFilterActiveLabels(null);

    // Spec 006 — resumo de padrões distintos do plano escolhido.
    if (prioritizeRepetition && best.length > 0) {
      const groups = new Map<string, { sheets: number; util: number }>();
      best.forEach((c) => {
        const fp = treeFingerprint(c.tree);
        const g = groups.get(fp);
        if (g) g.sheets++;
        else groups.set(fp, { sheets: 1, util: c.usedArea / sheetArea });
      });
      const perPattern = Array.from(groups.values())
        .sort((a, b) => b.sheets - a.sheets)
        .map((g, i) => ({ label: `Padrão ${i + 1}`, sheets: g.sheets, util: g.util }));
      const floorReached = perPattern.every((p) => p.util >= utilizationFloor);
      setPatternSummary({ distinctPatterns: perPattern.length, perPattern, floorReached });
    } else {
      setPatternSummary(null);
    }

    if (best.length > 0) {
      setTree(best[0].tree);
      setSelectedId("root");
    }
    setActiveChapa(best.length > 0 ? baseChapas.length : 0);
    setProgress(null);
    setGlobalProgress(null);
    setIsOptimizing(false);
    setStatus({ msg: `✅ ${best.length} chapa(s) gerada(s)! Grupo ${bestIdx + 1} selecionado automaticamente.`, type: "success" });
    return best.length;
  }, [pieces, usableW, usableH, extractUsedPiecesWithContext, minBreak, priorityIds, gaPopSize, gaGens, prioritizeRepetition, utilizationFloor]);

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

        // Relatório OF (.rpt): layout de posição fixa, detectado automaticamente.
        if (isOfReport(wb)) {
          const { items, imported, skipped } = parseOfReport(wb);
          if (imported === 0) {
            setStatus({ msg: "Relatório OF reconhecido, mas nenhuma peça válida encontrada.", type: "error" });
            return;
          }
          setPieces(items);
          setStatus({
            msg: `${imported} peças importadas do relatório OF${skipped ? ` (${skipped} linha(s) ignorada(s))` : ""}!`,
            type: "success",
          });
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

    // BOM do layout e máximo de repetições via módulo puro (spec 008, FR-001).
    // Inventário efetivo: desconta reservas de cópias salvas pendentes (emenda A1).
    const effective = effectiveInventory(pieces, chapas);
    const bom = buildLayoutBom(usedPieces);
    const maxReps = maxRepetitions(effective, bom);
    const bomDetails = bom.map(({ w, h, count }) => ({
      w,
      h,
      need: count,
      available: effective.reduce(
        (s, p) => ((p.w === w && p.h === h) || (p.w === h && p.h === w) ? s + p.qty : s),
        0,
      ),
    }));

    setReplicationInfo({ count: maxReps, bom: bomDetails });
    setStatus({ msg: `Layout pode ser repetido ${maxReps}×`, type: maxReps > 0 ? "success" : "error" });
  }, [tree, pieces, chapas, extractUsedPiecesWithContext]);

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
    const autoChapas = selectedAutoChapas(chapas);
    if (countAuto(chapas) === 0) {
      setStatus({ msg: "Nenhuma chapa automática para confirmar.", type: "error" });
      return;
    }
    if (autoChapas.length === 0) {
      setStatus({ msg: "Selecione ao menos uma chapa para gerar o lote.", type: "error" });
      return;
    }

    // Collect all used pieces for this lot
    const allUsedPieces: Array<{ w: number; h: number; label?: string }> = [];
    // Dedução exata pelas deductions registradas (caminho preciso).
    const updatedPieces = applyDeductions(pieces, autoChapas);
    autoChapas.forEach((chapa) => {
      // Always extract for lot summary (uses restored labels for display).
      const usedPieces = extractUsedPiecesWithContext(chapa.tree, false);
      allUsedPieces.push(...usedPieces);

      if (!chapa.deductions || chapa.deductions.length === 0) {
        // Fallback para chapas sem deductions (ex.: chapa única manual): label+dim, depois dim.
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
      usableW,
      usableH,
      ml,
      mb,
    };
    setLots((prev) => [...prev, newLot]);

    const filteredPieces = updatedPieces.filter((p) => p.qty > 0);
    setPieces(filteredPieces);

    // Mark only the selected auto chapas as confirmed; unselected stay available (FR-005).
    // `selected: false` evita contagem fantasma em grupos mistos após a confirmação.
    setChapas((prev) => prev.map((c) => (isSelectedAuto(c) ? { ...c, manual: true, selected: false } : c)));

    const remaining = filteredPieces.reduce((s, p) => s + p.qty, 0);
    setStatus({
      msg: `✅ Lote #${newLot.number} criado! ${autoChapas.length} chapa(s) aplicadas ao inventário. ${remaining} peça(s) restante(s).`,
      type: "success",
    });
  }, [chapas, pieces, lots, chapaW, chapaH, extractUsedPiecesWithContext]);

  // Seleção de chapas para o lote (feature 003): marca as N primeiras chapas de um
  // grupo de layout idêntico como selecionadas; as demais do grupo ficam desmarcadas.
  const setGroupSelectedCount = useCallback((indices: number[], n: number) => {
    setChapas((prev) => {
      // Spec 008: chapas confirmadas (manual) não entram em lote — a marcação
      // vale só para as automáticas/salvas do grupo, na ordem em que aparecem.
      const markable = indices.filter((i) => prev[i]?.manual !== true);
      return prev.map((c, i) => {
        const pos = markable.indexOf(i);
        if (pos === -1) return c;
        return { ...c, selected: pos < n };
      });
    });
  }, []);

  const selectedChapaCount = useMemo(() => countSelectedAuto(chapas), [chapas]);
  const autoChapaCount = useMemo(() => countAuto(chapas), [chapas]);

  const selectGroup = useCallback((idx: number) => {
    if (!optimizationGroups || !optimizationGroups[idx]) return;
    const group = optimizationGroups[idx];
    // Spec 008 (S6): trocar de variante nunca descarta chapas confirmadas nem
    // cópias salvas pendentes de lote.
    const { preserved } = partitionByPreserved(chapas);
    setActiveGroupIdx(idx);
    setChapas([...preserved, ...group.chapas]);
    setFilterActiveLabels(null);
    if (group.chapas.length > 0) {
      setTree(group.chapas[0].tree);
      setSelectedId("root");
    }
    setActiveChapa(group.chapas.length > 0 ? preserved.length : 0);
    setStatus({ msg: `Grupo ${idx + 1} selecionado: ${group.label} (${group.chapas.length} chapa(s))`, type: "info" });
  }, [optimizationGroups, chapas]);

  // Spec 008 (emenda A1): salvar ×N NÃO deduz o inventário — cria cópias
  // pendentes (`saved`, com checkbox pré-marcado e `deductions` exatas) que
  // reservam inventário até a confirmação do lote. Se existir plano automático
  // não confirmado (calculado sem essa reserva), descarta-o e replaneja o
  // restante com o mesmo gerador.
  const saveLayout = useCallback(
    async (reps?: number) => {
      if (isOptimizing) return;
      const usedPieces = extractUsedPiecesWithContext(tree, false);
      if (usedPieces.length === 0) {
        setStatus({ msg: "Desenhe um layout primeiro!", type: "error" });
        return;
      }

      // Clamp defensivo (S1) contra o inventário efetivo (menos reservas de
      // saves pendentes anteriores): o N vindo da UI pode estar obsoleto.
      const bom = buildLayoutBom(usedPieces);
      const effective = effectiveInventory(pieces, chapas);
      const maxReps = maxRepetitions(effective, bom);
      if (maxReps === 0) {
        setStatus({ msg: "Inventário disponível não cobre as peças deste layout — nada foi salvo.", type: "error" });
        return;
      }
      const count = Math.max(1, Math.min(reps && reps > 0 ? reps : 1, maxReps));

      // Reserva atômica (S2): aloca deduções id-a-id por cópia; falta aborta sem efeitos.
      const alloc = allocateDeductions(effective, bom, count);
      if (alloc.shortfall.length > 0) {
        setStatus({ msg: "Inventário disponível não cobre as peças deste layout — nada foi salvo.", type: "error" });
        return;
      }

      const usedArea = calcPlacedArea(tree);
      const copies = alloc.perCopy.map((deductions) => ({
        tree: cloneTree(tree),
        usedArea,
        manual: false,
        saved: true,
        selected: true,
        deductions,
      }));

      // S3/S7: com autos descartáveis pendentes, o plano antigo ficou inválido →
      // descartar; manuais e saves pendentes anteriores são preservados.
      const replan = needsReplan(chapas);
      const { preserved } = partitionByPreserved(chapas);
      const keptChapas = [...preserved, ...copies];

      setChapas(keptChapas);
      if (replan) {
        setOptimizationGroups(null);
        setActiveGroupIdx(0);
        setPatternSummary(null);
      }
      setActiveChapa(keptChapas.length - count);

      // Reset tree for next layout
      const freshTree = createRoot(usableW, usableH);
      setTree(freshTree);
      setSelectedId("root");
      setEditingExistingChapa(false);
      setReplicationInfo(null);

      const remainingPieces = alloc.remaining.filter((p) => p.qty > 0);
      const remainingQty = remainingPieces.reduce((s, p) => s + p.qty, 0);

      if (replan && remainingPieces.length > 0) {
        // S4: replanejar o restante (sem as reservas) preservando manuais + cópias.
        setProgress({ phase: "Replanejando restante...", current: 0, total: 1 });
        const newSheets = await optimizeAllSheets(remainingPieces, { baseChapas: keptChapas });
        setStatus({
          msg: `✅ ${count} cópia(s) marcada(s) para o lote. Plano replanejado: ${newSheets} chapa(s) nova(s), ${remainingQty} peça(s) fora da reserva. Confirme o plano para deduzir do inventário.`,
          type: "success",
        });
      } else if (replan) {
        // S5: todo o inventário reservado — nada a replanejar.
        setStatus({
          msg: `✅ ${count} cópia(s) marcada(s) para o lote — inventário totalmente reservado. Confirme o plano para deduzir.`,
          type: "success",
        });
      } else {
        setStatus({
          msg: `✅ Layout salvo (×${count}) e marcado para o lote. Confirme o plano para deduzir do inventário.`,
          type: "success",
        });
      }
    },
    [tree, pieces, chapas, isOptimizing, extractUsedPiecesWithContext, usableW, usableH, optimizeAllSheets],
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
          onOptimize={() => optimizeAllSheets()}
          progress={progress}
          globalProgress={globalProgress}
          layoutGroups={layoutGroups}
          filteredLayoutGroups={filteredLayoutGroups}
          chapas={chapas}
          onConfirmPlan={confirmAutoPlan}
          onSetGroupSelectedCount={setGroupSelectedCount}
          selectedChapaCount={selectedChapaCount}
          autoChapaCount={autoChapaCount}
          optimizationGroups={optimizationGroups}
          activeGroupIdx={activeGroupIdx}
          onSelectGroup={selectGroup}
          pdfFilename={pdfFilename}
          setPdfFilename={setPdfFilename}
          onExport={() => {
            exportPdf({ chapas, layoutGroups, chapaW, chapaH, usableW, usableH, ml, mr, mt, mb, utilization, filename: pdfFilename });
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

        {/* ─── SECTION 4b: Repetição de Padrão (spec 006) ─── */}
        <SidebarSection title="Repetição de Padrão" icon="🔁" defaultOpen={false}>
          <div className="p-2 space-y-3">
            <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "hsl(210 25% 82%)" }}>
              <input
                type="checkbox"
                checked={prioritizeRepetition}
                onChange={(e) => setPrioritizeRepetition(e.target.checked)}
              />
              Priorizar repetição de padrão
            </label>
            <p className="text-[10px] leading-tight" style={{ color: "hsl(210 25% 52%)" }}>
              Prefere padrões que se repetem em mais chapas (menos setups na serra),
              desde que o aproveitamento fique acima do piso.
            </p>
            {prioritizeRepetition && (
              <div className="space-y-1">
                <label className="flex justify-between text-[11px]" style={{ color: "hsl(210 25% 72%)" }}>
                  <span>Aproveitamento mínimo</span>
                  <span>{Math.round(utilizationFloor * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={99}
                  step={1}
                  value={Math.round(utilizationFloor * 100)}
                  onChange={(e) => setUtilizationFloor(Number(e.target.value) / 100)}
                  className="w-full"
                />
              </div>
            )}
            {patternSummary && (
              <div className="text-[11px] pt-1 border-t space-y-0.5" style={{ color: "hsl(210 25% 72%)", borderColor: "hsl(222 47% 18%)" }}>
                <div>Padrões distintos: <strong>{patternSummary.distinctPatterns}</strong></div>
                {patternSummary.perPattern.slice(0, 6).map((p, i) => (
                  <div key={i} className="text-[10px]" style={{ color: "hsl(210 25% 55%)" }}>
                    {p.label}: {p.sheets}× · {Math.round(p.util * 100)}%
                  </div>
                ))}
                {!patternSummary.floorReached && (
                  <div className="text-[10px]" style={{ color: "hsl(38 92% 60%)" }}>
                    ⚠ Piso não atingido em alguma etapa (usado o de maior aproveitamento).
                  </div>
                )}
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
          onView={(lot) => { setViewingLot(lot); setViewingLotIndex(0); }}
          onPrint={printLot}
          onReturn={returnLotToInventory}
        />
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col" style={{ background: "hsl(210 25% 95%)" }}>
        {viewingLot ? (
          <>
            <div
              className="flex items-center justify-between px-3 py-1.5"
              style={{ background: "hsl(265 60% 16%)", borderBottom: "1px solid hsl(265 60% 34%)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold" style={{ color: "hsl(265 80% 82%)" }}>
                  👁 Visualizando Lote #{viewingLot.number} — Chapa {viewingLotIndex + 1}/{viewingLot.chapas.length}
                </span>
                {viewingLot.chapas.length > 1 && (
                  <>
                    <button
                      className="text-[11px] px-2 py-0.5 rounded font-bold"
                      style={{
                        background: "hsl(265 60% 26%)", color: "hsl(265 80% 85%)", border: "1px solid hsl(265 60% 40%)",
                        cursor: viewingLotIndex > 0 ? "pointer" : "default", opacity: viewingLotIndex > 0 ? 1 : 0.35,
                      }}
                      disabled={viewingLotIndex <= 0}
                      onClick={() => setViewingLotIndex((i) => Math.max(0, i - 1))}
                      title="Chapa anterior (←)"
                    >
                      ◀
                    </button>
                    <button
                      className="text-[11px] px-2 py-0.5 rounded font-bold"
                      style={{
                        background: "hsl(265 60% 26%)", color: "hsl(265 80% 85%)", border: "1px solid hsl(265 60% 40%)",
                        cursor: viewingLotIndex < viewingLot.chapas.length - 1 ? "pointer" : "default",
                        opacity: viewingLotIndex < viewingLot.chapas.length - 1 ? 1 : 0.35,
                      }}
                      disabled={viewingLotIndex >= viewingLot.chapas.length - 1}
                      onClick={() => setViewingLotIndex((i) => Math.min(viewingLot.chapas.length - 1, i + 1))}
                      title="Próxima chapa (→)"
                    >
                      ▶
                    </button>
                  </>
                )}
              </div>
              <button
                className="text-[10px] px-2.5 py-1 rounded font-bold uppercase tracking-wider"
                style={{ background: "hsl(0 55% 22%)", color: "hsl(0 60% 82%)", border: "1px solid hsl(0 55% 40%)", cursor: "pointer" }}
                onClick={() => setViewingLot(null)}
                title="Voltar ao plano de trabalho"
              >
                ✕ Voltar
              </button>
            </div>
            <SheetViewer
              chapas={viewingLot.chapas}
              activeIndex={Math.min(viewingLotIndex, viewingLot.chapas.length - 1)}
              onSelectSheet={setViewingLotIndex}
              selectedId="root"
              onSelectNode={() => {}}
              usableW={viewingLot.usableW ?? usableW}
              usableH={viewingLot.usableH ?? usableH}
              chapaW={viewingLot.sheetW}
              chapaH={viewingLot.sheetH}
              ml={viewingLot.ml ?? ml}
              mb={viewingLot.mb ?? mb}
              utilization={
                (viewingLot.chapas[Math.min(viewingLotIndex, viewingLot.chapas.length - 1)]?.usedArea ?? 0) /
                Math.max(1, (viewingLot.usableW ?? usableW) * (viewingLot.usableH ?? usableH))
              }
            />
          </>
        ) : (
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
            onSelectNode={handleSelectNode}
            usableW={usableW}
            usableH={usableH}
            chapaW={chapaW}
            chapaH={chapaH}
            ml={ml}
            mb={mb}
            utilization={utilization}
            layoutGroups={layoutGroups}
            selectionInfo={selectionInfo}
            onRemoveSelected={removeSelected}
            onSelectParent={selectionInfo?.hasParent ? selectParent : undefined}
          />
        )}

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

