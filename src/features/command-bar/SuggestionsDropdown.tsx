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
      background: "hsl(240 60% 8%)",
      border: "1px solid hsl(237 40% 22%)",
      boxShadow: "0 -6px 24px hsl(240 65% 4% / 0.7)",
      zIndex: 1000,
    }}
  >
    <div
      className="px-2 py-1 text-[8px] uppercase tracking-wider font-bold"
      style={{ color: "hsl(220 18% 48%)", borderBottom: "1px solid hsl(237 40% 18%)" }}
    >
      Sugestões do inventário ({suggestions.length})
    </div>
    {suggestions.map((s, i) => (
      <div
        key={s.cmd + i}
        className="flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors"
        style={{
          background: i === selectedIdx ? "hsl(206 55% 14%)" : "transparent",
          borderBottom: "1px solid hsl(237 40% 15%)",
        }}
        onMouseEnter={() => onHover(i)}
        onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
      >
        <span className="text-[12px] font-bold font-mono" style={{ color: "hsl(206 82% 62%)" }}>{s.cmd}</span>
        <span className="text-[10px] ml-2" style={{ color: "hsl(220 18% 52%)" }}>{s.desc}</span>
      </div>
    ))}
  </div>
);

export default SuggestionsDropdown;
