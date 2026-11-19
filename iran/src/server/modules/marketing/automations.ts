import { and, count, eq, gte, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  customers,
  orders,
  products,
  restaurantSettings,
  restaurants,
  smsAutomationSends,
  type SmsAutomations,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { notFound, validation } from "@/server/errors";
import { sms } from "@/server/infra/sms";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { localDayOf } from "@/server/modules/staff/payroll";

/**
 * Texts that bring guests back on their own: a birthday wish, a "we miss you" after weeks without
 * an order, a new dish announced to the regulars. Each text is sent once (no double send), and
 * the orders that follow within 7 days show what it brought in.
 */

const DAY = 86_400_000;
const PER_RUN = 300;
/** Orders placed this many days after a text count as brought by it. */
export const ATTRIBUTION_DAYS = 7;
export const AUTOMATION_KINDS = ["birthday", "winback", "new_dish"] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

export const automationsSchema = z.object({
  birthday: z.object({ enabled: z.boolean(), text: z.string().trim().max(300).default("") }),
  winback: z.object({
    enabled: z.boolean(),
    days: z.coerce.number().int().min(14).max(180),
    text: z.string().trim().max(300).default(""),
  }),
});
export type AutomationSettings = z.infer<typeof automationsSchema>;
const DEFAULTS: AutomationSettings = {
  birthday: { enabled: false, text: "" },
  winback: { enabled: false, days: 30, text: "" },
};

export async function getAutomations(db: DbOrTx, restaurantId: string): Promise<AutomationSettings> {
  const [row] = await db
    .select({ s: restaurantSettings.smsAutomations })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  const s = row?.s ?? {};
  return {
    birthday: { ...DEFAULTS.birthday, ...s.birthday, text: s.birthday?.text ?? "" },
    winback: { ...DEFAULTS.winback, ...s.winback, text: s.winback?.text ?? "" },
  };
}

export async function saveAutomations(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "customers.manage");
  const s = automationsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set({ smsAutomations: s satisfies SmsAutomations })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "marketing.automations_saved",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { birthday: s.birthday.enabled, winback: s.winback.enabled, days: s.winback.days },
  });
}

/** The default wording of each text, in the restaurant's language. */
export async function defaultTexts(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${l}.json`)).default;
  const t = createTranslator({ locale: l, messages, namespace: "automations.defaults" });
  return { birthday: t("birthday"), winback: t("winback"), newDish: t("newDish") };
}

/** "{name}", "{restaurant}", "{dish}", "{link}" filled in; the opt-out keyword ends the text. */
export function fillText(
  template: string,
  v: { name: string | null; restaurant: string; dish?: string; link: string },
) {
  return `${template
    .replaceAll("{name}", v.name?.trim() || "")
    .replaceAll("{restaurant}", v.restaurant)
    .replaceAll("{dish}", v.dish ?? "")
    .replaceAll("{link}", v.link)
    .replace(/\s{2,}/g, " ")
    .trim()}\nلغو11`;
}

const appUrl = () => (process.env.APP_URL ?? "https://spotifood.ir").replace(/\/$/, "");

async function record(
  db: DbOrTx,
  restaurantId: string,
  customerId: string,
  kind: AutomationKind,
  ref: string,
) {
  const inserted = await db
    .insert(smsAutomationSends)
    .values({ restaurantId, customerId, kind, ref })
    .onConflictDoNothing()
    .returning({ id: smsAutomationSends.id });
  return inserted.length > 0;
}

/** The month and day of a local day, compared with birthdays whatever their year. */
const monthDay = (day: string) => day.slice(5);

/**
 * Sends the birthday and win-back texts that are due, for every restaurant that turned them on.
 * Called by the periodic job; each text is claimed before it is sent, so it never goes twice.
 */
export async function sendDueAutomations(db: Database, now = new Date(), only?: string) {
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      timezone: restaurants.timezone,
      locale: restaurants.defaultLocale,
      domain: restaurants.customDomain,
      s: restaurantSettings.smsAutomations,
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(
      and(
        isNull(restaurants.deletedAt),
        eq(restaurants.status, "active"),
        isNotNull(restaurantSettings.smsAutomations),
        only ? eq(restaurants.id, only) : undefined,
      ),
    );
  let sent = 0;
  for (const r of rows) {
    const s = await getAutomations(db, r.id);
    if (!s.birthday.enabled && !s.winback.enabled) continue;
    const defaults = await defaultTexts(r.locale);
    const link = r.domain ? `https://${r.domain}` : `${appUrl()}/r/${r.slug}/order`;
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: r.timezone, hour: "2-digit", hourCycle: "h23" }).format(
        now,
      ),
    );
    // Texts go out in the daytime only (10:00–20:00 local).
    if (hour < 10 || hour >= 20) continue;
    const today = localDayOf(now, r.timezone);
    if (s.birthday.enabled) {
      const list = await db
        .select({ id: customers.id, phone: customers.phone, name: customers.name })
        .from(customers)
        .where(
          and(
            eq(customers.restaurantId, r.id),
            eq(customers.smsOptOut, false),
            sql`to_char(${customers.birthDate}, 'MM-DD') = ${monthDay(today)}`,
          ),
        )
        .limit(PER_RUN);
      for (const c of list) {
        if (!(await record(db, r.id, c.id, "birthday", today.slice(0, 4)))) continue;
        sent += await deliver(
          c.phone,
          fillText(s.birthday.text || defaults.birthday, { name: c.name, restaurant: r.name, link }),
        );
      }
    }
    if (s.winback.enabled) {
      const cutoff = new Date(now.getTime() - s.winback.days * DAY);
      // Gone quiet: a last order before the cutoff (but within a year), not yet texted for it.
      const list = await db
        .select({
          id: customers.id,
          phone: customers.phone,
          name: customers.name,
          last: customers.lastOrderAt,
        })
        .from(customers)
        .where(
          and(
            eq(customers.restaurantId, r.id),
            eq(customers.smsOptOut, false),
            lt(customers.lastOrderAt, cutoff),
            gte(customers.lastOrderAt, new Date(now.getTime() - 365 * DAY)),
          ),
        )
        .limit(PER_RUN);
      for (const c of list) {
        if (!(await record(db, r.id, c.id, "winback", c.last!.toISOString().slice(0, 10)))) continue;
        sent += await deliver(
          c.phone,
          fillText(s.winback.text || defaults.winback, { name: c.name, restaurant: r.name, link }),
        );
      }
    }
  }
  return sent;
}

