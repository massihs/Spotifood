import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  smallint,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { money, pk, softDelete, timestamps } from "./_helpers";

/** A slice of the wheel: a discount (percent or amount in minor units) or nothing, and its odds. */
export type KpiGoals = {
  dailyRevenueCents?: number | null;
  maxPrepMinutes?: number | null;
  minRating?: number | null;
};

export type WheelPrize = {
  label: string;
  kind: "percent" | "amount" | "none";
  value: number;
  weight: number;
};
import { memberRole, memberStatus, restaurantKind, restaurantStatus } from "./enums";
import { organizations, users } from "./platform";

/** The tenant. Every tenant-scoped row carries `restaurant_id`. */
export const restaurants = pgTable(
  "restaurants",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    slug: varchar({ length: 64 }).notNull(),
    name: varchar({ length: 160 }).notNull(),
    kind: restaurantKind().notNull().default("restaurant"),
    logoKey: text(),
    /** Brand color key (lib/brand-colors): menu and dashboard accent. */
    brandColor: varchar({ length: 16 }).notNull().default("violet"),
    /** Guest menu look: atelier | nuit | doux. */
    menuTheme: varchar({ length: 16 }).notNull().default("doux"),
    /** Guest menu shows prices in thousand tomans (1 319 instead of 1 319 000 tomans). */
    menuShortPrices: boolean().notNull().default(false),
    email: varchar({ length: 320 }),
    phone: varchar({ length: 32 }),
    addressLine1: varchar({ length: 200 }),
    addressLine2: varchar({ length: 200 }),
    city: varchar({ length: 100 }),
    postalCode: varchar({ length: 20 }),
    country: varchar({ length: 2 }).notNull().default("FR"),
    currency: varchar({ length: 3 }).notNull().default("EUR"),
    timezone: varchar({ length: 64 }).notNull().default("Europe/Paris"),
    defaultLocale: varchar({ length: 8 }).notNull().default("fr"),
    status: restaurantStatus().notNull().default("active"),
    suspendedReason: text(),
    /** Public directory (spotifood.ir/restaurants): opt-in listing, themes, price level, position. */
    listed: boolean().notNull().default(false),
    cuisines: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    priceLevel: smallint(),
    /** Prices on the public page (/r/slug); the QR menu at the table always shows them. */
    showPublicPrices: boolean().notNull().default(true),
    tagline: varchar({ length: 200 }),
    /** Guide photo chosen by the owner: an uploaded cover or one of the dish photos (null = automatic). */
    coverKey: text(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("restaurants_slug_uq").on(t.slug),
    index("restaurants_org_idx").on(t.organizationId),
    index("restaurants_status_idx").on(t.status),
    index("restaurants_listed_city_idx").on(t.listed, t.city),
  ],
);

export type OpeningHours = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", { open: string; close: string }[]>
>;

