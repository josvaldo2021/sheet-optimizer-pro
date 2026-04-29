interface ReplicationInfo {
  count: number;
  bom: Array<{ w: number; h: number; need: number; available: number }>;
}

interface Props {
  info: ReplicationInfo;
  onSave: (n: number) => void;
  onClose: () => void;
}

const ReplicationInfoBox = ({ info, onSave, onClose }: Props) => (
  <div
    className="mt-2 p-2 rounded text-[10px]"
    style={{ background: "hsl(237 50% 8%)", border: "1px solid hsl(237 50% 20%)" }}
  >
    <div className="flex justify-between items-center mb-1">
      <span className="font-bold uppercase tracking-wider" style={{ color: "hsl(220 18% 52%)" }}>
        Repetições possíveis
      </span>
      <span className="text-[14px] font-bold" style={{ color: info.count > 0 ? "hsl(206 82% 62%)" : "hsl(220 18% 48%)" }}>
        ×{info.count}
      </span>
      <button
        onClick={onClose}
        className="text-[10px] cursor-pointer"
        style={{ color: "hsl(220 18% 48%)", background: "none", border: "none" }}
      >
        ✕
      </button>
    </div>
    <div className="flex gap-2 mb-2 items-center">
      <span style={{ color: "hsl(220 18% 60%)" }}>Salvar</span>
      <input
        type="number"
        min={1}
        max={info.count}
        defaultValue={info.count}
        id="saveRepCount"
        className="cnc-input w-14 text-center"
      />
      <span style={{ color: "hsl(220 18% 60%)" }}>cópias</span>
      <button
        onClick={() => {
          const val = parseInt((document.getElementById("saveRepCount") as HTMLInputElement)?.value || "1");
          onSave(Math.max(1, Math.min(val, info.count)));
        }}
        className="cnc-btn-secondary flex-1 text-[10px]"
        style={{ background: "hsl(240 100% 44%)", color: "white", border: "1px solid hsl(240 100% 58%)", fontWeight: "bold" }}
      >
        💾 SALVAR ×{info.count}
      </button>
    </div>
    <table className="w-full" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "hsl(220 18% 48%)", fontSize: "8px" }}>
          <th className="text-left py-0.5">Peça</th>
          <th className="text-center py-0.5">Precisa</th>
          <th className="text-center py-0.5">Disponível</th>
          <th className="text-center py-0.5">Máx Rep.</th>
        </tr>
      </thead>
      <tbody>
        {info.bom.map((item, i) => {
          const maxRep = Math.floor(item.available / item.need);
          return (
            <tr key={i} style={{ color: "hsl(220 18% 70%)", borderTop: "1px solid hsl(237 50% 18%)" }}>
              <td className="py-0.5">{item.w}×{item.h}</td>
              <td className="text-center py-0.5">{item.need}</td>
              <td className="text-center py-0.5">{item.available}</td>
              <td
                className="text-center py-0.5 font-bold"
                style={{ color: maxRep > 0 ? "hsl(206 82% 58%)" : "hsl(220 18% 42%)" }}
              >
                {maxRep}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default ReplicationInfoBox;
