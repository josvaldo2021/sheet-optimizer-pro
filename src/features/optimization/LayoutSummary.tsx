import { TreeNode, countAllocatedPieces } from "@/lib/cnc-engine";
import { LayoutGroup } from "@/lib/export/layout-utils";

interface Props {
  chapas: Array<{ tree: TreeNode; usedArea: number; manual?: boolean }>;
  layoutGroups: LayoutGroup[];
  filteredLayoutGroups: LayoutGroup[];
  filterActiveLabels: string[] | null;
  activeChapa: number;
  usableW: number;
  usableH: number;
  utilization: number;
  lastLeftoverInfo: { w: number; h: number } | null;
  onSelectLayout: (idx: number, tree: TreeNode) => void;
  onDeleteLayout: (origIdx: number) => void;
}

const LayoutSummary = ({
  chapas, layoutGroups, filteredLayoutGroups, filterActiveLabels,
  activeChapa, usableW, usableH, utilization, lastLeftoverInfo,
  onSelectLayout, onDeleteLayout,
}: Props) => (
  <div
    className="mt-3 p-2 rounded"
    style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 22%)" }}
  >
    <div className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: "hsl(210 25% 62%)" }}>
      Resumo dos Layouts {filterActiveLabels ? `(filtrado: ${filterActiveLabels.join(", ")})` : ""}
    </div>
    {(() => {
      const groups = filterActiveLabels ? filteredLayoutGroups : layoutGroups;
      const totalPieces = groups.reduce((s, g) => {
        const perSheet = countAllocatedPieces(chapas[g.indices[0]].tree);
        return s + perSheet * g.count;
      }, 0);
      return (
        <div className="text-[11px] mb-2 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "hsl(210 25% 78%)" }}>
          {filterActiveLabels
            ? <span>{filteredLayoutGroups.reduce((s, g) => s + g.count, 0)} chapa(s) filtrada(s) • {filteredLayoutGroups.length} layout(s) único(s) — total: {chapas.length}</span>
            : <span>{chapas.length} chapa(s) • {layoutGroups.length} layout(s) único(s)</span>}
          <span style={{ color: "hsl(210 80% 70%)", fontWeight: 700 }}>
            {totalPieces} peças alocadas no total
          </span>
        </div>
      );
    })()}

    <div
      className="flex items-center justify-between px-2 py-1.5 rounded mb-2"
      style={{ background: "hsl(222 47% 14%)", border: "1px solid hsl(222 47% 24%)" }}
    >
      <div>
        <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: "hsl(210 25% 55%)" }}>
          Aproveitamento do plano
        </div>
        {lastLeftoverInfo && lastLeftoverInfo.w >= 200 && lastLeftoverInfo.h >= 200 ? (
          <div className="text-[9px] mt-0.5" style={{ color: "hsl(45 80% 60%)" }}>
            Sobra reaproveitável: {lastLeftoverInfo.w}×{lastLeftoverInfo.h} mm
          </div>
        ) : lastLeftoverInfo ? (
          <div className="text-[9px] mt-0.5" style={{ color: "hsl(210 25% 45%)" }}>
            Última sobra {lastLeftoverInfo.w}×{lastLeftoverInfo.h} mm (perda)
          </div>
        ) : null}
      </div>
      <span
        className="text-[18px] font-bold"
        style={{
          color: utilization > 85 ? "hsl(120 70% 55%)" : utilization > 65 ? "hsl(45 80% 55%)" : "hsl(0 60% 55%)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {utilization.toFixed(1)}%
      </span>
    </div>

    {filteredLayoutGroups.map((group, gIdx) => {
      const util = usableW > 0 && usableH > 0 ? (group.usedArea / (usableW * usableH)) * 100 : 0;
      const pieceCount = countAllocatedPieces(chapas[group.indices[0]].tree);
      return (
        <div key={gIdx} className="flex items-center gap-1 mb-1">
          <button
            className="flex-1 flex items-center justify-between p-2 rounded cursor-pointer transition-all text-left"
            style={{
              background: group.indices.includes(activeChapa) ? "hsl(211 60% 22%)" : "hsl(222 47% 17%)",
              border: `1px solid ${group.indices.includes(activeChapa) ? "hsl(211 60% 42%)" : "hsl(222 47% 26%)"}`,
            }}
            onClick={() => onSelectLayout(group.indices[0], chapas[group.indices[0]].tree)}
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold" style={{ color: "white" }}>Layout {gIdx + 1}</span>
                <span className="text-[9px] font-medium" style={{ color: "hsl(210 25% 60%)" }}>
                  {pieceCount} peças alocadas
                </span>
              </div>
              {group.count > 1 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "hsl(30 100% 45%)", color: "white" }}>
                  ×{group.count}
                </span>
              )}
            </div>
            <span
              className="text-[14px] font-bold"
              style={{
                color: util > 80 ? "hsl(120 70% 55%)" : util > 50 ? "hsl(45 80% 55%)" : "hsl(0 60% 55%)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {util.toFixed(1)}%
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const origIdx = layoutGroups.findIndex((g) => g.indices[0] === group.indices[0]);
              onDeleteLayout(origIdx >= 0 ? origIdx : gIdx);
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
);

export default LayoutSummary;
