import { TreeNode, OptimizationProgress } from "@/lib/cnc-engine";
import { LayoutGroup } from "@/lib/export/layout-utils";
import SidebarSection from "@/components/SidebarSection";
import LayoutSummary from "./LayoutSummary";

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
  onConfirmPlan, pdfFilename, setPdfFilename, onExport,
  activeChapa, usableW, usableH, utilization, lastLeftoverInfo,
  setStatus, onSelectLayout, onDeleteLayout, onPrintLayout,
}: Props) => {
  const SEGMENTS = 12;

  return (
    <SidebarSection title="Execução" icon="🚀" defaultOpen={true}>
      <div className="p-3" style={{ background: "hsl(222 47% 14%)" }}>
        {/* Priority IDs */}
        <div className="mb-3">
          <label className="text-[9px] uppercase tracking-wider font-bold block mb-1" style={{ color: "hsl(210 25% 62%)" }}>
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
              style={{ background: filterActiveLabels ? "hsl(211 60% 40%)" : "hsl(30 80% 40%)", color: "white", fontSize: "9px" }}
            >
              {filterActiveLabels ? "✕ Limpar" : "🔍 Filtrar"}
            </button>
          </div>
          <div style={{ fontSize: "8px", color: "hsl(210 25% 58%)", marginTop: "3px" }}>
            Separe por vírgula. Peças priorizadas ficam nas primeiras chapas. Filtro visual — não remove layouts.
          </div>
        </div>

        {/* GA params */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-[9px] uppercase tracking-wider font-bold block mb-1" style={{ color: "hsl(210 25% 62%)" }}>
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
            <label className="text-[9px] uppercase tracking-wider font-bold block mb-1" style={{ color: "hsl(210 25% 62%)" }}>
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

        <button className="cnc-btn-primary w-full" onClick={onOptimize} disabled={isOptimizing} style={{ background: "hsl(222 80% 42%)" }}>
          📋 OTIMIZAR TODAS AS CHAPAS
        </button>

        {/* Progress bar */}
        {progress && (() => {
          const bar = globalProgress ?? { current: progress.current, total: progress.total };
          const pct = bar.total > 0 ? bar.current / bar.total : 0;
          const filled = Math.round(pct * SEGMENTS);
          return (
            <div className="mt-3 p-2" style={{ background: "hsl(222 47% 8%)", border: "1px solid #222" }}>
              <div className="cnc-pixel-progress-wrap">
                {Array.from({ length: SEGMENTS }).map((_, i) => (
                  <div key={i} className={`cnc-pixel-segment${i < filled ? " active" : ""}`} />
                ))}
              </div>
              <div className="cnc-pixel-label">{progress.phase}</div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: "#555", fontFamily: "monospace" }}>
                  {bar.current}/{bar.total}
                </span>
                {progress.bestUtil !== undefined && (
                  <span className="text-[9px] font-bold" style={{ color: "#22cc22", fontFamily: "monospace" }}>
                    {progress.bestUtil.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })()}

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
              <label className="text-[10px] text-zinc-500 uppercase font-bold px-1">Nome do PDF</label>
              <input
                type="text"
                className="cnc-input h-9"
                value={pdfFilename}
                onChange={(e) => setPdfFilename(e.target.value)}
                placeholder="Nome do arquivo..."
              />
            </div>
            <button
              className="cnc-btn-success w-full"
              style={{ background: "hsl(211 60% 35%)", border: "1px solid hsl(211 60% 45%)", padding: "12px", fontSize: "14px", fontWeight: "bold" }}
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
