"use server";

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
 */
export type LookupResult =
  | { ok: true; reference: string }
  | { ok: false; message: string };

export async function lookupOrderAction(
  reference: string,
  email: string,
): Promise<LookupResult> {
  const trimmed = reference.trim().toUpperCase();

  if (!trimmed || !email.trim()) {
    return { ok: false, message: "Enter the order reference and the email it was placed with." };
  }

  const access = await authorizeOrderByEmail(trimmed, email);

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
