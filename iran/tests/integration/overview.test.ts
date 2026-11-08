import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders, payments, reservations } from "@/server/db/schema";
import { getOverviewLive, getTodayPulse } from "@/server/modules/dashboard/service";
import { weekCounts } from "@/server/modules/reservations/service";
import { localDay, wallTime } from "@/lib/period";
import { randomToken } from "@/lib/ids";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("dashboard overview", () => {
  it("counts today's bookings and covers per restaurant, without cancelled ones or the queue", async () => {
    const a = await createOwnerWithRestaurant("Overview A");
    const b = await createOwnerWithRestaurant("Overview B");
    const now = new Date();
    const row = (status: string, partySize: number, kind = "booking") => ({
      restaurantId: a.restaurant.id,
      code: randomToken().slice(0, 12),
      name: `Guest ${partySize}`,
      phone: "09120000000",
      partySize,
      startsAt: now,
      status,
      kind,
    });
    await db
      .insert(reservations)
      .values([
        row("confirmed", 4),
        row("pending", 2),
        row("cancelled", 3),
        row("no_show", 5),
        row("confirmed", 6, "queue"),
      ]);

    const live = await getOverviewLive(db, a.ctx);
    expect(live.bookingsToday).toBe(2);
    expect(live.coversToday).toBe(6);
    expect(live.pendingBookings).toBe(1);
    expect(live.bookings.map((x) => x.partySize).sort()).toEqual([2, 4]);
    expect(live.active).toEqual([]);
    expect(live.top).toEqual([]);

    const today = localDay(now, a.ctx.restaurant.timezone);
    expect((await weekCounts(db, a.ctx, today)).get(today)).toEqual({ bookings: 2, covers: 6 });

    const other = await getOverviewLive(db, b.ctx);
    expect(other.bookingsToday).toBe(0);
    expect(other.bookings).toEqual([]);
  });

  it("follows the day hour by hour against the same weekday last week, at the same time of day", async () => {
    const a = await createOwnerWithRestaurant("Pulse A");
    const tz = a.ctx.restaurant.timezone;
    const today = localDay(new Date(), tz);
    const lastWeekDay = localDay(new Date(Date.now() - 7 * 86_400_000), tz);
    const at = (day: string, hhmm: string) => wallTime(day, hhmm, tz);
    let seq = 0;
    const order = (placedAt: Date, totalCents: number, channel = "dine_in", status = "served") => ({
      restaurantId: a.restaurant.id,
      number: `P-${++seq}`,
      seq,
      channel: channel as "dine_in",
      status: status as "served",
      currency: a.restaurant.currency,
      subtotalCents: totalCents,
      taxCents: 0,
      totalCents,
      placedAt,
    });
    await db
      .insert(orders)
      .values([
        order(at(today, "09:10"), 1_000),
        order(at(today, "09:40"), 2_000, "takeaway"),
        order(at(today, "11:05"), 4_000, "delivery", "preparing"),
        order(at(today, "11:20"), 9_000, "dine_in", "cancelled"),
        order(at(today, "11:30"), 8_000, "takeaway", "pending_payment"),
        order(at(lastWeekDay, "09:30"), 500),
        order(at(lastWeekDay, "13:00"), 700),
      ]);
    await db.insert(payments).values([
      {
        restaurantId: a.restaurant.id,
        provider: "cash",
        status: "succeeded",
        amountCents: 500,
        currency: a.restaurant.currency,
        idempotencyKey: randomToken(),
        succeededAt: at(lastWeekDay, "10:00"),
      },
      {
        restaurantId: a.restaurant.id,
        provider: "cash",
        status: "succeeded",
        amountCents: 700,
        currency: a.restaurant.currency,
        idempotencyKey: randomToken(),
        succeededAt: at(lastWeekDay, "14:00"),
      },
    ]);

    const pulse = await getTodayPulse(db, a.ctx, at(today, "12:00"));
    expect(pulse.hourly.today[9]).toBe(3_000);
    expect(pulse.hourly.today[11]).toBe(4_000); // cancelled and unpaid online orders left out
    expect(pulse.hourly.lastWeek[9]).toBe(500);
    expect(pulse.hourly.lastWeek[13]).toBe(700);
    // Last week up to noon only: the 13:00 order and the 14:00 payment come later in the day.
    expect(pulse.lastWeekSoFar).toEqual({ orders: 1, salesCents: 500, revenueCents: 500 });
    expect(pulse.channels).toEqual([
      { channel: "dine_in", orders: 1, cents: 1_000 },
      { channel: "takeaway", orders: 1, cents: 2_000 },
      { channel: "delivery", orders: 1, cents: 4_000 },
    ]);
    expect(pulse.steps).toEqual({ received: 0, preparing: 1, ready: 0 });

    const b = await createOwnerWithRestaurant("Pulse B");
    const other = await getTodayPulse(db, b.ctx, at(today, "12:00"));
    expect(other.channels).toEqual([]);
    expect(other.hourly.today.every((x) => x === 0)).toBe(true);
  });
});
