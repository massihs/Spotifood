import type { ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { CLIENT_NAMESPACES, type ClientArea } from "./client-namespaces";

/** Only the namespaces the area's client components use (see scripts/i18n-areas.ts). */
export function pickMessages(messages: AbstractIntlMessages, area: ClientArea): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const ns of CLIENT_NAMESPACES[area]) {
    const value = messages[ns];
    if (value !== undefined) out[ns] = value;
  }
  return out;
}

/**
 * Hands the client components below the messages of their part of the site, instead of the whole
 * dictionary on every page (≈ 170 KB of JSON in each HTML response before).
 */
export async function AreaMessages({ area, children }: { area: ClientArea; children: ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, area)}>
      {children}
    </NextIntlClientProvider>
  );
}
