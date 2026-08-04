import React, { useState } from "react";
import { Mail, Lock, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

const MIN_PASSWORD_LENGTH = 8;

interface Props {
  serverError?: string | null;
}

export default function SignUpForm({ serverError: initialServerError }: Props) {
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    tempPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(initialServerError ?? null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address";
    }

    if (!tempPassword) {
      next.tempPassword = "Temporary password is required";
    }

    if (!newPassword) {
      next.newPassword = "New password is required";
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      next.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (!confirmPassword) {
      next.confirmPassword = "Please confirm your new password";
    } else if (newPassword !== confirmPassword) {
      next.confirmPassword = "Passwords do not match";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          tempPassword: tempPassword.trim(),
          newPassword,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string; message?: string };

      if (!response.ok || !data.success) {
        setServerError(data.error ?? "Failed to create account");
        return;
      }

      setSuccessMessage(data.message ?? "Account created successfully! You can now sign in.");
      setEmail("");
      setTempPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (successMessage) {
    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-center">
        <h3 className="font-medium text-green-400">Success!</h3>
        <p className="mt-2 text-sm text-green-300">{successMessage}</p>
        <a
          href="/auth/signin"
          className="mt-4 inline-block text-blue-400 transition-colors hover:text-blue-300 hover:underline"
        >
          Go to Sign In
        </a>
      </div>
    );
  }

  const newPasswordHint =
    !errors.newPassword && newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH ? (
      <p className="mt-1 text-xs text-blue-100/50">
        {MIN_PASSWORD_LENGTH - newPassword.length} more character
        {MIN_PASSWORD_LENGTH - newPassword.length !== 1 ? "s" : ""} needed
      </p>
    ) : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="email"
        type="email"
        label="Email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="you@example.com"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="tempPassword"
        label="Temporary Password (from admin)"
        type={showTempPassword ? "text" : "password"}
        value={tempPassword}
        onChange={(v) => {
          setTempPassword(v);
          clearError("tempPassword");
        }}
        placeholder="Paste the password admin gave you"
        error={errors.tempPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showTempPassword}
            onToggle={() => {
              setShowTempPassword(!showTempPassword);
            }}
          />
        }
      />

      <FormField
        id="newPassword"
        label="New Password"
        type={showNewPassword ? "text" : "password"}
        value={newPassword}
        onChange={(v) => {
          setNewPassword(v);
          clearError("newPassword");
        }}
        placeholder="Create a strong password"
        error={errors.newPassword}
        hint={newPasswordHint}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showNewPassword}
            onToggle={() => {
              setShowNewPassword(!showNewPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        label="Confirm New Password"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Re-enter your new password"
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton disabled={isSubmitting} pendingText="Creating account..." icon={<UserPlus className="size-4" />}>
        Create account
      </SubmitButton>
    </form>
  );
}
