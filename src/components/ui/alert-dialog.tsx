import * as React from "react";

export type AlertDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  // Minimal wrapper: consumer controls `open` state; this component only renders children.
  return <div data-alert-dialog="root">{children}</div>;
}

export const AlertDialogContent = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <div data-alert-dialog="content" className={className}>
    {children}
  </div>
);

export const AlertDialogHeader = ({ children }: { children?: React.ReactNode }) => (
  <div data-alert-dialog="header">{children}</div>
);

export const AlertDialogTitle = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <h3 data-alert-dialog="title" className={className}>
    {children}
  </h3>
);

export const AlertDialogDescription = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <p data-alert-dialog="description" className={className}>
    {children}
  </p>
);

export const AlertDialogAction = ({ children, className, onClick, ...props }: any) => (
  <button type="button" className={className} onClick={onClick} {...props}>
    {children}
  </button>
);

export default AlertDialog;
