/**
 * The pure calculations behind the "save money" tools: menu engineering, food-cost targets,
 * the purchase forecast and the staff anomalies. No database here, so every rule is tested alone.
 */

// ─── Menu engineering (Kasavana & Smith) ─────────────────────────────────────

export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";
export type MenuItem = {
  productId: string | null;
  name: string;
  category: string | null;
  quantity: number;
  revenueCents: number;
  /** Total cost of the portions sold; null when the dish has no recipe. */
  costCents: number | null;
};
export type EngineeredItem = MenuItem & {
  mixPct: number;
  unitMarginCents: number | null;
  foodCostPct: number | null;
  class: MenuClass | null;
};

/**
 * Popular = sells at least 70 % of an equal share of the dishes sold; profitable = earns per portion
 * at least the menu's average margin. Stars: keep and show off; plowhorses (popular, thin margin):
 * raise the price or cut the cost; puzzles (rich margin, few sales): promote them; dogs: remove.
 * Dishes without a recipe have no margin, so no class.
 */
export function engineerMenu(items: MenuItem[]) {
  const sold = items.filter((i) => i.quantity > 0);
  const totalQty = sold.reduce((s, i) => s + i.quantity, 0);
  const costed = sold.filter((i) => i.costCents != null);
  const costedQty = costed.reduce((s, i) => s + i.quantity, 0);
  const avgMargin = costedQty
    ? costed.reduce((s, i) => s + (i.revenueCents - i.costCents!), 0) / costedQty
    : 0;
  const popularAt = sold.length ? (0.7 / sold.length) * 100 : 0;
  const rows: EngineeredItem[] = sold.map((i) => {
    const mixPct = totalQty ? (i.quantity / totalQty) * 100 : 0;
    const unitMarginCents =
      i.costCents != null ? Math.round((i.revenueCents - i.costCents) / i.quantity) : null;
    const foodCostPct =
      i.costCents != null && i.revenueCents > 0 ? (i.costCents / i.revenueCents) * 100 : null;
    const popular = mixPct >= popularAt;
    const profitable = unitMarginCents != null && unitMarginCents >= avgMargin;
    return {
      ...i,
      mixPct,
      unitMarginCents,
      foodCostPct,
      class:
        unitMarginCents == null
          ? null
          : popular && profitable
            ? "star"
            : popular
              ? "plowhorse"
              : profitable
                ? "puzzle"
                : "dog",
    };
  });
  return {
    rows: rows.sort((a, b) => b.revenueCents - a.revenueCents),
    avgMarginCents: Math.round(avgMargin),
    popularThresholdPct: popularAt,
    uncosted: sold.length - costed.length,
  };
}

// ─── Food cost ───────────────────────────────────────────────────────────────

/** A price people read easily: up to two significant digits after rounding up (۴۸۰٬۰۰۰ → ۴۸۰٬۰۰۰, 487 → 490). */
export function roundPriceUp(cents: number) {
  if (cents <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(cents)) - 1);
  return Math.ceil(cents / step) * step;
}

/** The price that brings a dish back to the food-cost target (35 % → price = cost ÷ 0.35). */
export const priceForTarget = (costCents: number, targetPct: number) =>
  roundPriceUp(Math.ceil(costCents / (targetPct / 100)));

export type CostRow = { productId: string; name: string; priceCents: number; costCents: number };
export function foodCostReview(rows: CostRow[], targetPct: number) {
  return rows
    .filter((r) => r.priceCents > 0 && r.costCents > 0)
    .map((r) => {
      const pct = (r.costCents / r.priceCents) * 100;
      return {
        ...r,
        foodCostPct: pct,
        over: pct > targetPct,
        suggestedPriceCents: pct > targetPct ? priceForTarget(r.costCents, targetPct) : null,
      };
    })
    .sort((a, b) => b.foodCostPct - a.foodCostPct);
}

// ─── Purchase forecast ───────────────────────────────────────────────────────

/**
 * What to buy for the next `days` days: each weekday's usage over the last weeks (Fridays are not
 * Tuesdays), times a factor for a special period (Norouz, Ramadan, a wedding), plus the safety
 * threshold, minus what is in stock.
 */
export function forecastNeed(opts: {
  /** Usage per weekday (0 = Sunday … 6 = Saturday), summed over `weeks` weeks. */
  usageByWeekday: number[];
  weeks: number;
  /** Weekday of the first day to cover. */
  startWeekday: number;
  days: number;
  factor: number;
  inStock: number;
  threshold: number;
}) {
  const perDay = opts.usageByWeekday.map((u) => (opts.weeks ? u / opts.weeks : 0));
  let need = 0;
  for (let d = 0; d < opts.days; d++) need += perDay[(opts.startWeekday + d) % 7] ?? 0;
  need *= opts.factor;
  const avgDaily = perDay.reduce((s, v) => s + v, 0) / 7;
  const toBuy = need + opts.threshold - Math.max(0, opts.inStock);
  return {
    forecast: round3(need),
    avgDaily: round3(avgDaily),
    daysLeft: avgDaily > 0 ? Math.max(0, opts.inStock) / avgDaily : null,
    toBuy: toBuy > 0 ? Math.ceil(toBuy * 10) / 10 : 0,
  };
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;

// ─── Staff anomalies ─────────────────────────────────────────────────────────

export type StaffStats = {
  userId: string;
  name: string;
  orders: number;
  salesCents: number;
  cancellations: number;
  cancelledCents: number;
  discountCents: number;
  refundCents: number;
  /** Cash counted minus expected at the shifts they closed (negative = missing). */
  cashDifferenceCents: number;
};
export type Signal = "cancellations" | "discounts" | "refunds" | "cash";
export type StaffReview = StaffStats & { signals: Signal[]; score: number };

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Flags a person whose cancellations, discounts or refunds weigh well above the team's (twice the
 * median rate and over a floor, so one bad evening does not accuse anyone), and cash missing at the
 * shifts they closed. A flag is a reason to look, never a proof.
 */
export function reviewStaff(stats: StaffStats[], cashToleranceCents: number) {
  const rate = (s: StaffStats, k: Signal) => {
    const base = Math.max(s.salesCents, 1);
    if (k === "cancellations") return s.cancelledCents / (base + s.cancelledCents);
    if (k === "discounts") return s.discountCents / base;
    if (k === "refunds") return s.refundCents / base;
    return 0;
  };
  const kinds: Exclude<Signal, "cash">[] = ["cancellations", "discounts", "refunds"];
  const medians = Object.fromEntries(kinds.map((k) => [k, median(stats.map((s) => rate(s, k)))]));
  const floors = { cancellations: 0.05, discounts: 0.05, refunds: 0.03 };
  const counts = (s: StaffStats, k: Signal) =>
    k === "cancellations" ? s.cancellations : k === "discounts" ? s.discountCents : s.refundCents;
  return stats
    .map((s): StaffReview => {
      const signals: Signal[] = [];
      let score = 0;
      for (const k of kinds) {
        const r = rate(s, k);
        const ref = Math.max(medians[k]! * 2, floors[k]);
        if (r > ref && counts(s, k) > 0 && (k !== "cancellations" || s.cancellations >= 3)) {
          signals.push(k);
          score += r / ref;
        }
      }
      if (s.cashDifferenceCents < -cashToleranceCents) {
        signals.push("cash");
        score += Math.abs(s.cashDifferenceCents) / Math.max(cashToleranceCents, 1);
      }
      return { ...s, signals, score: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.score - a.score || b.salesCents - a.salesCents);
}
