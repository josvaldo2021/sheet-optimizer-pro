import { ChangeEvent, useState } from "react";
import { PieceItem } from "@/lib/cnc-engine";
import SidebarSection from "@/components/SidebarSection";

type SortKey = "priority" | "qty" | "w" | "h" | "label";

interface Props {
  pieces: PieceItem[];
  setPieces: React.Dispatch<React.SetStateAction<PieceItem[]>>;
  pieceFilter: string;
  setPieceFilter: (v: string) => void;
  totalPieces: number;
  onImportExcel: (e: ChangeEvent<HTMLInputElement>) => void;
}

const PieceListSection = ({ pieces, setPieces, pieceFilter, setPieceFilter, totalPieces, onImportExcel }: Props) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key === key) return prev.dir === "desc" ? { key, dir: "asc" } : null;
      return { key, dir: "desc" };
    });
  };

  const arrow = (key: SortKey) => {
    if (sort?.key !== key) return "";
    return sort.dir === "desc" ? " ↓" : " ↑";
  };

  const headerBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => handleSort(key)}
      style={{
        all: "unset",
        cursor: "pointer",
        color: sort?.key === key ? "hsl(210 80% 72%)" : "hsl(210 25% 58%)",
        fontWeight: "bold",
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        userSelect: "none",
        width: "100%",
        textAlign: "center",
        display: "block",
      }}
      title={`Ordenar por ${label}`}
    >
      {label}{arrow(key)}
    </button>
  );

  const filtered = pieces.filter((p) => {
    if (!pieceFilter) return true;
    const lower = pieceFilter.toLowerCase();
    return (
      p.label?.toLowerCase().includes(lower) ||
      String(p.w).includes(lower) ||
      String(p.h).includes(lower)
    );
  });

  const sorted = sort
    ? [...filtered].sort((a, b) => {
        let va: number | string = 0, vb: number | string = 0;
        switch (sort.key) {
          case "priority": va = a.priority ? 1 : 0; vb = b.priority ? 1 : 0; break;
          case "qty":      va = a.qty;     vb = b.qty;     break;
          case "w":        va = a.w;       vb = b.w;       break;
          case "h":        va = a.h;       vb = b.h;       break;
          case "label":    va = a.label || ""; vb = b.label || ""; break;
        }
        if (va < vb) return sort.dir === "desc" ? 1 : -1;
        if (va > vb) return sort.dir === "desc" ? -1 : 1;
        return 0;
      })
    : filtered;

  return (
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
                className="cnc-btn-secondary flex-1"
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
              className="grid gap-1 mb-1"
              style={{ gridTemplateColumns: "20px 70px 70px 15px 70px 70px 20px" }}
            >
              <button
                onClick={() => handleSort("priority")}
                title="Ordenar por prioridade"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  color: sort?.key === "priority" ? "hsl(210 80% 72%)" : "hsl(210 25% 58%)",
                  fontSize: "12px",
                  textAlign: "center",
                  display: "block",
                  userSelect: "none",
                }}
              >
                🚩{arrow("priority")}
              </button>
              {headerBtn("qty",   "Qtd")}
              {headerBtn("w",     "Larg")}
              <span />
              {headerBtn("h",     "Alt")}
              {headerBtn("label", "ID")}
              <span />
            </div>
          )}
          {sorted.map((p) => (
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
                className="btn-delete-piece text-[12px]"
                title="Remover peça"
              >
                ×
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
};

export default PieceListSection;
