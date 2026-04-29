import { useState } from "react";
import { TreeNode, OptimizationProgress, getUseWasmEngine, setUseWasmEngine, isWasmReady } from "@/lib/cnc-engine";
import { LayoutGroup } from "@/lib/export/layout-utils";
import SidebarSection from "@/components/SidebarSection";
import LayoutSummary from "./LayoutSummary";

interface OptimizationGroup {
  label: string;
  chapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }>;
}

interface Props {
  priorityIds: string;
  setPriorityIds: (v: string) => void;
  filterActiveLabels: string[] | null;
  setFilterActiveLabels: (v: string[] | null) => void;
  gaPopSize: number;
  setGaPopSize: (v: number) => void;
  gaGens: number;
  setGaGens: (v: number) => void;
  isOptimizing: boolean;
  onOptimize: () => void;
  progress: OptimizationProgress | null;
  globalProgress: { current: number; total: number } | null;
  layoutGroups: LayoutGroup[];
  filteredLayoutGroups: LayoutGroup[];
  chapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }>;
  onConfirmPlan: () => void;
  optimizationGroups: OptimizationGroup[] | null;
  activeGroupIdx: number;
  onSelectGroup: (idx: number) => void;
  pdfFilename: string;
  setPdfFilename: (v: string) => void;
  onExport: () => void;
  activeChapa: number;
  usableW: number;
  usableH: number;
  utilization: number;
  lastLeftoverInfo: { w: number; h: number } | null;
  setStatus: (s: { msg: string; type: string }) => void;
  onSelectLayout: (idx: number, tree: TreeNode) => void;
  onDeleteLayout: (idx: number) => void;
  onPrintLayout: (chapaIdx: number, layoutNum: number, count: number) => void;
}

