import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  payments,
  payoutAccounts,
  payouts,
  platformSettings,
  restaurantSettings,
  restaurants,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, forbidden, notFound, validation } from "@/server/errors";
import type { SessionUser } from "@/server/auth/sessions";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { open, seal } from "@/server/infra/secret-box";
import { notifyTeam } from "@/server/modules/team/sections";
import { bankCodeOf, cleanDigits, isValidCard, isValidIban, normalizeIban } from "@/lib/iban";

/**
 * Online payments collected by Spotifood for restaurants that have no Zarinpal account of their
 * own ("via Spotifood"), and what Spotifood owes each of them.
 *
 * - The restaurant's owner enters where to be paid (Sheba, holder name, optional card), stored
 *   encrypted. Only the owner can change it; every change is audited and notified.
 * - Each payment collected that way keeps, in its metadata, the commission in force
 *   (`feeBps`) and what Zarinpal paid the restaurant directly through split settlement
 *   (`splitCents`, "تسهیم"), so later changes never rewrite the past.
 * - Owed = Σ (net payment − commission − split) − Σ payouts recorded by the platform admin.
 */

const BOX = "payout-account";

// ─── Platform settings (super admin) ─────────────────────────────────────────

export type PlatformPayments = {
  /** Spotifood's commission on payments it collects, in basis points (250 = 2.5 %). */
  feeBps: number;
  /** Zarinpal split settlement is activated on Spotifood's merchant: shares go out automatically. */
  split: boolean;
};
const PLATFORM_DEFAULTS: PlatformPayments = { feeBps: 0, split: false };

/** Spotifood's own Zarinpal merchant (the guest-payment one, else the subscription one). */
export const platformMerchantId = () =>
  process.env.ZARINPAL_MERCHANT_ID || process.env.BILLING_ZARINPAL_MERCHANT_ID || null;

export async function getPlatformPayments(db: DbOrTx): Promise<PlatformPayments> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, "payments"));
  return { ...PLATFORM_DEFAULTS, ...((row?.value as Partial<PlatformPayments> | undefined) ?? {}) };
}

export const platformPaymentsSchema = z.object({
  feeBps: z.number().int().min(0).max(3000),
  split: z.boolean(),
});

