/** Jobs in a restaurant team. Each sets a permission preset and the screen the member lands on. */
export const JOBS = ["manager", "cashier", "waiter", "bar", "kitchen"] as const;
export type Job = (typeof JOBS)[number];
export const isJob = (v: unknown): v is Job =>
  typeof v === "string" && (JOBS as readonly string[]).includes(v);
/** Jobs that work at a kitchen station (their screen shows only that station's items). */
export const STATION_JOBS: readonly Job[] = ["bar", "kitchen"];

/**
 * The dashboard screen a job opens on (path under /dashboard/{id}), or null for the overview.
 * In a hotel the front desk and housekeeping start on the rooms' requests.
 */
export function jobHome(kind: string, job: string | null | undefined): string | null {
  const map: Record<string, string> =
    kind === "hotel"
      ? { kitchen: "kitchen", bar: "kitchen", cashier: "requests", waiter: "requests" }
      : { kitchen: "kitchen", bar: "kitchen", cashier: "orders", waiter: "waiter" };
  return (job && map[job]) || null;
}

/** The sign-in link of a team job: staff open it on their device and land on their screen. */
export const staffLinkPath = (teamJobId: string) => `/staff/${teamJobId}`;
