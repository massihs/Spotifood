import { and, asc, desc, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { plannedShifts, restaurantMembers, timeEntries, tipPools, users } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import type { Range } from "@/server/modules/reports/service";
import { entryHours, lateness, missedShifts, splitTips } from "./payroll";

/**
 * The team's time: clock-in and clock-out (every member, from the dashboard's top bar), the week's
 * planning, the day's tips and the payroll of the hours worked (owners and managers).
 */

const DAY = 86_400_000;

// ─── Clock in / out ──────────────────────────────────────────────────────────

async function openEntry(db: DbOrTx, restaurantId: string, userId: string) {
  const [e] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.restaurantId, restaurantId),
        eq(timeEntries.userId, userId),
        isNull(timeEntries.clockOutAt),
      ),
    )
    .orderBy(desc(timeEntries.clockInAt))
    .limit(1);
  return e ?? null;
}

/** Whether the person is clocked in here, and since when. */
export async function clockStatus(db: DbOrTx, ctx: RestaurantContext) {
  if (ctx.viaSuperAdmin) return null;
  const e = await openEntry(db, ctx.restaurant.id, ctx.user.id);
  return { clockedIn: !!e, since: e?.clockInAt ?? null };
}

export async function clockIn(db: Database, ctx: RestaurantContext, now = new Date()) {
  if (ctx.viaSuperAdmin) throw conflict("not_a_member");
  return db.transaction(async (tx) => {
    if (await openEntry(tx, ctx.restaurant.id, ctx.user.id)) throw conflict("already_clocked_in");
    const [e] = await tx
      .insert(timeEntries)
      .values({ restaurantId: ctx.restaurant.id, userId: ctx.user.id, clockInAt: now })
      .returning();
    return e!;
  });
}

export async function clockOut(db: Database, ctx: RestaurantContext, now = new Date()) {
  return db.transaction(async (tx) => {
    const e = await openEntry(tx, ctx.restaurant.id, ctx.user.id);
    if (!e) throw conflict("not_clocked_in");
    const [done] = await tx
      .update(timeEntries)
      .set({ clockOutAt: now })
      .where(eq(timeEntries.id, e.id))
      .returning();
    return done!;
  });
}

// ─── Records (managers) ──────────────────────────────────────────────────────

const overlaps = (r: Range) =>
  and(
    lt(timeEntries.clockInAt, r.to),
    or(isNull(timeEntries.clockOutAt), gte(timeEntries.clockOutAt, r.from)),
  );

export async function listEntries(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "members.manage");
  return db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      name: users.fullName,
      clockInAt: timeEntries.clockInAt,
      clockOutAt: timeEntries.clockOutAt,
      note: timeEntries.note,
      edited: timeEntries.editedByUserId,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(and(eq(timeEntries.restaurantId, ctx.restaurant.id), overlaps(r)))
    .orderBy(desc(timeEntries.clockInAt))
    .limit(500);
}

const entrySchema = z
  .object({
    userId: z.uuid(),
    clockInAt: z.coerce.date(),
    clockOutAt: z.coerce.date().nullable(),
    note: z.string().trim().max(200).default(""),
  })
  .refine((e) => !e.clockOutAt || e.clockOutAt > e.clockInAt, { message: "end_before_start" })
  .refine((e) => !e.clockOutAt || e.clockOutAt.getTime() - e.clockInAt.getTime() <= DAY, {
    message: "too_long",
  });

async function assertMember(db: DbOrTx, restaurantId: string, userId: string) {
  const [m] = await db
    .select({ id: restaurantMembers.id })
    .from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.userId, userId)));
  if (!m) throw notFound();
}

/** A manager adds or corrects a period worked (a forgotten clock-out, a paper sheet). */
export async function saveEntry(db: Database, ctx: RestaurantContext, id: string | null, raw: unknown) {
  assertCan(ctx, "members.manage");
  const input = entrySchema.parse(raw);
  await assertMember(db, ctx.restaurant.id, input.userId);
  const values = {
    userId: input.userId,
    clockInAt: input.clockInAt,
    clockOutAt: input.clockOutAt,
    note: input.note || null,
    editedByUserId: ctx.user.id,
  };
  let saved;
  if (id) {
    if (!isUuid(id)) throw notFound();
    [saved] = await db
      .update(timeEntries)
      .set(values)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.restaurantId, ctx.restaurant.id)))
      .returning();
    if (!saved) throw notFound();
  } else {
    [saved] = await db
      .insert(timeEntries)
      .values({ ...values, restaurantId: ctx.restaurant.id })
      .returning();
  }
  await recordAudit(db, {
    action: id ? "time.entry_edited" : "time.entry_added",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "time_entry",
    entityId: saved!.id,
    metadata: { userId: input.userId, in: input.clockInAt, out: input.clockOutAt },
  });
  return saved!;
}

