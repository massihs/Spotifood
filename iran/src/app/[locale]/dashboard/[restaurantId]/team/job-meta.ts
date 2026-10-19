import { ChefHat, Calculator, Coffee, Crown, HandPlatter, type LucideIcon } from "lucide-react";
import type { Job } from "@/lib/jobs";

export const JOB_ICONS: Record<Job, LucideIcon> = {
  manager: Crown,
  cashier: Calculator,
  waiter: HandPlatter,
  bar: Coffee,
  kitchen: ChefHat,
};
export const JOB_TONES: Record<Job, string> = {
  manager: "bg-tone-violet/12 text-tone-violet",
  cashier: "bg-tone-emerald/12 text-tone-emerald",
  waiter: "bg-tone-sky/12 text-tone-sky",
  bar: "bg-tone-amber/18 text-tone-amber",
  kitchen: "bg-tone-orange/12 text-tone-orange",
};
