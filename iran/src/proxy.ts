import createIntlMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { isPlatformHost } from "@/lib/hosts";
import { routing } from "@/i18n/routing";
import {
  DINER_COOKIE,
  dinerCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/cookies";

const intl = createIntlMiddleware(routing);

/**
 * Edge proxy: locale negotiation + sliding session cookie.
 * Authorization is NOT done here (no DB access) — every page and action re-checks on the server.
 */
export default function proxy(request: NextRequest) {
  // A restaurant's own domain: its home page is its ordering site (the rest of the app as usual).
  const host = request.headers.get("host") ?? "";
  if (request.nextUrl.pathname === "/" && !isPlatformHost(host)) {
    const url = request.nextUrl.clone();
    url.pathname = `/d/${encodeURIComponent(host.toLowerCase().replace(/:\d+$/, ""))}`;
    request = new NextRequest(url, request);
  }
  const response = intl(request);
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions);
  const diner = request.cookies.get(DINER_COOKIE)?.value;
  if (diner) response.cookies.set(DINER_COOKIE, diner, dinerCookieOptions);
  return response;
}

export const config = {
  // Skip API, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
