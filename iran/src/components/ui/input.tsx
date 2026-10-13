import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-transparent bg-surface-2 px-4 text-[15px] text-fg",
        "transition-colors placeholder:text-fg-subtle",
        "hover:bg-surface-3 focus-visible:border-ink focus-visible:bg-surface focus-visible:outline-none",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

/** Label + input + hint/error, correctly wired for screen readers. */
export function Field({
  label,
  hint,
  error,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-fg">
        {label}
      </label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
