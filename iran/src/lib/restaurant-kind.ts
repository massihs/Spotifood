/** Venue kinds chosen at signup; a food court texts the guest when the order is ready. */
export const RESTAURANT_KINDS = ["restaurant", "cafe", "food_court"] as const;
export type RestaurantKind = (typeof RESTAURANT_KINDS)[number];

export const isRestaurantKind = (v: unknown): v is RestaurantKind =>
  typeof v === "string" && (RESTAURANT_KINDS as readonly string[]).includes(v);