const OptimizationPanel = ({
  priorityIds, setPriorityIds, filterActiveLabels, setFilterActiveLabels,
  gaPopSize, setGaPopSize, gaGens, setGaGens, isOptimizing, onOptimize,
  progress, globalProgress, layoutGroups, filteredLayoutGroups, chapas,
  onConfirmPlan, optimizationGroups, activeGroupIdx, onSelectGroup,
  pdfFilename, setPdfFilename, onExport,
  activeChapa, usableW, usableH, utilization, lastLeftoverInfo,
  setStatus, onSelectLayout, onDeleteLayout, onPrintLayout,
}: Props) => {
  const SEGMENTS = 12;
  const [useWasm, setUseWasm] = useState(() => getUseWasmEngine());
  const wasmAvailable = isWasmReady();

  function handleToggleWasm(val: boolean) {
    setUseWasmEngine(val);
    setUseWasm(val);
  }

  return (
    <SidebarSection title="Execução" icon="🚀" defaultOpen={true}>
      <div className="p-3" style={{ background: "hsl(237 50% 12%)" }}>
        {/* Priority IDs */}
        <div className="mb-3">
          <label className="text-[9px] uppercase tracking-wider font-bold block mb-1" style={{ color: "hsl(220 18% 52%)" }}>
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
                if (filterActiveLabels) {
                  setFilterActiveLabels(null);
                  setStatus({ msg: "Filtro removido. Todos os layouts visíveis.", type: "info" });
                  return;
                }
                const labels = priorityIds.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
                if (labels.length === 0) {
                  setStatus({ msg: "Preencha os IDs prioritários primeiro!", type: "error" });
                  return;
                }
                setFilterActiveLabels(labels);
                setStatus({ msg: `🔍 Filtro aplicado: mostrando apenas layouts com ${labels.join(", ")}`, type: "success" });
              }}
              className="cnc-btn text-[8px] px-2 whitespace-nowrap"
              title={filterActiveLabels ? "Remover filtro e mostrar todos os layouts" : "Filtrar layouts que contêm os IDs listados"}
              style={{
                background: filterActiveLabels ? "hsl(233 55% 28%)" : "hsl(206 72% 40%)",
                color: "hsl(206 82% 90%)",
                border: "1px solid hsl(206 72% 52%)",
                fontSize: "9px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {filterActiveLabels ? "✕ Limpar" : "🔍 Filtrar"}
            </button>
          </div>
          <div style={{ fontSize: "8px", color: "hsl(220 18% 45%)", marginTop: "3px" }}>
            Separe por vírgula. Peças priorizadas ficam nas primeiras chapas. Filtro visual — não remove layouts.
          </div>
        </div>

        {/* Engine toggle */}
        <div className="flex items-center justify-between mb-3 px-2 py-2 rounded" style={{ background: "hsl(237 50% 7%)" }}>
          <div>
            <div className="text-[10px] font-bold" style={{ color: useWasm && wasmAvailable ? "hsl(206 82% 58%)" : "hsl(220 18% 52%)" }}>
              {useWasm && wasmAvailable ? "⚡ Rust/WASM" : useWasm && !wasmAvailable ? "⏳ WASM carregando…" : "🔷 TypeScript"}
            </div>
            <div className="text-[9px]" style={{ color: "hsl(220 18% 42%)" }}>
              Motor de otimização
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer" title={useWasm ? "Desativar Rust/WASM" : "Ativar Rust/WASM"}>
            <input
              type="checkbox"
              className="sr-only"
              checked={useWasm}
              onChange={(e) => handleToggleWasm(e.target.checked)}
            />
            <div
              className="w-9 h-5 rounded-full transition-colors duration-200 relative"
              style={{ background: useWasm && wasmAvailable ? "hsl(120 55% 34%)" : "hsl(237 50% 22%)" }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200"
                style={{
                  background: "white",
                  transform: useWasm ? "translateX(18px)" : "translateX(2px)",
                }}
              />
            </div>
          </label>
        </div>

        {/* GA params */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-[9px] uppercase tracking-wider font-bold block mb-1" style={{ color: "hsl(220 18% 52%)" }}>
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
            <label className="text-[9px] uppercase tracking-wider font-bold block mb-1" style={{ color: "hsl(220 18% 52%)" }}>
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

        <button className="cnc-btn-primary w-full" onClick={onOptimize} disabled={isOptimizing}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.34.07-.68.07-1.08s-.03-.74-.07-1.08l2.33-1.82c.21-.16.27-.46.12-.7l-2.21-3.82c-.15-.26-.46-.34-.7-.26l-2.75 1.1c-.57-.44-1.18-.81-1.86-1.08l-.42-2.92C14.42 2.18 14.2 2 13.96 2h-4.42c-.24 0-.46.18-.5.42l-.42 2.92c-.68.27-1.29.64-1.86 1.08L4.01 5.33c-.24-.08-.55 0-.7.26L1.1 9.41c-.15.24-.09.54.12.7l2.33 1.82C3.51 12.26 3.5 12.6 3.5 13s.01.74.05 1.08L1.22 15.9c-.21.16-.27.46-.12.7l2.21 3.82c.15.26.46.34.7.26l2.75-1.1c.57.44 1.18.81 1.86 1.08l.42 2.92c.04.24.26.42.5.42h4.42c.24 0 .46-.18.5-.42l.42-2.92c.68-.27 1.29-.64 1.86-1.08l2.75 1.1c.24.08.55 0 .7-.26l2.21-3.82c.15-.24.09-.54-.12-.7l-2.33-1.82z"/>
          </svg>
          OTIMIZAR TODAS AS CHAPAS
        </button>

        {/* Progress bar */}
        {progress && (() => {
          const bar = globalProgress ?? { current: progress.current, total: progress.total };
          const pct = bar.total > 0 ? bar.current / bar.total : 0;
          const filled = Math.round(pct * SEGMENTS);
          return (
            <div className="mt-3 p-2" style={{ background: "hsl(237 50% 6%)", border: "1px solid hsl(237 50% 16%)" }}>
              <div className="cnc-pixel-progress-wrap">
                {Array.from({ length: SEGMENTS }).map((_, i) => (
                  <div key={i} className={`cnc-pixel-segment${i < filled ? " active" : ""}`} />
                ))}
              </div>
              <div className="cnc-pixel-label">{progress.phase}</div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: "hsl(220 18% 38%)", fontFamily: "monospace" }}>
                  {bar.current}/{bar.total}
                </span>
                {progress.bestUtil !== undefined && (
                  <span className="text-[9px] font-bold" style={{ color: "hsl(206 82% 60%)", fontFamily: "monospace" }}>
                    {progress.bestUtil.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Group selector */}
        {optimizationGroups && optimizationGroups.length > 0 && (
          <div className="mt-3 p-2" style={{ background: "hsl(237 50% 6%)", border: "1px solid hsl(237 50% 16%)" }}>
            <div className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: "hsl(220 18% 52%)" }}>
              Grupos de Otimização
            </div>
            <div className="flex flex-col gap-1">
              {optimizationGroups.map((g, idx) => {
                const isActive = idx === activeGroupIdx;
                const util = g.chapas.length > 0
                  ? ((g.chapas.reduce((s, c) => s + c.usedArea, 0) / (g.chapas.length * usableW * usableH)) * 100).toFixed(1)
                  : "0.0";
                return (
                  <button
                    key={idx}
                    onClick={() => onSelectGroup(idx)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "5px 8px",
                      fontSize: "10px",
                      fontFamily: "monospace",
                      border: isActive ? "1px solid hsl(240 100% 50%)" : "1px solid hsl(237 50% 20%)",
                      borderRadius: "5px",
                      background: isActive ? "hsl(206 55% 13%)" : "hsl(237 50% 11%)",
                      color: isActive ? "hsl(206 82% 72%)" : "hsl(220 18% 52%)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontWeight: isActive ? "bold" : "normal" }}>
                      {idx + 1}. {g.label}
                      {idx === activeGroupIdx && <span style={{ marginLeft: 4, color: "hsl(206 82% 58%)", fontSize: "8px" }}>✓ ativo</span>}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <span style={{ color: "hsl(220 18% 44%)" }}>{g.chapas.length} chp</span>
                      <span style={{ color: isActive ? "hsl(206 82% 58%)" : "hsl(220 18% 44%)" }}>{util}%</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirm plan button */}
        {layoutGroups.length > 0 && chapas.some((c) => !c.manual) && (
          <button
            className="cnc-btn-success w-full mt-2"
            style={{ padding: "10px", fontSize: "12px", fontWeight: "bold" }}
            onClick={onConfirmPlan}
          >
            ✅ CONFIRMAR PLANO (ATUALIZAR INVENTÁRIO)
          </button>
        )}

        {/* Export */}
        {layoutGroups.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold px-1" style={{ color: "hsl(220 18% 48%)" }}>Nome do PDF</label>
              <input
                type="text"
                className="cnc-input h-9"
                value={pdfFilename}
                onChange={(e) => setPdfFilename(e.target.value)}
                placeholder="Nome do arquivo..."
              />
            </div>
            <button
              className="cnc-btn-excel w-full"
              style={{ padding: "12px", fontSize: "14px", fontWeight: "bold" }}
              onClick={onExport}
            >
              📥 EXPORTAR ARQUIVOS
            </button>
          </div>
        )}

        {/* Layout summary */}
        {filteredLayoutGroups.length > 0 && (
          <LayoutSummary
            chapas={chapas}
            layoutGroups={layoutGroups}
            filteredLayoutGroups={filteredLayoutGroups}
            filterActiveLabels={filterActiveLabels}
            activeChapa={activeChapa}
            usableW={usableW}
            usableH={usableH}
            utilization={utilization}
            lastLeftoverInfo={lastLeftoverInfo}
            onSelectLayout={onSelectLayout}
            onDeleteLayout={onDeleteLayout}
            onPrintLayout={onPrintLayout}
          />
        )}
      </div>
    </SidebarSection>
  );
};

export default OptimizationPanel;
