import { ChangeEvent } from "react";
import { PieceItem } from "@/lib/cnc-engine";
import SidebarSection from "@/components/SidebarSection";

interface Props {
  pieces: PieceItem[];
  setPieces: React.Dispatch<React.SetStateAction<PieceItem[]>>;
  pieceFilter: string;
  setPieceFilter: (v: string) => void;
  totalPieces: number;
  onImportExcel: (e: ChangeEvent<HTMLInputElement>) => void;
}

const PieceListSection = ({ pieces, setPieces, pieceFilter, setPieceFilter, totalPieces, onImportExcel }: Props) => (
  <SidebarSection title={`Lista de Peças (${totalPieces})`} icon="📦" defaultOpen={true}>
    <div className="flex flex-col" style={{ background: "hsl(222 47% 11%)" }}>
      <div
        className="p-2.5 flex-shrink-0 space-y-2"
        style={{ background: "hsl(222 47% 14%)", borderBottom: "1px solid hsl(222 47% 22%)" }}
      >
        <input type="file" id="excelInput" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportExcel} />
        <button className="cnc-btn-excel w-full" onClick={() => document.getElementById("excelInput")?.click()}>
          📂 IMPORTAR EXCEL
        </button>

        <div className="flex flex-col gap-1 mt-2">
          <input
            type="text"
            placeholder="Filtrar peças (ID, L ou A)..."
            className="cnc-input w-full text-xs h-8"
            value={pieceFilter}
            onChange={(e) => setPieceFilter(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              className="text-[9px] uppercase font-bold py-1 px-2 rounded transition-colors flex-1"
              style={{ background: "hsl(222 47% 22%)", color: "hsl(210 25% 68%)", border: "1px solid hsl(222 47% 30%)" }}
              onClick={() => {
                const lower = pieceFilter.toLowerCase();
                setPieces((ps) =>
                  ps.map((p) => {
                    const matches =
                      p.label?.toLowerCase().includes(lower) ||
                      String(p.w).includes(lower) ||
                      String(p.h).includes(lower);
                    return matches ? { ...p, priority: true } : p;
                  }),
                );
              }}
            >
              Marcar Visíveis
            </button>
            <button
              className="text-[9px] uppercase font-bold py-1 px-2 rounded transition-colors flex-1"
              style={{ background: "hsl(222 47% 22%)", color: "hsl(210 25% 68%)", border: "1px solid hsl(222 47% 30%)" }}
              onClick={() => setPieces((ps) => ps.map((p) => ({ ...p, priority: false })))}
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
              onClick={() => { setPieces([]); setPieceFilter(""); }}
              className="cnc-btn-secondary flex-1 transition-all hover:brightness-125 hover:bg-red-700"
              style={{ background: "hsl(0 45% 25%)" }}
            >
              LIMPAR LISTA
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto p-2.5 cnc-scroll">
        {pieces.length > 0 && (
          <div
            className="grid gap-1 mb-1 text-[9px] font-bold uppercase"
            style={{ gridTemplateColumns: "20px 70px 70px 15px 70px 70px 20px", color: "hsl(210 25% 58%)" }}
          >
            <span className="text-center" title="Prioridade">🚩</span>
            <span className="text-center">Qtd</span>
            <span className="text-center">Larg</span>
            <span></span>
            <span className="text-center">Alt</span>
            <span className="text-center">ID</span>
            <span></span>
          </div>
        )}
        {pieces
          .filter((p) => {
            if (!pieceFilter) return true;
            const lower = pieceFilter.toLowerCase();
            return (
              p.label?.toLowerCase().includes(lower) ||
              String(p.w).includes(lower) ||
              String(p.h).includes(lower)
            );
          })
          .map((p) => (
            <div key={p.id} className="cnc-inv-item" style={{ gridTemplateColumns: "20px 70px 70px 15px 70px 70px 20px" }}>
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
                onChange={(e) => setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, qty: +e.target.value } : x)))}
                className="cnc-input"
              />
              <input
                type="number"
                value={p.w}
                onChange={(e) => setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, w: +e.target.value } : x)))}
                className="cnc-input"
              />
              <span className="text-center text-[8px]" style={{ color: "hsl(210 25% 60%)" }}>×</span>
              <input
                type="number"
                value={p.h}
                onChange={(e) => setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, h: +e.target.value } : x)))}
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
                className="w-5 h-5 flex items-center justify-center rounded transition-all bg-transparent text-zinc-400 hover:bg-red-600 hover:text-white border-0 p-0 cursor-pointer"
                title="Remover peça"
              >
                <span className="text-[18px] leading-none mb-0.5">×</span>
              </button>
            </div>
          ))}
        {pieces.length === 0 && (
          <div className="text-center text-[11px] py-6" style={{ color: "hsl(210 25% 52%)" }}>
            Nenhuma peça adicionada
          </div>
        )}
      </div>
    </div>
  </SidebarSection>
);

export default PieceListSection;
