import { RefObject } from "react";
import { TreeNode, createRoot } from "@/lib/cnc-engine";
import SuggestionsDropdown from "./SuggestionsDropdown";
import ReplicationInfoBox from "./ReplicationInfoBox";

interface Suggestion {
  cmd: string;
  label: string;
  desc: string;
  kind?: "direct" | "lookahead";
}

interface ReplicationInfo {
  count: number;
  bom: Array<{ w: number; h: number; need: number; available: number }>;
}

interface Props {
  status: { msg: string; type: string };
  cmdInput: string;
  setCmdInput: (v: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  selectedSuggestionIdx: number;
  setSelectedSuggestionIdx: (v: number | ((prev: number) => number)) => void;
  filteredSuggestions: Suggestion[];
  applySuggestion: (s: Suggestion) => void;
  processCommand: (cmd: string) => void;
  replicationInfo: ReplicationInfo | null;
  setReplicationInfo: (v: ReplicationInfo | null) => void;
  onSaveLayout: (n: number) => void;
  onClear: () => void;
  onCalcReplication: () => void;
  usableW: number;
  usableH: number;
  setTree: (t: TreeNode) => void;
  setSelectedId: (id: string) => void;
  setEditingExistingChapa: (v: boolean) => void;
  cmdInputRef: RefObject<HTMLInputElement>;
}

const CommandBar = ({
  status, cmdInput, setCmdInput, showSuggestions, setShowSuggestions,
  selectedSuggestionIdx, setSelectedSuggestionIdx, filteredSuggestions,
  applySuggestion, processCommand, replicationInfo, setReplicationInfo,
  onSaveLayout, onClear, onCalcReplication, cmdInputRef,
}: Props) => {
  const statusColor =
    status.type === "error" ? "hsl(220 10% 52%)" :
    status.type === "success" ? "hsl(206 82% 52%)" :
    "hsl(206 70% 44%)";

  return (
    <div
      className="flex flex-col p-2 px-4"
      style={{ height: "auto", minHeight: 80, background: "white", borderTop: "3px solid hsl(206 82% 51%)" }}
    >
      <div
        className="text-xs font-semibold h-5 mb-1 flex items-center gap-1.5"
        style={{ fontFamily: "var(--font-ui)", color: statusColor }}
      >
        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: statusColor }} />
        {status.msg}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={cmdInputRef}
            type="text"
            autoFocus
            autoComplete="off"
            value={cmdInput}
            onChange={(e) => { setCmdInput(e.target.value); setShowSuggestions(true); setSelectedSuggestionIdx(-1); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="X, Y, Z, W, Q ou U (UNDO). Ex: X100 Y200 Z50 W30 Q15"
            className="cnc-command-input w-full"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (selectedSuggestionIdx >= 0 && filteredSuggestions[selectedSuggestionIdx]) {
                  applySuggestion(filteredSuggestions[selectedSuggestionIdx]);
                } else {
                  processCommand(cmdInput.trim().toUpperCase());
                  setCmdInput("");
                  setShowSuggestions(true);
                }
                setSelectedSuggestionIdx(-1);
                e.preventDefault();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedSuggestionIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedSuggestionIdx((i) => Math.max(i - 1, -1));
              } else if (e.key === "Escape") {
                setShowSuggestions(false);
              } else if (e.key === "Tab" && filteredSuggestions.length > 0) {
                e.preventDefault();
                const idx = selectedSuggestionIdx >= 0 ? selectedSuggestionIdx : 0;
                if (filteredSuggestions[idx]) {
                  setCmdInput(filteredSuggestions[idx].cmd);
                  setSelectedSuggestionIdx(idx);
                }
              }
            }}
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <SuggestionsDropdown
              suggestions={filteredSuggestions}
              selectedIdx={selectedSuggestionIdx}
              onHover={setSelectedSuggestionIdx}
              onSelect={applySuggestion}
            />
          )}
        </div>

        <button
          onClick={() => onSaveLayout(replicationInfo?.count || 1)}
          className="cnc-btn-secondary text-[10px] px-3 whitespace-nowrap"
          style={{ background: "hsl(240 100% 44%)", color: "white", border: "1px solid hsl(240 100% 58%)", fontWeight: "bold" }}
          title="Salvar layout atual na lista de chapas e deduzir peças do inventário"
        >
          💾 SALVAR LAYOUT
        </button>
        <button
          onClick={onClear}
          className="cnc-btn-secondary text-[10px] px-3 whitespace-nowrap"
          style={{ fontWeight: "bold" }}
          title="Limpar a chapa atual e começar um novo layout do zero"
        >
          🧹 LIMPAR
        </button>
        <button
          onClick={onCalcReplication}
          className="cnc-btn-secondary text-[10px] px-3 whitespace-nowrap"
          style={{ fontWeight: "bold" }}
          title="Calcular quantas vezes o layout atual pode ser repetido com o inventário disponível"
        >
          🔄 REPETIÇÕES
        </button>
      </div>

      {replicationInfo && (
        <ReplicationInfoBox
          info={replicationInfo}
          onSave={onSaveLayout}
          onClose={() => setReplicationInfo(null)}
        />
      )}
    </div>
  );
};

export default CommandBar;
