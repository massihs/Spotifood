import { Suspense } from "react";
import { getFormatter } from "next-intl/server";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { ShiftBar } from "@/components/pos/shift-bar";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { paymentConfig } from "@/server/modules/payments/service";
import { getOpenShift, shiftSummary } from "@/server/modules/pos/service";
import { listTables } from "@/server/modules/tables/service";
import { can } from "@/server/tenancy";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/pos">["params"];

export default function PosPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
      <Pos params={params} />
    </Suspense>
  );
}

async function Pos({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.create");
  const [menu, tables, config, shift, format] = await Promise.all([
    getPublicMenu(ctx.restaurant.id),
    listTables(db, ctx),
    paymentConfig(db, ctx.restaurant.id),
    getOpenShift(db, ctx),
    getFormatter(),
  ]);
  const summary = shift ? await shiftSummary(db, shift) : null;
  return (
    <>
      <ShiftBar
        restaurantId={ctx.restaurant.id}
        currency={ctx.restaurant.currency}
        shift={
          shift
            ? { openedAt: shift.openedAt.toISOString(), openingFloatCents: shift.openingFloatCents }
            : null
        }
        summary={
          summary
            ? {
                cashSales: summary.cashSales,
                totalSales: summary.totalSales,
                moveIn: summary.moveIn,
                moveOut: summary.moveOut,
                expectedCash: summary.expectedCash,
              }
            : null
        }
        canManage={can(ctx, "cash.manage")}
        timeLabel={
          shift
            ? format.dateTime(shift.openedAt, { timeStyle: "short", timeZone: ctx.restaurant.timezone })
            : null
        }
      />
      <PosTerminal
        restaurantId={ctx.restaurant.id}
        menu={menu}
        currency={ctx.restaurant.currency}
        tables={tables
          .filter((tb) => tb.qrEnabled !== undefined)
          .map((tb) => ({ id: tb.id, label: tb.label }))}
        methods={config.offline}
        canPay={can(ctx, "payments.record")}
      />
    </>
  );
}
