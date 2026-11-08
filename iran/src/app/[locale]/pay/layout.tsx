import type { ReactNode } from "react";
import { AreaMessages } from "@/i18n/area-messages";

/** Simulated payment page (development): only the messages its client components use. */
export default function Layout({ children }: { children: ReactNode }) {
  return <AreaMessages area="pay">{children}</AreaMessages>;
}
