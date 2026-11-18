import { and, count, eq, gte, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { orderItems, orders, restaurantSettings, restaurants, stockItems } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { sms } from "@/server/infra/sms";
import { pushToManagers } from "@/server/modules/push/service";
import { notifyTeam } from "@/server/modules/team/sections";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { staffAnomaliesFor } from "@/server/modules/insights/service";
import { localDayOf, zonedInstant } from "@/server/modules/staff/payroll";

/**
 * The evening report: at the hour the owner chose, the day's takings, the comparison with the same
 * day last week, the best dish and what needs attention, on their phone (push, and a text message
 * if they want). Sent once a day by the periodic job.
 */

const DAY = 86_400_000;

export type DailyReportSettings = { enabled: boolean; hour: number; sms: boolean; phone: string };
export const DEFAULT_DAILY: DailyReportSettings = { enabled: false, hour: 23, sms: false, phone: "" };

export const dailySettingsSchema = z.object({
  enabled: z.boolean(),
  hour: z.coerce.number().int().min(0).max(23),
  sms: z.boolean(),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.replace(/[^\d+]/g, ""))
    .default(""),
});

export async function getDailyReportSettings(db: DbOrTx, restaurantId: string): Promise<DailyReportSettings> {
  const [row] = await db
    .select({ s: restaurantSettings.dailyReport })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return { ...DEFAULT_DAILY, ...(row?.s ?? {}) } as DailyReportSettings;
}

export async function saveDailyReportSettings(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "accounting.manage");
  const s = dailySettingsSchema.parse(raw);
  const [cur] = await db
    .select({ s: restaurantSettings.dailyReport })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await db
    .update(restaurantSettings)
    .set({ dailyReport: { ...(cur?.s ?? {}), ...s } })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "reports.daily_settings",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { enabled: s.enabled, hour: s.hour, sms: s.sms },
  });
}

/** The figures of one local day, and of the same weekday a week before. */
export async function dailyFigures(
  db: DbOrTx,
  r: { id: string; timezone: string; currency: string },
  day: string,
) {
  const from = zonedInstant(day, "00:00", r.timezone);
  const to = new Date(from.getTime() + DAY);
  const sales = (a: Date, b: Date) =>
    and(
      eq(orders.restaurantId, r.id),
      notInArray(orders.status, ["cancelled", "pending_payment"]),
      gte(orders.placedAt, a),
      lt(orders.placedAt, b),
    );
  const [[today], [lastWeek], [top], [cancelled], [low], anomalies] = await Promise.all([
    db
      .select({ n: count(), total: sql<string>`coalesce(sum(${orders.totalCents}), 0)` })
      .from(orders)
      .where(sales(from, to)),
    db
      .select({ total: sql<string>`coalesce(sum(${orders.totalCents}), 0)` })
      .from(orders)
      .where(sales(new Date(from.getTime() - 7 * DAY), new Date(to.getTime() - 7 * DAY))),
    db
      .select({ name: orderItems.productName, qty: sql<string>`sum(${orderItems.quantity})` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(sales(from, to))
      .groupBy(orderItems.productName)
      .orderBy(sql`2 desc`)
      .limit(1),
    db
      .select({ n: count() })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, r.id),
          eq(orders.status, "cancelled"),
          gte(orders.placedAt, from),
          lt(orders.placedAt, to),
        ),
      ),
    db
      .select({ n: count() })
      .from(stockItems)
      .where(
        and(
          eq(stockItems.restaurantId, r.id),
          isNull(stockItems.deletedAt),
          eq(stockItems.isActive, true),
          sql`${stockItems.lowStockThreshold} > 0`,
          lte(stockItems.quantity, stockItems.lowStockThreshold),
        ),
      ),
    staffAnomaliesFor(db, r, { from, to }),
  ]);
  const revenue = Number(today?.total ?? 0);
  const before = Number(lastWeek?.total ?? 0);
  return {
    day,
    revenueCents: revenue,
    orders: today?.n ?? 0,
    avgTicketCents: today?.n ? Math.round(revenue / today.n) : 0,
    lastWeekCents: before,
    changePct: before > 0 ? Math.round(((revenue - before) / before) * 100) : null,
    topDish: top ? { name: top.name, quantity: Number(top.qty) } : null,
    cancelled: cancelled?.n ?? 0,
    lowStock: low?.n ?? 0,
    flaggedStaff: anomalies.filter((a) => a.signals.length).length,
  };
}
export type DailyFigures = Awaited<ReturnType<typeof dailyFigures>>;

