import { homeScreen, resolveScreens } from "./screens";

/** Jobs in a restaurant team. Each sets a permission preset and the screen the member lands on. */
export const JOBS = ["manager", "cashier", "waiter", "bar", "kitchen"] as const;
export type Job = (typeof JOBS)[number];
export const isJob = (v: unknown): v is Job =>
  typeof v === "string" && (JOBS as readonly string[]).includes(v);
/** Jobs that work at a kitchen station (their screen shows only that station's items). */
export const STATION_JOBS: readonly Job[] = ["bar", "kitchen"];

/**
 * The dashboard screen a job opens on by default (path under /dashboard/{id}), or null for the
 * overview: the first of its default screens (see lib/screens).
 */
export function jobHome(kind: string, job: string | null | undefined): string | null {
  return homeScreen(resolveScreens({ role: "staff", job }), kind);
}

/** The sign-in link of a team job: staff open it on their device and land on their screen. */
export const staffLinkPath = (teamJobId: string) => `/staff/${teamJobId}`;
