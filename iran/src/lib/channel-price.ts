/** The product priced for a sales type (takeaway / delivery price lists; dine-in uses the menu price). */
export function forChannel<
  T extends { priceCents: number; takeawayPriceCents: number | null; deliveryPriceCents: number | null },
>(p: T, channel: "dine_in" | "takeaway" | "delivery"): T {
  const override =
    channel === "takeaway" ? p.takeawayPriceCents : channel === "delivery" ? p.deliveryPriceCents : null;
  return override != null ? { ...p, priceCents: override } : p;
}

/**
 * The product at its trade price for a professional customer (B2B): its trade price (else the
 * menu price), less the customer's own discount in basis points.
 */
export function forTrade<T extends { priceCents: number; tradePriceCents: number | null }>(
  p: T,
  discountBps = 0,
): T {
  const base = p.tradePriceCents ?? p.priceCents;
  return { ...p, priceCents: Math.round((base * (10_000 - discountBps)) / 10_000) };
}
