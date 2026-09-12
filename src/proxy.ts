import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_HINT_COOKIE,
  SESSION_HINT_OPTIONS,
  authFetch,
  hardenSessionCookie,
  isSessionCookieName,
  readSupabaseAuthConfig,
} from "@/lib/auth/config";
import { isSessionError } from "@/lib/auth/supabase";
import { OPS_PATH_HEADER, opsPathOf } from "@/lib/ops/routes";
import { hasMalformedEncoding } from "@/lib/security/url";

/**
 * The proxy: keeps Supabase sessions fresh. It does not authorize anything.
 *
 * Access tokens are short-lived. A Server Component cannot write cookies, so a
 * page rendered with an expired token could validate it but never store the
 * refreshed one. The proxy runs before rendering, where cookies *can* be
 * written, refreshes the session once, and passes the new tokens both to the
 * page (on the request) and to the browser (on the response).
 *
 * ── What it deliberately does not do ─────────────────────────────────────
 *
 * It does not redirect signed-out visitors away from `/account`, and it does
 * not decide who may read an order or a design. Every page and every API route
 * resolves the customer itself and every service checks ownership itself —
 * the proxy is skipped for prefetches and static assets, can be misconfigured
 * by a matcher, and is exactly the kind of single layer the Next.js guidance
 * warns against relying on.
 *
 * ── The one thing it refuses ─────────────────────────────────────────────
 *
 * A path whose percent-escapes do not decode. The router decodes dynamic
 * segments before any handler runs, and a malformed escape makes that throw —
 * a bare 500 for a request that is simply malformed. It is answered here with
 * a 400 instead. This is input hygiene, not authorization.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────
 *
 * A request without a session cookie does no work at all: no client, no
 * network call. Only a request carrying a session is validated, and the
 * validation is bounded by `AUTH_REQUEST_TIMEOUT_MS` — a slow provider delays a
 * navigation by at most that, and leaves the session hint alone.
 *
 * `getClaims()` verifies the token's signature locally when the project uses
 * asymmetric signing keys and asks Supabase when it does not; it refreshes an
 * expired session either way. The server then validates again with `getUser()`
 * before any decision is made (`lib/auth/server.ts`), so what the proxy
 * concludes only ever sets the header hint.
 */

export async function proxy(request: NextRequest) {
  if (hasMalformedEncoding(request.nextUrl.pathname)) {
    return NextResponse.json(
      { error: { code: "validation", message: "This address is not valid." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  /*
   * The operations console.
   *
   * Its layout cannot see which page was asked for, and needs it so that
   * signing in returns an operator to the page they wanted rather than to the
   * dashboard. The path travels as a request header, validated by
   * `opsPathOf` here and again by Payload when it honours the redirect — it is
   * a hint about *where to go back to*, never about who anyone is.
   *
   * Returning here also skips the customer-session work below, which a console
   * request has no use for.
   */
  const consolePath = opsPathOf(request.nextUrl.pathname, request.nextUrl.search);
  if (consolePath) {
    const headers = new Headers(request.headers);
    headers.set(OPS_PATH_HEADER, consolePath);
    return NextResponse.next({ request: { headers } });
  }

  const result = readSupabaseAuthConfig();
  if (result.status !== "configured") return NextResponse.next();

  const hasSession = request.cookies
    .getAll()
    .some((cookie) => isSessionCookieName(cookie.name));
  const hinted = request.cookies.has(SESSION_HINT_COOKIE);

  if (!hasSession) {
    if (!hinted) return NextResponse.next();
    const response = NextResponse.next();
    response.cookies.delete(SESSION_HINT_COOKIE);
    return response;
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(result.config.url, result.config.anonKey, {
    global: { fetch: authFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(list, headers) {
        // The page rendering this request reads the refreshed tokens…
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });

        // …and the browser stores them, HttpOnly.
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, hardenSessionCookie(options));
        }

        // `@supabase/ssr` asks that responses setting auth cookies are never
        // cached, so one customer's session is never served to another.
        for (const [header, value] of Object.entries(headers ?? {})) {
          response.headers.set(header, value);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const valid = !error && Boolean(data?.claims?.sub);

  if (valid && !hinted) {
    response.cookies.set(SESSION_HINT_COOKIE, "1", SESSION_HINT_OPTIONS);
  } else if (!valid && hinted && (!error || isSessionError(error))) {
    // A session that no longer works. A provider outage is not that, so the
    // hint is left alone when the failure is the provider's.
    response.cookies.delete(SESSION_HINT_COOKIE);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except build assets, public files and the CMS. Payload runs its
     * own operator authentication and has nothing to do with customer sessions.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|admin|payload-api|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|stl|3mf|obj|glb|gltf|woff2?)$).*)",
  ],
};
