import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { categories, expenses, orders, products, restaurantSettings } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { loadPublicMenu } from "@/server/modules/menu/public";
import { createPosOrder } from "@/server/modules/pos/service";
import {
  createTradeOrder,
  listTradeCustomers,
  listTradeOrders,
  receiveTradePayment,
  saveTradeCustomer,
  tradeCatalogue,
} from "@/server/modules/b2b/service";
import {
  createManualEntry,
  lockBooks,
  openBooks,
  reverseEntry,
  listEntries,
} from "@/server/modules/ledger/service";
import {
  agedReceivables,
  balanceSheet,
  exportFec,
  incomeStatement,
  taxReport,
  trialBalance,
} from "@/server/modules/ledger/reports";
import { chequeRegister, payablesAging, paySupplier, setChequeStatus } from "@/server/modules/ledger/finance";
import { listLedgerAccounts } from "@/server/modules/ledger/service";
import { localDay } from "@/lib/period";
import { createOwnerWithRestaurant } from "../helpers/factories";
import { suppliers } from "@/server/db/schema";

const key = () => randomBytes(12).toString("hex");

async function setup() {
  const owner = await createOwnerWithRestaurant("Torréfaction", { plan: "professional" });
  await db
    .update(restaurantSettings)
    .set({ enabledPaymentProviders: ["cash", "on_site_terminal"] })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const cat = await createCategory(db, owner.ctx, { name: "Cafés" });
  const latte = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Latte", priceCents: 1000 });
  // A trade-only category: beans by the kilo for other cafés.
  const trade = await createCategory(db, owner.ctx, { name: "Grains (pros)" });
  await db.update(categories).set({ tradeOnly: true }).where(eq(categories.id, trade.id));
  const beans = await createProduct(db, owner.ctx, {
    categoryId: trade.id,
    name: "Grains 1 kg",
    priceCents: 50000,
  });
  await db.update(products).set({ tradePriceCents: 40000 }).where(eq(products.id, beans.id));
  await db.update(products).set({ tradePriceCents: 700 }).where(eq(products.id, latte.id));
  const today = localDay(new Date(), owner.ctx.restaurant.timezone);
  return { ...owner, latte, beans, today };
}

