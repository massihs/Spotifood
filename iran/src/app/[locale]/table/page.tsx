import { Suspense } from "react";
import { menuThemeOf } from "@/lib/menu-themes";
import { NowPlaying } from "@/components/guest/now-playing";
import { hasActiveMusic, restaurantNowPlaying } from "@/server/modules/music/service";
import { getGuest } from "@/server/modules/guest/current";
import { db } from "@/server/db/client";
import { getCartView } from "@/server/modules/cart/service";
import { listGuestOrders } from "@/server/modules/orders/service";
import { getPopularProductIds, getPublicMenu } from "@/server/modules/menu/public-cache";
import { getStorefront } from "@/server/modules/guest/storefront";
import { MenuApp } from "@/components/guest/menu-app";
import { GuestHeader } from "@/components/guest/guest-header";
import { SessionExpired, GuestSkeleton } from "@/components/guest/states";
import { LiveProvider, LiveRefresh } from "@/components/realtime/live";

/** The guest cookie is per request: the page streams behind its own boundary (instant navigations). */
export default function GuestMenuPage() {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <GuestMenu />
    </Suspense>
  );
}

async function GuestMenu() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  // Menu comes from the tag-invalidated cache; the cart is always read live.
  const [menu, cart, orders, music, popularIds, store] = await Promise.all([
    getPublicMenu(guest.restaurant.id),
    getCartView(db, guest),
    listGuestOrders(db, guest),
    hasActiveMusic(db, guest.restaurant.id),
    getPopularProductIds(guest.restaurant.id),
    getStorefront(db, guest.restaurant.id),
  ]);
  const byProduct: Record<string, number> = {};
  for (const l of cart.lines) byProduct[l.productId] = (byProduct[l.productId] ?? 0) + l.quantity;
  const playing = music ? await restaurantNowPlaying(db, guest.restaurant.id) : null;
  // Cover: the first featured dish with a photo, else any dish with a photo.
  const dishes = Object.values(menu.products);
  const cover =
    (dishes.find((p) => p.isFeatured && p.images[0]) ?? dishes.find((p) => p.images[0]))?.images[0] ?? null;
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <div data-brand={guest.restaurant.brandColor} className="contents">
        <div data-menu-theme={menuThemeOf(guest.restaurant.menuTheme)}>
          <LiveRefresh types={["session.closed"]} />
          <MenuApp
            menu={menu}
            currency={guest.restaurant.currency}
            initialCart={{ itemCount: cart.itemCount, totalCents: cart.totals.totalCents, byProduct }}
            popularIds={popularIds}
            restaurantName={guest.restaurant.name}
            tableLabel={guest.table.label}
            theme={menuThemeOf(guest.restaurant.menuTheme)}
            shortPrices={guest.restaurant.menuShortPrices}
            header={
              <>
                <GuestHeader guest={guest} orderCount={orders.length} cover={cover} store={store} />
                {music ? <NowPlaying initial={playing} restaurantName={guest.restaurant.name} /> : null}
              </>
            }
          />
        </div>
      </div>
    </LiveProvider>
  );
}
