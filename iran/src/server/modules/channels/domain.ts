import { and, eq, gte, isNull, isNotNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { orders, restaurantSettings, restaurants } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isPlatformHost } from "@/lib/hosts";

/**
 * The restaurant's own domain for its ordering site, and what ordering direct saves it compared
 * with a delivery platform's commission.
 */

/** A host name (order.myrestaurant.ir): lower case, no scheme, no path, no port. */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) =>
    v
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, ""),
  )
  .refine((v) => v === "" || /^(?=.{4,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(v), "invalid_domain");

export async function slugForDomain(db: DbOrTx, host: string) {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  const [r] = await db
    .select({ slug: restaurants.slug })
    .from(restaurants)
    .where(
      and(eq(restaurants.customDomain, h), isNull(restaurants.deletedAt), eq(restaurants.status, "active")),
    );
  return r?.slug ?? null;
}

export async function getCustomDomain(db: DbOrTx, restaurantId: string) {
  const [r] = await db
    .select({ domain: restaurants.customDomain })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId));
  return r?.domain ?? null;
}

export async function setCustomDomain(db: Database, ctx: RestaurantContext, raw: string) {
  assertCan(ctx, "restaurant.manage");
  const domain = domainSchema.parse(raw);
  if (domain && isPlatformHost(domain)) throw conflict("invalid_domain");
  try {
    await db
      .update(restaurants)
      .set({ customDomain: domain || null })
      .where(eq(restaurants.id, ctx.restaurant.id));
  } catch (e) {
    if (
      String((e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code) === "23505"
    )
      throw conflict("domain_taken");
    throw e;
  }
  await recordAudit(db, {
    action: "restaurant.custom_domain",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { domain: domain || null },
  });
  return domain || null;
}

/** A delivery platform's usual commission when the restaurant has not set its own. */
export const DEFAULT_COMMISSION_BPS = 2500;

/**
 * Orders the guests placed themselves (online site, bot links, kiosk excluded) over the period,
 * and the commission a platform would have taken on them.
 */
export async function directSavings(db: DbOrTx, ctx: RestaurantContext, since: Date) {
  const [row] = await db
    .select({
      n: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, ctx.restaurant.id),
        isNotNull(orders.dinerId),
        isNull(orders.platform),
        notInArray(orders.status, ["cancelled", "pending_payment"]),
        gte(orders.placedAt, since),
      ),
    );
  const [s] = await db
    .select({ p: restaurantSettings.platforms })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  const rates = Object.values(s?.p?.commissions ?? {}).filter((v) => v > 0);
  const bps = rates.length
    ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
    : DEFAULT_COMMISSION_BPS;
  const total = row?.total ?? 0;
  return {
    orders: row?.n ?? 0,
    totalCents: total,
    commissionBps: bps,
    savedCents: Math.round((total * bps) / 10_000),
  };
}
