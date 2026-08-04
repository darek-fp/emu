import { useState, useEffect } from "react";

interface OperatorSectorEditorProps {
  sectors: { id: string; name: string }[];
}

interface OperatorData {
  operatorId: string;
  email: string;
  currentSectorIds: string[];
}

export function OperatorSectorEditor({ sectors }: OperatorSectorEditorProps) {
  const [operator, setOperator] = useState<OperatorData | null>(null);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  // Listen for edit requests
  useEffect(() => {
    const handleEditOperator = (e: Event) => {
      const event = e as CustomEvent;
      const data = event.detail as OperatorData;
      setOperator(data);
      setSelectedSectors(data.currentSectorIds);
      setErrors({});
      setSuccessMessage(false);
    };

    window.addEventListener("editOperator", handleEditOperator);
    return () => {
      window.removeEventListener("editOperator", handleEditOperator);
    };
  }, []);

  if (!operator) {
    return null;
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (selectedSectors.length === 0) {
      newErrors.sectors = "Please select at least one sector";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSectorToggle = (sectorId: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sectorId) ? prev.filter((id) => id !== sectorId) : [...prev, sectorId],
    );
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/operators/${operator.operatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateSectors",
          sectorIds: selectedSectors,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        try {
          const maybe = JSON.parse(text) as unknown;
          let errMsg: string | undefined;
          if (typeof maybe === "object" && maybe !== null) {
            const rec = maybe as Record<string, unknown>;
            if (typeof rec.error === "string") {
              errMsg = rec.error;
            }
          }
          setErrors({ submit: errMsg ?? `Failed to update operator sectors: ${response.statusText}` });
        } catch {
          setErrors({ submit: `Failed to update operator sectors: ${response.statusText}` });
        }
        return;
      }

      const text = await response.text();
      if (!text) {
        setErrors({ submit: "Empty response from server" });
        return;
      }

      try {
        JSON.parse(text);
        setSuccessMessage(true);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("operatorUpdated"));
        }, 500);
      } catch (_parseErr) {
        setErrors({ submit: "Invalid response format from server" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setOperator(null);
    setSelectedSectors([]);
    setErrors({});
    setSuccessMessage(false);
    window.dispatchEvent(new CustomEvent("cancelEditForm"));
  };

  if (successMessage) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
          <h3 className="font-medium text-green-400">Sectors Updated Successfully</h3>
          <p className="mt-2 text-sm text-green-300">The operator&apos;s sector assignments have been updated.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.submit && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {errors.submit}
        </div>
      )}

      {/* Operator Email Display */}
      <div>
        <label className="block text-sm font-medium text-white/80">Operator Email</label>
        <div className="mt-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white">
          {operator.email}
        </div>
      </div>

      {/* Sector Selection */}
      <div>
        <label className="block text-sm font-medium text-white/80">Assign to Sectors</label>
        {errors.sectors && <p className="mt-1 text-sm text-red-400">{errors.sectors}</p>}
        <div className="mt-2 space-y-2">
          {sectors.length === 0 ? (
            <p className="text-sm text-white/60">No sectors available</p>
          ) : (
            sectors.map((sector) => (
              <div key={sector.id} className="flex items-center">
                <input
                  id={`edit-sector-${sector.id}`}
                  type="checkbox"
                  checked={selectedSectors.includes(sector.id)}
                  onChange={() => {
                    handleSectorToggle(sector.id);
                  }}
                  className="h-4 w-4 rounded border-white/20 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor={`edit-sector-${sector.id}`} className="ml-3 text-sm text-white/80">
                  {sector.name}
                </label>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-white/20 px-6 py-2 font-medium text-white transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