export async function deleteEntry(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "members.manage");
  if (!isUuid(id)) throw notFound();
  const [gone] = await db
    .delete(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.restaurantId, ctx.restaurant.id)))
    .returning();
  if (!gone) throw notFound();
  await recordAudit(db, {
    action: "time.entry_deleted",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "time_entry",
    entityId: id,
    metadata: { userId: gone.userId, in: gone.clockInAt, out: gone.clockOutAt },
  });
}

// ─── Planning ────────────────────────────────────────────────────────────────

export async function listPlanned(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "members.manage");
  return db
    .select({
      id: plannedShifts.id,
      userId: plannedShifts.userId,
      startsAt: plannedShifts.startsAt,
      endsAt: plannedShifts.endsAt,
      note: plannedShifts.note,
    })
    .from(plannedShifts)
    .where(
      and(
        eq(plannedShifts.restaurantId, ctx.restaurant.id),
        lt(plannedShifts.startsAt, r.to),
        gte(plannedShifts.endsAt, r.from),
      ),
    )
    .orderBy(asc(plannedShifts.startsAt));
}

const shiftSchema = z
  .object({
    userId: z.uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    note: z.string().trim().max(120).default(""),
  })
  .refine((s) => s.endsAt > s.startsAt, { message: "end_before_start" })
  .refine((s) => s.endsAt.getTime() - s.startsAt.getTime() <= DAY, { message: "too_long" });

export async function addPlannedShift(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "members.manage");
  const s = shiftSchema.parse(raw);
  await assertMember(db, ctx.restaurant.id, s.userId);
  const [row] = await db
    .insert(plannedShifts)
    .values({ restaurantId: ctx.restaurant.id, ...s, note: s.note || null })
    .returning();
  return row!;
}

export async function deletePlannedShift(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "members.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .delete(plannedShifts)
    .where(and(eq(plannedShifts.id, id), eq(plannedShifts.restaurantId, ctx.restaurant.id)));
}

/** The week of `weekStart` gets the shifts of the week before (only if it is still empty). */
export async function copyPreviousWeek(db: Database, ctx: RestaurantContext, weekStart: Date) {
  assertCan(ctx, "members.manage");
  const week = { from: weekStart, to: new Date(weekStart.getTime() + 7 * DAY) };
  if ((await listPlanned(db, ctx, week)).length) throw conflict("week_not_empty");
  const before = await listPlanned(db, ctx, {
    from: new Date(weekStart.getTime() - 7 * DAY),
    to: weekStart,
  });
  const rows = before.filter((s) => s.startsAt >= new Date(weekStart.getTime() - 7 * DAY));
  if (!rows.length) return 0;
  await db.insert(plannedShifts).values(
    rows.map((s) => ({
      restaurantId: ctx.restaurant.id,
      userId: s.userId,
      startsAt: new Date(s.startsAt.getTime() + 7 * DAY),
      endsAt: new Date(s.endsAt.getTime() + 7 * DAY),
      note: s.note,
    })),
  );
  return rows.length;
}

// ─── Tips ────────────────────────────────────────────────────────────────────

const tipSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCents: z.coerce.number().int().positive().max(1e15),
  note: z.string().trim().max(200).default(""),
});

export async function addTips(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "members.manage");
  const t = tipSchema.parse(raw);
  const [row] = await db
    .insert(tipPools)
    .values({ restaurantId: ctx.restaurant.id, ...t, note: t.note || null, createdByUserId: ctx.user.id })
    .returning();
  await recordAudit(db, {
    action: "time.tips_added",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "tip_pool",
    entityId: row!.id,
    metadata: { day: t.day, amountCents: t.amountCents },
  });
  return row!;
}

export async function deleteTips(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "members.manage");
  if (!isUuid(id)) throw notFound();
  await db.delete(tipPools).where(and(eq(tipPools.id, id), eq(tipPools.restaurantId, ctx.restaurant.id)));
}

// ─── Pay ─────────────────────────────────────────────────────────────────────

