import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";

/**
 * Where Spotifood pays a restaurant the online payments it collected for it (Sheba / card).
 * The IBAN and card number are stored encrypted (server/infra/secret-box.ts); the last four
 * digits and the bank code stay readable for display and for the payout list.
 */
export const payoutAccounts = pgTable("payout_accounts", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  holderName: varchar({ length: 120 }).notNull(),
  ibanEnc: text().notNull(),
  ibanLast4: varchar({ length: 4 }).notNull(),
  /** The 3-digit bank identifier of the Sheba number (012 = Mellat, 017 = Melli…). */
  bankCode: varchar({ length: 3 }).notNull(),
  cardEnc: text(),
  cardLast4: varchar({ length: 4 }),
  updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

/** A transfer Spotifood made to a restaurant's account for the online payments it collected. */
export const payouts = pgTable(
  "payouts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    amountCents: money().notNull(),
    currency: varchar({ length: 3 }).notNull(),
    /** Bank tracking number of the transfer (شماره پیگیری). */
    reference: varchar({ length: 64 }).notNull(),
    note: text(),
    /** Last four digits of the IBAN paid, frozen: the account may change later. */
    ibanLast4: varchar({ length: 4 }),
    paidAt: tstz().notNull().defaultNow(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("payouts_restaurant_paid_idx").on(t.restaurantId, t.paidAt),
    check("payouts_amount_chk", sql`${t.amountCents} > 0`),
  ],
);
