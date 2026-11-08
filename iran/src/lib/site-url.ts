import { DEFAULT_LOCALE } from "@/i18n/config";

/** Public address of a page: the default language has no prefix ("/r/x"), the others do ("/en/r/x"). */
export function pageUrl(base: string, locale: string, path = "") {
  const root = base.replace(/\/$/, "");
  return locale === DEFAULT_LOCALE ? `${root}${path || "/"}` : `${root}/${locale}${path}`;
}

/** Search engines need absolute addresses (our files are served from relative paths). */
export function absoluteUrl(base: string, url: string) {
  if (/^https?:\/\//.test(url)) return url;
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}
