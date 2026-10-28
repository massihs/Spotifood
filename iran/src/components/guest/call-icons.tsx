import {
  Baby,
  BellRing,
  Coffee,
  Droplets,
  Flame,
  HandPlatter,
  Receipt,
  Sparkles,
  Utensils,
  Wind,
  type LucideIcon,
} from "lucide-react";

/** Icons of the guest call bell's options (keys stored in the restaurant settings). */
export const CALL_ICON: Record<string, LucideIcon> = {
  hand: HandPlatter,
  receipt: Receipt,
  droplets: Droplets,
  flame: Flame,
  wind: Wind,
  utensils: Utensils,
  coffee: Coffee,
  baby: Baby,
  sparkles: Sparkles,
  bell: BellRing,
};
export const CALL_TONES = [
  "bg-tone-orange/12 text-tone-orange",
  "bg-tone-emerald/12 text-tone-emerald",
  "bg-tone-sky/12 text-tone-sky",
  "bg-tone-rose/12 text-tone-rose",
  "bg-tone-violet/12 text-tone-violet",
  "bg-tone-teal/12 text-tone-teal",
];
