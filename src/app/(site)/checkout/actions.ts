"use server";

import { cookies } from "next/headers";

import { ORDER_COOKIE, ORDER_COOKIE_MAX_AGE } from "@/lib/checkout/cookies";
import { placeOrder } from "@/lib/checkout/service";
import type { CheckoutInput, CheckoutResult } from "@/lib/checkout/types";

/**
 * The checkout server boundary.
 *
 * The browser sends contact details and an address. It does not send a cart, a
 * total, a currency or a product — the server already has the cart, and every
 * figure is derived from it here. There is no field in this request that can
 * change what anything costs.
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

export async function placeOrderAction(
  input: CheckoutInput,
): Promise<CheckoutActionResult> {
  const result = await placeOrder(input);

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
