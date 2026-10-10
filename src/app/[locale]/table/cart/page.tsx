import { getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { getGuest } from "@/server/modules/guest/current";
import { getCartView } from "@/server/modules/cart/service";
import { CartView } from "@/components/guest/cart-view";
import { SessionExpired } from "@/components/guest/states";

export default async function GuestCartPage() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  const [t, cart] = await Promise.all([getTranslations("guest"), getCartView(db, guest)]);
  return (
    <CartView
      lines={cart.lines}
      totals={cart.totals}
      currency={guest.restaurant.currency}
      pricesIncludeTax={guest.restaurant.pricesIncludeTax}
      seatLabel={t("you", { n: guest.participant.seq })}
      displayName={guest.participant.displayName}
    />
  );
}
