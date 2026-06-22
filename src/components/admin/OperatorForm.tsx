import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface OperatorFormProps {
  sectors: { id: string; name: string }[];
  onSave?: () => void;
  onCancel?: () => void;
}

interface TempPasswordResponse {
  operatorId: string;
  tempPassword: string;
  email: string;
}

export function OperatorForm({ sectors, onSave, onCancel }: OperatorFormProps) {
  const [email, setEmail] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempPasswordData, setTempPasswordData] = useState<TempPasswordResponse | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

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

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sectorIds: selectedSectors,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setErrors({ submit: data.error ?? "Failed to create operator" });
        return;
      }

      const data = (await response.json()) as TempPasswordResponse;
      setTempPasswordData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseTempPasswordModal = () => {
    setTempPasswordData(null);
    setEmail("");
    setSelectedSectors([]);
    setErrors({});
    if (onSave) {
      onSave();
    }
  };

  const handleCopyPassword = () => {
    if (tempPasswordData) {
      void navigator.clipboard.writeText(tempPasswordData.tempPassword);
    }
  };

  if (tempPasswordData) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="font-medium text-green-900">Operator Created Successfully</h3>
          <p className="mt-2 text-sm text-green-800">
            An operator account has been created. Share this temporary password with the operator:
          </p>
          <div className="mt-4 space-y-2">
            <div className="text-sm">
              <span className="font-medium">Email:</span> {tempPasswordData.email}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span className="font-medium">Temp Password:</span>
                <div className="mt-1 rounded border border-gray-300 bg-gray-100 px-3 py-2 font-mono text-sm">
                  {tempPasswordData.tempPassword}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleCopyPassword}>
                Copy
              </Button>
            </div>
          </div>
          <p className="mt-4 text-xs text-green-700">The operator must change this password on first login.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleCloseTempPasswordModal} className="flex-1">
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {errors.submit && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errors.submit}</div>
      )}

      {/* Email Input */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email Address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          placeholder="operator@example.com"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
      </div>

      {/* Sector Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Assign to Sectors</label>
        {errors.sectors && <p className="mt-1 text-sm text-red-600">{errors.sectors}</p>}
        <div className="mt-2 space-y-2">
          {sectors.length === 0 ? (
            <p className="text-sm text-gray-500">No sectors available</p>
          ) : (
            sectors.map((sector) => (
              <div key={sector.id} className="flex items-center">
                <input
                  id={`sector-${sector.id}`}
                  type="checkbox"
                  checked={selectedSectors.includes(sector.id)}
                  onChange={() => {
                    handleSectorToggle(sector.id);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor={`sector-${sector.id}`} className="ml-3 text-sm text-gray-700">
                  {sector.name}
                </label>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Creating..." : "Create Operator"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
