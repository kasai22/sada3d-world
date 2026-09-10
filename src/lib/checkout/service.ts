import { getCustomerContext } from "@/lib/account/identity";
import { EVENTS, log } from "@/lib/observability";
import { cartFingerprint } from "@/lib/cart/identity";
import { cartRepository } from "@/lib/cart/repository";
import { priceCart } from "@/lib/cart/validation";
import type { PricedCart } from "@/lib/cart/types";
import { resolvePaymentAdapter } from "@/lib/payment/service";
import { PaymentConfigurationError } from "@/lib/payment/types";

import { checkoutIdempotencyKey, idempotencyStore } from "./idempotency";
import { createManufacturingJobs } from "@/lib/orders/service";
import { orderRepository } from "@/lib/orders/repository";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import type { Order, OrderItem } from "@/lib/orders/types";
import { shippingPolicy, taxPolicy } from "./policies";
import { normaliseAddress, normaliseContact, validateCheckoutInput } from "./validation";
import type { CheckoutInput, CheckoutResult } from "./types";

/**
 * Checkout.
 *
 * The sequence is fixed and each step exists because skipping it would let
 * something untrue reach an order:
 *
 *   load the cart from the server's own store
 *   revalidate every line against the catalog and the pricing rules
 *   validate the customer's details
 *   compute the total from the revalidated lines and the shipping/tax policies
 *   reserve an idempotency key
 *   create the payment session for the server's figure
 *   record the order
 *   clear the cart
 *
 * Nothing in a request contributes an amount. The browser sends a name, an
 * email, a phone number and an address; every rupee comes from this side.
 */

/**
 * Prices the current cart for checkout.
 *
 * Shipping and tax are asked of their policies rather than assumed. With no
 * address yet they are unknown, which is what the summary shows.
 */
export async function reviewCheckout(address?: CheckoutInput["address"]): Promise<PricedCart> {
  const cart = await cartRepository.load();
  const priced = await priceCart(cart);

  if (!address) return priced;

  return priceCart(cart, {
    shipping: shippingPolicy.quote(address, priced.lines),
    tax: taxPolicy.calculate(address, priced.totals.subtotal),
  });
}

/**
 * Snapshots the cart as order items.
 *
 * Each gets its own identity and its own fulfilment status, because an order
 * may hold a stocked part that ships tomorrow beside a custom part that takes a
 * week, and one status could not describe both.
 */
function toOrderItems(cart: PricedCart, reference: string): OrderItem[] {
  return cart.lines.map((priced, index) => ({
    id: `${reference}-${String(index + 1).padStart(2, "0")}`,
    type: priced.line.type,
    name: priced.name,
    spec: priced.spec,
    quantity: priced.line.quantity,
    unitPrice: priced.unitPrice ?? 0,
    lineTotal: priced.lineTotal ?? 0,
    quoteRulesVersion:
      priced.line.type === "custom" ? priced.line.quote.rulesVersion : undefined,
    // Nothing has started. A custom item moves to in_progress when its
    // manufacturing job is created, below.
    fulfillmentStatus: "pending" as const,
  }));
}

