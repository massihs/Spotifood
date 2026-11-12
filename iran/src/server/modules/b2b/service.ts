import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  cashMovements,
  cashShifts,
  customerAccountEntries,
  customers,
  invoices,
  orders,
  payments,
  paymentAllocations,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { localDay } from "@/lib/period";
import { MAX_AMOUNT_CENTS, normalizeDigits } from "@/lib/money";
import { normalizeIranMobile } from "@/lib/phone";
import { loadPublicMenu } from "@/server/modules/menu/public";
import { createPosOrder, type PosOrderInput } from "@/server/modules/pos/service";
import { issueInvoiceAsStaff } from "@/server/modules/invoices/service";
import { chequeDetailsSchema, insertCheque } from "@/server/modules/ledger/finance";

/**
 * Trade sales (B2B): a café or a roastery selling its products to other venues (restaurants,
 * offices…) at trade prices. Professional customers are customer files flagged as businesses,
 * with their company id, address, payment terms, credit limit (sales on account) and their own
 * discount on the trade prices. Their orders are ordinary orders flagged `isB2b`, journalled as
 * trade revenue, with an invoice in the company's name.
 */

const cents = z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS);
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const tradeCustomerSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v, c) => {
      const n = normalizeIranMobile(v);
      if (!n) c.addIssue({ code: "custom", message: "invalid_phone" });
      return n ?? "";
    }),
  name: z.string().trim().min(2).max(120),
  taxId: z
    .string()
    .max(24)
    .transform((v) => normalizeDigits(v).replace(/\s/g, "") || null)
    .nullable()
    .optional(),
  address: opt(500),
  note: opt(1000),
  /** null: no sale on account. */
  creditLimitCents: cents.nullable().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  /** Percent off the trade prices (0–90). */
  discountPct: z.coerce.number().min(0).max(90).default(0),
});
export type TradeCustomerInput = z.input<typeof tradeCustomerSchema>;

/** Adds a professional customer, or turns an existing customer file into one. */
export async function saveTradeCustomer(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: TradeCustomerInput,
) {
  assertCan(ctx, "customers.manage");
  const input = tradeCustomerSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const values = {
    name: input.name,
    taxId: input.taxId ?? null,
    address: input.address ?? null,
    note: input.note ?? null,
    creditLimitCents: input.creditLimitCents ?? null,
    paymentTermsDays: input.paymentTermsDays,
    tradeDiscountBps: Math.round(input.discountPct * 100),
    isBusiness: true,
  };
  return db.transaction(async (tx) => {
    let row;
    if (id) {
      if (!isUuid(id)) throw notFound();
      [row] = await tx
        .update(customers)
        .set(values)
        .where(and(eq(customers.id, id), eq(customers.restaurantId, rid)))
        .returning();
      if (!row) throw notFound();
    } else {
      [row] = await tx
        .insert(customers)
        .values({ restaurantId: rid, phone: input.phone, ...values })
        .onConflictDoUpdate({ target: [customers.restaurantId, customers.phone], set: values })
        .returning();
    }
    // Lowering the limit below what they already owe is allowed; new sales on account stop.
    await recordAudit(tx, {
      action: id ? "trade_customer.updated" : "trade_customer.created",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "customer",
      entityId: row!.id,
      metadata: {
        name: input.name,
        creditLimitCents: values.creditLimitCents,
        discountBps: values.tradeDiscountBps,
      },
    });
    return row!;
  });
}

/** Back to an ordinary customer file (their history and balance stay). */
export async function removeTradeCustomer(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "customers.manage");
  if (!isUuid(id)) throw notFound();
  const res = await db
    .update(customers)
    .set({ isBusiness: false, tradeDiscountBps: 0 })
    .where(and(eq(customers.id, id), eq(customers.restaurantId, ctx.restaurant.id)))
    .returning({ id: customers.id, balance: customers.balanceCents });
  if (!res.length) throw notFound();
}

