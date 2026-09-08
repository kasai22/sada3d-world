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

export async function placeOrderAction(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const result = await placeOrder(input);

  if (result.status === "placed") {
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
  }

  return result;
}
