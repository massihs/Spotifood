import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { pageUrl } from "@/lib/site-url";
import { env } from "@/server/env";
import { getDirectory } from "@/server/modules/directory/cache";

/**
 * Public pages in every language, with their hreflang alternates: the home page, prices, the
 * restaurant guide and each listed restaurant (its page links to its online ordering, if any).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // read the restaurants at request time, not at build time
  const base = env().APP_URL;
  // The default language has no prefix ("/restaurants"; "/fa/restaurants" redirects there).
  const href = (locale: string, path: string) => pageUrl(base, locale, path);
  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: href(DEFAULT_LOCALE, path),
    priority,
    alternates: {
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [l, href(l, path)])),
        "x-default": href(DEFAULT_LOCALE, path),
      },
    },
  });
  const places = await getDirectory().catch(() => []);
  return [
    entry("", 1),
    entry("/restaurants", 0.9),
    entry("/pricing", 0.7),
    entry("/radio", 0.4),
    ...places.map((p) => entry(`/r/${p.slug}`, 0.8)),
  ];
}
