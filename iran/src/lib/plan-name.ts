/** Plans the platform ships with: shown under their translated name (pricing.plans.{code}.name). */
export const KNOWN_PLANS = ["free", "starter", "professional", "enterprise"] as const;

/** A plan's name in the reader's language when it is a default plan; renamed or new plans keep theirs. */
export function planLabel(code: string, name: string, t: (key: string) => string) {
  return (KNOWN_PLANS as readonly string[]).includes(code) ? t(`pricing.plans.${code}.name`) : name;
}