/** The report as one short text (push body and SMS), in the restaurant's language. */
export async function dailyText(locale: string, currency: string, f: DailyFigures, name: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${l}.json`)).default;
  const t = createTranslator({ locale: l, messages, namespace: "dailyReport.text" });
  const money = (c: number) => formatMoney(c, currency, l);
  const lines = [
    t("title", { name }),
    t("revenue", { amount: money(f.revenueCents), orders: f.orders }),
    f.changePct != null ? t(f.changePct >= 0 ? "up" : "down", { pct: Math.abs(f.changePct) }) : null,
    f.topDish ? t("top", { name: f.topDish.name, n: f.topDish.quantity }) : null,
    f.cancelled ? t("cancelled", { n: f.cancelled }) : null,
    f.lowStock ? t("lowStock", { n: f.lowStock }) : null,
    f.flaggedStaff ? t("staff", { n: f.flaggedStaff }) : null,
  ].filter(Boolean) as string[];
  return { title: lines[0]!, body: lines.slice(1).join("\n") };
}

/**
 * Sends the evening report of every restaurant whose hour has come and that has not had today's.
 * Called by the periodic job (every 10 minutes) and when a dashboard loads.
 */
export async function sendDueDailyReports(db: Database, now = new Date(), only?: string) {
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      timezone: restaurants.timezone,
      currency: restaurants.currency,
      locale: restaurants.defaultLocale,
      settings: restaurantSettings.dailyReport,
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(
      and(
        isNull(restaurants.deletedAt),
        eq(restaurants.status, "active"),
        sql`(${restaurantSettings.dailyReport}->>'enabled')::boolean is true`,
        only ? eq(restaurants.id, only) : undefined,
      ),
    );
  let sent = 0;
  for (const r of rows) {
    const s = { ...DEFAULT_DAILY, ...(r.settings ?? {}) };
    const day = localDayOf(now, r.timezone);
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: r.timezone, hour: "2-digit", hourCycle: "h23" }).format(
        now,
      ),
    );
    if (hour < s.hour || r.settings?.lastDay === day) continue;
    // Claim the day first: two runs at once never send it twice.
    const claimed = await db
      .update(restaurantSettings)
      .set({
        dailyReport: sql`coalesce(${restaurantSettings.dailyReport}, '{}'::jsonb) || ${JSON.stringify({ lastDay: day })}::jsonb`,
      })
      .where(
        and(
          eq(restaurantSettings.restaurantId, r.id),
          sql`coalesce(${restaurantSettings.dailyReport}->>'lastDay', '') <> ${day}`,
        ),
      )
      .returning({ id: restaurantSettings.restaurantId });
    if (!claimed.length) continue;
    try {
      const f = await dailyFigures(db, r, day);
      const text = await dailyText(r.locale, r.currency, f, r.name);
      await notifyTeam(db, {
        restaurantId: r.id,
        type: "report.daily",
        payload: { amountCents: f.revenueCents, currency: r.currency, count: f.orders, day },
      });
      await pushToManagers(db, r.id, {
        title: text.title,
        body: text.body,
        url: `/dashboard/${r.id}/reports?p=today`,
        tag: `daily-${day}`,
      });
      if (s.sms && s.phone) await sms().send(s.phone, `${text.title}\n${text.body}`);
      sent++;
    } catch (e) {
      console.error("[daily-report]", r.id, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
