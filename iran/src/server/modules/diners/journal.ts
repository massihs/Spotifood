import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { NUTRIENTS, sumNutrition, type Nutrient, type Nutrition } from "@/lib/nutrition";
import type { DbOrTx } from "@/server/db/client";
import { orderItems, orders, restaurants } from "@/server/db/schema";
import type { Diner } from "./service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of an instant in a time zone. */
export function localDate(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const isDate = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v);

/** Every meal of one day (diner's time zone): what was ordered, where, and its nutrition. */
export async function dayJournal(db: DbOrTx, diner: Pick<Diner, "id" | "timezone">, date: string) {
  if (!isDate(date)) throw new Error("bad date");
  const tz = diner.timezone;
  const rows = await db
    .select({
      orderId: orders.id,
      number: orders.number,
      placedAt: orders.placedAt,
      restaurant: restaurants.name,
      itemId: orderItems.id,
      name: orderItems.productName,
      quantity: orderItems.quantity,
      nutrition: orderItems.nutrition,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .where(
      and(
        eq(orders.dinerId, diner.id),
        ne(orders.status, "cancelled"),
        sql`(${orders.placedAt} at time zone ${tz})::date = ${date}::date`,
      ),
    )
    .orderBy(asc(orders.placedAt), asc(orderItems.createdAt));

  const meals: {
    orderId: string;
    number: string;
    at: Date;
    restaurant: string;
    items: { id: string; name: string; quantity: number; nutrition: Nutrition | null }[];
    total: Required<Nutrition>;
    unknownPortions: number;
  }[] = [];
  for (const r of rows) {
    let meal = meals.at(-1);
    if (meal?.orderId !== r.orderId) {
      meal = {
        orderId: r.orderId,
        number: r.number,
        at: r.placedAt,
        restaurant: r.restaurant,
        items: [],
        total: { kcal: 0, proteinG: 0, carbsG: 0, sugarG: 0, fatG: 0, fiberG: 0, saltG: 0 },
        unknownPortions: 0,
      };
      meals.push(meal);
    }
    meal.items.push({ id: r.itemId, name: r.name, quantity: r.quantity, nutrition: r.nutrition });
  }
  for (const m of meals) {
    const s = sumNutrition(m.items);
    m.total = s.total;
    m.unknownPortions = s.unknownPortions;
  }
  const day = sumNutrition(meals.flatMap((m) => m.items));
  return { date, meals, ...day };
}

export type DayTotals = { date: string; meals: number; unknownPortions: number } & Required<Nutrition>;

/** Totals per day over [from, to] (inclusive), days without meals included as zeros. */
export async function rangeTotals(
  db: DbOrTx,
  diner: Pick<Diner, "id" | "timezone">,
  from: string,
  to: string,
): Promise<DayTotals[]> {
  if (!isDate(from) || !isDate(to)) throw new Error("bad date");
  const tz = diner.timezone;
  const day = sql<string>`to_char(${orders.placedAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const total = (k: Nutrient) =>
    sql<number>`coalesce(sum((${orderItems.nutrition}->>${sql.raw(`'${k}'`)})::numeric * ${orderItems.quantity}), 0)`.mapWith(
      Number,
    );
  const rows = await db
    .select({
      date: day,
      meals: sql<number>`count(distinct ${orders.id})`.mapWith(Number),
      unknownPortions:
        sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${orderItems.nutrition} is null or ${orderItems.nutrition} = '{}'::jsonb), 0)`.mapWith(
          Number,
        ),
      kcal: total("kcal"),
      proteinG: total("proteinG"),
      carbsG: total("carbsG"),
      sugarG: total("sugarG"),
      fatG: total("fatG"),
      fiberG: total("fiberG"),
      saltG: total("saltG"),
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.dinerId, diner.id),
        ne(orders.status, "cancelled"),
        sql`(${orders.placedAt} at time zone ${tz})::date between ${from}::date and ${to}::date`,
      ),
    )
    .groupBy(sql`1`);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DayTotals[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    const r = byDate.get(d);
    const base = { date: d, meals: r?.meals ?? 0, unknownPortions: r?.unknownPortions ?? 0 };
    const values = Object.fromEntries(NUTRIENTS.map((k) => [k, Math.round((r?.[k] ?? 0) * 10) / 10]));
    out.push({ ...base, ...(values as Required<Nutrition>) });
  }
  return out;
}

/** Most ordered dishes over a period (for "your favourites"). */
export async function topDishes(db: DbOrTx, dinerId: string, limit = 5) {
  const orderIds = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.dinerId, dinerId), ne(orders.status, "cancelled")));
  return db
    .select({
      name: orderItems.productName,
      count: sql<number>`sum(${orderItems.quantity})`.mapWith(Number),
      kcal: sql<number | null>`max((${orderItems.nutrition}->>'kcal')::numeric)`.mapWith((v) =>
        v == null ? null : Number(v),
      ),
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .groupBy(orderItems.productName)
    .orderBy(sql`sum(${orderItems.quantity}) desc`)
    .limit(limit);
}
