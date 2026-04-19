import { Lot } from "@/lib/cnc-engine";

interface Props {
  lot: Lot;
  isExpanded: boolean;
  onToggle: () => void;
  onPrint: (lot: Lot) => void;
  onReturn: (lot: Lot) => void;
  onRemove: (lotId: string) => void;
}

const LotCard = ({ lot, isExpanded, onToggle, onPrint, onReturn, onRemove }: Props) => {
  const totalPiecesInLot = lot.piecesUsed.reduce((s, p) => s + p.qty, 0);

  return (
    <div
      className="rounded overflow-hidden"
      style={{
        border: `1px solid ${isExpanded ? "hsl(211 60% 38%)" : "hsl(222 47% 28%)"}`,
        background: "hsl(222 47% 11%)",
      }}
    >
      <button
        className="w-full flex items-center justify-between px-2.5 py-2 text-left"
        style={{ background: isExpanded ? "hsl(211 60% 17%)" : "hsl(222 47% 14%)", cursor: "pointer", border: "none" }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold" style={{ color: "hsl(120 70% 55%)" }}>
            Lote #{lot.number}
          </span>
          <span className="text-[9px]" style={{ color: "hsl(210 25% 55%)" }}>
            {lot.totalSheets} chapa(s) • {totalPiecesInLot} peça(s)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px]" style={{ color: "hsl(210 25% 48%)" }}>
            {new Date(lot.date).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span style={{ color: "hsl(210 25% 55%)", fontSize: "8px" }}>{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-2.5 pb-2 pt-1.5" style={{ borderTop: "1px solid hsl(222 47% 22%)" }}>
          <div className="text-[9px] mb-2" style={{ color: "hsl(210 25% 50%)" }}>
            Chapa: {lot.sheetW}×{lot.sheetH} mm &nbsp;|&nbsp; {new Date(lot.date).toLocaleString("pt-BR")}
          </div>
          <table className="w-full mb-2" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "hsl(210 25% 50%)", fontSize: "8px" }}>
                <th className="text-left py-0.5 font-semibold">Dimensão</th>
                <th className="text-center py-0.5 font-semibold">Qtd</th>
                <th className="text-left py-0.5 font-semibold">ID</th>
              </tr>
            </thead>
            <tbody>
              {lot.piecesUsed.map((p, i) => (
                <tr
                  key={i}
                  style={{ color: "hsl(210 25% 75%)", borderTop: "1px solid hsl(222 47% 19%)", fontSize: "10px" }}
                >
                  <td className="py-0.5 font-mono">{p.w}×{p.h}</td>
                  <td className="text-center py-0.5 font-bold" style={{ color: "hsl(120 70% 55%)" }}>{p.qty}</td>
                  <td className="py-0.5" style={{ color: "hsl(210 25% 55%)" }}>{p.label || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-1.5 mt-1">
            <button
              className="flex-1 text-[9px] py-1.5 rounded font-bold uppercase tracking-wider"
              style={{ background: "hsl(211 60% 28%)", color: "hsl(210 80% 85%)", border: "1px solid hsl(211 60% 40%)", cursor: "pointer" }}
              onClick={() => onPrint(lot)}
              title="Imprimir relatório deste lote"
            >
              🖨 Imprimir
            </button>
            <button
              className="flex-1 text-[9px] py-1.5 rounded font-bold uppercase tracking-wider"
              style={{ background: "hsl(38 70% 28%)", color: "hsl(38 90% 85%)", border: "1px solid hsl(38 70% 40%)", cursor: "pointer" }}
              onClick={() => onReturn(lot)}
              title="Devolver todas as peças deste lote ao inventário"
            >
              ↩ Devolver
            </button>
            <button
              className="flex-1 text-[9px] py-1.5 rounded font-bold uppercase tracking-wider"
              style={{ background: "hsl(0 50% 22%)", color: "hsl(0 70% 75%)", border: "1px solid hsl(0 50% 32%)", cursor: "pointer" }}
              onClick={() => onRemove(lot.id)}
              title="Remover lote permanentemente (sem devolver ao inventário)"
            >
              🗑 Remover
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LotCard;
