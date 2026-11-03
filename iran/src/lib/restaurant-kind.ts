/**
 * Venue kinds chosen at signup; a food court texts the guest when the order is ready, a hotel
 * puts QR codes in its rooms (room service) as well as on its restaurant's tables.
 */
export const RESTAURANT_KINDS = ["restaurant", "cafe", "food_court", "hotel"] as const;
export type RestaurantKind = (typeof RESTAURANT_KINDS)[number];

export const isRestaurantKind = (v: unknown): v is RestaurantKind =>
  typeof v === "string" && (RESTAURANT_KINDS as readonly string[]).includes(v);

/**
 * Kinds a new venue can pick. Hotels moved to their own platform (Spotihotel): the kind stays
 * valid for venues created before, but is no longer offered.
 */
export const OFFERED_KINDS = [
  "restaurant",
  "cafe",
  "food_court",
] as const satisfies readonly RestaurantKind[];
