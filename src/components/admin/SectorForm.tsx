import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Sector } from "./SectorList";

interface SectorFormProps {
  sectors: Sector[];
  onSuccess: () => void;
}

interface Operation {
  type: "add" | "update";
  name?: string;
  spotCount?: number;
  id?: string;
}

interface ConflictData {
  sectorName: string;
  activeReservations: number;
}

interface ApiResponse {
  conflicts?: ConflictData[];
  error?: string;
}

export function SectorForm({ sectors, onSuccess }: SectorFormProps) {
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorCount, setNewSectorCount] = useState("");
  const [updates, setUpdates] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (newSectorName.trim() && !newSectorCount) {
      newErrors.newSectorCount = "Spot count is required for new sector";
    }
    if (newSectorName.trim() && parseInt(newSectorCount) <= 0) {
      newErrors.newSectorCount = "Spot count must be greater than 0";
    }
    if (newSectorName.trim() && sectors.some((s) => s.name === newSectorName)) {
      newErrors.newSectorName = "Sector name already exists";
    }

    for (const [id, count] of Object.entries(updates)) {
      if (count <= 0) {
        newErrors[`update_${id}`] = "Spot count must be greater than 0";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const operations: Operation[] = [];

    if (newSectorName.trim() && newSectorCount) {
      operations.push({
        type: "add",
        name: newSectorName,
        spotCount: parseInt(newSectorCount),
      });
    }

    for (const [id, spotCount] of Object.entries(updates)) {
      operations.push({
        type: "update",
        id,
        spotCount,
      });
    }

    if (operations.length === 0) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/sectors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operations }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        if (data.conflicts) {
          setConflictWarning(
            `Conflict detected: ${data.conflicts
              .map((c) => `${c.sectorName} has ${c.activeReservations} active reservation(s)`)
              .join(", ")}`,
          );
        } else {
          setErrors({ submit: data.error ?? "Failed to submit changes" });
        }
        return;
      }

      // Success
      setNewSectorName("");
      setNewSectorCount("");
      setUpdates({});
      setErrors({});
      onSuccess();
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Add New Sector Section */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Add New Sector</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="newSectorName" className="mb-1 block text-sm font-medium text-white/80">
                Sector Name
              </label>
              <input
                id="newSectorName"
                type="text"
                value={newSectorName}
                onChange={(e) => {
                  setNewSectorName(e.target.value);
                }}
                placeholder="e.g., Main Lot, North Parking"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder:text-white/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                disabled={loading}
              />
              {errors.newSectorName && <p className="mt-1 text-sm text-red-400">{errors.newSectorName}</p>}
            </div>
            <div>
              <label htmlFor="newSectorCount" className="mb-1 block text-sm font-medium text-white/80">
                Spot Count
              </label>
              <input
                id="newSectorCount"
                type="number"
                value={newSectorCount}
                onChange={(e) => {
                  setNewSectorCount(e.target.value);
                }}
                placeholder="e.g., 50"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder:text-white/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                disabled={loading}
              />
              {errors.newSectorCount && <p className="mt-1 text-sm text-red-400">{errors.newSectorCount}</p>}
            </div>
          </div>
        </div>

        {/* Update Existing Sectors Section */}
        {sectors.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Update Existing Sectors</h3>
            <div className="space-y-4">
              {sectors.map((sector) => (
                <div key={sector.id}>
                  <label htmlFor={`update_${sector.id}`} className="mb-1 block text-sm font-medium text-white/80">
                    {sector.name}
                  </label>
                  <input
                    id={`update_${sector.id}`}
                    type="number"
                    value={updates[sector.id] ?? sector.spot_count}
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) : sector.spot_count;
                      setUpdates({
                        ...updates,
                        [sector.id]: value,
                      });
                    }}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    disabled={loading}
                  />
                  {errors[`update_${sector.id}`] && (
                    <p className="mt-1 text-sm text-red-400">{errors[`update_${sector.id}`]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {errors.submit && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{errors.submit}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>

      {/* Conflict Warning Dialog */}
      <AlertDialog
        open={!!conflictWarning}
        onOpenChange={() => {
          setConflictWarning(null);
        }}
      >
        <AlertDialogContent className="border-white/10 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Conflict Detected</AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">{conflictWarning}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction
            onClick={() => {
              setConflictWarning(null);
            }}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            Dismiss
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
