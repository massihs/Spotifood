import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/server/db/client";
import { menuThemeOf } from "@/lib/menu-themes";
import { getPopularProductIds, getPublicMenu } from "@/server/modules/menu/public-cache";
import { getKioskStore } from "@/server/modules/online/service";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { OrderApp } from "../../r/[slug]/order/order-app";

type Props = PageProps<"/[locale]/kiosk/[token]">;

/** The counter tablet's page: its link is the credential, never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function KioskPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse bg-surface-2" />}>
      <Kiosk params={params} />
    </Suspense>
  );
}

async function Kiosk({ params }: Pick<Props, "params">) {
  const { token } = await params;
  const store = await getKioskStore(db, token);
  if (!store) notFound();
  const [menu, popularIds] = await Promise.all([getPublicMenu(store.id), getPopularProductIds(store.id)]);
  const theme = menuThemeOf(store.menuTheme);
  return (
    <div data-brand={store.brandColor} data-menu-theme={theme} className="min-h-dvh bg-bg">
      {/* Full width on the counter's tablet: the menu, and the order panel beside it in landscape. */}
      <main className="relative mx-auto max-w-[100rem]">
        <OrderApp
          kioskToken={token}
          kioskBrand={{ name: store.name, logo: logoUrl(store.logoKey) }}
          slug={store.slug}
          menu={menu}
          currency={store.currency}
          takeaway
          delivery={false}
          zones={[]}
          signedIn={false}
          hasPhone={false}
          defaultName=""
          popularIds={popularIds}
          theme={theme}
          shortPrices={store.shortPrices}
        />
      </main>
    </div>
  );
}
