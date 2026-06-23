import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}

export function SubmitButton({ pendingText, icon, children, disabled: externalDisabled }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || externalDisabled;

  return (
    <Button
      type="submit"
      disabled={isDisabled}
      className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
    >
      {isDisabled ? (
        <span className="flex items-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
