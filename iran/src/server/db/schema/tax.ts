import { bigint, index, integer, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps, tstz } from "./_helpers";
import { invoices } from "./orders";
import { restaurants } from "./restaurant";

/** Each invoice's trip to the tax system (سامانه مؤدیان): queued, sent, accepted or refused. */
export const moadianInvoices = pgTable(
  "moadian_invoices",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    serial: bigint({ mode: "number" }).notNull(),
    taxId: varchar({ length: 22 }).notNull(),
    /** pending | sent | accepted | failed */
    status: varchar({ length: 12 }).notNull().default("pending"),
    referenceNumber: varchar({ length: 64 }),
    error: text(),
    attempts: integer().notNull().default(0),
    sentAt: tstz(),
    checkedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("moadian_invoices_invoice_uq").on(t.invoiceId),
    index("moadian_invoices_status_idx").on(t.restaurantId, t.status),
  ],
);