export async function placeOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const contact = normaliseContact(input.contact);
  const address = normaliseAddress(input.address);

  const errors = validateCheckoutInput({ contact, address });
  if (errors.length > 0) return { status: "invalid", errors };

  const cart = await cartRepository.load();

  if (cart.lines.length === 0) {
    return { status: "cart_invalid", messages: ["Your cart is empty."] };
  }

  // Revalidated here, not trusted from the page the customer was looking at.
  const priced = await priceCart(cart, {
    shipping: shippingPolicy.quote(address, []),
    tax: taxPolicy.calculate(address, 0),
  });

  const blocking = priced.issues.filter((issue) => issue.severity === "blocking");
  if (blocking.length > 0) {
    return {
      status: "cart_invalid",
      messages: blocking.map((issue) => issue.message),
    };
  }

  if (priced.totals.total <= 0) {
    return {
      status: "cart_invalid",
      messages: ["This cart has no payable total."],
    };
  }

  /*
   * Reserved before the payment session exists. A duplicate submit that arrives
   * while the first is still running is told so rather than being allowed to
   * start a second payment for the same cart.
   */
  const key = checkoutIdempotencyKey({
    cartId: cart.id,
    fingerprint: cartFingerprint(cart),
    email: contact.email,
    postalCode: address.postalCode,
  });

  const reservation = await idempotencyStore.reserve(key);

  if (reservation.status === "duplicate") {
    const existing = await orderRepository.findOrder(reservation.orderReference);
    if (existing) return { status: "placed", order: existing };
    // The reservation outlived its order, which should not happen. Treat the
    // request as unsafe to repeat rather than charging again.
    return {
      status: "error",
      message: "This order was already submitted. Check your email for the confirmation.",
    };
  }

  if (reservation.status === "in_flight") {
    return {
      status: "error",
      message: "This order is already being placed. Wait a moment before trying again.",
    };
  }

  const reference = await orderRepository.nextReference();

  let payment;
  try {
    payment = await resolvePaymentAdapter().createSession({
      // The server's figure. There is no path by which a request can set this.
      amount: priced.totals.total,
      currency: "INR",
      reference,
      idempotencyKey: key,
      customer: { name: contact.name, email: contact.email },
    });
  } catch (cause) {
    await idempotencyStore.release(key);

    if (cause instanceof PaymentConfigurationError) {
      // A misconfigured provider is an operator problem, and its detail is not
      // the customer's to read.
      return {
        status: "error",
        message: "Payments are not available right now. Try again shortly.",
      };
    }

    return {
      status: "error",
      message: "Payment could not be started. Try again.",
    };
  }

  if (payment.status === "failed" || payment.status === "cancelled") {
    // The cart is deliberately untouched: the customer still has everything
    // they chose, and can try again.
    await idempotencyStore.release(key);
    return { status: "payment_failed", message: payment.message };
  }

  if (payment.status === "requires_action") {
    // The seam a real provider needs. No provider implemented today reaches
    // this branch, and the order is not recorded until payment completes.
    await idempotencyStore.release(key);
    return {
      status: "error",
      message: "This payment needs an extra step that is not available yet.",
    };
  }

  const placedAt = new Date().toISOString();
  const items = toOrderItems(priced, reference);

  /*
   * Ownership, when there is an account to own it. There is no authentication
   * until Phase 17, so this is undefined for every order placed today and the
   * order stays a guest order reachable through the receipt grant. Wired now so
   * that an order placed by a signed-in customer arrives in their portal
   * without a second change.
   */
  const { identity } = await getCustomerContext();

  const payload = {
    reference,
    cartId: cart.id,
    customerId: identity?.id,
    payment: {
      // The commercial fact, kept out of the order status. Manufacturing knows
      // nothing about it and it knows nothing about manufacturing.
      status: "paid" as const,
      sessionId: payment.session.id,
      provider: payment.session.provider,
    },
    items,
    shipments: [],
    totals: priced.totals,
    contact,
    address,
    placedAt,
    updatedAt: placedAt,
    provisional: priced.totals.provisional || payment.session.mode !== "live",
  };

  const order: Order = {
    ...payload,
    // Derived, never assigned. Every item is pending, so this is `confirmed`.
    status: aggregateOrderStatus({ items, payment: payload.payment }),
  };

  // One write. In Postgres this is one transaction covering the order, its
  // items and the payment reference.
  await orderRepository.createOrder(order);

  /*
   * Identifiers and counts. Not the customer's name, email, phone or address,
   * and not the payment session — an operator needs to find this order, not to
   * read who placed it.
   */
  log.info(EVENTS.orderCreated, {
    orderReference: reference,
    items: items.length,
    units: priced.totals.unitCount,
    total: priced.totals.total,
    currency: priced.totals.currency,
    provisional: payload.provisional,
    customerId: identity?.id,
  });

  /*
   * Custom items become manufacturing jobs; catalog items do not. Today no
   * custom item can reach this point — checkout refuses one whose file is not
   * durably stored — so this runs against nothing until Phase 16. It is wired
   * now so that when the file seam opens, an order arrives in production
   * without a second change.
   */
  const withJobs = await createManufacturingJobs(order);

  await idempotencyStore.complete(key, reference);

  // The cart has become an order and is no longer a cart.
  await cartRepository.clear();

  return { status: "placed", order: withJobs };
}

export async function findOrder(reference: string): Promise<Order | undefined> {
  return orderRepository.findOrder(reference);
}
