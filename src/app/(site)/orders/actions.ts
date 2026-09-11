"use server";

import { headers } from "next/headers";

import { RATE_LIMITS, enforceRateLimit, sourceSubject } from "@/lib/api/rate-limit";
import { RateLimitedError } from "@/lib/errors";
import { authorizeOrderByEmail } from "@/lib/orders/access";
import { grantAccess } from "@/lib/orders/grants";

/**
 * Order lookup.
 *
 * The browser sends a reference and an email; the server decides whether the
 * two belong together. Nothing about an order is returned by this action —
 * success only records a grant, and the tracking page reads the order itself.
 *
 * A wrong email and a reference that does not exist produce the same answer, so
 * the form cannot be used to discover which references are real.
 *
 * ── Two throttles ────────────────────────────────────────────────────────
 *
 * Per reference (`lib/orders/access`): five wrong emails for one reference and
 * it stops answering. Per source (here): a caller walking through references
 * one guess each never trips the first, so the second bounds how many lookups
 * one connection makes at all. Both are per instance; see `lib/api/rate-limit`.
 */
export type LookupResult =
  | { ok: true; reference: string }
  | { ok: false; message: string };

export async function lookupOrderAction(
  reference: unknown,
  email: unknown,
): Promise<LookupResult> {
  /*
   * A server action is a public POST endpoint, and its arguments are whatever
   * that request carried — whatever the signature of the form that calls it
   * says. They are checked as unknowns.
   */
  if (
    typeof reference !== "string" ||
    typeof email !== "string" ||
    !reference.trim() ||
    !email.trim()
  ) {
    return { ok: false, message: "Enter the order reference and the email it was placed with." };
  }

  try {
    enforceRateLimit(RATE_LIMITS.orderLookupSource, sourceSubject(await headers()));
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { ok: false, message: "Too many lookups. Wait a few minutes and try again." };
    }
    throw error;
  }

  const access = await authorizeOrderByEmail(reference, email);

  if (!access.ok) {
    return {
      ok: false,
      message:
        access.reason === "throttled"
          ? "Too many attempts for this reference. Try again later."
          : "No order matches that reference and email.",
    };
  }

  await grantAccess(access.order.reference);
  return { ok: true, reference: access.order.reference };
}
