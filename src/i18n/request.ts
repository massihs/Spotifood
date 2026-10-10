import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { DEFAULT_LOCALE, isLocale } from "./config";

export default getRequestConfig(async ({ locale }) => {
  let candidate: string | undefined = locale;
  if (!candidate) {
    try {
      candidate = await rootLocale();
    } catch {
      // Not available in server actions / route handlers.
      candidate = undefined;
    }
  }
  const resolved = isLocale(candidate) ? candidate : DEFAULT_LOCALE;
  return {
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
