"use client";

import { useEffect } from "react";

/** Transient, non-blocking confirmation (announced to screen readers). */
export function Toast({
  message,
  onDone,
  duration = 5000,
}: {
  message: string | null;
  onDone: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, duration);
    return () => clearTimeout(id);
  }, [message, onDone, duration]);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 print:hidden"
    >
      {message ? (
        <p
          role="status"
          className="pointer-events-auto rounded-xl bg-fg px-4 py-3 text-sm font-medium text-bg shadow-2xl"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
