import type { ReactNode } from "react";
import { AreaMessages } from "@/i18n/area-messages";

export default function PublicPlaceLayout({ children }: { children: ReactNode }) {
  return (
    <AreaMessages area="online">
      <div className="min-h-dvh bg-bg">{children}</div>
    </AreaMessages>
  );
}
