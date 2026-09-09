import {
  isItemActive,
  isItemFulfilled,
  type OrderItem,
  type OrderPayment,
  type OrderStatus,
} from "./types";

/**
 * Order status aggregation.
 *
 * The single place the order-level status is decided. Pure: items and payment
 * in, one status out. No page, component, route or repository may set
 * `order.status` by any other means — if two places encoded these rules they
 * would disagree, and the customer would be shown a status the items do not
 * support.
 *
 * Precedence is explicit and ordered. Each rule is checked in turn, and the
 * first that matches wins.
 */

export interface AggregateInput {
  items: readonly OrderItem[];
  payment: OrderPayment;
  /** Set when the order as a whole was cancelled, rather than item by item. */
  cancelledAt?: string;
}

export function aggregateOrderStatus(input: AggregateInput): OrderStatus {
  const { items, payment, cancelledAt } = input;

  // 1. An empty order has nothing to be in progress about.
  if (items.length === 0) {
    return payment.status === "paid" ? "confirmed" : "pending";
  }

  // 2. Cancellation is decisive, whether it was the order or every item.
  if (cancelledAt) return "cancelled";
  if (items.every((item) => item.fulfillmentStatus === "cancelled")) {
    return "cancelled";
  }

  /*
   * 3. Payment precedence. Nothing is fulfilled before it is paid for, so the
   *    commercial state comes before any statement about progress.
   *
   *    A failed payment reads as `awaiting_payment` rather than `failed`: it is
   *    recoverable, the customer can pay again, and calling it a failed order
   *    would close something that is still open.
   */
  if (payment.status === "pending") return "pending";
  if (payment.status === "failed") return "awaiting_payment";

  const live = items.filter((item) => item.fulfillmentStatus !== "cancelled");
  const fulfilled = live.filter((item) => isItemFulfilled(item.fulfillmentStatus));
  const active = live.filter((item) => isItemActive(item.fulfillmentStatus));
  const pending = live.filter((item) => item.fulfillmentStatus === "pending");
  const failed = live.filter((item) => item.fulfillmentStatus === "failed");

  // 4. Everything that was not cancelled has failed: nothing can arrive.
  if (failed.length === live.length) return "failed";

  // 5. Work is under way. Some already dispatched makes it partial.
  if (active.length > 0) {
    return fulfilled.length > 0 ? "partially_fulfilled" : "fulfillment_in_progress";
  }

  // 6. Nothing active. Something dispatched, something still to start or lost.
  if (fulfilled.length > 0 && (pending.length > 0 || failed.length > 0)) {
    return "partially_fulfilled";
  }

  // 7. Everything that could be dispatched has been.
  if (fulfilled.length === live.length) return "fulfilled";

  // 8. Paid, accepted, nothing started.
  return "confirmed";
}

/**
 * The fulfilment status an item reaches when its manufacturing job finishes.
 *
 * Deliberately a small, explicit translation rather than a shared enum: a
 * completed job means the part is ready to hand to fulfilment, and a failed one
 * means the item cannot be fulfilled. The two domains meet here and nowhere
 * else.
 */
export function itemStatusForManufacturing(
  state: string,
): OrderItem["fulfillmentStatus"] | null {
  switch (state) {
    case "queued":
    case "design_review":
    case "file_preparation":
    case "material_preparation":
    case "scheduled":
    case "printing":
    case "post_processing":
    case "quality_check":
    case "rework":
    case "approved":
    case "packaging":
      return "in_progress";
    case "ready_for_dispatch":
    case "completed":
      return "ready";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return null;
  }
}
