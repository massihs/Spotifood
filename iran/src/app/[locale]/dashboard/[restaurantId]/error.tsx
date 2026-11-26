"use client";

import { RotateCcw, TriangleAlert } from "@/components/icons";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";

/** A page of the dashboard failed: the menu stays, the page offers to try again. */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errors");
  const { restaurantId } = useParams<{ restaurantId: string }>();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-10 max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-[var(--shadow-soft)]">
      <span className="kashi-tile mx-auto grid size-14 place-items-center bg-danger-soft text-danger">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-xl font-bold">{t("errorTitle")}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t("errorBodyDashboard")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={retry} className={buttonClasses("primary", "md")}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("retry")}
        </button>
        <Link href={`/dashboard/${restaurantId}`} className={buttonClasses("secondary", "md")}>
          {t("overview")}
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-xs text-fg-subtle" dir="ltr">
          {t("reference")}: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
