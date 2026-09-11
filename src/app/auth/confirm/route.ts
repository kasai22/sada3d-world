import { NextResponse, type NextRequest } from "next/server";

import { completeCustomerEmailLink } from "@/lib/account/authentication";
import { signInHref } from "@/lib/account/routes";
import { RATE_LIMITS, enforceRateLimit, sourceSubject } from "@/lib/api/rate-limit";
import { RateLimitedError } from "@/lib/errors";
import { EVENTS, log } from "@/lib/observability";

/**
 * GET /auth/confirm — where every confirmation and recovery email lands.
 *
 * Accepts either form Supabase can send:
 *
 *   ?token_hash=…&type=signup|recovery|…   verified directly; works in any browser
 *   ?code=…                                 the PKCE exchange; needs the browser
 *                                           that started the flow
 *
 * On success the session is set as HttpOnly cookies on this response, the guest
 * cart is merged, and the browser is sent on with a 303: a recovery link to the
 * reset-password page, anything else to its validated return path or the
 * account. On any failure, to the sign-in page with a notice — never a provider
 * message.
 *
 * ── One exception: too many attempts ─────────────────────────────────────
 *
 * Every request here asks the provider to verify whatever token it carries,
 * so the route is limited per network source (`auth.email_link.source`) before
 * any token is looked at. A source over the limit gets a plain 429 with
 * `Retry-After` rather than the sign-in redirect: sending it to "this link is
 * invalid" would be untrue, and a script guessing tokens gets nothing it can
 * use either way. No token is verified when the request is refused, so a real
 * link still works once the window passes. A person following their own email
 * does not come near thirty attempts in ten minutes.
 *
 * The destination is a path produced by the service from constants and an
 * allowlist, resolved against this request's own origin. A link cannot send the
 * browser off-site.
 *
 * The response must not be cached or leak the token onward: `no-store`, and no
 * Referer to the next page.
 */
export const dynamic = "force-dynamic";

function withPrivacy(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    enforceRateLimit(RATE_LIMITS.emailLinkSource, sourceSubject(request.headers));
  } catch (error) {
    if (!(error instanceof RateLimitedError)) throw error;

    const response = new NextResponse(
      "Too many attempts. Wait a few minutes, then open the link from your email again.",
      { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return withPrivacy(response);
  }

  let destination: string;

  try {
    destination = await completeCustomerEmailLink(request.nextUrl.searchParams);
  } catch (error) {
    log.error(EVENTS.authLinkRejected, {
      code: "unexpected",
      reason: error instanceof Error ? error.name : "unknown",
    });
    destination = signInHref(undefined, { status: "link_invalid" });
  }

  return withPrivacy(
    NextResponse.redirect(new URL(destination, request.nextUrl.origin), 303),
  );
}
