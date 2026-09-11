"use server";

import { cookies, headers } from "next/headers";

import { RATE_LIMITS, enforceRateLimit, sourceSubject } from "@/lib/api/rate-limit";
import { ORDER_COOKIE, ORDER_COOKIE_MAX_AGE } from "@/lib/checkout/cookies";
import { parseCheckoutInput } from "@/lib/checkout/input";
import { placeOrder } from "@/lib/checkout/service";
import type { CheckoutResult } from "@/lib/checkout/types";
import { RateLimitedError, ValidationError } from "@/lib/errors";

/**
 * The checkout server boundary.
 *
 * The browser sends contact details and an address. It does not send a cart, a
 * total, a currency or a product — the server already has the cart, and every
 * figure is derived from it here. There is no field in this request that can
 * change what anything costs.
 *
 * The argument is read as `unknown` (`parseCheckoutInput`): a server action is a
 * public endpoint, and the form's type describes the form, not the request.
 * The per-source checkout limit applies here as it does to the JSON route —
 * this is the path customers actually use.
 */

/**
 * What the browser receives.
 *
 * A placed order comes back as its reference and nothing else. A server
 * action's return value is serialised to the client, and the domain `Order`
 * carries the payment session, the contact details and — since Stage 16 — the
 * manufacturing file's private storage reference. None of that is the form's to
 * hold; the success page reads the order server-side from the reference cookie.
 */
export type CheckoutActionResult =
  | Exclude<CheckoutResult, { status: "placed" }>
  | { status: "placed"; reference: string };

export async function placeOrderAction(input: unknown): Promise<CheckoutActionResult> {
  try {
    enforceRateLimit(RATE_LIMITS.checkoutSource, sourceSubject(await headers()));
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { status: "error", message: "Too many attempts. Wait a few minutes and try again." };
    }
    throw error;
  }

  let parsed;
  try {
    parsed = parseCheckoutInput(input);
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        status: "invalid",
        errors: error.issues.map(({ field, message }) => ({ field, message })),
      };
    }
    throw error;
  }

  const result = await placeOrder(parsed);

  if (result.status !== "placed") return result;

  const store = await cookies();
  // The reference only. The order itself stays on the server, and nothing
  // about the customer or the payment is written to the browser.
  store.set(ORDER_COOKIE, result.order.reference, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ORDER_COOKIE_MAX_AGE,
  });

  return { status: "placed", reference: result.order.reference };
}
