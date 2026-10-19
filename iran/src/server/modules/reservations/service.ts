import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  customers,
  diningTables,
  notifications,
  reservations,
  restaurantSettings,
  restaurants,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { sms } from "@/server/infra/sms";
import { env } from "@/server/env";
import { AppError, conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { isUuid, randomToken } from "@/lib/ids";
import { dayStart, localDay } from "@/lib/period";
import { normalizeIranMobile } from "@/lib/phone";
import { nextCounterValue } from "@/server/modules/restaurants/service";

const SLOT_MIN = 30;
const ACTIVE = ["pending", "confirmed", "notified", "seated"] as const;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type Place = {
  id: string;
  name: string;
  slug: string;
  logoKey: string | null;
  brandColor: string;
  timezone: string;
  defaultLocale: string;
  enabled: boolean;
  autoConfirm: boolean;
  slotCapacity: number;
  maxParty: number;
  durationMin: number;
  openingHours: Record<string, { open: string; close: string }[]> | null;
};

async function loadPlace(db: DbOrTx, where: ReturnType<typeof eq>): Promise<Place | null> {
  const [r] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      logoKey: restaurants.logoKey,
      brandColor: restaurants.brandColor,
      timezone: restaurants.timezone,
      defaultLocale: restaurants.defaultLocale,
      status: restaurants.status,
      enabled: restaurantSettings.reservationsEnabled,
      autoConfirm: restaurantSettings.reservationAutoConfirm,
      slotCapacity: restaurantSettings.reservationSlotCapacity,
      maxParty: restaurantSettings.reservationMaxParty,
      durationMin: restaurantSettings.reservationDurationMin,
      openingHours: restaurantSettings.openingHours,
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(and(where, isNull(restaurants.deletedAt)));
  if (!r || r.status !== "active") return null;
  return r as Place;
}
export const placeBySlug = (db: DbOrTx, slug: string) => loadPlace(db, eq(restaurants.slug, slug));
const placeById = (db: DbOrTx, id: string) => loadPlace(db, eq(restaurants.id, id));

// ─── Slots ───────────────────────────────────────────────────────────────────

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Bookable start times of a day, with what is left of each slot's capacity. */
export async function slotsForDay(
  db: DbOrTx,
  place: Place,
  day: string,
  partySize: number,
  now = new Date(),
) {
  const start = dayStart(day, place.timezone);
  const weekday = DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
  const ranges = place.openingHours
    ? (place.openingHours[weekday] ?? [])
    : [{ open: "12:00", close: "23:00" }];
  const booked = await db
    .select({
      startsAt: reservations.startsAt,
      durationMin: reservations.durationMin,
      partySize: reservations.partySize,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, place.id),
        eq(reservations.kind, "booking"),
        inArray(reservations.status, [...ACTIVE]),
        gte(reservations.startsAt, new Date(start.getTime() - 6 * 3600_000)),
        lt(reservations.startsAt, new Date(start.getTime() + 30 * 3600_000)),
      ),
    );
  const out: { time: string; at: Date; left: number }[] = [];
  for (const r of ranges) {
    // Last booking starts one duration before closing (closing after midnight wraps).
    let close = toMin(r.close);
    const open = toMin(r.open);
    if (close <= open) close += 24 * 60;
    for (let m = open; m + Math.min(place.durationMin, 60) <= close; m += SLOT_MIN) {
      const at = new Date(start.getTime() + m * 60_000);
      if (at.getTime() < now.getTime() + 30 * 60_000) continue;
      const used = booked
        .filter((b) => b.startsAt <= at && b.startsAt.getTime() + b.durationMin * 60_000 > at.getTime())
        .reduce((s, b) => s + b.partySize, 0);
      const left = place.slotCapacity - used;
      if (left >= partySize)
        out.push({
          time: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
          at,
          left,
        });
    }
  }
  return out;
}

const OUTDOOR = /out|terrace|garden|بیرون|تراس|حیاط|باغ|فضای باز/i;
/** Tables in the wished area first (outdoor = zone name like "terrace"/"حیاط"). */
const zoneRank = (zone: string | null, area: string) =>
  area === "any" ? 0 : (area === "outdoor") === OUTDOOR.test(zone ?? "") ? 0 : 1;

