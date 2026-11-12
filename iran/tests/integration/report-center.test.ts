import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { reservations, restaurantSettings } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { createPosOrder } from "@/server/modules/pos/service";
import { createTradeOrder, receiveTradePayment, saveTradeCustomer } from "@/server/modules/b2b/service";
import {
  accountStatement,
  bankReport,
  businessRange,
  chargesOnAccount,
  creditAccounts,
  dailySales,
  debtors,
  getReportSettings,
  invoicesInPeriod,
  occupancy,
  openBills,
  saveReportSettings,
  salesPerPerson,
  salesPlans,
  upcomingGuests,
  walkIns,
  weekdaySales,
} from "@/server/modules/reports/center";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("report centre", () => {
  it("answers every report from real sales", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Rapports", { plan: "professional" });
    await db
      .update(restaurantSettings)
      .set({ enabledPaymentProviders: ["cash", "on_site_terminal"] })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    const cat = await createCategory(db, ctx, { name: "Cafés" });
    const latte = await createProduct(db, ctx, { categoryId: cat.id, name: "Latte", priceCents: 1000 });
    const table = await createTable(db, ctx, { label: "4" });

    // A table served by the waiter (still open, unpaid), a counter sale in cash, one by card.
    await createPosOrder(db, ctx, {
      channel: "dine_in",
      tableId: table.id,
      lines: [{ productId: latte.id, quantity: 2 }],
      idempotencyKey: key(),
    });
    await createPosOrder(db, ctx, {
      lines: [{ productId: latte.id, quantity: 1 }],
      payment: { provider: "cash", tenderedCents: 1000 },
      idempotencyKey: key(),
    });
    await createPosOrder(db, ctx, {
      lines: [{ productId: latte.id, quantity: 3 }],
      payment: { provider: "on_site_terminal", terminalRef: "998877" },
      idempotencyKey: key(),
    });
    // A trade customer buys on account and pays part by transfer.
    const pro = await saveTradeCustomer(db, ctx, null, {
      phone: "09125556677",
      name: "Bureau Nord",
      creditLimitCents: 100_000,
    });
    await createTradeOrder(db, ctx, {
      customerId: pro.id,
      lines: [{ productId: latte.id, quantity: 10 }],
      payment: "account",
      idempotencyKey: key(),
    });
    await receiveTradePayment(db, ctx, { customerId: pro.id, amountCents: 4000, method: "transfer" });
    await db.insert(reservations).values({
      restaurantId: restaurant.id,
      code: randomUUID().slice(0, 12),
      name: "Sara",
      phone: "09121112222",
      partySize: 4,
      startsAt: new Date(Date.now() + 2 * 86_400_000),
    });

    const r = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 3_600_000) };
    const daily = await dailySales(db, ctx, r);
    expect(daily.total.orders).toBe(4);
    expect(daily.total.cash).toBe(1000);
    expect(daily.total.card).toBe(3000);
    expect(daily.total.account).toBe(10_000);

    const plans = await salesPlans(db, ctx, r);
    expect(plans.rows.map((p) => p.plan).sort()).toEqual(["b2b", "dine_in_staff", "takeaway_counter"]);

    const bank = await bankReport(db, ctx, r);
    expect(bank.methods.card).toBe(3000);
    expect(bank.repaid.transfer).toBe(4000);
    expect(bank.bankCents).toBe(7000);
    expect(bank.recent[0]?.terminalRef).toBe("998877");

    const acc = await creditAccounts(db, ctx, r);
    expect(acc.rows[0]).toMatchObject({ id: pro.id, balanceCents: 6000, availableCents: 94_000 });
    expect(acc.rows[0]!.lastAt).toBeInstanceOf(Date);
    const st = await accountStatement(db, ctx, pro.id, r);
    expect(st.openingCents).toBe(0);
    expect(st.lines.map((l) => l.balanceCents)).toEqual([10_000, 6000]);
    expect(st.closingCents).toBe(6000);

    const bills = await openBills(db, ctx);
    expect(bills.tables[0]).toMatchObject({ label: "4", orders: 1, dueCents: 2000 });
    const owing = await debtors(db, ctx);
    expect(owing.totals.accounts).toBe(6000);
    expect(owing.accounts[0]!.oldest).toBeInstanceOf(Date);
    expect((await chargesOnAccount(db, ctx, r)).totals.charges).toBe(10_000);
    expect((await upcomingGuests(db, ctx)).totals.covers).toBe(4);
    expect((await walkIns(db, ctx, r)).walkIns).toBe(1);
    const occ = await occupancy(db, ctx, r);
    expect(occ).toMatchObject({ tables: 1, visits: 1 });
    const staff = await salesPerPerson(db, ctx, r);
    expect(staff.people[0]).toMatchObject({ id: ctx.user.id, orders: 4 });
    expect((await invoicesInPeriod(db, ctx, r)).totals.count).toBe(3);
    expect((await weekdaySales(db, ctx, r)).reduce((s, w) => s + w.orders, 0)).toBe(4);

    // Settings: a business day starting at 4 a.m.
    await saveReportSettings(db, ctx, { dayStartHour: 4, defaultPreset: "7d" });
    expect(await getReportSettings(db, restaurant.id)).toEqual({ dayStartHour: 4, defaultPreset: "7d" });
    expect(businessRange(r, 4).from.getTime() - r.from.getTime()).toBe(4 * 3_600_000);
    await expect(saveReportSettings(db, ctx, { dayStartHour: 9, defaultPreset: "7d" })).rejects.toThrow();
  });
});
