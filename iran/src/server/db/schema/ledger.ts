import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";
import { customers } from "./customers";
import { suppliers } from "./inventory";

/**
 * Double-entry general ledger. Every financial event (sale, refund, sale on a customer's account
 * and its repayment, expense, stock purchase, supplier payment, cheque…) is journalled
 * automatically as a balanced entry; accountants add manual entries. Reports (trial balance,
 * P&L, balance sheet, general ledger, aged receivables) are computed from the journal lines only.
 */

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    code: varchar({ length: 12 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    /** asset | liability | equity | revenue | expense */
    type: varchar({ length: 10 }).notNull(),
    /** Accounts the automatic postings use: cash, receivables, revenue_food… (null = user account). */
    systemKey: varchar({ length: 32 }),
    /** Cash and bank accounts are reconciled against statements. */
    reconcilable: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ledger_accounts_code_uq").on(t.restaurantId, t.code),
    uniqueIndex("ledger_accounts_system_uq")
      .on(t.restaurantId, t.systemKey)
      .where(sql`${t.systemKey} IS NOT NULL`),
    check("ledger_accounts_type_chk", sql`${t.type} in ('asset','liability','equity','revenue','expense')`),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    /** Accounting date (the venue's local day for automatic entries). */
    date: date({ mode: "string" }).notNull(),
    memo: varchar({ length: 240 }).notNull(),
    /** payment | refund | account_payment | expense | purchase | cheque_event | manual | reversal… */
    sourceType: varchar({ length: 16 }).notNull(),
    sourceId: uuid(),
    /** This entry cancels that one (reversal). */
    reversalOfId: uuid(),
    postedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("journal_entries_number_uq").on(t.restaurantId, t.number),
    // An automatic posting is journalled once, whatever retries happen.
    uniqueIndex("journal_entries_source_uq")
      .on(t.restaurantId, t.sourceType, t.sourceId)
      .where(sql`${t.sourceId} IS NOT NULL`),
    index("journal_entries_date_idx").on(t.restaurantId, t.date),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    entryId: uuid()
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    debitCents: money().notNull().default(0),
    creditCents: money().notNull().default(0),
    /** Revenue / cost centre: dine_in, takeaway, delivery, b2b, admin… */
    department: varchar({ length: 16 }),
    description: varchar({ length: 200 }),
    /** Bank reconciliation: matched with the statement on this day. */
    reconciledAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.restaurantId, t.accountId),
    check(
      "journal_lines_side_chk",
      sql`${t.debitCents} >= 0 and ${t.creditCents} >= 0 and (${t.debitCents} = 0) <> (${t.creditCents} = 0)`,
    ),
  ],
);

/** Monthly budget per account, to compare with actuals. */
export const ledgerBudgets = pgTable(
  "ledger_budgets",
  {
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "cascade" }),
    /** "YYYY-MM" */
    month: varchar({ length: 7 }).notNull(),
    amountCents: money().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.accountId, t.month] })],
);

/** Books closed up to a date: no entry may be dated on or before it. */
export const ledgerSettings = pgTable("ledger_settings", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  lockedUntil: date({ mode: "string" }),
  nextEntryNumber: integer().notNull().default(1),
  /** First month of the fiscal year (1–12). Iran: 1 = Farvardin is handled by the calendar. */
  fiscalYearStartMonth: integer().notNull().default(1),
  ...timestamps,
});

/**
 * Cheques (چک): received from customers (a trade customer settling their account), or issued to
 * suppliers, with their Sayad id (شناسه صیادی) and due date; each status change is an event that
 * the books journal.
 */
export const cheques = pgTable(
  "cheques",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** received | issued */
    direction: varchar({ length: 8 }).notNull(),
    sayadId: varchar({ length: 16 }),
    number: varchar({ length: 32 }),
    bank: varchar({ length: 80 }),
    /** Drawer (received) or payee (issued). */
    party: varchar({ length: 160 }).notNull(),
    amountCents: money().notNull(),
    dueDate: date({ mode: "string" }).notNull(),
    /** received: in_hand | deposited | cleared | bounced | returned · issued: issued | cleared | bounced | cancelled */
    status: varchar({ length: 10 }).notNull(),
    /** The customer whose account it settles (received). */
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    note: varchar({ length: 300 }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("cheques_due_idx").on(t.restaurantId, t.direction, t.dueDate),
    uniqueIndex("cheques_sayad_uq")
      .on(t.restaurantId, t.direction, t.sayadId)
      .where(sql`${t.sayadId} IS NOT NULL`),
    check("cheques_amount_chk", sql`${t.amountCents} > 0`),
  ],
);

export const chequeEvents = pgTable(
  "cheque_events",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    chequeId: uuid()
      .notNull()
      .references(() => cheques.id, { onDelete: "cascade" }),
    status: varchar({ length: 10 }).notNull(),
    day: date({ mode: "string" }).notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("cheque_events_cheque_idx").on(t.chequeId)],
);

/** Money paid to a supplier (settles the accounts payable left by stock purchases). */
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    amountCents: money().notNull(),
    /** cash | transfer | cheque */
    method: varchar({ length: 10 }).notNull(),
    chequeId: uuid().references(() => cheques.id, { onDelete: "set null" }),
    paidOn: date({ mode: "string" }).notNull(),
    reference: varchar({ length: 64 }),
    note: varchar({ length: 300 }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("supplier_payments_idx").on(t.restaurantId, t.supplierId, t.paidOn),
    check("supplier_payments_amount_chk", sql`${t.amountCents} > 0`),
  ],
);