describe("trade sales (B2B) and the books", () => {
  it("sells to a professional customer at trade prices, on account, and journals everything", async () => {
    const { ctx, latte, beans, today } = await setup();

    // Guests never see the trade-only category; the trade catalogue does.
    const guest = await loadPublicMenu(db, ctx.restaurant.id);
    expect(Object.keys(guest.products)).not.toContain(beans.id);
    const cat = await tradeCatalogue(db, ctx);
    expect(cat.products[beans.id]?.tradePriceCents).toBe(40000);
    // …and the till cannot sell it to a guest.
    await expect(
      createPosOrder(db, ctx, { lines: [{ productId: beans.id, quantity: 1 }], idempotencyKey: key() }),
    ).rejects.toMatchObject({ message: "product_unavailable" });

    const pro = await saveTradeCustomer(db, ctx, null, {
      phone: "09121112233",
      name: "Café Sahel",
      taxId: "10101234567",
      address: "Tehran, Valiasr St.",
      creditLimitCents: 1_000_000,
      paymentTermsDays: 30,
      discountPct: 10,
    });
    expect(pro.isBusiness).toBe(true);

    // 2 kg of beans + 10 lattes on account: (40000 × 2 + 700 × 10) less 10 %.
    const { order, payment } = await createTradeOrder(db, ctx, {
      customerId: pro.id,
      lines: [
        { productId: beans.id, quantity: 2 },
        { productId: latte.id, quantity: 10 },
      ],
      payment: "account",
      idempotencyKey: key(),
    });
    expect(order.totalCents).toBe(36000 * 2 + 630 * 10);
    expect(payment?.provider).toBe("account");
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.isB2b).toBe(true);
    const listed = await listTradeOrders(db, ctx);
    expect(listed[0]).toMatchObject({ id: order.id, customerName: "Café Sahel" });
    expect(listed[0]!.invoice).not.toBeNull();

    // Over the credit limit: refused.
    await expect(
      createTradeOrder(db, ctx, {
        customerId: pro.id,
        lines: [{ productId: beans.id, quantity: 40 }],
        payment: "account",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ message: "credit_limit_exceeded" });

    // A guest sale paid in cash, and an expense.
    await createPosOrder(db, ctx, {
      lines: [{ productId: latte.id, quantity: 2 }],
      payment: { provider: "cash", tenderedCents: 2000 },
      idempotencyKey: key(),
    });
    await db.insert(expenses).values({
      restaurantId: ctx.restaurant.id,
      category: "rent",
      amountCents: 5000,
      method: "transfer",
    });

    // The customer pays half by cheque, which clears later.
    const owed = order.totalCents;
    await receiveTradePayment(db, ctx, {
      customerId: pro.id,
      amountCents: 40000,
      method: "cheque",
      cheque: { sayadId: "1234567890123456", number: "889", bank: "Mellat", dueDate: today },
    });
    const reg = await chequeRegister(db, ctx, "received");
    expect(reg.rows).toHaveLength(1);
    await setChequeStatus(db, ctx, reg.rows[0]!.id, "cleared", today);

    // A supplier is paid for a purchase.
    const [sup] = await db
      .insert(suppliers)
      .values({ restaurantId: ctx.restaurant.id, name: "Green beans Co" })
      .returning();
    await paySupplier(db, ctx, { supplierId: sup!.id, amountCents: 3000, method: "transfer", paidOn: today });

    await openBooks(db, ctx);
    const tb = await trialBalance(db, ctx, today, today);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    const accounts = await listLedgerAccounts(db, ctx.restaurant.id);
    const id = (k: string) => accounts.find((a) => a.systemKey === k)!.id;
    const bal = (k: string) => tb.rows.find((r) => r.id === id(k))?.closingNet ?? 0;
    expect(bal("receivables")).toBe(owed - 40000);
    expect(bal("cash")).toBe(2000);
    expect(bal("bank")).toBe(40000 - 5000 - 3000);
    expect(bal("cheques_receivable")).toBe(0);

    const pl = await incomeStatement(db, ctx, today, today);
    const b2b = pl.revenue.find((r) => r.id === id("revenue_b2b"))!;
    const sales = pl.revenue.find((r) => r.id === id("revenue_sales"))!;
    // Revenue net of the VAT the orders carry.
    expect(b2b.amount).toBe(owed - order.taxCents);
    expect(sales.amount).toBeGreaterThan(0);
    expect(bal("vat_payable")).toBeLessThan(0);
    expect(pl.departments.map((d) => d.department)).toContain("b2b");
    const bs = await balanceSheet(db, ctx, today);
    expect(bs.balanced).toBe(true);

    const aged = await agedReceivables(db, ctx, today);
    expect(aged.accounts[0]).toMatchObject({ id: pro.id, total: owed - 40000, current: owed - 40000 });
    const pros = await listTradeCustomers(db, ctx);
    expect(pros[0]).toMatchObject({ balanceCents: owed - 40000, overdue: false });
    const payables = await payablesAging(db, ctx, today);
    expect(payables.total).toBe(-3000);
    expect(await taxReport(db, ctx, today, today)).toHaveLength(1);
    expect(await exportFec(db, ctx, today, today)).toContain(
      `\t${accounts.find((a) => a.systemKey === "revenue_b2b")!.code}\t`,
    );

    // Syncing again posts nothing new.
    const before = (await listEntries(db, ctx, { from: today, to: today })).length;
    await openBooks(db, ctx);
    expect((await listEntries(db, ctx, { from: today, to: today })).length).toBe(before);
  });

  it("keeps manual entries balanced, reverses them, and closes the books", async () => {
    const { ctx, today } = await setup();
    await openBooks(db, ctx);
    const accounts = await listLedgerAccounts(db, ctx.restaurant.id);
    const id = (k: string) => accounts.find((a) => a.systemKey === k)!.id;
    await expect(
      createManualEntry(db, ctx, {
        date: today,
        memo: "Bad",
        lines: [
          { accountId: id("cash"), debitCents: 100 },
          { accountId: id("equity"), creditCents: 90 },
        ],
      }),
    ).rejects.toThrow();
    const e = await createManualEntry(db, ctx, {
      date: today,
      memo: "Apport",
      lines: [
        { accountId: id("cash"), debitCents: 100000 },
        { accountId: id("equity"), creditCents: 100000 },
      ],
    });
    await reverseEntry(db, ctx, e.id, today);
    await expect(reverseEntry(db, ctx, e.id, today)).rejects.toMatchObject({ message: "already_reversed" });
    await lockBooks(db, ctx, today);
    await expect(
      createManualEntry(db, ctx, {
        date: today,
        memo: "Too late",
        lines: [
          { accountId: id("cash"), debitCents: 1 },
          { accountId: id("equity"), creditCents: 1 },
        ],
      }),
    ).rejects.toMatchObject({ message: "period_locked" });
  });
});
