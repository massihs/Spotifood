import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeft, Briefcase, LogOut } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { isJob, type Job } from "@/lib/jobs";
import { HOTEL_SCREENS } from "@/lib/screens";
import { getCurrentUser } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { staffSpaces } from "@/server/modules/team/pro";
import { JOB_TONES } from "../../dashboard/[restaurantId]/team/job-meta";
import { TeamIcon } from "../../dashboard/[restaurantId]/team/team-icon";
import { LoginForm } from "../auth-forms";
import { proLogoutAction } from "../actions";

export const metadata: Metadata = { title: "Spotifood Pro" };

/**
 * spotifood.ir/pro — the team's entrance: every staff member signs in here and lands on their own
 * dashboard, limited to the screens the owner opened to them (the kitchen on its tickets, the
 * till on its register…). Someone working at several venues picks one.
 */
export default async function ProPage({ params }: PageProps<"/[locale]/pro">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Pro />
    </Suspense>
  );
}

async function Pro() {
  const [t, user] = await Promise.all([getTranslations("auth.pro"), getCurrentUser()]);
  if (!user)
    return (
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-text">
          <Briefcase className="size-3.5" aria-hidden="true" />
          Spotifood Pro
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1.5 text-fg-muted">{t("subtitle")}</p>
        <div className="mt-8">
          <LoginForm next="/pro" />
        </div>
        <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">{t("noAccount")}</p>
        <p className="mt-4 text-center text-sm text-fg-muted">
          <Link href="/login" className="font-medium text-accent-text hover:underline">
            {t("owner")}
          </Link>
        </p>
      </div>
    );

  const spaces = (await staffSpaces(db, user)).filter((s) => !s.suspended);
  // One venue: straight to their own screen.
  if (spaces.length === 1 && !user.isSuperAdmin)
    redirect({ href: spaces[0]!.href, locale: await getLocale() });
  const tj = await getTranslations("team.jobs");
  const tn = await getTranslations("nav");
  const tr = await getTranslations("roles");
  return (
    <div>
      <p className="text-sm font-semibold text-fg-muted">{t("hello", { name: user.fullName })}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("chooseTitle")}</h1>
      {spaces.length ? (
        <ul className="mt-6 space-y-3">
          {spaces.map((s) => {
            const logo = logoUrl(s.logoKey);
            const visible = s.screens?.filter((x) => s.kind === "hotel" || !HOTEL_SCREENS.includes(x));
            return (
              <li key={s.id} data-brand={s.brandColor}>
                <Link
                  href={s.href}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft/30"
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt=""
                      className="size-12 shrink-0 rounded-xl bg-surface object-contain p-1 ring-1 ring-border"
                    />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-lg font-bold text-accent-text">
                      {[...s.name][0]}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                      {isJob(s.job) ? (
                        <span
                          className={cn("grid size-5 place-items-center rounded-md", JOB_TONES[s.job as Job])}
                        >
                          <TeamIcon name={s.jobIcon ?? "users"} className="size-3" />
                        </span>
                      ) : null}
                      {s.jobName ?? (isJob(s.job) ? tj(`${s.job}.name`) : tr(s.role))}
                    </span>
                    <span className="mt-1 block truncate text-xs text-fg-subtle">
                      {visible ? visible.map((x) => tn(x)).join(" · ") : t("allScreens")}
                    </span>
                  </span>
                  <ArrowLeft className="size-5 shrink-0 text-fg-subtle ltr:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 rounded-xl bg-warning-soft px-4 py-3 text-sm">
          {t("noVenue", { email: user.email })}
        </p>
      )}
      {user.isSuperAdmin ? (
        <p className="mt-4 text-center text-sm">
          <Link href="/admin" className="font-medium text-accent-text hover:underline">
            {t("admin")}
          </Link>
        </p>
      ) : null}
      <form action={proLogoutAction} className="mt-6 text-center">
        <button className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
          <LogOut className="size-4" aria-hidden="true" />
          {t("logout")}
        </button>
      </form>
    </div>
  );
}
