/**
 * Hours, lateness, tips and pay from the clock-in records: pure functions, tested on their own.
 */

export type Entry = { userId: string; clockInAt: Date; clockOutAt: Date | null };
export type Planned = { userId: string; startsAt: Date; endsAt: Date };
export type Pool = { day: string; amountCents: number };

const HOUR = 3_600_000;
/** A clock-in this long after the planned start counts as late. */
export const LATE_AFTER_MIN = 5;
/** A clock-in left open this long is a forgotten clock-out, not 20 hours of work. */
export const MAX_SHIFT_HOURS = 16;

/** Local day ("YYYY-MM-DD") of a moment in the restaurant's time zone. */
export const localDayOf = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/** Hours of one entry inside [from, to); an open entry counts until `now`, capped. */
export function entryHours(e: Entry, from: Date, to: Date, now: Date) {
  const end =
    e.clockOutAt ?? new Date(Math.min(now.getTime(), e.clockInAt.getTime() + MAX_SHIFT_HOURS * HOUR));
  const a = Math.max(e.clockInAt.getTime(), from.getTime());
  const b = Math.min(end.getTime(), to.getTime());
  return b > a ? (b - a) / HOUR : 0;
}

/** Each day's tips shared by the hours each person worked that day (the day of their clock-in). */
export function splitTips(pools: Pool[], entries: Entry[], tz: string, now: Date) {
  const share = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const p of pools) byDay.set(p.day, (byDay.get(p.day) ?? 0) + p.amountCents);
  const undistributed: string[] = [];
  for (const [day, amount] of byDay) {
    const hours = new Map<string, number>();
    for (const e of entries) {
      if (localDayOf(e.clockInAt, tz) !== day) continue;
      const h = entryHours(e, new Date(0), new Date(8.64e15), now);
      hours.set(e.userId, (hours.get(e.userId) ?? 0) + h);
    }
    const total = [...hours.values()].reduce((s, h) => s + h, 0);
    if (!total) {
      undistributed.push(day);
      continue;
    }
    // Largest remainders: the shares add up to the exact amount.
    const raw = [...hours].map(([u, h]) => ({ u, exact: (amount * h) / total }));
    let left = amount - raw.reduce((s, r) => s + Math.floor(r.exact), 0);
    raw.sort((a, b) => (b.exact % 1) - (a.exact % 1));
    for (const r of raw) {
      const add = Math.floor(r.exact) + (left > 0 ? 1 : 0);
      if (left > 0) left--;
      share.set(r.u, (share.get(r.u) ?? 0) + add);
    }
  }
  return { share, undistributed };
}

/** Late arrivals: the first clock-in of a planned shift's day more than 5 minutes after its start. */
export function lateness(planned: Planned[], entries: Entry[]) {
  const late = new Map<string, { count: number; minutes: number }>();
  for (const p of planned) {
    // The clock-in that belongs to this shift: from 3 h before it starts to its end.
    const ins = entries
      .filter(
        (e) =>
          e.userId === p.userId &&
          e.clockInAt.getTime() >= p.startsAt.getTime() - 3 * HOUR &&
          e.clockInAt.getTime() < p.endsAt.getTime(),
      )
      .sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
    const first = ins[0];
    if (!first) continue;
    const min = Math.round((first.clockInAt.getTime() - p.startsAt.getTime()) / 60_000);
    if (min > LATE_AFTER_MIN) {
      const l = late.get(p.userId) ?? { count: 0, minutes: 0 };
      l.count++;
      l.minutes += min;
      late.set(p.userId, l);
    }
  }
  return late;
}

/** Planned shifts nobody clocked in for (a no-show, or someone who forgot). */
export function missedShifts(planned: Planned[], entries: Entry[], now: Date) {
  return planned.filter(
    (p) =>
      p.endsAt.getTime() < now.getTime() &&
      !entries.some(
        (e) =>
          e.userId === p.userId &&
          e.clockInAt.getTime() < p.endsAt.getTime() &&
          (e.clockOutAt ?? now).getTime() > p.startsAt.getTime() - 3 * HOUR,
      ),
  );
}

/** The instant of a local day and time ("2026-11-18", "08:30") in the restaurant's time zone. */
export function zonedInstant(day: string, time: string, tz: string) {
  const guess = new Date(`${day}T${time}:00Z`);
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const utcShown = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (shown.getTime() - utcShown.getTime()));
}

/** A start and an end typed as times of one day: an end before the start is the next morning. */
export function zonedSpan(day: string, start: string, end: string | null, tz: string) {
  const a = zonedInstant(day, start, tz);
  if (!end) return { start: a, end: null };
  let b = zonedInstant(day, end, tz);
  if (b <= a) b = new Date(b.getTime() + 86_400_000);
  return { start: a, end: b };
}
