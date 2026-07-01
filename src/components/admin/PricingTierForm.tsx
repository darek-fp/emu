import { useRef, useState } from "react";

interface DiscountStep {
  dayMin: number;
  dayMax: number;
  discountPercent: number;
}

interface PricingTier {
  sectorId: string;
  baseRate: number;
  floor: number;
  discountSteps: DiscountStep[];
}

interface PricingTierFormProps {
  sectorId: string;
  sectors: { id: string; name: string }[];
  onSave?: (tier: PricingTier) => void;
  onCancel?: () => void;
  initialTier?: PricingTier;
}

export function PricingTierForm({
  sectorId: defaultSectorId,
  sectors,
  onSave,
  onCancel,
  initialTier,
}: PricingTierFormProps) {
  const [selectedSectorId, setSelectedSectorId] = useState(initialTier?.sectorId ?? defaultSectorId ?? sectors[0]?.id ?? "");
  const [baseRate, setBaseRate] = useState(initialTier?.baseRate ?? 100);
  const [floor, setFloor] = useState(initialTier?.floor ?? 50);
  const [discountSteps, setDiscountSteps] = useState<DiscountStep[]>(initialTier?.discountSteps ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!selectedSectorId) {
      newErrors.sector = "Please select a sector";
    }

    if (baseRate <= 0) {
      newErrors.baseRate = "Base rate must be greater than 0";
    }

    if (floor < 0) {
      newErrors.floor = "Floor must be 0 or greater";
    }

    // Validate discount steps
    for (const step of discountSteps) {
      if (step.dayMin <= 0 || step.dayMax <= 0) {
        newErrors.discountSteps = "Day ranges must be positive";
        break;
      }
      if (step.dayMin > step.dayMax) {
        newErrors.discountSteps = "Day min must be less than or equal to day max";
        break;
      }
      if (step.discountPercent < 0 || step.discountPercent > 100) {
        newErrors.discountSteps = "Discount percent must be between 0 and 100";
        break;
      }
    }

    // Check for overlapping ranges
    for (let i = 0; i < discountSteps.length; i++) {
      for (let j = i + 1; j < discountSteps.length; j++) {
        const step1 = discountSteps[i];
        const step2 = discountSteps[j];
        // Check if ranges overlap
        if (!(step1.dayMax < step2.dayMin || step2.dayMax < step1.dayMin)) {
          newErrors.discountSteps = "Discount step ranges cannot overlap";
          break;
        }
      }
      if (newErrors.discountSteps) break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddStep = () => {
    const nextDayMin = discountSteps.length > 0 ? discountSteps[discountSteps.length - 1].dayMax + 1 : 1;
    setDiscountSteps([...discountSteps, { dayMin: nextDayMin, dayMax: nextDayMin + 2, discountPercent: 5 }]);
  };

  const handleRemoveStep = (index: number) => {
    setDiscountSteps(discountSteps.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, field: keyof DiscountStep, value: number) => {
    const updated = [...discountSteps];
    updated[index] = { ...updated[index], [field]: value };
    setDiscountSteps(updated);
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectorId: selectedSectorId,
          baseRate,
          floor,
          discountSteps,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setErrors({ submit: data.error ?? "Failed to save pricing tier" });
        return;
      }

      if (onSave) {
        onSave({ sectorId: selectedSectorId, baseRate, floor, discountSteps });
      }
      
      // Dispatch event to notify form container to reload
      window.dispatchEvent(new CustomEvent("tierSaved"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {errors.submit && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {errors.submit}
        </div>
      )}

      {/* Sector Selection */}
      <div>
        <label htmlFor="sector" className="block text-sm font-medium text-white/80">
          Sector
        </label>
        <select
          id="sector"
          value={selectedSectorId}
          onChange={(e) => {
            setSelectedSectorId(e.target.value);
          }}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select a sector</option>
          {sectors.map((s) => (
            <option key={s.id} value={s.id} className="bg-gray-900">
              {s.name}
            </option>
          ))}
        </select>
        {errors.sector && <p className="mt-1 text-sm text-red-400">{errors.sector}</p>}
      </div>

      {/* Base Rate */}
      <div>
        <label htmlFor="baseRate" className="block text-sm font-medium text-white/80">
          Base Daily Rate ($)
        </label>
        <input
          id="baseRate"
          type="number"
          step="0.01"
          min="0"
          value={baseRate}
          onChange={(e) => {
            setBaseRate(parseFloat(e.target.value));
          }}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {errors.baseRate && <p className="mt-1 text-sm text-red-400">{errors.baseRate}</p>}
      </div>

      {/* Daily Floor */}
      <div>
        <label htmlFor="floor" className="block text-sm font-medium text-white/80">
          Daily Floor ($)
        </label>
        <input
          id="floor"
          type="number"
          step="0.01"
          min="0"
          value={floor}
          onChange={(e) => {
            setFloor(parseFloat(e.target.value));
          }}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {errors.floor && <p className="mt-1 text-sm text-red-400">{errors.floor}</p>}
      </div>

      {/* Discount Steps */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <label className="block text-sm font-medium text-white/80">Discount Steps</label>
          <button
            type="button"
            onClick={handleAddStep}
            className="rounded px-3 py-1 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white"
          >
            + Add Step
          </button>
        </div>

        {errors.discountSteps && <p className="mb-2 text-sm text-red-400">{errors.discountSteps}</p>}

        {discountSteps.length === 0 ? (
          <p className="text-sm text-white/60">No discount steps configured. Click &quot;+ Add Step&quot; to add one.</p>
        ) : (
          <div className="space-y-3">
            {discountSteps.map((step, index) => (
              <div key={index} className="flex items-end gap-3 rounded-lg border border-white/20 bg-white/5 p-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-white/60">Day Min</label>
                  <input
                    type="number"
                    min="1"
                    value={step.dayMin}
                    onChange={(e) => {
                      handleStepChange(index, "dayMin", parseInt(e.target.value));
                    }}
                    className="mt-1 block w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder-white/40 focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-white/60">Day Max</label>
                  <input
                    type="number"
                    min="1"
                    value={step.dayMax}
                    onChange={(e) => {
                      handleStepChange(index, "dayMax", parseInt(e.target.value));
                    }}
                    className="mt-1 block w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder-white/40 focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-white/60">Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={step.discountPercent}
                    onChange={(e) => {
                      handleStepChange(index, "discountPercent", parseInt(e.target.value));
                    }}
                    className="mt-1 block w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder-white/40 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleRemoveStep(index);
                  }}
                  className="rounded px-3 py-1 text-sm text-red-400 hover:bg-red-500/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Save Tier"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/20 px-6 py-2 font-medium text-white transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
