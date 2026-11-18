import { describe, expect, it } from "vitest";
import {
  engineerMenu,
  foodCostReview,
  forecastNeed,
  priceForTarget,
  reviewStaff,
  roundPriceUp,
} from "@/server/modules/insights/analysis";

describe("menu engineering", () => {
  it("sorts dishes into stars, plowhorses, puzzles and dogs", () => {
    const r = engineerMenu([
      {
        productId: "a",
        name: "Star",
        category: null,
        quantity: 100,
        revenueCents: 100_000,
        costCents: 30_000,
      },
      {
        productId: "b",
        name: "Horse",
        category: null,
        quantity: 100,
        revenueCents: 60_000,
        costCents: 45_000,
      },
      { productId: "c", name: "Puzzle", category: null, quantity: 5, revenueCents: 7_500, costCents: 1_500 },
      { productId: "d", name: "Dog", category: null, quantity: 5, revenueCents: 2_500, costCents: 2_000 },
      {
        productId: "e",
        name: "No recipe",
        category: null,
        quantity: 50,
        revenueCents: 20_000,
        costCents: null,
      },
    ]);
    const cls = Object.fromEntries(r.rows.map((x) => [x.name, x.class]));
    expect(cls).toEqual({
      Star: "star",
      Horse: "plowhorse",
      Puzzle: "puzzle",
      Dog: "dog",
      "No recipe": null,
    });
    expect(r.uncosted).toBe(1);
  });
});

describe("food cost", () => {
  it("rounds suggested prices up to readable amounts", () => {
    expect(roundPriceUp(487)).toBe(490);
    expect(roundPriceUp(4_812_345)).toBe(4_900_000);
    expect(priceForTarget(100_000, 35)).toBe(290_000);
  });
  it("flags dishes above the target with the price that fixes them", () => {
    const rows = foodCostReview(
      [
        { productId: "a", name: "Kebab", priceCents: 1_000_000, costCents: 450_000 },
        { productId: "b", name: "Salad", priceCents: 500_000, costCents: 100_000 },
      ],
      35,
    );
    expect(rows[0]).toMatchObject({ name: "Kebab", over: true, suggestedPriceCents: 1_300_000 });
    expect(rows[1]).toMatchObject({ name: "Salad", over: false, suggestedPriceCents: null });
  });
});

describe("purchase forecast", () => {
  it("adds up the coming weekdays, the period factor and the threshold, minus the stock", () => {
    // 4 weeks: 40 kg used on Fridays (10/week), 4 kg on other days (1/week).
    const usage = [4, 4, 4, 4, 4, 40, 4];
    const f = forecastNeed({
      usageByWeekday: usage,
      weeks: 4,
      startWeekday: 4,
      days: 3,
      factor: 1.5,
      inStock: 5,
      threshold: 2,
    });
    // Thursday 1 + Friday 10 + Saturday 1 = 12 × 1.5 = 18 → 18 + 2 − 5 = 15
    expect(f.forecast).toBe(18);
    expect(f.toBuy).toBe(15);
    expect(f.daysLeft).toBeCloseTo(5 / (16 / 7), 3);
  });
  it("buys nothing when the stock covers it", () => {
    const f = forecastNeed({
      usageByWeekday: [7, 7, 7, 7, 7, 7, 7],
      weeks: 7,
      startWeekday: 0,
      days: 2,
      factor: 1,
      inStock: 10,
      threshold: 1,
    });
    expect(f.toBuy).toBe(0);
  });
});

describe("staff anomalies", () => {
  const base = {
    orders: 50,
    salesCents: 1_000_000,
    cancellations: 1,
    cancelledCents: 10_000,
    discountCents: 10_000,
    refundCents: 0,
    cashDifferenceCents: 0,
  };
  it("flags the person far above the team, not the others", () => {
    const rows = reviewStaff(
      [
        { ...base, userId: "a", name: "Ali" },
        { ...base, userId: "b", name: "Sara" },
        {
          ...base,
          userId: "c",
          name: "Reza",
          cancellations: 9,
          cancelledCents: 200_000,
          discountCents: 150_000,
        },
        { ...base, userId: "d", name: "Mina", cashDifferenceCents: -50_000 },
      ],
      10_000,
    );
    expect(rows[0]!.name).toBe("Reza");
    expect(rows[0]!.signals).toEqual(["cancellations", "discounts"]);
    expect(rows.find((r) => r.name === "Mina")!.signals).toEqual(["cash"]);
    expect(rows.find((r) => r.name === "Ali")!.signals).toEqual([]);
  });
  it("does not accuse anyone over a couple of cancellations", () => {
    const rows = reviewStaff(
      [
        { ...base, userId: "a", name: "Ali", cancellations: 0, cancelledCents: 0 },
        { ...base, userId: "b", name: "Sara", cancellations: 2, cancelledCents: 300_000 },
      ],
      10_000,
    );
    expect(rows.every((r) => !r.signals.includes("cancellations"))).toBe(true);
  });
});
