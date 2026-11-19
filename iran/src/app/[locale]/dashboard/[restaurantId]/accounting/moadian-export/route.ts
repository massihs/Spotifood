import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { isDay } from "@/lib/days";
import { dayStart } from "@/lib/period";
import { exportForProvider } from "@/server/modules/moadian/service";

/** The period's invoices in the tax system's JSON, for a trusted provider: ?from=…&to=… */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "accounting.manage");
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!isDay(from) || !isDay(to) || to < from) return new Response("invalid range", { status: 400 });
    const tz = ctx.restaurant.timezone;
    const end = new Date(dayStart(to, tz).getTime() + 86_400_000);
    const list = await exportForProvider(db, ctx, dayStart(from, tz), end);
    return new Response(JSON.stringify(list, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="moadian_${from}_${to}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