/** Smallest free table that seats the party for the whole booking, in the wished area if possible. */
async function pickTable(
  tx: DbOrTx,
  rid: string,
  at: Date,
  durationMin: number,
  partySize: number,
  area: string,
) {
  const tables = await tx
    .select({ id: diningTables.id, capacity: diningTables.capacity, zone: diningTables.zone })
    .from(diningTables)
    .where(and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt)));
  const end = new Date(at.getTime() + durationMin * 60_000);
  const busy = await tx
    .select({ tableId: reservations.tableId })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, rid),
        inArray(reservations.status, [...ACTIVE]),
        sql`${reservations.tableId} is not null`,
        lt(reservations.startsAt, end),
        sql`${reservations.startsAt} + make_interval(mins => ${reservations.durationMin}) > ${at}`,
      ),
    );
  const taken = new Set(busy.map((b) => b.tableId));
  const fits = tables
    .filter((t) => !taken.has(t.id) && (t.capacity == null || t.capacity >= partySize))
    .sort(
      (a, b) => zoneRank(a.zone, area) - zoneRank(b.zone, area) || (a.capacity ?? 99) - (b.capacity ?? 99),
    );
  return fits[0]?.id ?? null;
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

async function text(place: Place, key: string, values: Record<string, string | number>) {
  const locale = isLocale(place.defaultLocale) ? place.defaultLocale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "sms.reservation" });
  return t(key, values);
}
const statusLink = (place: Place, code: string) => `${env().APP_URL}/r/${place.slug}/b/${code}`;
async function sendSms(phone: string, body: string) {
  try {
    await sms().send(phone, body);
  } catch (e) {
    console.error("[reservations] sms failed", e instanceof Error ? e.message : e);
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export const bookingSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v, c) => {
      const n = normalizeIranMobile(v);
      if (!n) c.addIssue({ code: "custom", message: "invalid_phone" });
      return n ?? "";
    }),
  partySize: z.coerce.number().int().min(1).max(200),
  /** ISO instant of the chosen slot. */
  startsAt: z.coerce.date(),
  area: z.enum(["any", "indoor", "outdoor"]).default("any"),
  note: z.string().trim().max(500).default(""),
  tableId: z.uuid().nullable().optional(),
});

async function upsertCustomer(tx: DbOrTx, rid: string, phone: string, name: string) {
  const [c] = await tx
    .insert(customers)
    .values({ restaurantId: rid, phone, name })
    .onConflictDoUpdate({ target: [customers.restaurantId, customers.phone], set: { updatedAt: new Date() } })
    .returning({ id: customers.id });
  return c!.id;
}

async function create(
  db: Database,
  place: Place,
  raw: z.input<typeof bookingSchema>,
  opts: { source: "online" | "phone"; actorUserId: string | null },
) {
  const input = bookingSchema.parse(raw);
  if (input.partySize > place.maxParty && opts.source === "online")
    throw new AppError("VALIDATION", "party_too_large", { max: place.maxParty });
  const day = localDay(input.startsAt, place.timezone);
  if (opts.source === "online") {
    const ok = (await slotsForDay(db, place, day, input.partySize)).some(
      (s) => s.at.getTime() === input.startsAt.getTime(),
    );
    if (!ok) throw conflict("slot_unavailable");
  }
  const res = await db.transaction(async (tx) => {
    const tableId =
      input.tableId ??
      (await pickTable(tx, place.id, input.startsAt, place.durationMin, input.partySize, input.area));
    const [r] = await tx
      .insert(reservations)
      .values({
        restaurantId: place.id,
        kind: "booking",
        code: randomToken(12),
        name: input.name,
        phone: input.phone,
        partySize: input.partySize,
        startsAt: input.startsAt,
        durationMin: place.durationMin,
        area: input.area,
        tableId,
        status: opts.source === "online" && !place.autoConfirm ? "pending" : "confirmed",
        source: opts.source,
        note: input.note || null,
        customerId: await upsertCustomer(tx, place.id, input.phone, input.name),
        createdByUserId: opts.actorUserId,
      })
      .returning();
    await tx.insert(notifications).values({
      restaurantId: place.id,
      type: "reservation.created",
      payload: {
        reservationId: r!.id,
        name: r!.name,
        partySize: r!.partySize,
        startsAt: r!.startsAt.toISOString(),
      },
    });
    await emit(tx, { topic: topics.restaurant(place.id), type: "notification.created" });
    return r!;
  });
  const when = new Intl.DateTimeFormat(
    place.defaultLocale === "fa" ? "fa-u-ca-persian" : place.defaultLocale,
    {
      timeZone: place.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(res.startsAt);
  await sendSms(
    res.phone,
    await text(place, res.status === "pending" ? "requested" : "confirmed", {
      restaurant: place.name,
      when,
      people: res.partySize,
      link: statusLink(place, res.code),
    }),
  );
  return res;
}

export async function createBooking(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof bookingSchema>,
) {
  assertCan(ctx, "orders.create");
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  return create(db, place, raw, { source: "phone", actorUserId: ctx.user.id });
}

export async function bookOnline(db: Database, slug: string, raw: z.input<typeof bookingSchema>) {
  const place = await placeBySlug(db, slug);
  if (!place?.enabled) throw notFound();
  return create(db, place, { ...raw, tableId: null }, { source: "online", actorUserId: null });
}

// ─── Queue (نوبت‌دهی) ────────────────────────────────────────────────────────

export const queueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: bookingSchema.shape.phone,
  partySize: z.coerce.number().int().min(1).max(50),
});

