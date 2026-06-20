import { AlertCircle } from "lucide-react";

export interface Sector {
  id: string;
  name: string;
  spot_count: number;
  created_at?: string;
  updated_at?: string;
}

interface SectorListProps {
  sectors: Sector[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  isEditing?: boolean;
}

export function SectorList({ sectors, selectedId, onSelect, isEditing = false }: SectorListProps) {
  if (sectors.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-white/50" />
        <p className="text-white/70">No sectors configured yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <table className="w-full text-sm text-white">
        <thead className="border-b border-white/10 bg-white/10">
          <tr>
            <th className="px-6 py-3 text-left font-semibold">Sector Name</th>
            <th className="px-6 py-3 text-right font-semibold">Spot Count</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((sector, index) => (
            <tr
              key={sector.id}
              className={`border-t border-white/10 transition-colors ${index % 2 === 0 ? "bg-white/0" : "bg-white/5"} ${
                isEditing && selectedId === sector.id ? "bg-blue-500/20" : ""
              } cursor-pointer hover:bg-white/10`}
              onClick={() => onSelect?.(sector.id)}
            >
              <td className="px-6 py-4">{sector.name}</td>
              <td className="px-6 py-4 text-right font-mono">{sector.spot_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
