import SidebarSection from "@/components/SidebarSection";

interface Props {
  chapaW: number;
  setChapaW: (v: number) => void;
  chapaH: number;
  setChapaH: (v: number) => void;
  ml: number;
  setMl: (v: number) => void;
  mr: number;
  setMr: (v: number) => void;
  mt: number;
  setMt: (v: number) => void;
  mb: number;
  setMb: (v: number) => void;
  minBreak: number;
  setMinBreak: (v: number) => void;
  usableW: number;
  usableH: number;
  onApply: () => void;
}

const SheetSetupPanel = ({
  chapaW, setChapaW, chapaH, setChapaH,
  ml, setMl, mr, setMr, mt, setMt, mb, setMb,
  minBreak, setMinBreak, usableW, usableH, onApply,
}: Props) => (
  <SidebarSection title="Setup da Chapa" icon="📐" defaultOpen={true}>
    <div className="p-4 text-xs" style={{ background: "hsl(222 47% 16%)" }}>
      <div className="flex justify-between items-center mb-2 gap-1">
        <span>Chapa:</span>
        <input type="number" value={chapaW} onChange={(e) => setChapaW(+e.target.value)} className="cnc-input w-16" />
        <span>x</span>
        <input type="number" value={chapaH} onChange={(e) => setChapaH(+e.target.value)} className="cnc-input w-16" />
      </div>
      <div className="flex justify-between items-center mb-2 gap-1">
        <span>Refilo L/R:</span>
        <input type="number" value={ml} onChange={(e) => setMl(+e.target.value)} className="cnc-input w-16" />
        <span>/</span>
        <input type="number" value={mr} onChange={(e) => setMr(+e.target.value)} className="cnc-input w-16" />
      </div>
      <div className="flex justify-between items-center mb-2 gap-1">
        <span>Refilo T/B:</span>
        <input type="number" value={mt} onChange={(e) => setMt(+e.target.value)} className="cnc-input w-16" />
        <span>/</span>
        <input type="number" value={mb} onChange={(e) => setMb(+e.target.value)} className="cnc-input w-16" />
      </div>
      <div className="flex justify-between items-center mb-2 gap-1">
        <span>Dist. Quebra:</span>
        <input type="number" value={minBreak} onChange={(e) => setMinBreak(+e.target.value)} className="cnc-input w-16" />
        <span className="text-[9px]" style={{ color: "hsl(210 25% 62%)" }}>mm</span>
      </div>
      <div className="mt-2 text-[10px]" style={{ color: "hsl(210 25% 62%)" }}>
        Área útil: {usableW} × {usableH} mm
      </div>
      <button onClick={onApply} className="cnc-btn-success w-full mt-2">
        APLICAR SETUP
      </button>
    </div>
  </SidebarSection>
);

export default SheetSetupPanel;