export async function setHourlyRate(
  db: Database,
  ctx: RestaurantContext,
  userId: string,
  cents: number | null,
) {
  assertCan(ctx, "members.manage");
  if (!isUuid(userId)) throw notFound();
  if (cents != null && (!Number.isInteger(cents) || cents < 0 || cents > 1e13))
    throw validation("invalid_rate");
  const [m] = await db
    .update(restaurantMembers)
    .set({ hourlyRateCents: cents })
    .where(and(eq(restaurantMembers.restaurantId, ctx.restaurant.id), eq(restaurantMembers.userId, userId)))
    .returning({ id: restaurantMembers.id });
  if (!m) throw notFound();
}

/**
 * The period's payroll: hours clocked × hourly pay, the share of tips, late arrivals and missed
 * shifts, for every active member (also those who did not work, so nobody is forgotten).
 */
export async function payroll(db: DbOrTx, ctx: RestaurantContext, r: Range, now = new Date()) {
  assertCan(ctx, "members.manage");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const dayFrom = new Date(r.from.getTime() - DAY);
  const [members, entries, planned, pools] = await Promise.all([
    db
      .select({
        userId: restaurantMembers.userId,
        name: users.fullName,
        role: restaurantMembers.role,
        job: restaurantMembers.job,
        rate: restaurantMembers.hourlyRateCents,
      })
      .from(restaurantMembers)
      .innerJoin(users, eq(users.id, restaurantMembers.userId))
      .where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.status, "active")))
      .orderBy(users.fullName),
    db
      .select({
        userId: timeEntries.userId,
        clockInAt: timeEntries.clockInAt,
        clockOutAt: timeEntries.clockOutAt,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.restaurantId, rid), overlaps({ from: dayFrom, to: r.to }))),
    db
      .select({
        userId: plannedShifts.userId,
        startsAt: plannedShifts.startsAt,
        endsAt: plannedShifts.endsAt,
      })
      .from(plannedShifts)
      .where(
        and(
          eq(plannedShifts.restaurantId, rid),
          gte(plannedShifts.startsAt, r.from),
          lt(plannedShifts.startsAt, r.to),
        ),
      ),
    db
      .select({ id: tipPools.id, day: tipPools.day, amountCents: tipPools.amountCents, note: tipPools.note })
      .from(tipPools)
      .where(
        and(
          eq(tipPools.restaurantId, rid),
          gte(tipPools.day, isoDay(r.from, tz)),
          lte(tipPools.day, isoDay(new Date(r.to.getTime() - 1), tz)),
        ),
      )
      .orderBy(desc(tipPools.day)),
  ]);
  const tips = splitTips(pools, entries, tz, now);
  const late = lateness(planned, entries);
  const missed = missedShifts(planned, entries, now);
  const rows = members.map((m) => {
    const mine = entries.filter((e) => e.userId === m.userId);
    const hours = mine.reduce((s, e) => s + entryHours(e, r.from, r.to, now), 0);
    const pay = m.rate != null ? Math.round(hours * m.rate) : null;
    const tip = tips.share.get(m.userId) ?? 0;
    return {
      ...m,
      hours: Math.round(hours * 100) / 100,
      shifts: mine.filter((e) => e.clockInAt >= r.from).length,
      openNow: mine.some((e) => !e.clockOutAt),
      payCents: pay,
      tipsCents: tip,
      totalCents: (pay ?? 0) + tip,
      late: late.get(m.userId) ?? { count: 0, minutes: 0 },
      missed: missed.filter((p) => p.userId === m.userId).length,
      planned: planned.filter((p) => p.userId === m.userId).length,
    };
  });
  return {
    rows,
    pools,
    undistributedDays: tips.undistributed,
    totals: {
      hours: Math.round(rows.reduce((s, x) => s + x.hours, 0) * 100) / 100,
      payCents: rows.reduce((s, x) => s + (x.payCents ?? 0), 0),
      tipsCents: rows.reduce((s, x) => s + x.tipsCents, 0),
    },
  };
}

const isoDay = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/** Who is at work right now (open clock-ins). */
export async function onShiftNow(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "members.manage");
  return db
    .select({ userId: timeEntries.userId, name: users.fullName, since: timeEntries.clockInAt })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(and(eq(timeEntries.restaurantId, ctx.restaurant.id), isNull(timeEntries.clockOutAt)))
    .orderBy(asc(timeEntries.clockInAt));
}