async function deliver(phone: string, text: string) {
  try {
    await sms().send(phone, text);
    return 1;
  } catch (e) {
    console.error("[automations] sms failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** A new dish told to the regulars (an order in the last 90 days), once per dish and guest. */
export async function announceDish(db: Database, ctx: RestaurantContext, productId: string, rawText: string) {
  assertCan(ctx, "customers.manage");
  if (!isUuid(productId)) throw notFound();
  const [dish] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.restaurantId, ctx.restaurant.id),
        isNull(products.deletedAt),
      ),
    );
  if (!dish) throw notFound();
  const text = rawText.trim().slice(0, 300) || (await defaultTexts(ctx.restaurant.defaultLocale)).newDish;
  const [r] = await db
    .select({ slug: restaurants.slug, domain: restaurants.customDomain })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  const link = r?.domain ? `https://${r.domain}` : `${appUrl()}/r/${r?.slug}/order`;
  const list = await db
    .select({ id: customers.id, phone: customers.phone, name: customers.name })
    .from(customers)
    .where(
      and(
        eq(customers.restaurantId, ctx.restaurant.id),
        eq(customers.smsOptOut, false),
        gte(customers.lastOrderAt, new Date(Date.now() - 90 * DAY)),
      ),
    )
    .limit(5000);
  if (!list.length) throw validation("no_recipients");
  let sent = 0;
  for (const c of list) {
    if (!(await record(db, ctx.restaurant.id, c.id, "new_dish", dish.id))) continue;
    sent += await deliver(
      c.phone,
      fillText(text, { name: c.name, restaurant: ctx.restaurant.name, dish: dish.name, link }),
    );
  }
  await recordAudit(db, {
    action: "marketing.dish_announced",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "product",
    entityId: dish.id,
    metadata: { recipients: list.length, sent },
  });
  return { recipients: list.length, sent };
}

/**
 * What each kind of text brought in over the period: texts sent, guests who ordered within 7 days
 * after one, and what those orders came to.
 */
export async function automationResults(db: DbOrTx, ctx: RestaurantContext, since: Date) {
  assertCan(ctx, "customers.view");
  const rid = ctx.restaurant.id;
  const sent = await db
    .select({ kind: smsAutomationSends.kind, n: count() })
    .from(smsAutomationSends)
    .where(and(eq(smsAutomationSends.restaurantId, rid), gte(smsAutomationSends.sentAt, since)))
    .groupBy(smsAutomationSends.kind);
  const rows = await db
    .selectDistinct({
      kind: smsAutomationSends.kind,
      orderId: orders.id,
      customerId: orders.customerId,
      totalCents: orders.totalCents,
    })
    .from(smsAutomationSends)
    .innerJoin(
      orders,
      and(
        eq(orders.restaurantId, rid),
        eq(orders.customerId, smsAutomationSends.customerId),
        gte(orders.placedAt, smsAutomationSends.sentAt),
        lt(orders.placedAt, sql`${smsAutomationSends.sentAt} + make_interval(days => ${ATTRIBUTION_DAYS})`),
        notInArray(orders.status, ["cancelled", "pending_payment"]),
      ),
    )
    .where(and(eq(smsAutomationSends.restaurantId, rid), gte(smsAutomationSends.sentAt, since)))
    .limit(20_000);
  const back = AUTOMATION_KINDS.map((k) => {
    const mine = rows.filter((x) => x.kind === k);
    return {
      kind: k,
      guests: new Set(mine.map((x) => x.customerId)).size,
      orders: mine.length,
      revenue: mine.reduce((sum, x) => sum + x.totalCents, 0),
    };
  });
  return AUTOMATION_KINDS.map((k) => ({
    kind: k,
    sent: sent.find((s) => s.kind === k)?.n ?? 0,
    guests: back.find((b) => b.kind === k)?.guests ?? 0,
    orders: back.find((b) => b.kind === k)?.orders ?? 0,
    revenueCents: back.find((b) => b.kind === k)?.revenue ?? 0,
  }));
}

/** Guests whose birthday is known (the birthday text needs it). */
export async function birthdaysKnown(db: DbOrTx, ctx: RestaurantContext) {
  const [row] = await db
    .select({ n: count() })
    .from(customers)
    .where(and(eq(customers.restaurantId, ctx.restaurant.id), isNotNull(customers.birthDate)));
  return row?.n ?? 0;
}

/** The latest dishes of the menu, newest first (the "new dish" text picks one). */
export async function recentDishes(db: DbOrTx, restaurantId: string) {
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.restaurantId, restaurantId), isNull(products.deletedAt)))
    .orderBy(sql`${products.createdAt} desc`)
    .limit(60);
}
