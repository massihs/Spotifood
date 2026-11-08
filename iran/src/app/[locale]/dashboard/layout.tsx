import type { ReactNode } from "react";
import { AreaMessages } from "@/i18n/area-messages";

/** Restaurant panel: only the messages its client components use. */
export default function Layout({ children }: { children: ReactNode }) {
  return <AreaMessages area="dashboard">{children}</AreaMessages>;
}
