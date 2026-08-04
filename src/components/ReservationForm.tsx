import { useState, useEffect } from "react";

interface Sector {
  id: string;
  name: string;
  spot_count: number;
}

interface ReservationFormProps {
  sectors: Sector[];
  onCancel?: () => void;
}

export function ReservationForm({ sectors, onCancel }: ReservationFormProps) {
  const [selectedSectorId, setSelectedSectorId] = useState(sectors[0]?.id || "");
  const [arrivalAt, setArrivalAt] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [useOverride, setUseOverride] = useState(false);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);

  // Reset form to initial state
  const resetForm = () => {
    setSelectedSectorId(sectors[0]?.id || "");
    setArrivalAt("");
    setDepartureAt("");
    setCustomerName("");
    setLicensePlate("");
    setPriceOverride(null);
    setUseOverride(false);
    setCalculatedPrice(null);
    setErrors({});
    setIsSubmitting(false);
    setIsLoadingPrice(false);
  };

  // Listen for global reset event so parent can clear the form before showing
  useEffect(() => {
    const handler = () => {
      resetForm();
    };
    window.addEventListener("resetReservationForm", handler);
    return () => {
      window.removeEventListener("resetReservationForm", handler);
    };
  }, [sectors]);

  // Calculate price whenever sector, arrival, or departure changes
  useEffect(() => {
    if (!selectedSectorId || !arrivalAt || !departureAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCalculatedPrice(null);
      return;
    }

    const arrival = new Date(arrivalAt);
    const departure = new Date(departureAt);

    if (departure <= arrival) {
      setCalculatedPrice(null);
      return;
    }

    // Fetch pricing tier and calculate price
    const calculatePrice = async () => {
      setIsLoadingPrice(true);
      try {
        const calcResponse = await fetch("/api/reservations/calculate-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectorId: selectedSectorId,
            arrivalAt,
            departureAt,
          }),
        });

        if (calcResponse.ok) {
          const calcData = (await calcResponse.json()) as { price: number };
          setCalculatedPrice(calcData.price);
        }
      } catch (err) {
        console.error("Failed to calculate price:", err);
      } finally {
        setIsLoadingPrice(false);
      }
    };

    void calculatePrice();
  }, [selectedSectorId, arrivalAt, departureAt]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!selectedSectorId) {
      newErrors.sector = "Please select a sector";
    }

    if (!customerName.trim()) {
      newErrors.customerName = "Customer name is required";
    }

    if (!licensePlate.trim()) {
      newErrors.licensePlate = "License plate is required";
    }

    if (!arrivalAt) {
      newErrors.arrivalAt = "Arrival date is required";
    }

    if (!departureAt) {
      newErrors.departureAt = "Departure date is required";
    }

    if (arrivalAt && departureAt) {
      const arrival = new Date(arrivalAt);
      const departure = new Date(departureAt);
      if (departure <= arrival) {
        newErrors.dateRange = "Departure must be after arrival";
      }
    }

    if (useOverride && (!priceOverride || priceOverride <= 0)) {
      newErrors.priceOverride = "Override price must be greater than 0";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectorId: selectedSectorId,
          arrivalAt,
          departureAt,
          customerName,
          licensePlate,
          priceOverride: useOverride ? priceOverride : undefined,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setErrors({ submit: data.error ?? "Failed to create reservation" });
        return;
      }

      // Dispatch event to notify page to reload
      window.dispatchEvent(new CustomEvent("reservationCreated"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 [color-scheme:dark] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="" className="bg-slate-900 text-white">
            Select a sector
          </option>
          {sectors.map((s) => (
            <option key={s.id} value={s.id} className="bg-slate-900 text-white">
              {s.name}
            </option>
          ))}
        </select>
        {errors.sector && <p className="mt-1 text-sm text-red-400">{errors.sector}</p>}
      </div>

      {/* Customer Name */}
      <div>
        <label htmlFor="customerName" className="block text-sm font-medium text-white/80">
          Customer Name
        </label>
        <input
          id="customerName"
          type="text"
          value={customerName}
          onChange={(e) => {
            setCustomerName(e.target.value);
          }}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          placeholder="Enter customer name"
        />
        {errors.customerName && <p className="mt-1 text-sm text-red-400">{errors.customerName}</p>}
      </div>

      {/* License Plate */}
      <div>
        <label htmlFor="licensePlate" className="block text-sm font-medium text-white/80">
          License Plate
        </label>
        <input
          id="licensePlate"
          type="text"
          value={licensePlate}
          onChange={(e) => {
            setLicensePlate(e.target.value.toUpperCase());
          }}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          placeholder="ABC-1234"
        />
        {errors.licensePlate && <p className="mt-1 text-sm text-red-400">{errors.licensePlate}</p>}
      </div>

      {/* Arrival Date */}
      <div>
        <label htmlFor="arrivalAt" className="block text-sm font-medium text-white/80">
          Arrival Date
        </label>
        <input
          id="arrivalAt"
          type="date"
          value={arrivalAt}
          onChange={(e) => {
            setArrivalAt(e.target.value);
          }}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {errors.arrivalAt && <p className="mt-1 text-sm text-red-400">{errors.arrivalAt}</p>}
      </div>

      {/* Departure Date */}
      <div>
        <label htmlFor="departureAt" className="block text-sm font-medium text-white/80">
          Departure Date
        </label>
        <input
          id="departureAt"
          type="date"
          value={departureAt}
          onChange={(e) => {
            setDepartureAt(e.target.value);
          }}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {errors.departureAt && <p className="mt-1 text-sm text-red-400">{errors.departureAt}</p>}
        {errors.dateRange && <p className="mt-1 text-sm text-red-400">{errors.dateRange}</p>}
      </div>

      {/* Price Display */}
      {calculatedPrice !== null && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-200/70">Calculated Price</p>
              <p className="text-2xl font-bold text-blue-100">${calculatedPrice.toFixed(2)}</p>
            </div>
            {isLoadingPrice && <p className="text-sm text-blue-200/50">Calculating...</p>}
          </div>
        </div>
      )}

      {/* Price Override */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            id="useOverride"
            type="checkbox"
            checked={useOverride}
            onChange={(e) => {
              setUseOverride(e.target.checked);
            }}
            className="h-4 w-4 rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="useOverride" className="text-sm font-medium text-white/80">
            Override Price
          </label>
        </div>

        {useOverride && (
          <>
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
              <p className="text-xs text-yellow-200">⚠️ This price override will be audited</p>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceOverride ?? ""}
              onChange={(e) => {
                setPriceOverride(e.target.value ? parseFloat(e.target.value) : null);
              }}
              placeholder={calculatedPrice?.toFixed(2)}
              className="block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            {errors.priceOverride && <p className="mt-1 text-sm text-red-400">{errors.priceOverride}</p>}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting || isLoadingPrice}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Creating..." : "Create Reservation"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (onCancel) onCancel();
            window.dispatchEvent(new CustomEvent("cancelReservationForm"));
          }}
          className="rounded-lg border border-white/20 px-6 py-2 font-medium text-white transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
