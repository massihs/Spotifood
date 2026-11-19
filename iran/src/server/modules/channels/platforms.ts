import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gte, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  categories,
  orders,
  paymentAllocations,
  payments,
  products,
  restaurantSettings,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { ownerContext } from "./owner";
import { createPosOrder } from "@/server/modules/pos/service";
import { emitPaymentUpdate, settleAllocations } from "@/server/modules/payments/service";
import { DEFAULT_COMMISSION_BPS } from "./domain";

/**
 * Orders from the delivery platforms (Snappfood, Tapsi Food…) in the same kitchen flow as the
 * others: typed in from the tablet of the platform in a few taps, or pushed by an integration with
 * the restaurant's key. Each comes in paid by the platform (the platform pays the restaurant later),
 * marked with the platform and its order number, so the reports show what each platform brings
 * and costs in commission.
 */

export const PLATFORMS = ["snappfood", "tapsifood", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export async function platformSettings(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ p: restaurantSettings.platforms })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  const c = row?.p?.commissions ?? {};
  return {
    commissions: Object.fromEntries(
      PLATFORMS.map((p) => [p, c[p] ?? (p === "other" ? 0 : DEFAULT_COMMISSION_BPS)]),
    ) as Record<Platform, number>,
    hasKey: !!row?.p?.apiKeyHash,
  };
}

export const commissionsSchema = z.object(
  Object.fromEntries(PLATFORMS.map((p) => [p, z.coerce.number().int().min(0).max(6000)])) as Record<
    Platform,
    z.ZodCoercedNumber<unknown>
  >,
);

export async function saveCommissions(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.manage");
  const c = commissionsSchema.parse(raw);
  const [row] = await db
    .select({ p: restaurantSettings.platforms })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await db
    .update(restaurantSettings)
    .set({ platforms: { ...(row?.p ?? {}), commissions: c } })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
}

const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

/** A new key for an integration (shown once; only its hash is kept). */
export async function regenerateApiKey(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.manage");
  const key = `sfk_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .select({ p: restaurantSettings.platforms })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await db
    .update(restaurantSettings)
    .set({ platforms: { ...(row?.p ?? {}), apiKeyHash: hashKey(key) } })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "channels.api_key_created",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
  });
  return key;
}

/**
 * The context an integration acts in: the restaurant's owner, once its key matches. Same answer
 * for an unknown restaurant and a wrong key.
 */
export async function integrationContext(db: Database, restaurantId: string, key: string) {
  const [row] = await db
    .select({ p: restaurantSettings.platforms })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId))
    .catch(() => []);
  const stored = row?.p?.apiKeyHash;
  if (!stored || !key) throw notFound();
  const a = Buffer.from(hashKey(key));
  const b = Buffer.from(stored);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw notFound();
  return ownerContext(db, restaurantId);
}

export const platformOrderSchema = z.object({
  platform: z.enum(PLATFORMS),
  externalRef: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\w#-]+$/, "invalid_ref"),
  customerName: z.string().trim().max(120).default(""),
  note: z.string().trim().max(400).default(""),
  lines: z
    .array(
      z
        .object({
          productId: z.uuid().optional(),
          /** Name on the platform, matched with the menu when there is no id. */
          name: z.string().trim().max(160).optional(),
          quantity: z.coerce.number().int().min(1).max(99),
          note: z.string().trim().max(200).default(""),
        })
        .refine((l) => l.productId || l.name, "product_required"),
    )
    .min(1)
    .max(60),
});
export type PlatformOrderInput = z.input<typeof platformOrderSchema>;

const norm = (s: string) =>
  s
    .replace(/[‌\s]+/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .trim()
    .toLowerCase();

/** Rings up a platform's order: to the kitchen at once, paid by the platform. Sent twice = once. */
export async function createPlatformOrder(db: Database, ctx: RestaurantContext, raw: PlatformOrderInput) {
  assertCan(ctx, "orders.create");
  const input = platformOrderSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const [existing] = await db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, rid),
        eq(orders.platform, input.platform),
        eq(orders.externalRef, input.externalRef),
      ),
    );
  if (existing) return { orderId: existing.id, number: existing.number, duplicate: true };

  const menu = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt)));
  const unknown: string[] = [];
  const lines = input.lines.map((l) => {
    const p = l.productId
      ? menu.find((m) => m.id === l.productId)
      : menu.find((m) => norm(m.name) === norm(l.name!));
    if (!p) unknown.push(l.name ?? l.productId!);
    return { productId: p?.id ?? "", quantity: l.quantity, note: l.note };
  });
  if (unknown.length) throw validation("unknown_products", { names: unknown.slice(0, 10) });

  const label = { snappfood: "Snappfood", tapsifood: "Tapsi Food", other: "Platform" }[input.platform];
  const { order } = await createPosOrder(db, ctx, {
    channel: "takeaway",
    lines,
    note: [`${label} #${input.externalRef}`, input.customerName, input.note]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500),
    idempotencyKey: `plt_${input.platform}_${createHash("sha256").update(input.externalRef).digest("hex").slice(0, 32)}`,
  });
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ platform: input.platform, externalRef: input.externalRef })
      .where(eq(orders.id, order.id));
    if (order.totalCents <= 0) return;
    const [payment] = await tx
      .insert(payments)
      .values({
        restaurantId: rid,
        provider: "platform",
        status: "succeeded",
        succeededAt: new Date(),
        amountCents: order.totalCents,
        currency: ctx.restaurant.currency,
        recordedByUserId: ctx.user.id,
        idempotencyKey: `pay_${input.platform}_${createHash("sha256").update(input.externalRef).digest("hex").slice(0, 32)}`,
        metadata: { platform: input.platform, externalRef: input.externalRef },
      })
      .returning();
    await tx.insert(paymentAllocations).values({
      restaurantId: rid,
      paymentId: payment!.id,
      orderId: order.id,
      amountCents: order.totalCents,
    });
    await settleAllocations(tx, payment!, ctx.user.id);
    await emitPaymentUpdate(tx, payment!);
  });
  return { orderId: order.id, number: order.number, duplicate: false };
}

/** What each platform brought over the period, its commission, and the direct orders beside. */
export async function platformReport(db: DbOrTx, ctx: RestaurantContext, since: Date) {
  const settings = await platformSettings(db, ctx.restaurant.id);
  const live = and(
    eq(orders.restaurantId, ctx.restaurant.id),
    notInArray(orders.status, ["cancelled", "pending_payment"]),
    gte(orders.placedAt, since),
  );
  const rows = await db
    .select({
      platform: orders.platform,
      n: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(and(live, isNotNull(orders.platform)))
    .groupBy(orders.platform);
  const [direct] = await db
    .select({
      n: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(and(live, isNull(orders.platform), isNotNull(orders.dinerId)));
  const list = PLATFORMS.map((p) => {
    const r = rows.find((x) => x.platform === p);
    const total = r?.total ?? 0;
    const commission = Math.round((total * settings.commissions[p]) / 10_000);
    return {
      platform: p,
      orders: r?.n ?? 0,
      totalCents: total,
      commissionBps: settings.commissions[p],
      commissionCents: commission,
      netCents: total - commission,
    };
  });
  return { platforms: list, direct: { orders: direct?.n ?? 0, totalCents: direct?.total ?? 0 } };
}

/** Every dish of the menu by name (the platform order form picks from it). */
export async function menuDishes(db: DbOrTx, restaurantId: string) {
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.restaurantId, restaurantId), isNull(products.deletedAt)))
    .orderBy(products.name)
    .limit(500);
}
