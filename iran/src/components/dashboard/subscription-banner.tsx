import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { SubscriptionState } from "@/server/modules/billing/service";
import { planLabel } from "@/lib/plan-name";

/** Trial running, period ending soon, or expired (the restaurant is back on Free limits). */
export async function SubscriptionBanner({
  restaurantId,
  notice,
}: {
  restaurantId: string;
  notice: SubscriptionState;
}) {
  const [t, tAll] = await Promise.all([getTranslations("billing.banner"), getTranslations()]);
  const plan = notice.kind === "free" ? "" : planLabel(notice.planCode, notice.planName, tAll);
  const expired = notice.kind === "expired";
  const text =
    notice.kind === "trial"
      ? t("trial", { days: notice.daysLeft, plan })
      : notice.kind === "paid"
        ? t("ending", { days: notice.daysLeft ?? 0, plan })
        : notice.kind === "expired"
          ? t(notice.wasTrial ? "trialOver" : "expired", { plan })
          : "";
  return (
    <div
      role={expired ? "alert" : "status"}
      className={cn(
        "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium",
        expired ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text",
      )}
    >
      <span>{text}</span>
      <Link
        href={`/dashboard/${restaurantId}/billing`}
        className="kashi-btn bg-fg px-4 py-1.5 text-xs font-bold text-bg [--cut:5px]"
      >
        {expired ? t("renew") : t("choose")}
      </Link>
    </div>
  );
}
