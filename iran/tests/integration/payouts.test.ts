import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Iran edition: Zarinpal offered, IRR.
vi.mock("@/config/edition", async (orig) => {
  const mod = await orig<typeof import("@/config/edition")>();
  return { ...mod, EDITION: "iran", edition: mod.editionConfig("iran") };
});

const { db } = await import("@/server/db/client");
const { auditLogs, notifications, payments, payoutAccounts, restaurantSettings } =
  await import("@/server/db/schema");
const { createCategory } = await import("@/server/modules/menu/categories");
const { createProduct } = await import("@/server/modules/menu/products");
const { createTable } = await import("@/server/modules/tables/service");
const { enterTableByQr, loadGuestContext } = await import("@/server/modules/guest/sessions");
const { addToCart } = await import("@/server/modules/cart/service");
const { placeOrder } = await import("@/server/modules/orders/service");
const { handlePaymentReturn, newIdempotencyKey, startOnlinePayment, updatePaymentSettings } =
  await import("@/server/modules/payments/service");
const payouts = await import("@/server/modules/payouts/service");
const { createOwnerWithRestaurant } = await import("../helpers/factories");

const IBAN = "IR150120000000004567891234"; // valid check digits, Bank Mellat (012)
const RETURN = "http://localhost:3000/table/orders";
let calls: { url: string; body: Record<string, unknown> }[] = [];

/** Zarinpal API stub; `refuseWages`: the split is rejected (IBAN not registered at Shaparak). */
function zarinpal({ refuseWages = false } = {}) {
  calls = [];
  const authority = `A${randomUUID().replaceAll("-", "")}`;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.endsWith("/request.json")) {
      if (refuseWages && body.wages)
        return Response.json({ data: [], errors: { code: -38, message: "iban" } });
      return Response.json({ data: { code: 100, authority }, errors: [] });
    }
    return Response.json({ data: { code: 100, ref_id: 9, card_pan: "6037**1234" }, errors: [] });
  });
  return authority;
}

beforeAll(() => {
  process.env.ZARINPAL_MERCHANT_ID = "00000000-0000-0000-0000-000000000000";
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const owner = await createOwnerWithRestaurant("رستوران پرداخت", { plan: "professional" });
  await db
    .update(restaurantSettings)
    .set({ onlinePaymentEnabled: true, enabledPaymentProviders: ["cash", "zarinpal"] })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const table = await createTable(db, owner.ctx, { label: "۳" });
  const cat = await createCategory(db, owner.ctx, { name: "غذا" });
  const dish = await createProduct(db, owner.ctx, {
    categoryId: cat.id,
    name: "جوجه",
    priceCents: 450_000_000,
  });
  const admin = { ...owner.ctx.user, isSuperAdmin: true };
  return { owner, table, dish, admin };
}

async function pay(
  o: Awaited<ReturnType<typeof setup>>,
  quantity: number,
  opts: { refuseWages?: boolean } = {},
) {
  const authority = zarinpal(opts);
  const guestId = randomUUID();
  const e = await enterTableByQr(db, o.table.qrToken, guestId);
  const guest = (await loadGuestContext(db, guestId, e!.participant.id))!;
  await addToCart(db, guest, { productId: o.dish.id, optionValueIds: [], quantity });
  await placeOrder(db, guest);
  const start = await startOnlinePayment(
    db,
    guest,
    { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
    { returnUrl: RETURN },
  );
  await handlePaymentReturn(
    db,
    "zarinpal",
    new URLSearchParams({ payment: start.paymentId, Authority: authority, Status: "OK" }),
  );
  const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
  return p!;
}

describe("restaurant bank account", () => {
  it("is the owner's: validated, encrypted at rest, masked, audited and notified", async () => {
    const { owner } = await setup();
    const manager = { ...owner.ctx, role: "admin" as const };
    await expect(
      payouts.savePayoutAccount(db, manager, { holderName: "X", iban: IBAN }),
    ).rejects.toMatchObject({
      message: "owner_only",
    });
    await expect(
      payouts.savePayoutAccount(db, owner.ctx, {
        holderName: "علی رضایی",
        iban: "IR150120000000004567891235",
      }),
    ).rejects.toThrow();

    // Spaces, lower case and Persian digits are all accepted.
    const saved = await payouts.savePayoutAccount(db, owner.ctx, {
      holderName: "علی رضایی",
      iban: "ir15 0120 0000 0000 ۴۵۶۷ ۸۹۱۲ ۳۴",
      card: "",
    });
    expect(saved).toMatchObject({ ibanLast4: "1234", bankCode: "012", cardLast4: null });
    const [row] = await db
      .select()
      .from(payoutAccounts)
      .where(eq(payoutAccounts.restaurantId, owner.restaurant.id));
    expect(row!.ibanEnc).not.toContain("4567891234");
    expect(await payouts.payoutIban(db, owner.restaurant.id)).toBe(IBAN);
    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.restaurantId, owner.restaurant.id), eq(auditLogs.action, "payout_account.created")),
      );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain("4567891234");
    const bell = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.restaurantId, owner.restaurant.id),
          eq(notifications.type, "payout_account.updated"),
        ),
      );
    expect(bell).toHaveLength(1);
  });

  it("is required to collect through Spotifood, and cannot be removed while in use", async () => {
    const { owner } = await setup();
    const settings = {
      onlinePaymentEnabled: true,
      enabledPaymentProviders: ["cash", "zarinpal"] as "cash"[],
      requirePaymentBeforeOrder: false,
      onlinePaymentCollection: "platform" as const,
    };
    await expect(updatePaymentSettings(db, owner.ctx, settings)).rejects.toMatchObject({
      message: "payout_account_required",
    });
    await payouts.savePayoutAccount(db, owner.ctx, { holderName: "علی", iban: IBAN });
    await updatePaymentSettings(db, owner.ctx, settings);
    await expect(payouts.removePayoutAccount(db, owner.ctx)).rejects.toMatchObject({
      message: "payout_account_in_use",
    });
  });
});

