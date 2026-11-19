/**
 * A menu taken from the restaurant's own Snappfood page (or another platform's export): the link
 * gives the vendor code, Snappfood's public API gives categories, dishes, prices and descriptions,
 * and the result becomes the same spreadsheet the menu import already previews and applies.
 * A JSON copied from the page can be pasted instead when the server cannot reach Snappfood.
 */

/** `price` as the platform gives it (its unit is checked on the preview: tomans, or rials ÷ 10). */
export type ScrapedItem = {
  category: string;
  name: string;
  price: number | null;
  description: string | null;
};

/** "https://snappfood.ir/restaurant/menu/کافه-r-0x9a2b/" → "0x9a2b" (also ?vendorCode=…). */
export function vendorCodeFromUrl(raw: string) {
  const s = decodeURIComponent(raw.trim());
  const q = /[?&]vendorCode=([a-z0-9]{3,12})/i.exec(s);
  if (q) return q[1]!.toLowerCase();
  const m = /-r-([a-z0-9]{3,12})\/?(?:[?#].*)?$/i.exec(s);
  return m ? m[1]!.toLowerCase() : null;
}

const SNAPPFOOD_API = "https://snappfood.ir/mobile/v2/restaurant/details/dynamic";

export async function fetchSnappfoodMenu(vendorCode: string, f: typeof fetch = fetch) {
  const qs = new URLSearchParams({
    lat: "35.715",
    long: "51.404",
    optionalClient: "WEBSITE",
    client: "WEBSITE",
    deviceType: "WEBSITE",
    appVersion: "8.1.1",
    vendorCode,
    show_party: "1",
    fetch_static_data: "1",
  });
  const res = await f(`${SNAPPFOOD_API}?${qs}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`snappfood ${res.status}`);
  return parseSnappfoodMenu(await res.json());
}

type Node = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && /^\d+$/.test(v)
      ? Number(v)
      : null;

/**
 * Reads the menus whatever their exact shape: a list of sections ({category|title|name,
 * products|items|foods: [...]}) somewhere in the answer, each dish with a title/name, a price
 * (or its first variation's price) and a description.
 */
export function parseSnappfoodMenu(json: unknown): ScrapedItem[] {
  const sections: Node[] = [];
  const seen = new Set<unknown>();
  const walk = (n: unknown, depth: number) => {
    if (!n || typeof n !== "object" || seen.has(n) || depth > 8) return;
    seen.add(n);
    if (Array.isArray(n)) {
      for (const x of n) walk(x, depth + 1);
      return;
    }
    const o = n as Node;
    const list = (o.products ?? o.items ?? o.foods) as unknown;
    if (
      Array.isArray(list) &&
      list.some((p) => p && typeof p === "object" && (str((p as Node).title) || str((p as Node).name)))
    )
      sections.push(o);
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(json, 0);
  const out: ScrapedItem[] = [];
  const keys = new Set<string>();
  for (const s of sections) {
    const category = (str(s.category) || str(s.title) || str(s.name) || "منو").slice(0, 80);
    for (const p of (s.products ?? s.items ?? s.foods) as Node[]) {
      if (!p || typeof p !== "object") continue;
      const name = (str(p.title) || str(p.name)).slice(0, 120);
      if (!name) continue;
      const variation = Array.isArray(p.productVariations)
        ? (p.productVariations[0] as Node | undefined)
        : undefined;
      const price = num(p.price) ?? num(variation?.price) ?? null;
      const key = `${category}\n${name}`;
      if (keys.has(key)) continue;
      keys.add(key);
      out.push({
        category,
        name,
        price,
        description: (str(p.description) || str(p.ingredients)).slice(0, 1000) || null,
      });
    }
  }
  return out;
}

/**
 * The items as the menu import's spreadsheet (category, name, price, description); prices in the
 * restaurant's display unit (tomans), divided by ten when the platform gave rials.
 */
export function itemsToCsv(items: ScrapedItem[], divideBy10: boolean) {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = items.map((i) =>
    [
      i.category,
      i.name,
      i.price == null ? "" : String(divideBy10 ? Math.round(i.price / 10) : i.price),
      i.description ?? "",
    ]
      .map(cell)
      .join(","),
  );
  return ["category,name,price,description", ...rows].join("\r\n");
}