export async function setPlatformPayments(
  db: Database,
  admin: SessionUser,
  raw: z.input<typeof platformPaymentsSchema>,
) {
  if (!admin.isSuperAdmin) throw forbidden();
  const value = platformPaymentsSchema.parse(raw);
  await db.transaction(async (tx) => {
    await tx
      .insert(platformSettings)
      .values({ key: "payments", value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
    await recordAudit(tx, {
      action: "admin.platform_payments_updated",
      actorUserId: admin.id,
      metadata: value,
    });
  });
  return value;
}

// ─── The restaurant's bank account ───────────────────────────────────────────

export const payoutAccountSchema = z.object({
  holderName: z.string().trim().min(2, "invalid").max(120),
  iban: z
    .string()
    .transform(normalizeIban)
    .refine((v) => isValidIban(v), "invalid_iban"),
  card: z
    .string()
    .optional()
    .transform((v) => (v ? cleanDigits(v) : ""))
    .refine((v) => v === "" || isValidCard(v), "invalid_card"),
});

export type PayoutAccountView = {
  holderName: string;
  ibanLast4: string;
  bankCode: string;
  cardLast4: string | null;
  updatedAt: Date;
};

/** Masked account (anyone who manages the restaurant sees whether payouts are set up). */
export async function getPayoutAccount(
  db: DbOrTx,
  ctx: RestaurantContext,
): Promise<PayoutAccountView | null> {
  assertCan(ctx, "restaurant.view");
  return payoutAccountOf(db, ctx.restaurant.id);
}

async function payoutAccountOf(db: DbOrTx, restaurantId: string): Promise<PayoutAccountView | null> {
  const [row] = await db
    .select({
      holderName: payoutAccounts.holderName,
      ibanLast4: payoutAccounts.ibanLast4,
      bankCode: payoutAccounts.bankCode,
      cardLast4: payoutAccounts.cardLast4,
      updatedAt: payoutAccounts.updatedAt,
    })
    .from(payoutAccounts)
    .where(eq(payoutAccounts.restaurantId, restaurantId));
  return row ?? null;
}

/** Bank details are the owner's decision: a manager or staff account cannot redirect the money. */
function assertOwner(ctx: RestaurantContext) {
  if (ctx.role !== "owner") throw forbidden("owner_only");
}

export async function savePayoutAccount(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof payoutAccountSchema>,
) {
  assertOwner(ctx);
  const input = payoutAccountSchema.parse(raw);
  const values = {
    holderName: input.holderName,
    ibanEnc: seal(input.iban, BOX),
    ibanLast4: input.iban.slice(-4),
    bankCode: bankCodeOf(input.iban),
    cardEnc: input.card ? seal(input.card, BOX) : null,
    cardLast4: input.card ? input.card.slice(-4) : null,
    updatedByUserId: ctx.user.id,
  };
  await db.transaction(async (tx) => {
    const before = await payoutAccountOf(tx, ctx.restaurant.id);
    await tx
      .insert(payoutAccounts)
      .values({ restaurantId: ctx.restaurant.id, ...values })
      .onConflictDoUpdate({ target: payoutAccounts.restaurantId, set: { ...values, updatedAt: new Date() } });
    const meta = {
      ibanLast4: values.ibanLast4,
      bankCode: values.bankCode,
      previousIbanLast4: before?.ibanLast4 ?? null,
    };
    await recordAudit(tx, {
      action: before ? "payout_account.updated" : "payout_account.created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "payout_account",
      entityId: ctx.restaurant.id,
      metadata: meta,
    });
    // Everyone with the bell sees it: a change nobody expected is spotted at once.
    await notifyTeam(tx, {
      restaurantId: ctx.restaurant.id,
      type: "payout_account.updated",
      payload: { ...meta, by: ctx.user.fullName },
    });
  });
  return payoutAccountOf(db, ctx.restaurant.id);
}

export async function removePayoutAccount(db: Database, ctx: RestaurantContext) {
  assertOwner(ctx);
  const [s] = await db
    .select({
      on: restaurantSettings.onlinePaymentEnabled,
      collection: restaurantSettings.onlinePaymentCollection,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  // Payments collected by Spotifood must always have somewhere to go.
  if (s?.on && s.collection === "platform") throw conflict("payout_account_in_use");
  await db.transaction(async (tx) => {
    await tx.delete(payoutAccounts).where(eq(payoutAccounts.restaurantId, ctx.restaurant.id));
    await recordAudit(tx, {
      action: "payout_account.removed",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "payout_account",
      entityId: ctx.restaurant.id,
    });
  });
}

/** Clear IBAN for a payment split or a transfer (server side only, never sent to the browser). */
export async function payoutIban(db: DbOrTx, restaurantId: string): Promise<string | null> {
  const [row] = await db
    .select({ ibanEnc: payoutAccounts.ibanEnc })
    .from(payoutAccounts)
    .where(eq(payoutAccounts.restaurantId, restaurantId));
  return row ? open(row.ibanEnc, BOX) : null;
}

// ─── What Spotifood owes ─────────────────────────────────────────────────────

const SETTLED = ["succeeded", "partially_refunded", "refunded"] as const;

/** Restaurant share of a payment collected by Spotifood, after its commission. */
export const shareOf = (netCents: number, feeBps: number) =>
  Math.floor((netCents * (10_000 - feeBps)) / 10_000);

/** Totals for one restaurant, or every restaurant with platform-collected payments. */
async function ledger(db: DbOrTx, restaurantId?: string) {
  const net = sql`(${payments.amountCents} - ${payments.refundedCents})`;
  const fee = sql`coalesce((${payments.metadata}->>'feeBps')::int, 0)`;
  const rows = await db
    .select({
      restaurantId: payments.restaurantId,
      currency: sql<string>`max(${payments.currency})`,
      count: sql<number>`count(*)::int`,
      collectedCents: sql<number>`coalesce(sum(${net}), 0)::bigint`.mapWith(Number),
      shareCents: sql<number>`coalesce(sum(floor(${net} * (10000 - ${fee}) / 10000.0)), 0)::bigint`.mapWith(
        Number,
      ),
      splitCents:
        sql<number>`coalesce(sum(coalesce((${payments.metadata}->>'splitCents')::bigint, 0)), 0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(payments)
    .where(
      and(
        inArray(payments.status, [...SETTLED]),
        sql`${payments.metadata}->>'collectedBy' = 'platform'`,
        restaurantId ? eq(payments.restaurantId, restaurantId) : undefined,
      ),
    )
    .groupBy(payments.restaurantId);
  const paid = await db
    .select({
      restaurantId: payouts.restaurantId,
      paidOutCents: sql<number>`coalesce(sum(${payouts.amountCents}), 0)::bigint`.mapWith(Number),
      lastPaidAt: sql<Date | null>`max(${payouts.paidAt})`,
    })
    .from(payouts)
    .where(restaurantId ? eq(payouts.restaurantId, restaurantId) : undefined)
    .groupBy(payouts.restaurantId);
  const paidBy = new Map(paid.map((p) => [p.restaurantId, p]));
  return rows.map((r) => {
    const p = paidBy.get(r.restaurantId);
    const paidOutCents = p?.paidOutCents ?? 0;
    return {
      ...r,
      feeCents: r.collectedCents - r.shareCents,
      paidOutCents,
      lastPaidAt: p?.lastPaidAt ? new Date(p.lastPaidAt) : null,
      /** Still to transfer by hand (what the split did not already send). */
      dueCents: r.shareCents - r.splitCents - paidOutCents,
    };
  });
}

export type PayoutBalance = Awaited<ReturnType<typeof ledger>>[number];

/** The restaurant's view: collected for it, commission, already received, still due. */
export async function getRestaurantPayouts(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "payments.view");
  const [balance] = await ledger(db, ctx.restaurant.id);
  const history = await db
    .select({
      id: payouts.id,
      amountCents: payouts.amountCents,
      currency: payouts.currency,
      reference: payouts.reference,
      ibanLast4: payouts.ibanLast4,
      paidAt: payouts.paidAt,
    })
    .from(payouts)
    .where(eq(payouts.restaurantId, ctx.restaurant.id))
    .orderBy(desc(payouts.paidAt))
    .limit(20);
  return { balance: balance ?? null, history, account: await payoutAccountOf(db, ctx.restaurant.id) };
}

/** Super admin: every restaurant Spotifood collects for, with its account to pay. */
export async function listPayoutBalances(db: Database, admin: SessionUser) {
  if (!admin.isSuperAdmin) throw forbidden();
  const balances = await ledger(db);
  const accounts = await db
    .select({
      restaurantId: payoutAccounts.restaurantId,
      holderName: payoutAccounts.holderName,
      ibanEnc: payoutAccounts.ibanEnc,
      bankCode: payoutAccounts.bankCode,
      cardEnc: payoutAccounts.cardEnc,
      updatedAt: payoutAccounts.updatedAt,
    })
    .from(payoutAccounts);
  const names = await db
    .select({ id: restaurants.id, name: restaurants.name, currency: restaurants.currency })
    .from(restaurants);
  const nameOf = new Map(names.map((n) => [n.id, n]));
  const accountOf = new Map(accounts.map((a) => [a.restaurantId, a]));
  const ids = new Set([...balances.map((b) => b.restaurantId), ...accounts.map((a) => a.restaurantId)]);
  return [...ids]
    .map((id) => {
      const b = balances.find((x) => x.restaurantId === id);
      const a = accountOf.get(id);
      const r = nameOf.get(id);
      return {
        restaurantId: id,
        name: r?.name ?? "—",
        currency: b?.currency ?? r?.currency ?? "IRR",
        count: b?.count ?? 0,
        collectedCents: b?.collectedCents ?? 0,
        feeCents: b?.feeCents ?? 0,
        splitCents: b?.splitCents ?? 0,
        paidOutCents: b?.paidOutCents ?? 0,
        dueCents: b?.dueCents ?? 0,
        lastPaidAt: b?.lastPaidAt ?? null,
        account: a
          ? {
              holderName: a.holderName,
              iban: open(a.ibanEnc, BOX),
              bankCode: a.bankCode,
              card: a.cardEnc ? open(a.cardEnc, BOX) : null,
              updatedAt: a.updatedAt,
            }
          : null,
      };
    })
    .sort((x, y) => y.dueCents - x.dueCents || x.name.localeCompare(y.name));
}

export const payoutSchema = z.object({
  restaurantId: z.uuid(),
  amountCents: z.number().int().positive("invalid"),
  reference: z.string().trim().min(3, "invalid").max(64),
  note: z.string().trim().max(500).optional(),
});

/** Records a bank transfer the platform admin made to a restaurant. */
export async function recordPayout(db: Database, admin: SessionUser, raw: z.input<typeof payoutSchema>) {
  if (!admin.isSuperAdmin) throw forbidden();
  const input = payoutSchema.parse(raw);
  return db.transaction(async (tx) => {
    // One transfer at a time per restaurant, so two admins never pay the same balance twice.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payouts:${input.restaurantId}`}))`);
    const [balance] = await ledger(tx, input.restaurantId);
    const [account] = await tx
      .select({ ibanLast4: payoutAccounts.ibanLast4 })
      .from(payoutAccounts)
      .where(eq(payoutAccounts.restaurantId, input.restaurantId));
    if (!balance) throw notFound();
    if (input.amountCents > balance.dueCents) throw validation("payout_exceeds_due", { field: "amount" });
    const [row] = await tx
      .insert(payouts)
      .values({
        restaurantId: input.restaurantId,
        amountCents: input.amountCents,
        currency: balance.currency,
        reference: input.reference,
        note: input.note || null,
        ibanLast4: account?.ibanLast4 ?? null,
        createdByUserId: admin.id,
      })
      .returning();
    await recordAudit(tx, {
      action: "admin.payout_recorded",
      actorUserId: admin.id,
      restaurantId: input.restaurantId,
      entityType: "payout",
      entityId: row!.id,
      metadata: { amountCents: input.amountCents, reference: input.reference },
    });
    await notifyTeam(tx, {
      restaurantId: input.restaurantId,
      type: "payout.sent",
      payload: { amountCents: input.amountCents, currency: balance.currency, reference: input.reference },
    });
    return row!;
  });
}

export async function listRecentPayouts(db: Database, admin: SessionUser, limit = 20) {
  if (!admin.isSuperAdmin) throw forbidden();
  return db
    .select({
      id: payouts.id,
      restaurantId: payouts.restaurantId,
      name: restaurants.name,
      amountCents: payouts.amountCents,
      currency: payouts.currency,
      reference: payouts.reference,
      ibanLast4: payouts.ibanLast4,
      paidAt: payouts.paidAt,
    })
    .from(payouts)
    .innerJoin(restaurants, eq(restaurants.id, payouts.restaurantId))
    .orderBy(desc(payouts.paidAt))
    .limit(limit);
}
