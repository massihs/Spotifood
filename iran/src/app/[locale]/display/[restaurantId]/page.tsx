import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/server/auth/current";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { CustomerDisplay } from "@/components/pos/customer-display";

type Props = PageProps<"/[locale]/display/[restaurantId]">;

/**
 * The customer display: opened on the till's second screen (facing the customer), it shows what
 * is rung up and the amount to pay, in large type, then "thank you" and the change.
 */
export default function DisplayPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Display params={params} />
    </Suspense>
  );
}

async function Display({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.create", "pos");
  const t = await getTranslations("pos.display");
  return (
    <CustomerDisplay
      restaurantId={ctx.restaurant.id}
      name={ctx.restaurant.name}
      logo={logoUrl(ctx.restaurant.logoKey)}
      brand={ctx.restaurant.brandColor}
      currency={ctx.restaurant.currency}
      labels={{
        welcome: t("welcome"),
        total: t("total"),
        discount: t("discount"),
        toPay: t("toPay"),
        card: t("card"),
        thanks: t("thanks"),
        change: t("change"),
        order: t("order"),
      }}
    />
  );
}
