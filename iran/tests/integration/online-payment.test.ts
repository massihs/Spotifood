import { randomInt, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Iran edition: Zarinpal offered, IRR.
vi.mock("@/config/edition", async (orig) => {
  const mod = await orig<typeof import("@/config/edition")>();
  return { ...mod, EDITION: "iran", edition: mod.editionConfig("iran") };
});

const { db } = await import("@/server/db/client");
const { diners, notifications, orders, payments, restaurantSettings } = await import("@/server/db/schema");
const { createCategory } = await import("@/server/modules/menu/categories");
const { createProduct } = await import("@/server/modules/menu/products");
const online = await import("@/server/modules/online/service");
const { handlePaymentReturn, newIdempotencyKey, onlineOrderPayment, startOnlineOrderPayment } =
  await import("@/server/modules/payments/service");
const { savePayoutAccount } = await import("@/server/modules/payouts/service");
const { createOwnerWithRestaurant } = await import("../helpers/factories");

const IBAN = "IR150120000000004567891234";
let calls: { url: string; body: Record<string, unknown> }[] = [];

function zarinpal(verifyCode = 100) {
  calls = [];
  const authority = `A${randomUUID().replaceAll("-", "")}`;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.endsWith("/request.json")) return Response.json({ data: { code: 100, authority }, errors: [] });
    return verifyCode === 100
      ? Response.json({ data: { code: 100, ref_id: 7 }, errors: [] })
      : Response.json({ data: [], errors: { code: -51, message: "not paid" } });
  });
  return authority;
}

beforeAll(() => {
  process.env.ZARINPAL_MERCHANT_ID = "00000000-0000-0000-0000-000000000000";
});
afterEach(() => vi.unstubAllGlobals());

async function diner() {
  const phone = `0912${String(randomInt(1_000_000, 9_999_999))}`;
  const [d] = await db.insert(diners).values({ phone, phoneVerifiedAt: new Date() }).returning();
  return { id: d!.id, phone };
}

async function setup(opts: { requirePayment?: boolean } = {}) {
  const o = await createOwnerWithRestaurant("سفارش آنلاین", { plan: "professional" });
  const cat = await createCategory(db, o.ctx, { name: "غذا" });
  const dish = await createProduct(db, o.ctx, { categoryId: cat.id, name: "پیتزا", priceCents: 300_000_000 });
  await online.updateOnlineSettings(db, o.ctx, {
    onlineOrderingEnabled: true,
    onlineTakeaway: true,
    onlineDelivery: false,
  });
  await savePayoutAccount(db, o.ctx, { holderName: "مالک", iban: IBAN });
  await db
    .update(restaurantSettings)
    .set({
      onlinePaymentEnabled: true,
      enabledPaymentProviders: ["cash", "zarinpal"],
      requirePaymentBeforeOrder: opts.requirePayment ?? false,
    })
    .where(eq(restaurantSettings.restaurantId, o.restaurant.id));
  return { ...o, dish, slug: o.restaurant.slug };
}

const order = (dishId: string, payment: "online" | "on_site") => ({
  channel: "takeaway" as const,
  lines: [{ productId: dishId, quantity: 2 }],
  customerName: "سارا",
  payment,
});

const RETURN = (slug: string, id: string) => `http://localhost:3000/r/${slug}/o/${id}`;

