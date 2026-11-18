import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications, restaurantSettings, stockItems } from "@/server/db/schema";
import { createBranch } from "@/server/modules/branches/service";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { createPurchase, createStockItem } from "@/server/modules/inventory/service";
import { listTransfers, transferStock, transferTargets } from "@/server/modules/inventory/transfers";
import { dailyFigures, saveDailyReportSettings, sendDueDailyReports } from "@/server/modules/reports/daily";
import {
  addPlannedShift,
  addTips,
  clockIn,
  clockOut,
  clockStatus,
  payroll,
  setHourlyRate,
} from "@/server/modules/staff/service";
import { localDayOf } from "@/server/modules/staff/payroll";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

const H = 3_600_000;

describe("team time, evening report and stock transfers", () => {
  it("clocks in and out, plans shifts, shares tips and computes pay", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Pointage", { plan: "professional" });
    const { sessionUser } = await createUser();
    await addMember(restaurant.id, sessionUser.id, "staff");
    const staff = await contextFor(sessionUser, restaurant.id);

    const t0 = new Date(Date.now() - 6 * H);
    await clockIn(db, staff, t0);
    await expect(clockIn(db, staff)).rejects.toThrow(/already_clocked_in/);
    expect((await clockStatus(db, staff))?.clockedIn).toBe(true);
    await clockOut(db, staff, new Date(t0.getTime() + 4 * H));
    expect((await clockStatus(db, staff))?.clockedIn).toBe(false);

    // Planned 15 minutes before the clock-in: late by 15 min.
    await addPlannedShift(db, ctx, {
      userId: sessionUser.id,
      startsAt: new Date(t0.getTime() - 15 * 60_000),
      endsAt: new Date(t0.getTime() + 4 * H),
    });
    await setHourlyRate(db, ctx, sessionUser.id, 100_000);
    await addTips(db, ctx, { day: localDayOf(t0, restaurant.timezone), amountCents: 50_000 });

    const pay = await payroll(db, ctx, { from: new Date(Date.now() - 24 * H), to: new Date() });
    const row = pay.rows.find((r) => r.userId === sessionUser.id)!;
    expect(row.hours).toBe(4);
    expect(row.payCents).toBe(400_000);
    expect(row.tipsCents).toBe(50_000);
    expect(row.late).toEqual({ count: 1, minutes: 15 });
  });

  it("sends the evening report once, at the chosen hour", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Rapport du soir", { plan: "professional" });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 10_000 });
    await createPosOrder(db, ctx, {
      lines: [{ productId: dish.id, quantity: 3 }],
      payment: { provider: "cash", tenderedCents: 30_000 },
      idempotencyKey: randomBytes(8).toString("hex"),
    });
    const f = await dailyFigures(db, restaurant, localDayOf(new Date(), restaurant.timezone));
    expect(f).toMatchObject({ orders: 1, revenueCents: 30_000, topDish: { name: "Kebab", quantity: 3 } });

    await saveDailyReportSettings(db, ctx, { enabled: true, hour: 0, sms: false, phone: "" });
    expect(await sendDueDailyReports(db, new Date(), restaurant.id)).toBe(1);
    expect(await sendDueDailyReports(db, new Date(), restaurant.id)).toBe(0);
    const [n] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, restaurant.id), eq(notifications.type, "report.daily")));
    expect(n?.payload).toMatchObject({ amountCents: 30_000, count: 1 });
    const [s] = await db
      .select()
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    expect(s?.dailyReport?.lastDay).toBe(localDayOf(new Date(), restaurant.timezone));
  });

  it("transfers stock to another venue of the group", async () => {
    const { ctx } = await createOwnerWithRestaurant("Cuisine centrale");
    const branch = await createBranch(db, ctx, {
      name: "Branche Nord",
      copyMenu: false,
      copySettings: false,
    });
    expect((await transferTargets(db, ctx)).map((v) => v.id)).toContain(branch.id);
    const rice = await createStockItem(db, ctx, { name: "Riz", unit: "kg" });
    await createPurchase(db, ctx, { lines: [{ stockItemId: rice.id, quantity: 50, unitCostCents: 2_000 }] });
    await expect(
      transferStock(db, ctx, { toRestaurantId: branch.id, lines: [{ stockItemId: rice.id, quantity: 80 }] }),
    ).rejects.toThrow(/not_enough_stock/);
    await transferStock(db, ctx, {
      toRestaurantId: branch.id,
      lines: [{ stockItemId: rice.id, quantity: 20 }],
    });
    const [src] = await db.select().from(stockItems).where(eq(stockItems.id, rice.id));
    expect(src!.quantity).toBe(30);
    const [dst] = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.restaurantId, branch.id), eq(stockItems.name, "Riz")));
    expect(dst).toMatchObject({ quantity: 20, avgCostCents: 2_000, unit: "kg" });
    const list = await listTransfers(db, ctx);
    expect(list[0]).toMatchObject({ out: true, other: "Branche Nord", quantity: 20 });
  });
});
