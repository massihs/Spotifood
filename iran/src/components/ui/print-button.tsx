"use client";

import { Printer } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
