import type { Job } from "./jobs";

/**
 * The dashboard's screens, in menu order. The owner decides which ones each job (and, if needed,
 * each person) sees: the kitchen only its tickets, the till its register… A screen that is not
 * allowed is hidden from the menu and its page sends the member back to their own screen.
 * The key is also the page's path under /dashboard/{id} ("overview" is the dashboard's root).
 */
export const SCREENS = [
  "overview",
  "requests",
  "rooms",
  "pos",
  "waiter",
  "orders",
  "kitchen",
  "floor",
  "callcenter",
  "delivery",
  "reservations",
  "b2b",
  "menu",
  "inventory",
  "tables",
  "customers",
  "feedback",
  "music",
  "reports",
  "accounting",
  "payments",
  "invoices",
  "branches",
  "team",
  "billing",
  "settings",
] as const;
export type Screen = (typeof SCREENS)[number];
export const isScreen = (v: unknown): v is Screen =>
  typeof v === "string" && (SCREENS as readonly string[]).includes(v);

/** Screens only a hotel has. */
export const HOTEL_SCREENS: readonly Screen[] = ["requests", "rooms"];

/**
 * What each base job sees until the owner changes it (null: every screen its permissions open).
 * The first screen of the list is where the member lands.
 */
export const JOB_SCREENS: Record<Job, readonly Screen[] | null> = {
  manager: null,
  cashier: [
    "requests",
    "rooms",
    "orders",
    "pos",
    "delivery",
    "callcenter",
    "reservations",
    "b2b",
    "customers",
    "payments",
    "invoices",
  ],
  waiter: ["requests", "rooms", "waiter", "orders", "floor", "reservations"],
  bar: ["kitchen"],
  kitchen: ["kitchen"],
};

/** Keeps known screens, in menu order, without duplicates. */
export function cleanScreens(list: readonly string[]): Screen[] {
  const set = new Set(list);
  return SCREENS.filter((s) => set.has(s));
}

/**
 * A member's screens: their own list, else their job's, else the base job's default.
 * Null means no restriction (owners always; managers and members without a job by default).
 */
export function resolveScreens(input: {
  role: "owner" | "admin" | "staff";
  job?: string | null;
  memberScreens?: readonly string[] | null;
  jobScreens?: readonly string[] | null;
}): Screen[] | null {
  if (input.role === "owner") return null;
  const own = input.memberScreens ?? input.jobScreens;
  if (own) {
    const list = cleanScreens(own);
    return list.length === SCREENS.length ? null : list;
  }
  if (input.role !== "staff" || !input.job) return null;
  const preset = JOB_SCREENS[input.job as Job];
  return preset ? [...preset] : null;
}

/** Whether a screen is open to a member (null: everything). */
export const screenAllowed = (screens: readonly Screen[] | null | undefined, s: Screen) =>
  !screens || screens.includes(s);

/** Path (under /dashboard/{id}) of a screen. */
export const screenPath = (s: Screen) => (s === "overview" ? "" : `/${s}`);

/** Where a member lands: the first of their screens this venue has (null: the overview). */
export function homeScreen(screens: readonly Screen[] | null | undefined, kind: string): Screen | null {
  if (!screens) return null;
  const usable = screens.filter((s) => kind === "hotel" || !HOTEL_SCREENS.includes(s));
  return usable[0] ?? null;
}
