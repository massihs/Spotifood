import { describe, expect, it } from "vitest";
import { sumNutrition, tidy } from "@/lib/nutrition";
import { estimateNutrition } from "@/lib/nutrition-estimate";

describe("nutrition estimate", () => {
  it("reads Persian ingredient lists, quantities and the dish weight", () => {
    const e = estimateNutrition({
      ingredients: "برنج ایرانی، کباب کوبیده ۲ سیخ، گوجه کبابی، کره",
      weightGrams: 450,
    });
    expect(e.unknown).toEqual([]);
    expect(e.matched.map((m) => m.text)).toHaveLength(4);
    expect(e.matched.reduce((s, m) => s + m.grams, 0)).toBeCloseTo(450, -1);
    expect(e.nutrition.kcal).toBeGreaterThan(700);
    expect(e.nutrition.kcal).toBeLessThan(1200);
    expect(e.nutrition.proteinG).toBeGreaterThan(30);
  });

  it("keeps written grams and reports what it does not know", () => {
    const e = estimateNutrition({ ingredients: "poulet grillé 120 g, laitue, sauce mystère, quinoa" });
    expect(e.matched.find((m) => m.text.startsWith("poulet"))?.grams).toBe(120);
    expect(e.nutrition.proteinG).toBeGreaterThan(35);
    // "sauce" is known generically; nothing is invented for unknown words.
    expect(estimateNutrition({ ingredients: "xyzzy" })).toMatchObject({ nutrition: {}, unknown: ["xyzzy"] });
  });

  it("does not take a longer word for a shorter one", () => {
    // سیب زمینی (potato) is not سیب (apple); تخم مرغ (egg) is not مرغ (chicken).
    const potato = estimateNutrition({ ingredients: "سیب‌زمینی ۱۰۰ گرم" });
    expect(potato.nutrition.kcal).toBe(87);
    const egg = estimateNutrition({ ingredients: "تخم مرغ ۱۰۰ گرم" });
    expect(egg.nutrition.proteinG).toBe(13);
  });

  it("falls back to the dish name and sums portions", () => {
    expect(estimateNutrition({ name: "Pizza margherita" }).matched.length).toBeGreaterThan(0);
    const s = sumNutrition([
      { nutrition: { kcal: 500, proteinG: 20 }, quantity: 2 },
      { nutrition: null, quantity: 1 },
    ]);
    expect(s.total.kcal).toBe(1000);
    expect(s.unknownPortions).toBe(1);
    expect(s.missing).toContain("fiberG");
    expect(tidy({ kcal: 99.6, proteinG: 1.234, saltG: 1.236, fatG: -1 })).toEqual({
      kcal: 100,
      proteinG: 1.2,
      saltG: 1.24,
    });
  });
});
