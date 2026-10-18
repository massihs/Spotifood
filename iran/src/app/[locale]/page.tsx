import {
  BarChart3,
  Check,
  ChefHat,
  ChevronDown,
  Languages,
  QrCode,
  ReceiptText,
  ShoppingBag,
  Smartphone,
  SquareMenu,
  Users,
  UsersRound,
  Wallet,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

const STEPS = [
  { key: "menu", Icon: SquareMenu },
  { key: "qr", Icon: QrCode },
  { key: "serve", Icon: ChefHat },
] as const;

const FEATURES = [
  { key: "qr", Icon: QrCode },
  { key: "split", Icon: UsersRound },
  { key: "live", Icon: Zap },
  { key: "pay", Icon: Wallet },
  { key: "invoice", Icon: ReceiptText },
  { key: "langs", Icon: Languages },
  { key: "team", Icon: Users },
  { key: "insights", Icon: BarChart3 },
] as const;

const STATS = ["setup", "app", "langs", "live"] as const;
const FAQ = ["app", "pay", "cash", "hardware", "menu"] as const;

/** Mock dishes shown in the phone preview (Brielle's real photos). */
const MOCK = [
  { img: "/landing/salmon.jpg", name: "بشقاب سالمون", price: "۲٬۴۰۰٬۰۰۰" },
  { img: "/landing/rockshrimp.jpg", name: "راک شریمپ", price: "۱٬۳۱۹٬۰۰۰" },
  { img: "/landing/baconavocado.jpg", name: "سالاد بیکن و آووکادو", price: "۱٬۲۰۰٬۰۰۰" },
];

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const guestPoints = t.raw("split.guest") as string[];
  const ownerPoints = t.raw("split.owner") as string[];

  return (
    <div className="min-h-dvh bg-bg">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <nav className="ms-6 hidden items-center gap-6 text-sm font-medium text-fg-muted md:flex">
            <a href="#how" className="hover:text-fg">
              {t("nav.how")}
            </a>
            <a href="#features" className="hover:text-fg">
              {t("nav.features")}
            </a>
            <a href="#faq" className="hover:text-fg">
              {t("nav.faq")}
            </a>
            <Link href="/radio" className="hover:text-fg">
              {t("nav.radio")}
            </Link>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-full px-4 text-sm font-medium text-fg-muted hover:text-fg sm:inline-flex"
            >
              {t("ctaSecondary")}
            </Link>
            <Link href="/signup" className={buttonClasses("accent", "sm", "h-9 px-4")}>
              {t("ctaPrimary")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft/70 to-bg">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-40 -top-40 size-[34rem] rounded-full bg-accent/15 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20 lg:pb-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-fg-muted ring-1 ring-border">
                <span className="size-1.5 rounded-full bg-accent" />
                {t("badge")}
              </span>
              <h1 className="mt-6 text-4xl leading-[1.2] font-bold tracking-tight text-balance sm:text-[3.4rem]">
                {t("title")}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-fg-muted">{t("subtitle")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className={buttonClasses("primary", "lg", "px-7")}>
                  {t("ctaPrimary")}
                </Link>
                <Link href="/login" className={buttonClasses("secondary", "lg", "px-7")}>
                  {t("ctaSecondary")}
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted">
                {(["noApp", "zarinpal", "invoice"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <Check className="size-4 text-accent" strokeWidth={3} aria-hidden="true" />
                    {t(`trust.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
            <PhoneMock table={t("mock.table")} featured={t("mock.featured")} cart={t("mock.cart")} />
          </div>
        </section>

        {/* ── Stats strip ─────────────────────────────────── */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {STATS.map((k) => (
              <div key={k} className="bg-bg px-4 py-7 text-center sm:px-6">
                <p className="text-2xl font-semibold tracking-tight">{t(`stats.${k}.value`)}</p>
                <p className="mt-1 text-sm text-fg-muted">{t(`stats.${k}.label`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionTitle title={t("howTitle")} subtitle={t("howSubtitle")} />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ key, Icon }, i) => (
              <li key={key} className="relative rounded-2xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-fg-subtle tabular-nums">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
                <p className="mt-2 leading-7 text-fg-muted">{t(`steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Features ────────────────────────────────────── */}
        <section id="features" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionTitle title={t("featuresTitle")} subtitle={t("featuresSubtitle")} />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ key, Icon }) => (
                <li key={key} className="rounded-2xl border border-border bg-bg p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">{t(`features.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-fg-muted">{t(`features.${key}.body`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Guests vs restaurants ───────────────────────── */}
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-20 sm:px-6 md:grid-cols-2">
          <BenefitCard
            title={t("split.guestTitle")}
            points={guestPoints}
            Icon={Smartphone}
            className="border border-border bg-surface"
          />
          <BenefitCard
            title={t("split.ownerTitle")}
            points={ownerPoints}
            Icon={ChefHat}
            className="border border-accent/20 bg-accent-soft"
          />
        </section>

        {/* ── Showcase ────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {["salmon", "pepperoni", "baconavocado", "rockshrimp"].map((n) => (
                <img
                  key={n}
                  src={`/landing/${n}.jpg`}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              ))}
            </div>
            <p className="px-6 py-5 text-center font-medium text-fg-muted">{t("showcase")}</p>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────── */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <SectionTitle title={t("faqTitle")} />
          <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-surface">
            {FAQ.map((k) => (
              <details key={k} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {t(`faq.${k}.q`)}
                  <ChevronDown
                    className="size-5 shrink-0 text-fg-muted transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 leading-7 text-fg-muted">{t(`faq.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────── */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-accent px-6 py-16 text-center text-accent-fg sm:px-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-white/20 blur-3xl"
            />
            <h2 className="relative text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              {t("finalTitle")}
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl leading-8 opacity-85">{t("finalBody")}</p>
            <Link
              href="/signup"
              className="relative mt-8 inline-flex h-12 items-center rounded-full bg-white px-8 font-semibold text-accent-text shadow-[var(--shadow-soft)] hover:bg-white/90"
            >
              {t("ctaPrimary")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-fg-muted sm:px-6">
          <Logo />
          <p>{t("footer.rights")}</p>
          <nav className="flex items-center gap-4">
            <Link href="/login" className="hover:text-fg">
              {t("footer.login")}
            </Link>
            <Link href="/signup" className="hover:text-fg">
              {t("footer.signup")}
            </Link>
            <LanguageSwitcher />
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-lg text-fg-muted">{subtitle}</p> : null}
    </div>
  );
}

function BenefitCard({
  title,
  points,
  Icon,
  className,
}: {
  title: string;
  points: string[];
  Icon: typeof Smartphone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl p-8", className)}>
      <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-fg">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-xl font-semibold">{title}</h3>
      <ul className="mt-5 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3">
            <Check className="mt-1 size-4 shrink-0 text-accent" strokeWidth={3} aria-hidden="true" />
            <p className="leading-7 text-fg-muted">{p}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Static phone preview of the guest menu (decorative). */
function PhoneMock({ table, featured, cart }: { table: string; featured: string; cart: string }) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[19rem] lg:me-0">
      <div className="rounded-[2.75rem] bg-[#1c1c1e] p-2 shadow-[0_30px_80px_-20px_hsl(265_30%_20%/0.35)]">
        <div className="overflow-hidden rounded-[2.25rem] bg-white text-[#141414]" dir="rtl">
          <div className="bg-gradient-to-b from-[#e9f8ee] to-white px-4 pt-5 pb-8">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                <img src="/landing/logo-brielle.png" alt="" className="size-full object-contain p-0.5" />
              </div>
              <div>
                <p className="text-lg font-bold">Brielle</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ring-1 ring-black/5">
                  {table}
                </span>
              </div>
            </div>
          </div>
          <div className="-mt-4 rounded-t-3xl bg-white px-4 pt-4 pb-3">
            <div className="h-9 rounded-full bg-[#f3f3f3]" />
            <p className="mt-4 text-sm font-bold">{featured}</p>
            <div className="mt-2 space-y-3">
              {MOCK.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{d.name}</p>
                    <p className="text-[12px] font-semibold text-[#555]">{d.price} تومان</p>
                  </div>
                  <div className="relative">
                    <img src={d.img} alt="" className="size-16 rounded-xl bg-[#f3f3f3] object-cover" />
                    <span className="absolute -end-1 -bottom-1 grid size-6 place-items-center rounded-full bg-white text-sm font-bold shadow">
                      +
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-11 items-center gap-2 rounded-full bg-accent ps-1.5 pe-4 text-[13px] font-bold text-white">
              <span className="grid size-8 place-items-center rounded-full bg-white/20">
                <ShoppingBag className="size-4" />
              </span>
              <span className="flex-1">{cart}</span>
              <span>۳٬۶۰۰٬۰۰۰</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