describe("online orders paid online", () => {
  it("waits unseen by the team until Zarinpal confirms, then goes to the kitchen", async () => {
    const o = await setup();
    const d = await diner();
    expect((await online.getOnlineStore(db, o.slug))?.payment).toEqual({
      provider: "zarinpal",
      onSite: true,
    });

    const placed = await online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "online"));
    expect(placed.status).toBe("pending_payment");
    const bellBefore = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, o.restaurant.id), eq(notifications.type, "order.created")));
    expect(bellBefore).toHaveLength(0);

    const authority = zarinpal();
    const start = await startOnlineOrderPayment(
      db,
      d,
      o.slug,
      placed.id,
      { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN(o.slug, placed.id) },
    );
    expect(calls[0]!.body).toMatchObject({
      amount: 6_000_000,
      merchant_id: process.env.ZARINPAL_MERCHANT_ID,
    });
    const back = await handlePaymentReturn(
      db,
      "zarinpal",
      new URLSearchParams({ payment: start.paymentId, Authority: authority, Status: "OK" }),
    );
    expect(back.returnUrl).toBe(`${RETURN(o.slug, placed.id)}?payment=${start.paymentId}`);

    const [after] = await db.select().from(orders).where(eq(orders.id, placed.id));
    expect(after).toMatchObject({ status: "received", paymentStatus: "paid" });
    const bell = await db
      .select({ type: notifications.type, payload: notifications.payload })
      .from(notifications)
      .where(eq(notifications.restaurantId, o.restaurant.id));
    expect(bell.map((n) => n.type).sort()).toEqual([
      "order.created",
      "payment.received",
      "payout_account.updated",
    ]);
    expect(bell.find((n) => n.type === "payment.received")!.payload).toMatchObject({
      place: "online",
      number: placed.number,
    });
    const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p!.metadata).toMatchObject({ collectedBy: "platform", onlineOrderId: placed.id });
  });

  it("after a failed payment the guest can retry, pay on site, or cancel (stock and limit freed)", async () => {
    const o = await setup();
    const d = await diner();
    const placed = await online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "online"));
    const authority = zarinpal(-51);
    const start = await startOnlineOrderPayment(
      db,
      d,
      o.slug,
      placed.id,
      { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN(o.slug, placed.id) },
    );
    await handlePaymentReturn(
      db,
      "zarinpal",
      new URLSearchParams({ payment: start.paymentId, Authority: authority, Status: "OK" }),
    );
    expect((await onlineOrderPayment(db, placed.id))?.status).toBe("failed");
    let [row] = await db.select().from(orders).where(eq(orders.id, placed.id));
    expect(row).toMatchObject({ status: "pending_payment", paymentStatus: "unpaid" });

    // Retry starts a new checkout (an unfinished one is replaced).
    zarinpal();
    const again = await startOnlineOrderPayment(
      db,
      d,
      o.slug,
      placed.id,
      { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN(o.slug, placed.id) },
    );
    expect(again.paymentId).not.toBe(start.paymentId);

    // …or pays at pickup after all: the order goes to the team.
    const other = await online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "online"));
    await online.payOnlineOrderOnSite(db, d, o.slug, other.id);
    [row] = await db.select().from(orders).where(eq(orders.id, other.id));
    expect(row!.status).toBe("received");

    // …or cancels the first one, even with its checkout still open at the bank (tab closed).
    await expect(online.cancelUnpaidOnlineOrder(db, d, o.slug, other.id)).rejects.toMatchObject({
      message: "order_not_awaiting_payment",
    });
    await online.cancelUnpaidOnlineOrder(db, d, o.slug, placed.id);
    [row] = await db.select().from(orders).where(eq(orders.id, placed.id));
    expect(row!.status).toBe("cancelled");
    const [released] = await db.select().from(payments).where(eq(payments.id, again.paymentId));
    expect(released!.status).toBe("cancelled");
  });

  it("only online payment when the restaurant requires it; never online when it has none", async () => {
    const o = await setup({ requirePayment: true });
    const d = await diner();
    expect((await online.getOnlineStore(db, o.slug))?.payment).toEqual({
      provider: "zarinpal",
      onSite: false,
    });
    await expect(online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "on_site"))).rejects.toMatchObject({
      message: "online_payment_required",
    });
    await db
      .update(restaurantSettings)
      .set({ onlinePaymentEnabled: false })
      .where(eq(restaurantSettings.restaurantId, o.restaurant.id));
    await expect(online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "online"))).rejects.toMatchObject({
      message: "online_payment_unavailable",
    });
    const onSite = await online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "on_site"));
    expect(onSite.status).toBe("received");
  });

  it("cancels an order abandoned unpaid before the guest orders again", async () => {
    const o = await setup();
    const d = await diner();
    const stale = await online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "online"));
    await db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - 2 * 60 * 60_000) })
      .where(eq(orders.id, stale.id));
    await online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "on_site"));
    const [row] = await db.select().from(orders).where(eq(orders.id, stale.id));
    expect(row!.status).toBe("cancelled");
  });

  it("the periodic sweep cancels orders left at the bank, not a checkout in progress", async () => {
    const o = await setup();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    const start = async (d: { id: string }, id: string) => {
      zarinpal();
      return startOnlineOrderPayment(
        db,
        d,
        o.slug,
        id,
        { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
        { returnUrl: RETURN(o.slug, id) },
      );
    };
    // Left at the bank two hours ago: the tab was closed, the guest never came back.
    const gone = await diner();
    const left = await online.placeOnlineOrder(db, gone, o.slug, order(o.dish.id, "online"));
    const leftPay = await start(gone, left.id);
    await db.update(orders).set({ createdAt: twoHoursAgo }).where(eq(orders.id, left.id));
    await db.update(payments).set({ createdAt: twoHoursAgo }).where(eq(payments.id, leftPay.paymentId));
    // Another guest placed two hours ago too, but is paying right now (a retry).
    const back = await diner();
    const paying = await online.placeOnlineOrder(db, back, o.slug, order(o.dish.id, "online"));
    await db.update(orders).set({ createdAt: twoHoursAgo }).where(eq(orders.id, paying.id));
    await start(back, paying.id);

    expect(await online.cancelAbandonedOnlineOrders(db)).toBeGreaterThanOrEqual(1);
    const [a] = await db.select().from(orders).where(eq(orders.id, left.id));
    expect(a!.status).toBe("cancelled");
    const [ap] = await db.select().from(payments).where(eq(payments.id, leftPay.paymentId));
    expect(ap).toMatchObject({ status: "cancelled", failureReason: "expired" });
    const [b] = await db.select().from(orders).where(eq(orders.id, paying.id));
    expect(b).toMatchObject({ status: "pending_payment", paymentStatus: "pending" });
  });

  it("busy mode: online orders wait while paused, then come back", async () => {
    const o = await setup();
    const d = await diner();
    await expect(online.pauseOnlineOrders(db, o.ctx, 7)).rejects.toMatchObject({ message: "invalid_pause" });
    const until = await online.pauseOnlineOrders(db, o.ctx, 15);
    expect(until!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect((await online.getOnlineStore(db, o.slug))?.pausedUntil?.getTime()).toBe(until!.getTime());
    expect(await online.onlineServiceStatus(db, o.ctx)).toMatchObject({ enabled: true });
    await expect(online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "on_site"))).rejects.toMatchObject({
      message: "online_paused",
    });
    await online.pauseOnlineOrders(db, o.ctx, 0);
    expect((await online.getOnlineStore(db, o.slug))?.pausedUntil).toBeNull();
    const placed = await online.placeOnlineOrder(db, d, o.slug, order(o.dish.id, "on_site"));
    expect(placed.status).toBe("received");
  });
});
