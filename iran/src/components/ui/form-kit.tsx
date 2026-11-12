"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Sheet, useRun } from "@/components/ui/sheet-kit";

type Result = { ok: boolean; error?: string } | null | undefined;

/** A button running a server action, with optional confirmation and inline error. */
export function RunButton({
  run,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  onDone,
}: {
  run: () => Promise<Result>;
  children: ReactNode;
  confirm?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const r = useRun();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || r.pending}
        aria-busy={r.pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          r.run(run, onDone);
        }}
      >
        {children}
      </Button>
      {r.error ? (
        <span role="alert" className="text-xs text-danger">
          {r.error}
        </span>
      ) : null}
    </span>
  );
}

/** A button opening a sheet (dialog) with a form inside. */
export function SheetButton({
  label,
  title,
  children,
  variant = "secondary",
  size = "sm",
  className,
}: {
  label: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </Sheet>
      ) : null}
    </>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
      {error}
    </p>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 block text-sm font-semibold">
      {children}
      {hint ? <span className="ms-1 font-normal text-fg-muted">{hint}</span> : null}
    </span>
  );
}

export const inputCls =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-[15px] focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none";
