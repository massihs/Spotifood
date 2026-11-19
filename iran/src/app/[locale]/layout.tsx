import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { isLocale, localeDirection, LOCALES } from "@/i18n/config";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { pickMessages } from "@/i18n/area-messages";
import "@/styles/globals.css";

// Fonts are self-hosted (no request to Google at build or run time: unreachable from Iran,
// and avoids sending visitors' IPs to a third party). Inter for Latin, Vazirmatn for Persian/Arabic.
const sans = localFont({
  src: "../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-sans-loaded",
  display: "swap",
});
const persian = localFont({
  src: "../../../node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-fa-loaded",
  display: "swap",
  // Its Arial-based fallback would catch the Latin letters before Inter (Persian comes first now).
  adjustFontFallback: false,
  // Font loader options must be literals: not preloaded (≈ 60 KB), fetched as soon as Persian/Arabic
  // text is rendered, with `swap` so text is never invisible.
  preload: false,
});
// Persian digits only (unicode-range 0-9): any number on a Persian page — prices, table labels,
// quantities, order numbers — renders as ۰-۹ whatever produced it, in every weight. Letters come
// from the variable Vazirmatn above (all weights, no synthesised bold).
const persianDigits = localFont({
  src: [
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Thin.woff2",
      weight: "100",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-ExtraLight.woff2",
      weight: "200",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Light.woff2",
      weight: "300",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Regular.woff2",
      weight: "400",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Medium.woff2",
      weight: "500",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-SemiBold.woff2",
      weight: "600",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Bold.woff2",
      weight: "700",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-ExtraBold.woff2",
      weight: "800",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Black.woff2",
      weight: "900",
    },
  ],
  variable: "--font-fa-digits",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0030-0039" }],
  // No metric-adjusted Arial fallback: it has no unicode-range and would take the letters.
  adjustFontFallback: false,
});
// Headings in Persian: Estedad, a modern geometric face that gives titles more character.
const persianDisplay = localFont({
  src: "../../../node_modules/@fontsource-variable/estedad/files/estedad-arabic-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-fa-display",
  display: "swap",
  adjustFontFallback: false,
  preload: false,
});

// Display faces of the guest menu themes (Atelier: Persian serif, Nuit: modern Kufi).
const menuSerif = localFont({
  src: "../../../node_modules/@fontsource-variable/markazi-text/files/markazi-text-arabic-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-menu-serif",
  display: "swap",
  preload: false,
});
const menuKufi = localFont({
  src: "../../../node_modules/@fontsource-variable/reem-kufi/files/reem-kufi-arabic-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-menu-kufi",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Spotifood", template: "%s · Spotifood" },
  applicationName: "Spotifood",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className={`${sans.variable} ${persian.variable} ${persianDigits.variable} ${persianDisplay.variable} ${menuSerif.variable} ${menuKufi.variable}`}
      data-scroll-behavior="smooth"
      // The boot script may set data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {/* The public site's messages; the restaurant panel, admin and guest pages bring their own. */}
        <NextIntlClientProvider locale={locale} messages={pickMessages(messages, "site")}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
