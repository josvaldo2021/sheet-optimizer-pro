import { useState } from "react";
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
  onPrintLayout: (chapaIdx: number, layoutNum: number, count: number) => void;
}

const utilColor = (pct: number) =>
  pct > 85 ? "hsl(120 70% 55%)" : pct > 65 ? "hsl(45 80% 55%)" : "hsl(0 60% 55%)";

const LayoutSummary = ({
  chapas, layoutGroups, filteredLayoutGroups, filterActiveLabels,
  activeChapa, usableW, usableH, utilization, lastLeftoverInfo,
  onSelectLayout, onDeleteLayout, onPrintLayout,
}: Props) => {
  const [popupIdx, setPopupIdx] = useState<number | null>(null);

  return (
    <div
      className="mt-3 p-2 rounded"
      style={{ background: "hsl(240 60% 7%)", border: "1px solid hsl(237 40% 18%)" }}
    >
      <div className="text-[9px] uppercase tracking-wider font-bold mb-2" style={{ color: "hsl(220 18% 52%)" }}>
        Resumo dos Layouts {filterActiveLabels ? `(filtrado: ${filterActiveLabels.join(", ")})` : ""}
      </div>
      {(() => {
        const groups = filterActiveLabels ? filteredLayoutGroups : layoutGroups;
        const totalPieces = groups.reduce((s, g) => {
          const perSheet = countAllocatedPieces(chapas[g.indices[0]].tree);
          return s + perSheet * g.count;
        }, 0);
        return (
          <div className="text-[11px] mb-2 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "hsl(220 18% 68%)" }}>
            {filterActiveLabels
              ? <span>{filteredLayoutGroups.reduce((s, g) => s + g.count, 0)} chapa(s) filtrada(s) • {filteredLayoutGroups.length} layout(s) único(s) — total: {chapas.length}</span>
              : <span>{chapas.length} chapa(s) • {layoutGroups.length} layout(s) único(s)</span>}
            <span style={{ color: "hsl(206 82% 62%)", fontWeight: 700 }}>
              {totalPieces} peças alocadas no total
            </span>
          </div>
        );
      })()}

      <div
        className="flex items-center justify-between px-2 py-1.5 rounded mb-2"
        style={{ background: "hsl(237 50% 12%)", border: "1px solid hsl(237 40% 20%)" }}
      >
        <div>
          <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: "hsl(220 18% 48%)" }}>
            Aproveitamento do plano
          </div>
          {lastLeftoverInfo && lastLeftoverInfo.w >= 200 && lastLeftoverInfo.h >= 200 ? (
            <div className="text-[9px] mt-0.5" style={{ color: "hsl(206 72% 60%)" }}>
              Sobra reaproveitável: {lastLeftoverInfo.w}×{lastLeftoverInfo.h} mm
            </div>
          ) : lastLeftoverInfo ? (
            <div className="text-[9px] mt-0.5" style={{ color: "hsl(220 18% 38%)" }}>
              Última sobra {lastLeftoverInfo.w}×{lastLeftoverInfo.h} mm (perda)
            </div>
          ) : null}
        </div>
        <span
          className="text-[18px] font-bold"
          style={{ color: utilColor(utilization), fontFamily: "var(--font-mono)" }}
        >
          {utilization.toFixed(1)}%
        </span>
      </div>

      {filteredLayoutGroups.map((group, gIdx) => {
        const util = usableW > 0 && usableH > 0 ? (group.usedArea / (usableW * usableH)) * 100 : 0;
        const pieceCount = countAllocatedPieces(chapas[group.indices[0]].tree);
        const showPopup = popupIdx === gIdx;

        return (
          <div key={gIdx} className="relative mb-1">
            <button
              className="w-full flex items-center justify-between p-2 rounded cursor-pointer transition-all text-left"
              style={{
                background: group.indices.includes(activeChapa) ? "hsl(206 50% 13%)" : "hsl(237 50% 13%)",
                border: `1px solid ${group.indices.includes(activeChapa) ? "hsl(206 75% 42%)" : "hsl(237 40% 22%)"}`,
              }}
              onClick={() => {
                setPopupIdx(null);
                onSelectLayout(group.indices[0], chapas[group.indices[0]].tree);
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPopupIdx(showPopup ? null : gIdx);
              }}
              title="Clique para visualizar · Duplo clique para imprimir ou excluir"
            >
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold" style={{ color: "hsl(220 20% 88%)" }}>Layout {gIdx + 1}</span>
                  <span className="text-[9px] font-medium" style={{ color: "hsl(220 18% 50%)" }}>
                    {pieceCount} peças alocadas
                  </span>
                </div>
                {group.count > 1 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: "hsl(233 65% 42%)", color: "white" }}
                  >
                    ×{group.count}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px]"
                  style={{ color: "hsl(220 18% 40%)", fontFamily: "var(--font-mono)" }}
                  title="Duplo clique para ações"
                >
                  ··
                </span>
                <span
                  className="text-[14px] font-bold"
                  style={{ color: utilColor(util), fontFamily: "var(--font-mono)" }}
                >
                  {util.toFixed(1)}%
                </span>
              </div>
            </button>

            {showPopup && (
              <div
                className="absolute right-0 top-full mt-1 z-20 flex gap-1 p-1.5 rounded"
                style={{
                  background: "hsl(237 50% 11%)",
                  border: "1px solid hsl(237 40% 28%)",
                  boxShadow: "0 6px 20px hsl(240 60% 4% / 0.7)",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrintLayout(group.indices[0], gIdx + 1, group.count);
                    setPopupIdx(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold transition-colors"
                  style={{
                    background: "hsl(237 50% 17%)",
                    border: "1px solid hsl(237 40% 30%)",
                    color: "hsl(220 18% 75%)",
                    cursor: "pointer",
                  }}
                  title={`Imprimir layout ${gIdx + 1}`}
                >
                  🖨️ <span>Imprimir</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const origIdx = layoutGroups.findIndex((g) => g.indices[0] === group.indices[0]);
                    onDeleteLayout(origIdx >= 0 ? origIdx : gIdx);
                    setPopupIdx(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold transition-colors"
                  style={{
                    background: "hsl(0 55% 18%)",
                    border: "1px solid hsl(0 55% 30%)",
                    color: "hsl(0 60% 78%)",
                    cursor: "pointer",
                  }}
                  title={`Excluir layout ${gIdx + 1} (×${group.count}) e devolver peças ao inventário`}
                >
                  🗑️ <span>Excluir</span>
                </button>
              </div>
            )}
          </div>
        );
      })}

      {popupIdx !== null && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 19 }}
          onClick={() => setPopupIdx(null)}
        />
      )}
    </div>
  );
};

export default LayoutSummary;
