import { getGuest } from "@/server/modules/guest/current";
import { db } from "@/server/db/client";
import { getCartView } from "@/server/modules/cart/service";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { MenuApp } from "@/components/guest/menu-app";
import { GuestHeader } from "@/components/guest/guest-header";
import { SessionExpired } from "@/components/guest/states";

export default async function GuestMenuPage() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  // Menu comes from the tag-invalidated cache; the cart is always read live.
  const [menu, cart] = await Promise.all([getPublicMenu(guest.restaurant.id), getCartView(db, guest)]);
  return (
    <MenuApp
      menu={menu}
      currency={guest.restaurant.currency}
      initialCart={{ itemCount: cart.itemCount, totalCents: cart.totals.totalCents }}
      header={<GuestHeader guest={guest} />}
    />
  );
}
