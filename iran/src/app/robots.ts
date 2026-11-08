import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { env } from "@/server/env";

/** Private areas and links that carry a token (a table's QR code, a feedback or invoice link). */
const PRIVATE = [
  "/dashboard",
  "/admin",
  "/table",
  "/account",
  "/pay/",
  "/invoice/",
  "/kiosk",
  "/staff",
  "/print/",
  "/t/",
  "/f/",
  "/r/*/o/",
];

/** Search engines: the public site and restaurant pages, never the panels or the guest pages. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection(); // the real site address, not the build machine's
  const base = env().APP_URL.replace(/\/$/, "");
  // Persian pages have no language prefix ("/dashboard"), the others do ("/en/dashboard").
  const prefixes = ["", ...LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((l) => `/${l}`)];
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...prefixes.flatMap((p) => PRIVATE.map((path) => `${p}${path}`))],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
