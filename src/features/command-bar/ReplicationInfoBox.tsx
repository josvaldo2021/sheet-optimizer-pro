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
    style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 26%)" }}
  >
    <div className="flex justify-between items-center mb-1">
      <span className="font-bold uppercase tracking-wider" style={{ color: "hsl(210 25% 62%)" }}>
        Repetições possíveis
      </span>
      <span className="text-[14px] font-bold" style={{ color: info.count > 0 ? "hsl(120 70% 55%)" : "hsl(0 70% 55%)" }}>
        ×{info.count}
      </span>
      <button
        onClick={onClose}
        className="text-[10px] cursor-pointer"
        style={{ color: "hsl(210 25% 55%)", background: "none", border: "none" }}
      >
        ✕
      </button>
    </div>
    <div className="flex gap-2 mb-2 items-center">
      <span style={{ color: "hsl(210 25% 68%)" }}>Salvar</span>
      <input
        type="number"
        min={1}
        max={info.count}
        defaultValue={info.count}
        id="saveRepCount"
        className="cnc-input w-14 text-center"
      />
      <span style={{ color: "hsl(210 25% 68%)" }}>cópias</span>
      <button
        onClick={() => {
          const val = parseInt((document.getElementById("saveRepCount") as HTMLInputElement)?.value || "1");
          onSave(Math.max(1, Math.min(val, info.count)));
        }}
        className="cnc-btn-secondary flex-1 text-[10px]"
        style={{ background: "hsl(120 60% 25%)", fontWeight: "bold" }}
      >
        💾 SALVAR ×{info.count}
      </button>
    </div>
    <table className="w-full" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "hsl(210 25% 58%)", fontSize: "8px" }}>
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
            <tr key={i} style={{ color: "hsl(210 25% 78%)", borderTop: "1px solid hsl(222 47% 22%)" }}>
              <td className="py-0.5">{item.w}×{item.h}</td>
              <td className="text-center py-0.5">{item.need}</td>
              <td className="text-center py-0.5">{item.available}</td>
              <td
                className="text-center py-0.5 font-bold"
                style={{ color: maxRep > 0 ? "hsl(120 60% 50%)" : "hsl(0 60% 50%)" }}
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
