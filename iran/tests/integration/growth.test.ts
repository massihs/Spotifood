import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { customers, orders, restaurantSettings } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { createCustomer } from "@/server/modules/customers/service";
import {
  automationResults,
  saveAutomations,
  sendDueAutomations,
} from "@/server/modules/marketing/automations";
import {
  createPlatformOrder,
  integrationContext,
  platformReport,
  regenerateApiKey,
  saveCommissions,
} from "@/server/modules/channels/platforms";
import { setCustomDomain, slugForDomain } from "@/server/modules/channels/domain";
import { payKioskOrderByTerminal, placeKioskOrder, updateKiosk } from "@/server/modules/online/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const DAY = 86_400_000;
/** Noon in Tehran: texts only go out in the daytime. */
const noonTehran = () => {
  const d = new Date();
  d.setUTCHours(8, 30, 0, 0);
  return d;
};

describe("growth: automatic texts, platforms, own domain, kiosk card payment", () => {
  it("sends birthday and win-back texts once, and counts the orders they bring", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Relances", { plan: "professional" });
    const now = noonTehran();
    const mmdd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const bday = await createCustomer(db, ctx, {
      phone: "09121110001",
      name: "Sara",
      birthDate: `1990-${mmdd}`,
    });
    const gone = await createCustomer(db, ctx, { phone: "09121110002", name: "Ali" });
    await db
      .update(customers)
      .set({ lastOrderAt: new Date(now.getTime() - 40 * DAY) })
      .where(eq(customers.id, gone.id));
    await createCustomer(db, ctx, {
      phone: "09121110003",
      name: "Opt",
      birthDate: `1990-${mmdd}`,
      smsOptOut: true,
    });

    await saveAutomations(db, ctx, {
      birthday: { enabled: true, text: "" },
      winback: { enabled: true, days: 30, text: "" },
    });
    expect(await sendDueAutomations(db, now, restaurant.id)).toBe(2);
    expect(await sendDueAutomations(db, now, restaurant.id)).toBe(0);

    // Ali comes back and orders: the win-back text gets the credit.
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 10_000 });
    await createPosOrder(db, ctx, {
      lines: [{ productId: dish.id, quantity: 2 }],
      customerPhone: "09121110002",
      payment: { provider: "cash", tenderedCents: 20_000 },
      idempotencyKey: randomBytes(8).toString("hex"),
    });
    const res = await automationResults(db, ctx, new Date(Date.now() - 2 * DAY));
    expect(res.find((r) => r.kind === "winback")).toMatchObject({
      sent: 1,
      guests: 1,
      orders: 1,
      revenueCents: 20_000,
    });
    expect(res.find((r) => r.kind === "birthday")).toMatchObject({ sent: 1, orders: 0 });
    expect(bday.id).toBeTruthy();
  });

  it("takes platform orders (typed or pushed), once each, and reports their commission", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Plateformes", { plan: "professional" });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    await createProduct(db, ctx, { categoryId: cat.id, name: "کباب کوبیده", priceCents: 50_000 });
    await saveCommissions(db, ctx, { snappfood: 2500, tapsifood: 2000, other: 0 });

    const first = await createPlatformOrder(db, ctx, {
      platform: "snappfood",
      externalRef: "SF-1001",
      lines: [{ name: "كباب كوبيده", quantity: 2 }],
    });
    expect(first.duplicate).toBe(false);
    const [o] = await db.select().from(orders).where(eq(orders.id, first.orderId));
    expect(o).toMatchObject({
      platform: "snappfood",
      externalRef: "SF-1001",
      paymentStatus: "paid",
      totalCents: 100_000,
    });

    // Pushed again by the integration, with the key: the same order.
    const key = await regenerateApiKey(db, ctx);
    await expect(integrationContext(db, restaurant.id, "sfk_wrong")).rejects.toThrow();
    const api = await integrationContext(db, restaurant.id, key);
    const again = await createPlatformOrder(db, api, {
      platform: "snappfood",
      externalRef: "SF-1001",
      lines: [{ name: "کباب کوبیده", quantity: 2 }],
    });
    expect(again).toMatchObject({ duplicate: true, orderId: first.orderId });
    await expect(
      createPlatformOrder(db, ctx, {
        platform: "tapsifood",
        externalRef: "T-1",
        lines: [{ name: "Pizza", quantity: 1 }],
      }),
    ).rejects.toThrow(/unknown_products/);

    const rep = await platformReport(db, ctx, new Date(Date.now() - DAY));
    expect(rep.platforms.find((p) => p.platform === "snappfood")).toMatchObject({
      orders: 1,
      totalCents: 100_000,
      commissionCents: 25_000,
      netCents: 75_000,
    });
  });

  it("serves the ordering site on the restaurant's own domain", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Domaine", { plan: "professional" });
    const host = `order-${randomBytes(4).toString("hex")}.example.ir`;
    await setCustomDomain(db, ctx, `https://${host.toUpperCase()}/`);
    expect(await slugForDomain(db, host)).toBe(restaurant.slug);
    await expect(setCustomDomain(db, ctx, "spotifood.ir")).rejects.toThrow(/invalid_domain/);
    await setCustomDomain(db, ctx, "");
    expect(await slugForDomain(db, host)).toBeNull();
  });

  it("lets the kiosk's card terminal pay the order just placed", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Borne", { plan: "professional" });
    const cat = await createCategory(db, ctx, { name: "Cafés" });
    const latte = await createProduct(db, ctx, { categoryId: cat.id, name: "Latte", priceCents: 30_000 });
    await db
      .update(restaurantSettings)
      .set({ onlineOrderingEnabled: true })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    const { token } = await updateKiosk(db, ctx, { enabled: true });
    const order = await placeKioskOrder(db, token, {
      channel: "takeaway",
      lines: [{ productId: latte.id, quantity: 1 }],
      customerName: "Reza",
      phone: "",
    });
    expect(await payKioskOrderByTerminal(db, token, order.id, "RRN123")).toEqual({ paid: true });
    const [o] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, order.id)));
    expect(o?.paymentStatus).toBe("paid");
    await expect(payKioskOrderByTerminal(db, "wrong-token", order.id, "X")).rejects.toThrow();
  });
});
