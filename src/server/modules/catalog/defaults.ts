import type { PlanLimits } from "@/server/db/schema";

/** Platform plan catalog. Prices in cents. */
export const DEFAULT_PLANS: {
  code: string;
  name: string;
  priceMonthlyCents: number;
  sortOrder: number;
  limits: PlanLimits;
}[] = [
  {
    code: "free",
    name: "Free",
    priceMonthlyCents: 0,
    sortOrder: 0,
    limits: { maxRestaurants: 1, maxTables: 5, maxOrdersPerMonth: 300, maxStaff: 2, features: [] },
  },
  {
    code: "starter",
    name: "Starter",
    priceMonthlyCents: 2900,
    sortOrder: 1,
    limits: {
      maxRestaurants: 1,
      maxTables: 25,
      maxOrdersPerMonth: 3000,
      maxStaff: 10,
      features: ["online_payments", "invoices_email"],
    },
  },
  {
    code: "professional",
    name: "Professional",
    priceMonthlyCents: 7900,
    sortOrder: 2,
    limits: {
      maxRestaurants: 3,
      maxTables: null,
      maxOrdersPerMonth: null,
      maxStaff: null,
      features: ["online_payments", "invoices_email", "analytics_advanced", "custom_branding"],
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    priceMonthlyCents: 0,
    sortOrder: 3,
    limits: {
      maxRestaurants: null,
      maxTables: null,
      maxOrdersPerMonth: null,
      maxStaff: null,
      features: [
        "online_payments",
        "invoices_email",
        "analytics_advanced",
        "custom_branding",
        "api_access",
        "sso",
        "priority_support",
      ],
    },
  },
];

/** Global category templates (keys are translated in the UI). */
export const DEFAULT_CATEGORY_TEMPLATES = [
  "starters",
  "salads",
  "soups",
  "mains",
  "steak",
  "pizza",
  "pasta",
  "burger",
  "sandwich",
  "fish",
  "meat",
  "chicken",
  "vegetarian",
  "kids",
  "desserts",
  "ice_cream",
  "coffee",
  "tea",
  "soft_drinks",
  "cocktails",
  "wines",
  "beers",
  "breakfast",
  "brunch",
] as const;
