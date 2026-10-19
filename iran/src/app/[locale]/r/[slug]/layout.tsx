import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PublicPlaceLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
