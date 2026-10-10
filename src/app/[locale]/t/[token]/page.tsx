import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import { resolveQrToken } from "@/server/modules/tables/service";
import { logoUrl } from "@/server/modules/restaurants/settings";

// Table links are private: never indexed, never shared in referrers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = PageProps<"/[locale]/t/[token]">;

/**
 * Entry point of every QR code. Phase 4 turns this into the full mobile menu + table session;
 * for now it validates the token and confirms the restaurant and table to the guest.
 */
export default function TableEntryPage({ params }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Suspense fallback={<div className="size-20 animate-pulse rounded-2xl bg-surface-2" />}>
        <Entry params={params} />
      </Suspense>
    </main>
  );
}

async function Entry({ params }: Pick<Props, "params">) {
  const { token } = await params;
  await connection();
  const [t, resolved] = await Promise.all([getTranslations("guest"), resolveQrToken(db, token)]);

  if (!resolved) {
    return (
      <>
        <h1 className="text-xl font-semibold">{t("unavailableTitle")}</h1>
        <p className="mt-2 text-fg-muted">{t("unavailableBody")}</p>
      </>
    );
  }

  const logo = logoUrl(resolved.restaurant.logoKey);
  return (
    <>
      {logo ? <img src={logo} alt="" className="size-20 rounded-2xl object-contain" /> : null}
      <p className="mt-5 text-sm text-fg-muted">{t("welcome")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{resolved.restaurant.name}</h1>
      <p className="mt-3 rounded-full bg-accent-soft px-4 py-1.5 text-sm font-medium text-accent">
        {t("table", { label: resolved.table.label })}
      </p>
      <p className="mt-8 text-fg-muted">{t("menuSoon")}</p>
    </>
  );
}
