/**
 * Which message namespaces each part of the site needs in the browser.
 *
 * Every page used to ship all translations (~170 KB of JSON) to the browser, although client
 * components only use a fraction of them. This walks the import graph from the route files of
 * each area, keeps the code that runs in the browser ("use client" files and everything they
 * import) and collects the namespaces it uses: `useTranslations("ns")` and any "ns.key" literal
 * (keys built at runtime, such as `errorCodes.${code}`, keep their literal prefix).
 *
 *   npx tsx scripts/i18n-areas.ts --write   regenerates src/i18n/client-namespaces.ts
 *   tests/unit/i18n-areas.test.ts           fails when a component needs a namespace not listed
 */
import fs from "node:fs";
import path from "node:path";

/** Route entries of src/app/[locale] served by each area's NextIntlClientProvider. */
export const AREA_ROUTES = {
  // The root layout: public site, sign-in, and anything without its own provider.
  site: [
    "layout.tsx",
    "page.tsx",
    "not-found.tsx",
    "[...rest]",
    "(auth)",
    "pricing",
    "restaurants",
    "radio",
    "demo",
    "staff",
    "t",
    "invoice",
    "print",
  ],
  table: ["table"],
  online: ["r"],
  kiosk: ["kiosk"],
  feedback: ["f"],
  pay: ["pay"],
  account: ["account"],
  dashboard: ["dashboard"],
  admin: ["admin"],
} as const;
export type ClientArea = keyof typeof AREA_ROUTES;

const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

export function computeAreas(root: string) {
  const src = path.join(root, "src");
  const messages = JSON.parse(fs.readFileSync(path.join(root, "messages/fa.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const known = new Set(Object.keys(messages));
  // "ns.key…" or a template prefix `ns.${…}`; the key must exist, so permission names such as
  // "orders.view" or paths are not mistaken for translations.
  const literalRe = new RegExp(`["'\`](${[...known].join("|")})\\.(\\$\\{|[A-Za-z]\\w*)`, "g");
  const isKey = (ns: string, first: string) =>
    first === "${" || Object.hasOwn((messages[ns] ?? {}) as object, first);

  const resolve = (spec: string, from: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    else return null;
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    for (const e of EXTS) if (fs.existsSync(base + e)) return base + e;
    return null;
  };

  const cache = new Map<string, { client: boolean; deps: string[]; ns: Set<string> }>();
  const info = (file: string) => {
    const hit = cache.get(file);
    if (hit) return hit;
    const text = fs.readFileSync(file, "utf8");
    const deps: string[] = [];
    for (const m of text.matchAll(IMPORT_RE)) {
      if (/^import\s+type\s/.test(m[0])) continue; // types never reach the browser
      const r = resolve(m[1] ?? m[2]!, file);
      if (r) deps.push(r);
    }
    const ns = new Set<string>();
    for (const m of text.matchAll(/useTranslations\(\s*["']([\w.]+)["']/g)) ns.add(m[1]!.split(".")[0]!);
    for (const m of text.matchAll(literalRe)) if (isKey(m[1]!, m[2]!)) ns.add(m[1]!);
    const entry = { client: /^\s*["']use client["']/.test(text), deps, ns };
    cache.set(file, entry);
    return entry;
  };

  /** Namespaces used by the browser code reachable from these route files. */
  const reach = (starts: string[]) => {
    const out = new Set<string>();
    const seen = new Set<string>();
    const stack: [string, boolean][] = starts.map((f) => [f, false]);
    while (stack.length) {
      const [file, inClient] = stack.pop()!;
      const key = `${file}|${inClient}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const i = info(file);
      // Anything a client module imports runs in the browser too, directive or not.
      const client = inClient || i.client;
      if (client) for (const n of i.ns) out.add(n);
      for (const d of i.deps) stack.push([d, client]);
    }
    return [...out].filter((n) => known.has(n)).sort();
  };

  const app = path.join(src, "app/[locale]");
  const filesOf = (entry: string): string[] => {
    const p = path.join(app, entry);
    if (!fs.existsSync(p)) return [];
    if (fs.statSync(p).isFile()) return [p];
    return fs
      .readdirSync(p, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
      .map((d) => path.join(d.parentPath, d.name));
  };

  const areas = {} as Record<ClientArea, string[]>;
  for (const [area, entries] of Object.entries(AREA_ROUTES) as [ClientArea, readonly string[]][])
    areas[area] = reach(entries.flatMap(filesOf));

  // Every route folder must belong to an area, or its pages would miss their messages.
  const assigned = new Set(Object.values(AREA_ROUTES).flat() as string[]);
  const unassigned = fs
    .readdirSync(app, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !assigned.has(d.name))
    .map((d) => d.name);
  return { areas, unassigned };
}

if (process.argv[1] && /i18n-areas\.ts$/.test(process.argv[1])) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const { areas, unassigned } = computeAreas(root);
  if (unassigned.length) {
    console.error(`Route folders without an area: ${unassigned.join(", ")} (add them to AREA_ROUTES)`);
    process.exit(1);
  }
  const body = (Object.entries(areas) as [string, string[]][])
    .map(([a, ns]) => `  ${a}: [${ns.map((n) => JSON.stringify(n)).join(", ")}],`)
    .join("\n");
  const out = `// Generated by \`npx tsx scripts/i18n-areas.ts --write\`; checked by tests/unit/i18n-areas.test.ts.
/**
 * Message namespaces sent to the browser by each part of the site (see scripts/i18n-areas.ts).
 * Server components read every message on the server; only client components need these.
 */
export const CLIENT_NAMESPACES = {
${body}
} as const satisfies Record<string, readonly string[]>;

export type ClientArea = keyof typeof CLIENT_NAMESPACES;
`;
  if (process.argv.includes("--write")) {
    fs.writeFileSync(path.join(root, "src/i18n/client-namespaces.ts"), out);
    console.log("src/i18n/client-namespaces.ts updated");
  } else console.log(out);
}
