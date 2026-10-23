"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { estimateNutrition, type NutritionEstimate } from "@/lib/nutrition-estimate";
import type { Nutrition } from "@/lib/nutrition";

const GRAM_FIELDS = ["proteinG", "carbsG", "sugarG", "fatG", "fiberG", "saltG"] as const;

/**
 * Calories, weight and nutrients of one portion. "Estimate" fills them from the ingredient
 * list (and the weight); the restaurant then checks and corrects — any edit marks them as entered.
 */
export function NutritionFields({
  values,
  errors,
}: {
  values: {
    caloriesKcal: number | null;
    weightGrams: number | null;
    nutrition: Nutrition | null;
    nutritionSource: string | null;
  };
  errors: { caloriesKcal?: string; weightGrams?: string; nutrition?: string };
}) {
  const t = useTranslations("product");
  const tn = useTranslations("nutrition");
  const box = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(values.nutritionSource ?? "manual");
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [empty, setEmpty] = useState(false);

  const input = (name: string) =>
    box.current?.closest("form")?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);

  const run = () => {
    const weight = Number(input("weightGrams")?.value) || null;
    const res = estimateNutrition({
      ingredients: input("ingredients")?.value,
      name: input("name")?.value,
      weightGrams: weight,
    });
    setEstimate(res);
    setEmpty(!res.matched.length);
    if (!res.matched.length) return;
    const set = (name: string, v: number | undefined) => {
      const el = input(name);
      if (el && v != null) el.value = String(v);
    };
    set("caloriesKcal", res.nutrition.kcal);
    for (const k of GRAM_FIELDS) set(k, res.nutrition[k]);
    if (!weight)
      set(
        "weightGrams",
        res.matched.reduce((s, m) => s + m.grams, 0),
      );
    setSource("estimated");
  };

  return (
    <div ref={box} className="space-y-4" onInput={() => setSource("manual")}>
      <input type="hidden" name="nutritionSource" value={source} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{t("nutritionTitle")}</p>
          <p className="text-fg-muted">{t("nutritionHint")}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={run}>
          <Sparkles className="size-4" aria-hidden="true" />
          {t("estimate")}
        </Button>
      </div>
      {source === "estimated" ? (
        <p role="status" className="rounded-xl bg-warning-soft px-3 py-2 text-sm">
          {t("estimatedNotice")}
          {estimate?.unknown.length ? (
            <span className="mt-1 block text-fg-muted">
              {t("estimateUnknown", { list: estimate.unknown.slice(0, 6).join("، ") })}
            </span>
          ) : null}
        </p>
      ) : null}
      {empty ? <p className="text-sm text-danger">{t("estimateNothing")}</p> : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field
          label={t("calories")}
          name="caloriesKcal"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={values.caloriesKcal ?? ""}
          error={errors.caloriesKcal}
        />
        <Field
          label={t("weight")}
          name="weightGrams"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={values.weightGrams ?? ""}
          error={errors.weightGrams}
        />
        {GRAM_FIELDS.map((k) => (
          <Field
            key={k}
            label={tn(`field.${k}`)}
            name={k}
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            defaultValue={values.nutrition?.[k] ?? ""}
          />
        ))}
      </div>
      {errors.nutrition ? <p className="text-sm text-danger">{errors.nutrition}</p> : null}
    </div>
  );
}
