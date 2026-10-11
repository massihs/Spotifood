import { getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { getGuest } from "@/server/modules/guest/current";
import { getCartView } from "@/server/modules/cart/service";
import { listGuestOrders } from "@/server/modules/orders/service";
import { CartView } from "@/components/guest/cart-view";
import { SessionExpired } from "@/components/guest/states";

export default async function GuestCartPage() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  const [t, cart, orders] = await Promise.all([
    getTranslations("guest"),
    getCartView(db, guest),
    listGuestOrders(db, guest),
  ]);
  return (
    <CartView
      lines={cart.lines}
      totals={cart.totals}
      currency={guest.restaurant.currency}
      pricesIncludeTax={guest.restaurant.pricesIncludeTax}
      seatLabel={t("you", { n: guest.participant.seq })}
      displayName={guest.participant.displayName}
      hasIssues={cart.hasIssues}
      orderCount={orders.length}
    />
  );
}
