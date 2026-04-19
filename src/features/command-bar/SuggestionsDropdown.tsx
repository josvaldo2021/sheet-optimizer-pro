interface Suggestion {
  cmd: string;
  label: string;
  desc: string;
  kind?: "direct" | "lookahead";
}

interface Props {
  suggestions: Suggestion[];
  selectedIdx: number;
  onHover: (i: number) => void;
  onSelect: (s: Suggestion) => void;
}

const SuggestionsDropdown = ({ suggestions, selectedIdx, onHover, onSelect }: Props) => (
  <div
    className="absolute bottom-full left-0 right-0 mb-1 max-h-[240px] overflow-y-auto rounded cnc-scroll cnc-suggestions-drop"
    style={{
      background: "hsl(222 47% 11%)",
      border: "1px solid hsl(222 47% 28%)",
      boxShadow: "0 -6px 24px hsla(222 47% 5% / 0.7)",
      zIndex: 1000,
    }}
  >
    <div
      className="px-2 py-1 text-[8px] uppercase tracking-wider font-bold"
      style={{ color: "hsl(210 25% 55%)", borderBottom: "1px solid hsl(222 47% 22%)" }}
    >
      Sugestões do inventário ({suggestions.length})
    </div>
    {suggestions.map((s, i) => (
      <div
        key={s.cmd + i}
        className="flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors"
        style={{
          background: i === selectedIdx ? "hsl(211 60% 22%)" : "transparent",
          borderBottom: "1px solid hsl(222 47% 18%)",
        }}
        onMouseEnter={() => onHover(i)}
        onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
      >
        <span className="text-[12px] font-bold font-mono" style={{ color: "hsl(120 80% 60%)" }}>{s.cmd}</span>
        <span className="text-[10px] ml-2" style={{ color: "hsl(210 25% 60%)" }}>{s.desc}</span>
      </div>
    ))}
  </div>
);

export default SuggestionsDropdown;
