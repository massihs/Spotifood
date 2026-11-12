import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { ledgerAccounts, ledgerSettings } from "@/server/db/schema";
import { EDITION } from "@/config/edition";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
type Names = { fr: string; en: string; fa: string; ar: string };

/** Accounts the automatic postings use (the restaurant can rename them, not change their nature). */
export const SYSTEM_KEYS = [
  "cash",
  "bank",
  "card_clearing",
  "online_clearing",
  "receivables",
  "cheques_receivable",
  "bounced_cheques",
  "inventory",
  "accounts_payable",
  "cheques_payable",
  "vat_payable",
  "salaries_payable",
  "equity",
  "retained_earnings",
  "revenue_sales",
  "revenue_b2b",
  "revenue_other",
  "cogs",
  "expense_rent",
  "expense_salaries",
  "expense_utilities",
  "expense_supplies",
  "expense_marketing",
  "expense_maintenance",
  "expense_taxes",
  "expense_bank_fees",
  "expense_other",
] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];

type Entry = { code: string; key?: SystemKey; type: AccountType; reconcilable?: boolean; names: Names };
const n = (fr: string, en: string, fa: string, ar: string): Names => ({ fr, en, fa, ar });

/**
 * Default chart of a restaurant or café, numbered like the French plan comptable (so the FEC
 * export reads naturally in any accounting package): cash and bank, customer accounts (house
 * accounts and trade customers), stock, suppliers, VAT, sales to guests and to professionals.
 */
