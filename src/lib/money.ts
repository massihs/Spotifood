/**
 * Money is always an integer number of minor units (cents). Never use floats for amounts.
 * Tax rates are basis points (1000 = 10%).
 */

export type Cents = number;

export function assertCents(value: number, label = "amount"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer number of cents`);
}

/** Parses user input such as "19,90", "19.9", "19" into cents. Returns null when invalid. */
export function parseMoney(input: string): Cents | null {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Banker-safe integer division with half-up rounding, for positive and negative values. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError("division by zero");
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((n * 2 + d) / (2 * d));
}

/** Tax contained in a tax-inclusive amount: gross × rate / (1 + rate). */
export function taxFromGross(grossCents: Cents, rateBps: number): Cents {
  assertCents(grossCents);
  if (rateBps === 0) return 0;
  return divRound(grossCents * rateBps, 10_000 + rateBps);
}

/** Tax to add on top of a tax-exclusive amount: net × rate. */
export function taxFromNet(netCents: Cents, rateBps: number): Cents {
  assertCents(netCents);
  return divRound(netCents * rateBps, 10_000);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total, "sum");
  return total;
}

export function formatMoney(cents: Cents, currency: string, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
