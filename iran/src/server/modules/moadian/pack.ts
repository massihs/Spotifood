import { strToU8, zipSync } from "fflate";
import { and, eq, gte, lt } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { invoices, moadianInvoices } from "@/server/db/schema";
import { toJalali } from "@/lib/jalali-calendar";
import { exportJournalCsv, taxReport, trialBalance } from "@/server/modules/ledger/reports";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { dayStart } from "@/lib/period";

/**
 * The accountant's pack (پکیج حسابدار): one ZIP with the journal, the trial balance, the VAT per
 * month and season, and the list of invoices with their tax id and status in the tax system —
 * CSV files Excel and Iranian accounting software (Sepidar, Hamkaran…) open as they are.
 */

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number | null | undefined)[][]) =>
  `﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}`;
const rial = (c: number) => Math.round(c / 100);
const jdate = (d: string) => {
  const j = toJalali(d);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
};

export async function accountantPack(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "accounting.manage");
  const tz = ctx.restaurant.timezone;
  const [journal, trial, vat, inv] = await Promise.all([
    exportJournalCsv(db, ctx, from, to),
    trialBalance(db, ctx, from, to),
    taxReport(db, ctx, from, to),
    db
      .select({
        number: invoices.number,
        issuedAt: invoices.issuedAt,
        totalCents: invoices.totalCents,
        taxCents: invoices.taxCents,
        snapshot: invoices.snapshot,
        taxId: moadianInvoices.taxId,
        status: moadianInvoices.status,
        ref: moadianInvoices.referenceNumber,
      })
      .from(invoices)
      .leftJoin(moadianInvoices, eq(moadianInvoices.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.restaurantId, ctx.restaurant.id),
          gte(invoices.issuedAt, dayStart(from, tz)),
          lt(invoices.issuedAt, dayStart(nextDay(to), tz)),
        ),
      )
      .orderBy(invoices.seq),
  ]);
  const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const files = {
    "1-journal-روزنامه.csv": strToU8(`﻿${journal}`),
    "2-trial-balance-تراز.csv": strToU8(
      csv([
        [
          "کد حساب",
          "نام حساب",
          "مانده اول دوره (ریال)",
          "بدهکار (ریال)",
          "بستانکار (ریال)",
          "مانده پایان دوره (ریال)",
        ],
        ...trial.rows.map((r) => [
          r.code,
          r.name,
          rial(r.openingNet),
          rial(r.debit),
          rial(r.credit),
          rial(r.closingNet),
        ]),
        ["", "جمع", "", rial(trial.totals.debit), rial(trial.totals.credit), ""],
      ]),
    ),
    "3-vat-ارزش-افزوده.csv": strToU8(
      csv([
        ["ماه", "فصل", "مالیات و عوارض ارزش افزوده (ریال)"],
        ...vat.map((v) => [v.month, v.season, rial(v.vat)]),
        ["جمع", "", rial(vat.reduce((s, v) => s + v.vat, 0))],
      ]),
    ),
    "4-invoices-صورتحساب‌ها.csv": strToU8(
      csv([
        [
          "شماره",
          "تاریخ",
          "خریدار",
          "شناسه خریدار",
          "مبلغ کل (ریال)",
          "مالیات (ریال)",
          "شماره مالیاتی",
          "وضعیت مؤدیان",
          "شماره پیگیری",
        ],
        ...inv.map((i) => [
          i.number,
          jdate(localDay(i.issuedAt)),
          i.snapshot.buyer?.name ?? "",
          i.snapshot.buyer?.nationalId ?? i.snapshot.buyer?.economicCode ?? "",
          rial(i.totalCents),
          rial(i.taxCents),
          i.taxId ?? "",
          i.status ?? "",
          i.ref ?? "",
        ]),
      ]),
    ),
  };
  return zipSync(files, { level: 6 });
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