/** Professional customers with what they owe, their limit and last order. */
export async function listTradeCustomers(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "customers.view");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select({
      id: customers.id,
      phone: customers.phone,
      name: customers.name,
      taxId: customers.taxId,
      address: customers.address,
      note: customers.note,
      creditLimitCents: customers.creditLimitCents,
      balanceCents: customers.balanceCents,
      paymentTermsDays: customers.paymentTermsDays,
      tradeDiscountBps: customers.tradeDiscountBps,
      lastOrderAt: customers.lastOrderAt,
      ordersCount: customers.ordersCount,
    })
    .from(customers)
    .where(and(eq(customers.restaurantId, rid), eq(customers.isBusiness, true)))
    .orderBy(asc(customers.name));
  // Oldest debt still open (repayments settle the oldest charges first): overdue past the terms.
  const ids = rows.filter((r) => r.balanceCents > 0).map((r) => r.id);
  const charges = ids.length
    ? await db
        .select({
          customerId: customerAccountEntries.customerId,
          amount: customerAccountEntries.amountCents,
          at: customerAccountEntries.createdAt,
        })
        .from(customerAccountEntries)
        .where(
          and(eq(customerAccountEntries.restaurantId, rid), inArray(customerAccountEntries.customerId, ids)),
        )
        .orderBy(asc(customerAccountEntries.createdAt))
    : [];
  const oldest = new Map<string, Date>();
  for (const id of ids) {
    const mine = charges.filter((c) => c.customerId === id);
    let paid = -mine.filter((c) => c.amount < 0).reduce((s, c) => s + c.amount, 0);
    for (const c of mine.filter((x) => x.amount > 0)) {
      if (paid >= c.amount) {
        paid -= c.amount;
        continue;
      }
      oldest.set(id, c.at);
      break;
    }
  }
  const now = Date.now();
  return rows.map((r) => {
    const since = oldest.get(r.id);
    const age = since ? Math.floor((now - since.getTime()) / 86_400_000) : 0;
    return { ...r, oldestDebtDays: since ? age : null, overdue: !!since && age > r.paymentTermsDays };
  });
}

/** The catalogue at trade prices (trade-only categories included). */
export async function tradeCatalogue(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.create");
  return loadPublicMenu(db, ctx.restaurant.id, { trade: true });
}

/** The latest trade orders with their customer, payment and invoice. */
export async function listTradeOrders(db: DbOrTx, ctx: RestaurantContext, limit = 50) {
  assertCan(ctx, "orders.view");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalCents: orders.totalCents,
      placedAt: orders.placedAt,
      customerId: orders.customerId,
      customerName: customers.name,
      customerPhone: orders.customerPhone,
    })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.restaurantId, rid), eq(orders.isB2b, true)))
    .orderBy(desc(orders.placedAt))
    .limit(Math.min(limit, 200));
  const invs = rows.length
    ? await db
        .select({
          orderId: paymentAllocations.orderId,
          token: invoices.publicToken,
          number: invoices.number,
          provider: payments.provider,
        })
        .from(paymentAllocations)
        .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
        .innerJoin(invoices, eq(invoices.paymentId, payments.id))
        .where(
          inArray(
            paymentAllocations.orderId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const byOrder = new Map(invs.map((i) => [i.orderId, i]));
  return rows.map((r) => ({ ...r, invoice: byOrder.get(r.id) ?? null }));
}

export const tradeOrderSchema = z.object({
  customerId: z.uuid(),
  lines: z
    .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(9999) }))
    .min(1)
    .max(200),
  /** "account": on the customer's account (within their limit); null: unpaid, to be invoiced. */
  payment: z.enum(["account", "cash", "on_site_terminal"]).nullable(),
  delivery: z.boolean().default(false),
  note: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

/**
 * Rings up a trade order for a professional customer: trade prices less their discount; paid on
 * the spot, put on their account, or left unpaid. The invoice is issued in the company's name.
 */
