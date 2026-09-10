import type { OrderStatus } from "@/lib/orders/types";

/**
 * Order list filtering.
 *
 * Pure, and in its own module so a client component can import it.
 *
 * The reason is structural rather than stylistic: `orders.ts` reaches the order
 * repository, which reaches the Postgres driver. A filter bar importing a
 * filter constant from there drags `pg` into the browser bundle — which is
 * exactly what happened, and what this split prevents from happening again.
 *
 * The same rule the catalog already follows: components import pure helpers,
 * server code imports data access.
 */

/**
 * The buckets the order list offers.
 *
 * Four, and they partition the eight order statuses completely — an order can
 * always be found under one of them. `closed` rather than "cancelled" because
 * it also holds `failed`: a failed order is not a cancelled one, and filing it
 * under that word would misdescribe it, while leaving it out of every bucket
 * would hide it. Each row still shows its own precise status.
 */
export type CustomerOrderFilter = "all" | "active" | "completed" | "closed";

export const ORDER_FILTERS: readonly { value: CustomerOrderFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

/** Anything a query string can say, reduced to a filter. Unknown reads as all. */
export function parseOrderFilter(value: string | undefined): CustomerOrderFilter {
  return ORDER_FILTERS.some((filter) => filter.value === value)
    ? (value as CustomerOrderFilter)
    : "all";
}

export function matchesOrderFilter(
  status: OrderStatus,
  filter: CustomerOrderFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return (
        status === "pending" ||
        status === "awaiting_payment" ||
        status === "confirmed" ||
        status === "fulfillment_in_progress" ||
        status === "partially_fulfilled"
      );
    case "completed":
      return status === "fulfilled";
    case "closed":
      return status === "cancelled" || status === "failed";
  }
}