export const restaurantSettings = pgTable("restaurant_settings", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  /** Menu prices are entered tax-inclusive (EU restaurant standard). */
  pricesIncludeTax: boolean().notNull().default(true),
  /** Order number prefix, e.g. "B" → B-1048. */
  orderPrefix: varchar({ length: 8 }).notNull().default("A"),
  onlinePaymentEnabled: boolean().notNull().default(false),
  /** Provider codes enabled for this restaurant (cash, on_site_terminal, pay_later, stripe...). */
  enabledPaymentProviders: text()
    .array()
    .notNull()
    .default(sql`ARRAY['cash','on_site_terminal']::text[]`),
  requirePaymentBeforeOrder: boolean().notNull().default(false),
  /** Anti-abuse: a table opened by a QR scan may only order / call once a waiter confirms it. */
  guestOrdersNeedStaff: boolean().notNull().default(false),
  /** Satisfaction: an SMS asks the guest (phone on the order) how it was, after serving. */
  feedbackSmsEnabled: boolean().notNull().default(false),
  feedbackDelayMinutes: integer().notNull().default(60),
  /** Wheel of fortune after a rating: prizes become single-use coupons. */
  wheelEnabled: boolean().notNull().default(false),
  wheelPrizes: jsonb().$type<WheelPrize[]>().notNull().default([]),
  /** Online ordering site (/r/{slug}/order): takeaway and/or delivery, by signed-in guests. */
  onlineOrderingEnabled: boolean().notNull().default(false),
  onlineTakeaway: boolean().notNull().default(true),
  onlineDelivery: boolean().notNull().default(false),
  /** Self-order kiosk (/kiosk/{token}): a tablet at the counter, eat in or take away. */
  kioskEnabled: boolean().notNull().default(false),
  kioskToken: varchar({ length: 32 }),
  /** Targets on the overview, with alerts: null = no target. */
  kpiGoals: jsonb().$type<KpiGoals>().notNull().default({}),
  /** The restaurant's own Zarinpal merchant id: online payments land on its account. */
  zarinpalMerchantId: varchar({ length: 64 }),
  /** Auto-close idle table sessions after N minutes (null = manual only). */
  sessionAutoCloseMinutes: integer().default(180),
  /** Loyalty club: one point per `loyaltySpendPerPointCents` paid, worth `loyaltyPointValueCents`. */
  loyaltyEnabled: boolean().notNull().default(true),
  loyaltySpendPerPointCents: money().notNull().default(10_000_000),
  loyaltyPointValueCents: money().notNull().default(500_000),
  openingHours: jsonb().$type<OpeningHours>(),
  /** Bookings & queue: online booking page, auto-confirm, guests per 30-minute slot. */
  reservationsEnabled: boolean().notNull().default(true),
  reservationAutoConfirm: boolean().notNull().default(true),
  reservationSlotCapacity: integer().notNull().default(40),
  reservationMaxParty: integer().notNull().default(12),
  reservationDurationMin: integer().notNull().default(90),
  /** Guest (QR) orders wait for the till to accept them before going to the kitchen. */
  cashierAcceptance: boolean().notNull().default(true),
  /** Local print agent (network ticket printers): token hash and last contact. */
  printAgentTokenHash: varchar({ length: 64 }),
  printAgentSeenAt: timestamp({ withTimezone: true, mode: "date" }),
  /** Dashboard modules the restaurant switched off (hidden from its navigation). */
  disabledModules: text()
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  legalName: varchar({ length: 200 }),
  legalId: varchar({ length: 64 }),
  vatNumber: varchar({ length: 64 }),
  /** شماره ثبت (company registration number), printed on invoices. */
  registrationNumber: varchar({ length: 64 }),
  legalNotice: text(),
  privacyPolicyUrl: text(),
  enabledLocales: text()
    .array()
    .notNull()
    .default(sql`ARRAY['fr','en']::text[]`),
  updatedAt: timestamps.updatedAt,
});

export const restaurantMembers = pgTable(
  "restaurant_members",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole().notNull(),
    /** Extra permissions granted on top of the role defaults. */
    grantedPermissions: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** Permissions removed from the role defaults. */
    revokedPermissions: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: memberStatus().notNull().default("active"),
    /** Job in the restaurant (manager, cashier, waiter, bar, kitchen): permission preset and home screen. */
    job: varchar({ length: 16 }),
    /** Kitchen station a bar / kitchen member works at (their screen shows only its items). */
    stationId: uuid(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("restaurant_members_restaurant_user_uq").on(t.restaurantId, t.userId),
    index("restaurant_members_user_idx").on(t.userId),
  ],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 64 }).notNull(),
    /** Basis points: 10% = 1000, 5.5% = 550. */
    rateBps: integer().notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("tax_rates_restaurant_idx").on(t.restaurantId),
    check("tax_rates_rate_bps_chk", sql`${t.rateBps} >= 0 AND ${t.rateBps} <= 10000`),
  ],
);

/** Gap-free per-restaurant sequences (order numbers, invoice numbers). */
export const counters = pgTable(
  "counters",
  {
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 32 }).notNull(),
    value: bigint({ mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.name] })],
);
