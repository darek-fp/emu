import { useState } from "react";
import { Lock } from "lucide-react";

interface OperatorFormProps {
  sectors: { id: string; name: string }[];
  onSave?: () => void;
}

interface OperatorResponse {
  operatorId: string;
  email: string;
}

export function OperatorForm({ sectors, onSave }: OperatorFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<OperatorResponse | null>(null);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Validate password
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
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
          password,
          sectorIds: selectedSectors,
        }),
      });

      console.log("[OperatorForm] Response status:", response.status, "ok:", response.ok);

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        console.error("[OperatorForm] Error response:", data);
        setErrors({ submit: data.error ?? "Failed to create operator" });
        return;
      }

      const data = (await response.json()) as { success?: boolean; operatorId?: string; email?: string };
      console.log("[OperatorForm] Success response:", data);

      // Verify required fields exist
      if (!data.operatorId || !data.email) {
        console.error("[OperatorForm] Missing required fields in response:", data);
        setErrors({ submit: "Invalid response from server - incomplete operator data" });
        return;
      }

      setSuccessMessage(data as OperatorResponse);
      // Reset form
      setEmail("");
      setPassword("");
      setSelectedSectors([]);
      setErrors({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[OperatorForm] Error:", message);
      setErrors({ submit: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSuccess = () => {
    setSuccessMessage(null);
    setEmail("");
    setPassword("");
    setSelectedSectors([]);
    setErrors({});

    // Emit a custom event so the page can close the form
    window.dispatchEvent(new CustomEvent("operatorCreated"));

    if (onSave) {
      onSave();
    }
  };

  if (successMessage) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
          <h3 className="font-medium text-green-400">Operator Created Successfully</h3>
          <p className="mt-2 text-sm text-green-300">
            The operator account has been created and can log in immediately with the email and password you provided.
          </p>
          <div className="mt-4 space-y-2">
            <div>
              <span className="font-medium text-white">Email:</span>
              <div className="mt-1 rounded border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm text-white">
                {successMessage.email}
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-green-300">The operator can now sign in at /auth/signin</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCloseSuccess}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Done
          </button>
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

      {/* Email Input */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-white/80">
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
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email}</p>}
      </div>

      {/* Password Input */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-white/80">
          Initial Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          placeholder="Min. 8 characters"
          className="mt-1 block w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password}</p>}
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
                  id={`sector-${sector.id}`}
                  type="checkbox"
                  checked={selectedSectors.includes(sector.id)}
                  onChange={() => {
                    handleSectorToggle(sector.id);
                  }}
                  className="h-4 w-4 rounded border-white/20 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor={`sector-${sector.id}`} className="ml-3 text-sm text-white/80">
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
          {isSubmitting ? "Creating..." : "Create Operator"}
        </button>
        <button
          type="button"
          id="formCancelBtn"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("cancelForm"));
          }}
          className="rounded-lg border border-white/20 px-6 py-2 font-medium text-white transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
