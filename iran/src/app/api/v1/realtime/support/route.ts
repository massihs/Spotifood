import { getCurrentUser } from "@/server/auth/current";
import { topics } from "@/server/infra/realtime";
import { sseResponse } from "@/server/infra/realtime/sse";

/** GET /api/v1/realtime/support — the Spotifood team's support inbox (super admins only). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return new Response("Not found", { status: 404 });
  return sseResponse(req, [topics.support()]);
}
