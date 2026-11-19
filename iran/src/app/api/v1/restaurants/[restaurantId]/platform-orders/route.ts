import { connection } from "next/server";
import { db } from "@/server/db/client";
import { errorResponse } from "@/server/actions";
import { createPlatformOrder, integrationContext } from "@/server/modules/channels/platforms";

/**
 * POST /api/v1/restaurants/{restaurantId}/platform-orders, header `x-api-key: sfk_…` — an order from
 * a delivery platform (Snappfood, Tapsi Food…) pushed by an integration: it goes to the kitchen
 * at once, paid by the platform. Body:
 *   { "platform": "snappfood", "externalRef": "123456", "customerName": "…", "note": "…",
 *     "lines": [{ "name": "کباب کوبیده", "quantity": 2 }, { "productId": "…", "quantity": 1 }] }
 * Sending the same order twice returns the first one (`duplicate: true`).
 */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/v1/restaurants/[restaurantId]/platform-orders">,
) {
  await connection();
  try {
    const { restaurantId } = await params;
    const ctx = await integrationContext(db, restaurantId, req.headers.get("x-api-key") ?? "");
    const body = await req.json();
    const res = await createPlatformOrder(db, ctx, body);
    return Response.json(res, {
      status: res.duplicate ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