describe("payments collected by Spotifood", () => {
  it("keeps the commission, splits the restaurant's share to its Sheba, and tracks what is still owed", async () => {
    const o = await setup();
    await payouts.savePayoutAccount(db, o.owner.ctx, { holderName: "علی", iban: IBAN });
    await payouts.setPlatformPayments(db, o.admin, { feeBps: 250, split: true });

    // 2 dishes = 9,000,000 rials; 2.5 % commission; the share goes out through Zarinpal's split.
    const p1 = await pay(o, 2);
    expect(calls[0]!.body).toMatchObject({
      merchant_id: process.env.ZARINPAL_MERCHANT_ID,
      amount: 9_000_000,
      wages: [{ iban: IBAN, amount: 8_775_000 }],
    });
    expect(p1).toMatchObject({
      status: "succeeded",
      metadata: expect.objectContaining({ collectedBy: "platform", feeBps: 250, splitCents: 877_500_000 }),
    });
    let [b] = (await payouts.listPayoutBalances(db, o.admin)).filter(
      (x) => x.restaurantId === o.owner.restaurant.id,
    );
    expect(b).toMatchObject({
      collectedCents: 900_000_000,
      feeCents: 22_500_000,
      splitCents: 877_500_000,
      dueCents: 0,
    });
    expect(b!.account?.iban).toBe(IBAN);

    // Zarinpal refuses the split: the payment still goes through, the share is owed by hand.
    const p2 = await pay(o, 1, { refuseWages: true });
    expect(calls.filter((c) => c.url.endsWith("/request.json"))).toHaveLength(2);
    expect(p2.metadata).toMatchObject({ splitCents: 0 });
    [b] = (await payouts.listPayoutBalances(db, o.admin)).filter(
      (x) => x.restaurantId === o.owner.restaurant.id,
    );
    expect(b!.dueCents).toBe(438_750_000);

    // The admin pays it by bank transfer; never more than what is owed.
    await expect(
      payouts.recordPayout(db, o.admin, {
        restaurantId: o.owner.restaurant.id,
        amountCents: 438_750_001,
        reference: "123456",
      }),
    ).rejects.toMatchObject({ message: "payout_exceeds_due" });
    await payouts.recordPayout(db, o.admin, {
      restaurantId: o.owner.restaurant.id,
      amountCents: 438_750_000,
      reference: "123456",
    });
    const mine = await payouts.getRestaurantPayouts(db, o.owner.ctx);
    expect(mine.balance).toMatchObject({ dueCents: 0, paidOutCents: 438_750_000 });
    expect(mine.history[0]).toMatchObject({ reference: "123456", ibanLast4: "1234" });
  });

  it("leaves a restaurant's own Zarinpal account alone (nothing owed by Spotifood)", async () => {
    const o = await setup();
    await db
      .update(restaurantSettings)
      .set({ onlinePaymentCollection: "own", zarinpalMerchantId: "11111111-2222-3333-4444-555555555555" })
      .where(eq(restaurantSettings.restaurantId, o.owner.restaurant.id));
    await payouts.setPlatformPayments(db, o.admin, { feeBps: 250, split: true });
    const p = await pay(o, 1);
    expect(calls[0]!.body.wages).toBeUndefined();
    expect(p.metadata).toMatchObject({ collectedBy: "restaurant" });
    const mine = await payouts.getRestaurantPayouts(db, o.owner.ctx);
    expect(mine.balance).toBeNull();
  });
});
