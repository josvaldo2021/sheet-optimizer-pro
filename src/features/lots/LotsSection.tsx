import { Lot } from "@/lib/cnc-engine";
import SidebarSection from "@/components/SidebarSection";
import LotCard from "./LotCard";

interface Props {
  lots: Lot[];
  setLots: React.Dispatch<React.SetStateAction<Lot[]>>;
  expandedLotId: string | null;
  setExpandedLotId: (id: string | null) => void;
  onPrint: (lot: Lot) => void;
  onReturn: (lot: Lot) => void;
}

const LotsSection = ({ lots, setLots, expandedLotId, setExpandedLotId, onPrint, onReturn }: Props) => (
  <SidebarSection title={`Lotes${lots.length > 0 ? ` (${lots.length})` : ""}`} icon="📋" defaultOpen={true}>
    <div className="p-2.5" style={{ background: "hsl(237 50% 12%)" }}>
      {lots.length === 0 ? (
        <div className="text-center text-[11px] py-4" style={{ color: "hsl(220 18% 44%)" }}>
          Nenhum lote gerado ainda.
          <div className="text-[10px] mt-1" style={{ color: "hsl(220 18% 36%)" }}>
            Confirme um plano para criar o primeiro lote.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {lots.map((lot) => (
            <LotCard
              key={lot.id}
              lot={lot}
              isExpanded={expandedLotId === lot.id}
              onToggle={() => setExpandedLotId(expandedLotId === lot.id ? null : lot.id)}
              onPrint={onPrint}
              onReturn={onReturn}
              onRemove={(id) => {
                setLots((prev) => prev.filter((l) => l.id !== id));
                if (expandedLotId === id) setExpandedLotId(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  </SidebarSection>
);

export default LotsSection;
