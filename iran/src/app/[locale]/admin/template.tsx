import type { ReactNode } from "react";

/** Re-mounted on every navigation: the new page eases in (see .page-enter). */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