export async function createTradeOrder(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof tradeOrderSchema>,
) {
  assertCan(ctx, "orders.create");
  const input = tradeOrderSchema.parse(raw);
  const [c] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, input.customerId),
        eq(customers.restaurantId, ctx.restaurant.id),
        eq(customers.isBusiness, true),
      ),
    );
  if (!c) throw notFound("trade_customer_not_found");
  if (input.payment === "account" && c.creditLimitCents == null) throw conflict("no_account");
  // Quantities over 99 (the till's limit) are split into lines of 99.
  const lines: PosOrderInput["lines"] = [];
  for (const l of input.lines)
    for (let left = l.quantity; left > 0; left -= 99)
      lines.push({ productId: l.productId, quantity: Math.min(99, left) });
  if (lines.length > 100) throw validation("too_many_lines");
  const res = await createPosOrder(db, ctx, {
    b2b: true,
    channel: input.delivery ? "delivery" : "takeaway",
    deliveryAddress: input.delivery ? (c.address ?? "") : "",
    saveAddress: false,
    lines,
    note: input.note,
    customerPhone: c.phone,
    customerName: c.name ?? "",
    payment: input.payment ? { provider: input.payment } : null,
    idempotencyKey: input.idempotencyKey,
  });
  // The invoice names the company (its id goes where the tax system expects it).
  if (res.payment) {
    const id = c.taxId ?? "";
    await issueInvoiceAsStaff(db, ctx, res.payment.id, {
      name: c.name ?? c.phone,
      nationalId: /^\d{10,11}$/.test(id) ? id : null,
      economicCode: /^\d{12,14}$/.test(id) ? id : null,
      phone: c.phone,
      address: c.address?.slice(0, 300) ?? null,
    });
  }
  return res;
}

export const tradePaymentSchema = z
  .object({
    customerId: z.uuid(),
    amountCents: cents.min(1),
    method: z.enum(["cash", "card", "transfer", "cheque"]),
    note: z.string().trim().max(200).default(""),
    cheque: chequeDetailsSchema.omit({ party: true }).optional(),
  })
  .refine((v) => v.method !== "cheque" || !!v.cheque, { message: "cheque_required", path: ["cheque"] });

/**
 * A professional customer settles (part of) their account: cash, card, transfer, or a cheque
 * that goes into the cheque register (cleared later into the bank).
 */
export async function receiveTradePayment(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof tradePaymentSchema>,
) {
  assertCan(ctx, "payments.record");
  const input = tradePaymentSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.restaurantId, rid)))
      .for("update");
    if (!c) throw notFound();
    if (input.amountCents > c.balanceCents)
      throw validation("repayment_too_high", { amountCents: c.balanceCents });
    const today = localDay(new Date(), ctx.restaurant.timezone);
    const cheque =
      input.method === "cheque"
        ? await insertCheque(tx, rid, {
            ...input.cheque!,
            party: c.name ?? c.phone,
            direction: "received",
            amountCents: input.amountCents,
            customerId: c.id,
            userId: ctx.user.id,
            today,
          })
        : null;
    await tx
      .update(customers)
      .set({ balanceCents: sql`${customers.balanceCents} - ${input.amountCents}` })
      .where(eq(customers.id, c.id));
    const [entry] = await tx
      .insert(customerAccountEntries)
      .values({
        restaurantId: rid,
        customerId: c.id,
        kind: "payment",
        amountCents: -input.amountCents,
        method: input.method,
        note: input.note || (cheque?.number ? `#${cheque.number}` : null),
        actorUserId: ctx.user.id,
      })
      .returning();
    // Cash goes into the open drawer, like any repayment at the till.
    if (input.method === "cash") {
      const [shift] = await tx
        .select({ id: cashShifts.id })
        .from(cashShifts)
        .where(and(eq(cashShifts.restaurantId, rid), isNull(cashShifts.closedAt)));
      if (shift)
        await tx.insert(cashMovements).values({
          restaurantId: rid,
          shiftId: shift.id,
          direction: "in",
          amountCents: input.amountCents,
          reason: `B2B ${c.name ?? c.phone}`.slice(0, 200),
          userId: ctx.user.id,
        });
    }
    await recordAudit(tx, {
      action: "trade_customer.paid",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "customer",
      entityId: c.id,
      metadata: { amountCents: input.amountCents, method: input.method },
    });
    return entry!;
  });
}