async function enqueue(
  db: Database,
  place: Place,
  raw: z.input<typeof queueSchema>,
  actorUserId: string | null,
) {
  const input = queueSchema.parse(raw);
  const now = new Date();
  const r = await db.transaction(async (tx) => {
    const number = await nextCounterValue(tx, place.id, `queue:${localDay(now, place.timezone)}`, 1);
    const [row] = await tx
      .insert(reservations)
      .values({
        restaurantId: place.id,
        kind: "queue",
        code: randomToken(12),
        queueNumber: number,
        name: input.name,
        phone: input.phone,
        partySize: input.partySize,
        startsAt: now,
        status: "confirmed",
        source: "walk_in",
        customerId: await upsertCustomer(tx, place.id, input.phone, input.name),
        createdByUserId: actorUserId,
      })
      .returning();
    await emit(tx, { topic: topics.restaurant(place.id), type: "notification.created" });
    return row!;
  });
  await sendSms(
    r.phone,
    await text(place, "queued", {
      restaurant: place.name,
      number: r.queueNumber!,
      link: statusLink(place, r.code),
    }),
  );
  return r;
}

export async function addToQueue(db: Database, ctx: RestaurantContext, raw: z.input<typeof queueSchema>) {
  assertCan(ctx, "orders.create");
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  return enqueue(db, place, raw, ctx.user.id);
}

export async function joinQueueOnline(db: Database, slug: string, raw: z.input<typeof queueSchema>) {
  const place = await placeBySlug(db, slug);
  if (!place?.enabled) throw notFound();
  return enqueue(db, place, raw, null);
}

// ─── Staff board ─────────────────────────────────────────────────────────────

/** A day's bookings and today's queue. Also sends due reminders (lazy sweep). */
export async function listDay(db: Database, ctx: RestaurantContext, day: string) {
  assertCan(ctx, "orders.view");
  const tz = ctx.restaurant.timezone;
  const from = dayStart(day, tz);
  const to = new Date(from.getTime() + 24 * 3600_000);
  await sendDueReminders(db, ctx.restaurant.id);
  const rows = await db
    .select({ r: reservations, tableLabel: diningTables.label })
    .from(reservations)
    .leftJoin(diningTables, eq(diningTables.id, reservations.tableId))
    .where(
      and(
        eq(reservations.restaurantId, ctx.restaurant.id),
        gte(reservations.startsAt, from),
        lt(reservations.startsAt, to),
      ),
    )
    .orderBy(asc(reservations.startsAt));
  const list = rows.map(({ r, tableLabel }) => ({ ...r, tableLabel }));
  return {
    bookings: list.filter((r) => r.kind === "booking"),
    queue: list.filter((r) => r.kind === "queue"),
  };
}

const TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["notified", "seated", "cancelled", "no_show"],
  notified: ["seated", "cancelled", "no_show"],
  seated: ["completed"],
};

/** Moves a booking / queue ticket along; "notified" texts the guest that the table is ready. */
export async function setReservationStatus(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  to: string,
  tableId?: string | null,
) {
  assertCan(ctx, "orders.update_status");
  if (!isUuid(id)) throw notFound();
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  const [r] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurant.id)));
  if (!r) throw notFound();
  if (!TRANSITIONS[r.status]?.includes(to)) throw conflict("invalid_transition");
  const now = new Date();
  await db
    .update(reservations)
    .set({
      status: to,
      ...(to === "notified" ? { notifiedAt: now } : {}),
      ...(to === "seated" ? { seatedAt: now } : {}),
      ...(tableId !== undefined && tableId !== null && isUuid(tableId) ? { tableId } : {}),
    })
    .where(eq(reservations.id, id));
  if (to === "notified")
    await sendSms(r.phone, await text(place, "tableReady", { restaurant: place.name, name: r.name }));
  if (to === "confirmed" && r.status === "pending")
    await sendSms(
      r.phone,
      await text(place, "confirmed", {
        restaurant: place.name,
        when: new Intl.DateTimeFormat(
          place.defaultLocale === "fa" ? "fa-u-ca-persian" : place.defaultLocale,
          {
            timeZone: place.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          },
        ).format(r.startsAt),
        people: r.partySize,
        link: statusLink(place, r.code),
      }),
    );
  await recordAudit(db, {
    action: "reservation.status",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "reservation",
    entityId: id,
    metadata: { from: r.status, to },
  });
}