export const DEFAULT_CHART: Entry[] = [
  {
    code: "530",
    key: "cash",
    type: "asset",
    reconcilable: true,
    names: n("Caisse", "Cash on hand", "صندوق", "الصندوق"),
  },
  {
    code: "512",
    key: "bank",
    type: "asset",
    reconcilable: true,
    names: n("Banque", "Bank", "بانک", "البنك"),
  },
  {
    code: "5115",
    key: "card_clearing",
    type: "asset",
    reconcilable: true,
    names: n(
      "Cartes bancaires à encaisser",
      "Card payments clearing",
      "دریافتی‌های کارتخوان",
      "مدفوعات البطاقات قيد التحصيل",
    ),
  },
  {
    code: "5116",
    key: "online_clearing",
    type: "asset",
    reconcilable: true,
    names: n(
      "Paiements en ligne à encaisser",
      "Online payments clearing",
      "دریافتی‌های درگاه آنلاین",
      "المدفوعات الإلكترونية قيد التحصيل",
    ),
  },
  {
    code: "411",
    key: "receivables",
    type: "asset",
    names: n(
      "Clients (comptes et professionnels)",
      "Customers (accounts and trade)",
      "حساب‌های دریافتنی مشتریان",
      "الذمم المدينة للعملاء",
    ),
  },
  {
    code: "5113",
    key: "cheques_receivable",
    type: "asset",
    names: n("Chèques à encaisser", "Cheques receivable", "اسناد دریافتنی (چک)", "شيكات برسم التحصيل"),
  },
  {
    code: "4161",
    key: "bounced_cheques",
    type: "asset",
    names: n("Chèques impayés", "Bounced cheques", "اسناد دریافتنی برگشتی", "شيكات مرتجعة"),
  },
  { code: "37", key: "inventory", type: "asset", names: n("Stocks", "Inventory", "موجودی کالا", "المخزون") },
  {
    code: "486",
    type: "asset",
    names: n("Charges constatées d'avance", "Prepayments", "پیش‌پرداخت‌ها", "المدفوعات المقدمة"),
  },
  {
    code: "21",
    type: "asset",
    names: n("Immobilisations", "Fixed assets", "دارایی‌های ثابت", "الأصول الثابتة"),
  },
  {
    code: "28",
    type: "asset",
    names: n(
      "Amortissements (à déduire)",
      "Accumulated depreciation",
      "استهلاک انباشته (کاهنده)",
      "مجمع الإهلاك",
    ),
  },
  {
    code: "401",
    key: "accounts_payable",
    type: "liability",
    names: n("Fournisseurs", "Trade payables", "حساب‌های پرداختنی تجاری", "الذمم الدائنة"),
  },
  {
    code: "403",
    key: "cheques_payable",
    type: "liability",
    names: n("Chèques émis à payer", "Cheques payable", "اسناد پرداختنی (چک)", "شيكات مستحقة الدفع"),
  },
  {
    code: "44571",
    key: "vat_payable",
    type: "liability",
    names: n(
      "TVA collectée",
      "VAT payable",
      "مالیات بر ارزش افزوده پرداختنی",
      "ضريبة القيمة المضافة المستحقة",
    ),
  },
  {
    code: "421",
    key: "salaries_payable",
    type: "liability",
    names: n(
      "Personnel, rémunérations dues",
      "Salaries payable",
      "حقوق و دستمزد پرداختنی",
      "الرواتب المستحقة",
    ),
  },
  {
    code: "431",
    type: "liability",
    names: n("Sécurité sociale", "Social charges payable", "حق بیمه پرداختنی", "التأمينات المستحقة"),
  },
  { code: "164", type: "liability", names: n("Emprunts", "Bank loans", "تسهیلات مالی دریافتی", "القروض") },
  { code: "101", key: "equity", type: "equity", names: n("Capital", "Capital", "سرمایه", "رأس المال") },
  {
    code: "110",
    key: "retained_earnings",
    type: "equity",
    names: n("Report à nouveau", "Retained earnings", "سود (زیان) انباشته", "الأرباح المحتجزة"),
  },
  {
    code: "7061",
    key: "revenue_sales",
    type: "revenue",
    names: n(
      "Ventes restaurant (repas et boissons)",
      "Food and beverage sales",
      "فروش غذا و نوشیدنی",
      "مبيعات الأطعمة والمشروبات",
    ),
  },
  {
    code: "7062",
    key: "revenue_b2b",
    type: "revenue",
    names: n(
      "Ventes aux professionnels (B2B)",
      "Trade sales (B2B)",
      "فروش عمده به همکاران (B2B)",
      "مبيعات الجملة (B2B)",
    ),
  },
  {
    code: "708",
    key: "revenue_other",
    type: "revenue",
    names: n("Autres produits", "Other revenue", "سایر درآمدها", "إيرادات أخرى"),
  },
  {
    code: "607",
    key: "cogs",
    type: "expense",
    names: n(
      "Achats de marchandises et matières",
      "Purchases (cost of sales)",
      "خرید مواد و کالا (بهای تمام‌شده)",
      "المشتريات (تكلفة المبيعات)",
    ),
  },
  { code: "613", key: "expense_rent", type: "expense", names: n("Loyers", "Rent", "اجاره", "الإيجار") },
  {
    code: "641",
    key: "expense_salaries",
    type: "expense",
    names: n("Salaires", "Payroll", "حقوق و دستمزد", "الرواتب والأجور"),
  },
  {
    code: "606",
    key: "expense_utilities",
    type: "expense",
    names: n("Eau, énergie, téléphone", "Utilities", "آب، برق، گاز و تلفن", "المرافق"),
  },
  {
    code: "6068",
    key: "expense_supplies",
    type: "expense",
    names: n(
      "Fournitures et emballages",
      "Supplies and packaging",
      "ملزومات و بسته‌بندی",
      "المستلزمات والتغليف",
    ),
  },
  {
    code: "623",
    key: "expense_marketing",
    type: "expense",
    names: n("Publicité", "Marketing", "تبلیغات و بازاریابی", "التسويق"),
  },
  {
    code: "615",
    key: "expense_maintenance",
    type: "expense",
    names: n("Entretien et réparations", "Maintenance", "تعمیر و نگهداری", "الصيانة"),
  },
  {
    code: "635",
    key: "expense_taxes",
    type: "expense",
    names: n("Impôts et taxes", "Taxes and levies", "مالیات و عوارض", "الضرائب والرسوم"),
  },
  {
    code: "627",
    key: "expense_bank_fees",
    type: "expense",
    names: n("Frais bancaires", "Bank fees", "کارمزد بانکی", "الرسوم المصرفية"),
  },
  {
    code: "681",
    type: "expense",
    names: n("Dotations aux amortissements", "Depreciation", "هزینه استهلاک", "الإهلاك"),
  },
  {
    code: "658",
    key: "expense_other",
    type: "expense",
    names: n("Autres charges", "Other expenses", "سایر هزینه‌ها", "مصاريف أخرى"),
  },
];

