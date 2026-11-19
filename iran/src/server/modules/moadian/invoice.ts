import type { InvoiceSnapshot } from "@/server/db/schema";
import { taxId } from "./taxid";

/**
 * A Spotifood invoice in the tax system's format (صورتحساب الکترونیکی): header, one line per
 * dish, amounts in rials without decimals. A guest without a national id gets a type-2 invoice
 * (نوع دوم, retail, no buyer details); a professional buyer with one gets a type-1 invoice.
 * Pattern 1 (فروش), subject 1 (اصلی), settlement 1 (نقد).
 */

export type MoadianConfig = {
  memoryId: string;
  /** Seller's economic code or national id (کد اقتصادی / شناسه ملی). */
  sellerId: string;
  /** Goods-and-services id of the dishes (شناسه کالا و خدمت, 13 digits). */
  serviceId: string;
  /** Unit of measure code (کد واحد اندازه‌گیری). */
  unitCode: string;
};

const rial = (cents: number) => Math.round(cents / 100);

export function moadianInvoice(
  inv: { issuedAt: Date; serial: number; snapshot: InvoiceSnapshot },
  cfg: MoadianConfig,
) {
  const s = inv.snapshot;
  const buyerId = s.buyer?.nationalId?.trim() || s.buyer?.economicCode?.trim() || null;
  const lines = s.lines.map((l) => {
    const rate = l.taxRateBps / 100;
    const gross = l.lineTotalCents;
    const net = s.pricesIncludeTax ? gross / (1 + rate / 100) : gross;
    return { l, rate, net };
  });
  const netTotal = lines.reduce((a, x) => a + x.net, 0);
  // The order discount spread over the lines by their share.
  const discountRatio =
    netTotal > 0 ? Math.min(1, s.discountCents / (s.pricesIncludeTax ? s.subtotalCents : netTotal)) : 0;
  const body = lines.map(({ l, rate, net }) => {
    const prdis = rial(net);
    const fee = Math.round(prdis / l.quantity);
    const dis = Math.round(prdis * discountRatio);
    const adis = prdis - dis;
    const vam = Math.round((adis * rate) / 100);
    return {
      sstid: cfg.serviceId,
      sstt: [l.name, ...l.options].join(" - ").slice(0, 400),
      am: l.quantity,
      mu: cfg.unitCode,
      fee,
      prdis,
      dis,
      adis,
      vra: rate,
      vam,
      tsstam: adis + vam,
    };
  });
  const sum = (k: "prdis" | "dis" | "adis" | "vam") => body.reduce((a, x) => a + x[k], 0);
  const tadis = sum("adis");
  const tvam = sum("vam");
  const tid = taxId(cfg.memoryId, inv.issuedAt, inv.serial);
  return {
    header: {
      taxid: tid,
      indatim: inv.issuedAt.getTime(),
      indati2m: inv.issuedAt.getTime(),
      inty: buyerId ? 1 : 2,
      inno: inv.serial.toString(16).padStart(10, "0"),
      irtaxid: null,
      inp: 1,
      ins: 1,
      tins: cfg.sellerId,
      tob: buyerId ? (buyerId.length === 11 ? 2 : 1) : null,
      bid: buyerId,
      tinb: buyerId,
      tprdis: sum("prdis"),
      tdis: sum("dis"),
      tadis,
      tvam,
      todam: 0,
      tbill: tadis + tvam,
      setm: 1,
      cap: tadis + tvam,
      insp: 0,
      tvop: 0,
    },
    body,
    payments: [],
    extension: null,
  };
}
export type MoadianInvoice = ReturnType<typeof moadianInvoice>;
