import { useState, useEffect } from "react";

interface EditOperatorFormProps {
  operatorId?: string;
  email?: string;
  currentSectorIds?: string[];
  sectors: { id: string; name: string }[];
  onSave?: () => void;
  onCancel?: () => void;
}

export function EditOperatorForm({
  operatorId = "",
  email = "",
  currentSectorIds = [],
  sectors,
  onSave,
  onCancel,
}: EditOperatorFormProps) {
  const [selectedSectors, setSelectedSectors] = useState<string[]>(currentSectorIds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [displayEmail, setDisplayEmail] = useState(email);

  // Update form when data attributes change
  useEffect(() => {
    const container = document.getElementById("editFormContainer");
    if (container) {
      const opId = container.getAttribute("data-operator-id");
      const opEmail = container.getAttribute("data-operator-email");
      const sectorStr = container.getAttribute("data-sector-ids");

      if (opEmail) {
        setDisplayEmail(opEmail);
      }
      if (sectorStr) {
        setSelectedSectors(sectorStr.split(",").filter((s) => s));
      }
    }
  }, []);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const container = document.getElementById("editFormContainer");
    const opId = container?.getAttribute("data-operator-id") || operatorId;

    if (!opId) {
      setErrors({ submit: "No operator selected" });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/operators/${opId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateSectors",
          sectorIds: selectedSectors,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setErrors({ submit: data.error ?? "Failed to update operator sectors" });
        return;
      }

      setSuccessMessage(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("operatorUpdated"));
      }, 500);

      if (onSave) {
        onSave();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
          <h3 className="font-medium text-green-400">Sectors Updated Successfully</h3>
          <p className="mt-2 text-sm text-green-300">
            The operator's sector assignments have been updated.
          </p>
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
          {displayEmail}
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
          onClick={onCancel}
          className="rounded-lg border border-white/20 px-6 py-2 font-medium text-white transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
