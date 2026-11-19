import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { isDay } from "@/lib/days";
import { syncLedger } from "@/server/modules/ledger/sync";
import { accountantPack } from "@/server/modules/moadian/pack";

/** The accountant's pack (journal, trial balance, VAT, invoices) as a ZIP: ?from=…&to=… */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "accounting.manage");
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!isDay(from) || !isDay(to) || to < from) return new Response("invalid range", { status: 400 });
    await syncLedger(db, ctx.restaurant);
    const zip = await accountantPack(db, ctx, from, to);
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="spotifood_${from}_${to}.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
