import SidebarSection from "@/components/SidebarSection";

interface Props {
  chapaW: number; setChapaW: (v: number) => void;
  chapaH: number; setChapaH: (v: number) => void;
  ml: number; setMl: (v: number) => void;
  mr: number; setMr: (v: number) => void;
  mt: number; setMt: (v: number) => void;
  mb: number; setMb: (v: number) => void;
  minBreak: number; setMinBreak: (v: number) => void;
  usableW: number; usableH: number;
  onApply: () => void;
}

function SheetPreview({ chapaW, chapaH, ml, mr, mt, mb }: {
  chapaW: number; chapaH: number; ml: number; mr: number; mt: number; mb: number;
}) {
  const W = 68, H = 50, pad = 3;
  const maxW = W - pad * 2, maxH = H - pad * 2;

  if (!chapaW || !chapaH) return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <rect x={pad} y={pad} width={maxW} height={maxH}
        fill="hsl(237 50% 13%)" stroke="hsl(237 40% 26%)" strokeWidth="0.75" rx="0.5" />
    </svg>
  );

  const aspect = chapaW / chapaH;
  let sw: number, sh: number;
  if (aspect >= maxW / maxH) { sw = maxW; sh = sw / aspect; }
  else { sh = maxH; sw = sh * aspect; }
  const ox = (W - sw) / 2, oy = (H - sh) / 2;
  const scaleX = sw / chapaW, scaleY = sh / chapaH;
  const ux = ox + ml * scaleX, uy = oy + mt * scaleY;
  const uw = Math.max(sw - (ml + mr) * scaleX, 0);
  const uh = Math.max(sh - (mt + mb) * scaleY, 0);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* Sheet outline */}
      <rect x={ox} y={oy} width={sw} height={sh}
        fill="hsl(237 50% 14%)" stroke="hsl(237 40% 32%)" strokeWidth="0.75" rx="0.5" />
      {/* Usable area */}
      {uw > 1 && uh > 1 && (
        <rect x={ux} y={uy} width={uw} height={uh}
          fill="hsl(206 60% 14%)" stroke="hsl(206 82% 51%)" strokeWidth="0.75" strokeDasharray="2.5 1.5" />
      )}
    </svg>
  );
}

const ACCENT = "hsl(206 82% 51%)";
const LABEL_COLOR = "hsl(220 18% 50%)";
const MONO: React.CSSProperties = { fontFamily: "monospace", fontSize: "11px" };

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "8px" }}>
      <span style={{ display: "block", width: "2px", height: "9px", background: ACCENT, borderRadius: "1px", flexShrink: 0 }} />
      <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: LABEL_COLOR }}>
        {text}
      </span>
    </div>
  );
}

function MarginCell({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      <span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em", color: "hsl(206 72% 58%)", textTransform: "uppercase" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="cnc-input"
        style={{ ...MONO, width: "52px", textAlign: "center", padding: "3px 4px" }}
      />
    </div>
  );
}

const SheetSetupPanel = ({
  chapaW, setChapaW, chapaH, setChapaH,
  ml, setMl, mr, setMr, mt, setMt, mb, setMb,
  minBreak, setMinBreak, usableW, usableH, onApply,
}: Props) => (
  <SidebarSection title="Setup da Chapa" icon="📐" defaultOpen={true}>
    <div style={{ background: "hsl(240 60% 8%)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "0" }}>

      {/* ── Dimensões ── */}
      <SectionLabel text="Dimensões" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "5px", marginBottom: "16px" }}>
        <div style={{ position: "relative" }}>
          <input
            type="number" value={chapaW}
            onChange={(e) => setChapaW(+e.target.value)}
            className="cnc-input"
            style={{ ...MONO, width: "100%", textAlign: "right", paddingRight: "18px" }}
          />
          <span style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", fontSize: "8px", fontWeight: 700, color: ACCENT, pointerEvents: "none" }}>W</span>
        </div>
        <span style={{ fontSize: "12px", color: "hsl(220 18% 30%)", userSelect: "none" }}>×</span>
        <div style={{ position: "relative" }}>
          <input
            type="number" value={chapaH}
            onChange={(e) => setChapaH(+e.target.value)}
            className="cnc-input"
            style={{ ...MONO, width: "100%", textAlign: "right", paddingRight: "18px" }}
          />
          <span style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", fontSize: "8px", fontWeight: 700, color: ACCENT, pointerEvents: "none" }}>H</span>
        </div>
      </div>

      {/* ── Refilos (cross layout) ── */}
      <SectionLabel text="Refilos" />
      <div style={{
        display: "grid",
        gridTemplateColumns: "56px 76px 56px",
        gridTemplateRows: "auto auto auto",
        gap: "4px",
        alignItems: "center",
        justifyItems: "center",
        marginBottom: "16px",
      }}>
        {/* row 1: _ T _ */}
        <div />
        <MarginCell label="T" value={mt} onChange={setMt} />
        <div />
        {/* row 2: L [preview] R */}
        <MarginCell label="L" value={ml} onChange={setMl} />
        <div style={{
          padding: "4px", borderRadius: "4px",
          background: "hsl(240 60% 6%)", border: "1px solid hsl(237 40% 20%)",
        }}>
          <SheetPreview chapaW={chapaW} chapaH={chapaH} ml={ml} mr={mr} mt={mt} mb={mb} />
        </div>
        <MarginCell label="R" value={mr} onChange={setMr} />
        {/* row 3: _ B _ */}
        <div />
        <MarginCell label="B" value={mb} onChange={setMb} />
        <div />
      </div>

      {/* ── Quebra mínima ── */}
      <SectionLabel text="Quebra Mínima" />
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
        <input
          type="number" value={minBreak}
          onChange={(e) => setMinBreak(+e.target.value)}
          className="cnc-input"
          style={{ ...MONO, flex: 1, textAlign: "right" }}
        />
        <span style={{ fontSize: "9px", color: LABEL_COLOR, fontWeight: 600, letterSpacing: "0.04em", minWidth: "16px" }}>mm</span>
      </div>

      {/* ── Área útil readout ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 10px", borderRadius: "4px", marginBottom: "12px",
        background: "hsl(240 60% 6%)", border: "1px solid hsl(206 40% 18%)",
      }}>
        <span style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: LABEL_COLOR }}>
          Área útil
        </span>
        <span style={{ ...MONO, fontWeight: 700, color: "hsl(206 82% 64%)", letterSpacing: "0.02em" }}>
          {usableW} × {usableH}
          <span style={{ fontSize: "8px", fontWeight: 400, color: LABEL_COLOR, marginLeft: "4px" }}>mm</span>
        </span>
      </div>

      {/* ── Aplicar ── */}
      <button onClick={onApply} className="cnc-btn-success w-full">
        APLICAR SETUP
      </button>
    </div>
  </SidebarSection>
);

export default SheetSetupPanel;
