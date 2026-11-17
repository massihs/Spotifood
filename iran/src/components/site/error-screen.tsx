"use client";

import { ArrowLeft, Home, RotateCcw, SearchX, UtensilsCrossed } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

/**
 * Full-page "page not found" / "something went wrong", in the brand's look: the logo, a plate
 * that has gone astray, what happened in one line, and the ways out (try again, back, home).
 */
export function ErrorScreen({
  kind,
  digest,
  onRetry,
}: {
  kind: "notFound" | "error";
  digest?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("errors");
  const Icon = kind === "notFound" ? SearchX : UtensilsCrossed;
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg px-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
      />
      <header className="relative mx-auto w-full max-w-lg py-6">
        <Link href="/" aria-label="Spotifood" className="inline-block">
          <Logo />
        </Link>
      </header>
      <main className="relative mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center pb-24 text-center">
        <div className="relative">
          <span
            className="absolute inset-0 -m-6 rounded-full border border-dashed border-accent/30"
            aria-hidden="true"
          />
          <span
            className="absolute inset-0 -m-12 rounded-full border border-dashed border-accent/15"
            aria-hidden="true"
          />
          <span className="relative grid size-24 place-items-center rounded-[2rem] bg-surface text-accent shadow-[var(--shadow-float)] ring-1 ring-border">
            <Icon className="size-11" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-12 text-sm font-bold tracking-widest text-accent-text tabular-nums">
          {kind === "notFound" ? "404" : t("errorCode")}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-balance sm:text-4xl">
          {kind === "notFound" ? t("notFoundTitle") : t("errorTitle")}
        </h1>
        <p className="mt-3 max-w-sm text-pretty text-fg-muted">
          {kind === "notFound" ? t("notFoundBody") : t("errorBody")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <button type="button" onClick={onRetry} className={buttonClasses("primary", "lg")}>
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("retry")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => history.back()}
            className={buttonClasses(onRetry ? "secondary" : "primary", "lg")}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            {t("back")}
          </button>
          <Link href="/" className={cn(buttonClasses("ghost", "lg"))}>
            <Home className="size-4" aria-hidden="true" />
            {t("home")}
          </Link>
        </div>
        {digest ? (
          <p className="mt-8 text-xs text-fg-subtle" dir="ltr">
            {t("reference")}: {digest}
          </p>
        ) : null}
      </main>
    </div>
  );
}