/** The Iranian numbering of the same accounts (group, then general ledger "کل" codes). */
const IRAN_CODES: Record<string, string> = {
  "530": "1101",
  "512": "1102",
  "5115": "1103",
  "5116": "1104",
  "411": "1201",
  "5113": "1203",
  "4161": "1204",
  "37": "1301",
  "486": "1401",
  "21": "1501",
  "28": "1502",
  "401": "2101",
  "403": "2102",
  "44571": "2201",
  "421": "2401",
  "431": "2402",
  "164": "2601",
  "101": "3101",
  "110": "3301",
  "7061": "4101",
  "7062": "4102",
  "708": "4901",
  "607": "5101",
  "641": "6101",
  "613": "6201",
  "606": "6202",
  "6068": "6203",
  "623": "6204",
  "615": "6205",
  "635": "6206",
  "627": "6207",
  "681": "6301",
  "658": "6901",
};

/**
 * Chart of the Iran edition: the usual Iranian layout (1 assets … 6 expenses) with the accounts
 * Iranian venues keep: cheques received and issued (اسناد دریافتنی / پرداختنی), social
 * insurance, legal reserve.
 */
export const IRAN_CHART: Entry[] = [
  ...DEFAULT_CHART.map((a) => ({ ...a, code: IRAN_CODES[a.code] ?? a.code })),
  {
    code: "3201",
    type: "equity" as AccountType,
    names: n("Réserve légale", "Legal reserve", "اندوخته قانونی", "الاحتياطي القانوني"),
  },
].sort((a, b) => a.code.localeCompare(b.code));

export const chartFor = (edition: string): Entry[] => (edition === "iran" ? IRAN_CHART : DEFAULT_CHART);

const pickName = (names: Names, locale: string) => names[(locale in names ? locale : "en") as keyof Names];

/** Creates the default chart and ledger settings for a venue that has none (idempotent). */
export async function ensureChart(db: DbOrTx, restaurantId: string, locale: string) {
  await db.insert(ledgerSettings).values({ restaurantId }).onConflictDoNothing();
  const existing = await db
    .select({ code: ledgerAccounts.code, key: ledgerAccounts.systemKey })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.restaurantId, restaurantId));
  const codes = new Set(existing.map((e) => e.code));
  const keys = new Set(existing.map((e) => e.key));
  const missing = chartFor(EDITION).filter(
    (a) => !(a.key ? keys.has(a.key) : codes.has(a.code)) && !codes.has(a.code),
  );
  if (missing.length)
    await db
      .insert(ledgerAccounts)
      .values(
        missing.map((a) => ({
          restaurantId,
          code: a.code,
          name: pickName(a.names, locale),
          type: a.type,
          systemKey: a.key ?? null,
          reconcilable: a.reconcilable ?? false,
        })),
      )
      .onConflictDoNothing();
}

/** System accounts by key (id lookup for the automatic postings). */
export async function systemAccounts(db: DbOrTx, restaurantId: string) {
  const rows = await db
    .select({ id: ledgerAccounts.id, key: ledgerAccounts.systemKey })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.restaurantId, restaurantId));
  const map = new Map<string, string>();
  for (const r of rows) if (r.key) map.set(r.key, r.id);
  return (key: SystemKey) => {
    const id = map.get(key);
    if (!id) throw new Error(`ledger account missing: ${key}`);
    return id;
  };
}

/** Cash / bank account a payment method lands in ("account": the customer's house account). */
export function moneyAccountOf(method: string | null): SystemKey {
  switch (method) {
    case "cash":
      return "cash";
    case "card":
    case "on_site_terminal":
      return "card_clearing";
    case "cheque":
      return "cheques_receivable";
    case "account":
      return "receivables";
    case "online":
    case "stripe":
    case "zarinpal":
    case "mock_online":
      return "online_clearing";
    default:
      return "bank";
  }
}
