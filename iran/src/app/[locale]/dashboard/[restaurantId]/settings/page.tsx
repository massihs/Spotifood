import { edition } from "@/config/edition";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Building2, Clock, CreditCard, Percent, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getRestaurantSettingsView } from "@/server/modules/restaurants/settings";
import { getPaymentSettingsView } from "@/server/modules/payments/service";
import {
  LegalForm,
  LogoForm,
  PaymentSettingsForm,
  ProfileForm,
  ServiceForm,
  TaxRates,
} from "./settings-forms";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/settings">["params"];

const COMMON_CURRENCIES = edition.currencies;

export default function SettingsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "restaurant.view");
  const [t, view, payment] = await Promise.all([
    getTranslations("settings"),
    getRestaurantSettingsView(db, ctx),
    getPaymentSettingsView(db, ctx),
  ]);
  const readOnly = !can(ctx, "restaurant.manage");
  const { restaurant: r, settings: s } = view;
  const rid = ctx.restaurant.id;
  const currencies = Array.from(new Set([r.currency, ...COMMON_CURRENCIES]));
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:max-w-6xl">
        <nav
          aria-label={t("title")}
          className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:px-0"
        >
          {SECTIONS.map(({ key, icon }) => (
            <a
              key={key}
              href={`#${key}`}
              className="flex shrink-0 items-center gap-2.5 rounded-full bg-surface px-4 py-2 text-sm font-bold whitespace-nowrap text-fg-muted shadow-[var(--shadow-soft)] hover:text-fg lg:rounded-2xl lg:bg-transparent lg:py-2.5 lg:shadow-none lg:hover:bg-surface [&_svg]:size-4"
            >
              {icon}
              {t(key)}
            </a>
          ))}
        </nav>
        <div className="grid min-w-0 gap-6">
          <Card id="profile" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Building2 />}>{t("profile")}</SectionTitle>}
              description={t("profileHint")}
            />
            <div className="space-y-6 p-5 sm:p-6">
              <LogoForm restaurantId={rid} logoUrl={view.logoUrl} disabled={readOnly} />
              <ProfileForm
                restaurantId={rid}
                disabled={readOnly}
                currencies={currencies}
                timezones={timezones}
                values={{
                  name: r.name,
                  email: r.email,
                  phone: r.phone,
                  addressLine1: r.addressLine1,
                  addressLine2: r.addressLine2,
                  city: r.city,
                  postalCode: r.postalCode,
                  country: r.country,
                  currency: r.currency,
                  timezone: r.timezone,
                  defaultLocale: r.defaultLocale,
                }}
              />
            </div>
          </Card>
          <Card id="service" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Clock />}>{t("service")}</SectionTitle>}
              description={t("serviceHint")}
            />
            <div className="p-5 sm:p-6">
              <ServiceForm
                restaurantId={rid}
                disabled={readOnly}
                values={{
                  orderPrefix: s.orderPrefix,
                  pricesIncludeTax: s.pricesIncludeTax,
                  sessionAutoCloseMinutes: s.sessionAutoCloseMinutes,
                  enabledLocales: s.enabledLocales,
                  openingHours: s.openingHours,
                }}
              />
            </div>
          </Card>
          <Card id="payments" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<CreditCard />}>{t("payments")}</SectionTitle>}
              description={t("paymentsHint")}
            />
            <div className="p-5 sm:p-6">
              <PaymentSettingsForm restaurantId={rid} disabled={readOnly} values={payment} />
            </div>
          </Card>
          <Card id="taxes" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Percent />}>{t("taxes")}</SectionTitle>}
              description={t("taxesHint")}
            />
            <div className="p-5 sm:p-6">
              <TaxRates
                restaurantId={rid}
                disabled={readOnly}
                rates={view.taxRates.map((x) => ({
                  id: x.id,
                  name: x.name,
                  rateBps: x.rateBps,
                  isDefault: x.isDefault,
                }))}
              />
            </div>
          </Card>
          <Card id="legal" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Scale />}>{t("legal")}</SectionTitle>}
              description={t("legalHint")}
            />
            <div className="p-5 sm:p-6">
              <LegalForm
                restaurantId={rid}
                disabled={readOnly}
                values={{
                  legalName: s.legalName,
                  legalId: s.legalId,
                  vatNumber: s.vatNumber,
                  registrationNumber: s.registrationNumber,
                  legalNotice: s.legalNotice,
                  privacyPolicyUrl: s.privacyPolicyUrl,
                }}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

const SECTIONS = [
  { key: "profile", icon: <Building2 aria-hidden="true" /> },
  { key: "service", icon: <Clock aria-hidden="true" /> },
  { key: "payments", icon: <CreditCard aria-hidden="true" /> },
  { key: "taxes", icon: <Percent aria-hidden="true" /> },
  { key: "legal", icon: <Scale aria-hidden="true" /> },
] as const;

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="grid size-9 place-items-center rounded-xl bg-ink text-accent [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      {children}
    </span>
  );
}
