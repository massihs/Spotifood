import { date, index, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";
import { stockItems } from "./inventory";

/** The week's planning: who works when (پلن شیفت). */
export const plannedShifts = pgTable(
  "planned_shifts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    note: varchar({ length: 120 }),
    ...timestamps,
  },
  (t) => [index("planned_shifts_restaurant_idx").on(t.restaurantId, t.startsAt)],
);

/** Clock-in / clock-out (حضور و غیاب): one row per period worked. */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clockInAt: tstz().notNull(),
    clockOutAt: tstz(),
    /** A manager corrected the times (forgotten clock-out…). */
    editedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    note: varchar({ length: 200 }),
    ...timestamps,
  },
  (t) => [
    index("time_entries_restaurant_idx").on(t.restaurantId, t.clockInAt),
    index("time_entries_user_idx").on(t.userId, t.clockInAt),
  ],
);

/** The day's tips (the jar, card tips): shared by the hours each person worked that day. */
export const tipPools = pgTable(
  "tip_pools",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    amountCents: money().notNull(),
    note: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("tip_pools_restaurant_idx").on(t.restaurantId, t.day)],
);

/** Stock sent from one venue of a group to another (central kitchen, shared storeroom). */
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: pk(),
    fromRestaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    toRestaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    fromItemId: uuid()
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    toItemId: uuid()
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    quantity: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(),
    unitCostCents: money().notNull(),
    note: varchar({ length: 200 }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index("stock_transfers_from_idx").on(t.fromRestaurantId, t.createdAt),
    index("stock_transfers_to_idx").on(t.toRestaurantId, t.createdAt),
  ],
);
