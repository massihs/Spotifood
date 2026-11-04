import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { jobHome, type Job } from "@/lib/jobs";
import { getCurrentUser } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { staffLinkInfo } from "@/server/modules/team/jobs";
import { listUserRestaurants } from "@/server/tenancy";
import { JOB_TONES } from "../../dashboard/[restaurantId]/team/job-meta";
import { TeamIcon } from "../../dashboard/[restaurantId]/team/team-icon";
import { LoginForm } from "../../(auth)/auth-forms";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { robots: { index: false } };

/**
 * A team job's own sign-in link (kitchen, waiters, front desk…): staff bookmark it on their device,
 * sign in once and land straight on their screen. Already signed in to this venue: no form at all.
 */
export default function StaffLinkPage({ params }: PageProps<"/[locale]/staff/[jobId]">) {
  return (
    <div className="min-h-dvh bg-bg px-5">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-md pt-2 pb-16">
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-float)] sm:p-8">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
            <StaffLink params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function StaffLink({ params }: { params: PageProps<"/[locale]/staff/[jobId]">["params"] }) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);
  const info = await staffLinkInfo(db, jobId);
  if (!info) notFound();
  const home = jobHome(info.kind, info.baseJob);
  const target = `/dashboard/${info.restaurantId}${home ? `/${home}` : ""}`;

  const user = await getCurrentUser();
  const isMember = user
    ? (await listUserRestaurants(db, user.id)).some((r) => r.id === info.restaurantId)
    : false;
  if (isMember) redirect({ href: target, locale: await getLocale() });

  const t = await getTranslations("auth.staff");
  const logo = logoUrl(info.logoKey);
  return (
    <div data-brand={info.brandColor}>
      <div className="flex items-center gap-3">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="size-14 shrink-0 rounded-2xl bg-surface object-contain p-1 ring-1 ring-border"
          />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg-muted">{info.restaurantName}</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                JOB_TONES[info.baseJob as Job],
              )}
            >
              <TeamIcon name={info.icon} className="size-5" />
            </span>
            <span className="truncate">{info.jobName}</span>
          </h1>
        </div>
      </div>
      <p className="mt-4 text-fg-muted">{t("subtitle", { job: info.jobName })}</p>
      {user ? (
        <p role="status" className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-sm">
          {t("otherAccount", { email: user.email })}
        </p>
      ) : null}
      <div className="mt-6">
        <LoginForm next={target} />
      </div>
      <p className="mt-6 text-center text-xs text-fg-subtle">{t("bookmark")}</p>
    </div>
  );
}
