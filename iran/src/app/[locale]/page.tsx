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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0b0b]/90 text-white backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="[&_.text-fg]:text-white">
            <Logo className="text-white" />
          </span>
          <nav className="ms-6 hidden items-center gap-6 text-sm font-medium text-white/70 md:flex">
            <a href="#how" className="hover:text-white">
              {t("nav.how")}
            </a>
            <a href="#features" className="hover:text-white">
              {t("nav.features")}
            </a>
            <a href="#faq" className="hover:text-white">
              {t("nav.faq")}
            </a>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher tone="inverted" className="hidden sm:inline-flex" />
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-full px-4 text-sm font-semibold text-white/80 hover:text-white sm:inline-flex"
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
        <section className="relative overflow-hidden bg-[#0b0b0b] text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-40 -top-40 size-[34rem] rounded-full bg-accent/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -start-40 bottom-0 size-96 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20 lg:pb-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                <span className="size-1.5 rounded-full bg-accent" />
                {t("badge")}
              </span>
              <h1 className="mt-6 text-4xl leading-[1.15] font-black tracking-tight text-balance sm:text-6xl">
                {t("title")}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-white/70">{t("subtitle")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className={buttonClasses("accent", "xl", "px-8")}>
                  {t("ctaPrimary")}
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-14 items-center rounded-full border border-white/20 px-8 font-semibold text-white hover:bg-white/10"
                >
                  {t("ctaSecondary")}
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
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
                <p className="text-2xl font-black tracking-tight sm:text-3xl">{t(`stats.${k}.value`)}</p>
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
              <li key={key} className="relative rounded-3xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-ink text-accent">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="text-5xl font-black text-surface-3">{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-extrabold">{t(`steps.${key}.title`)}</h3>
                <p className="mt-2 leading-7 text-fg-muted">{t(`steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Features ────────────────────────────────────── */}
        <section id="features" className="scroll-mt-20 bg-surface-2">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionTitle title={t("featuresTitle")} subtitle={t("featuresSubtitle")} />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ key, Icon }) => (
                <li key={key} className="rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)]">
                  <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-extrabold">{t(`features.${key}.title`)}</h3>
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
            className="bg-[#0b0b0b] text-white [&_p]:text-white/75"
          />
        </section>

        {/* ── Showcase ────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="overflow-hidden rounded-[2rem] bg-surface-2">
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
            <p className="px-6 py-5 text-center font-semibold">{t("showcase")}</p>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────── */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <SectionTitle title={t("faqTitle")} />
          <div className="mt-10 divide-y divide-border rounded-3xl border border-border bg-surface">
            {FAQ.map((k) => (
              <details key={k} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
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
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#0b0b0b] px-6 py-16 text-center text-white sm:px-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl"
            />
            <h2 className="relative text-3xl font-black tracking-tight text-balance sm:text-4xl">
              {t("finalTitle")}
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl leading-8 text-white/70">{t("finalBody")}</p>
            <Link href="/signup" className={buttonClasses("accent", "xl", "relative mt-8 px-10")}>
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
      <h2 className="text-3xl font-black tracking-tight text-balance sm:text-4xl">{title}</h2>
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
    <div className={cn("rounded-[2rem] p-8", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-2xl font-black">{title}</h3>
      <ul className="mt-5 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3">
            <Check className="mt-1 size-5 shrink-0 text-accent" strokeWidth={3} aria-hidden="true" />
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
      <div className="rounded-[2.75rem] border border-white/15 bg-[#1a1a1a] p-2.5 shadow-2xl shadow-black/60">
        <div className="overflow-hidden rounded-[2.25rem] bg-white text-[#141414]" dir="rtl">
          <div className="bg-[#0b0b0b] px-4 pt-5 pb-8 text-white">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center overflow-hidden rounded-xl bg-white">
                <img src="/landing/logo-brielle.png" alt="" className="size-full object-contain p-0.5" />
              </div>
              <div>
                <p className="text-lg font-black">Brielle</p>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
                  {table}
                </span>
              </div>
            </div>
          </div>
          <div className="-mt-4 rounded-t-3xl bg-white px-4 pt-4 pb-3">
            <div className="h-9 rounded-full bg-[#f3f3f3]" />
            <p className="mt-4 text-sm font-black">{featured}</p>
            <div className="mt-2 space-y-3">
              {MOCK.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{d.name}</p>
                    <p className="text-[12px] font-semibold text-[#555]">{d.price} تومان</p>
                  </div>
                  <div className="relative">
                    <img src={d.img} alt="" className="size-16 rounded-xl bg-[#f3f3f3] object-cover" />
                    <span className="absolute -end-1 -bottom-1 grid size-6 place-items-center rounded-full bg-white text-sm font-black shadow">
                      +
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-11 items-center gap-2 rounded-full bg-[#0b0b0b] ps-1.5 pe-4 text-[13px] font-bold text-white">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-fg">
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