/** Confirmed bookings starting within 2 hours get one reminder text. */
export async function sendDueReminders(db: Database, restaurantId: string, now = new Date()) {
  const place = await placeById(db, restaurantId);
  if (!place) return 0;
  const due = await db
    .update(reservations)
    .set({ reminderSentAt: now })
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.kind, "booking"),
        eq(reservations.status, "confirmed"),
        isNull(reservations.reminderSentAt),
        gte(reservations.startsAt, new Date(now.getTime() + 15 * 60_000)),
        lt(reservations.startsAt, new Date(now.getTime() + 2 * 3600_000)),
      ),
    )
    .returning();
  for (const r of due) {
    const time = new Intl.DateTimeFormat(place.defaultLocale, {
      timeZone: place.timezone,
      timeStyle: "short",
    }).format(r.startsAt);
    await sendSms(
      r.phone,
      await text(place, "reminder", { restaurant: place.name, time, link: statusLink(place, r.code) }),
    );
  }
  return due.length;
}

export const reservationSettingsSchema = z.object({
  enabled: z.boolean(),
  autoConfirm: z.boolean(),
  slotCapacity: z.coerce.number().int().min(1).max(2000),
  maxParty: z.coerce.number().int().min(1).max(200),
  durationMin: z.coerce.number().int().min(15).max(480),
});

export async function getReservationSettings(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  const p = await placeById(db, ctx.restaurant.id);
  if (!p) throw notFound();
  return {
    enabled: p.enabled,
    autoConfirm: p.autoConfirm,
    slotCapacity: p.slotCapacity,
    maxParty: p.maxParty,
    durationMin: p.durationMin,
    slug: p.slug,
  };
}

export async function updateReservationSettings(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof reservationSettingsSchema>,
) {
  assertCan(ctx, "restaurant.manage");
  const i = reservationSettingsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set({
      reservationsEnabled: i.enabled,
      reservationAutoConfirm: i.autoConfirm,
      reservationSlotCapacity: i.slotCapacity,
      reservationMaxParty: i.maxParty,
      reservationDurationMin: i.durationMin,
    })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
}

// ─── Public status page ──────────────────────────────────────────────────────

export async function getByCode(db: DbOrTx, slug: string, code: string) {
  const place = await placeBySlug(db, slug);
  if (!place || !/^[A-Za-z0-9]{8,16}$/.test(code)) return null;
  const [r] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.code, code), eq(reservations.restaurantId, place.id)));
  if (!r) return null;
  let ahead = 0;
  if (r.kind === "queue" && (r.status === "confirmed" || r.status === "notified")) {
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, place.id),
          eq(reservations.kind, "queue"),
          eq(reservations.status, "confirmed"),
          lt(reservations.queueNumber, r.queueNumber!),
          gte(reservations.startsAt, dayStart(localDay(r.startsAt, place.timezone), place.timezone)),
        ),
      );
    ahead = row?.n ?? 0;
  }
  return { place, reservation: r, ahead };
}

export async function cancelByCode(db: Database, slug: string, code: string) {
  const found = await getByCode(db, slug, code);
  if (!found) throw notFound();
  const r = found.reservation;
  if (!["pending", "confirmed", "notified"].includes(r.status)) throw conflict("invalid_transition");
  await db
    .update(reservations)
    .set({ status: "cancelled" })
    .where(and(eq(reservations.id, r.id), ne(reservations.status, "cancelled")));
  await db.insert(notifications).values({
    restaurantId: found.place.id,
    type: "reservation.cancelled",
    payload: {
      reservationId: r.id,
      name: r.name,
      partySize: r.partySize,
      startsAt: r.startsAt.toISOString(),
    },
  });
  await emit(db, { topic: topics.restaurant(found.place.id), type: "notification.created" });
}
