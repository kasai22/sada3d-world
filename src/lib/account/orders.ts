import {
  furthestStageInHistory,
  stageIndex,
  toCustomerTracking,
  type CustomerManufacturingStage,
  type CustomerManufacturingTracking,
} from "@/lib/manufacturing";
import { orderRepository } from "@/lib/orders/repository";
import { getOrderTracking, type OrderTracking } from "@/lib/orders/service";
import type { Order, OrderItem } from "@/lib/orders/types";

import {
  matchesOrderFilter,
  type CustomerOrderFilter,
} from "./order-filters";
import type {
  CustomerIdentity,
  CustomerManufacturingItem,
  CustomerOrderManufacturing,
  CustomerOrderSummary,
} from "./types";

/**
 * The account's view of orders.
 *
 * Phase 12 owns orders, their four state machines and the customer projection.
 * This module owns exactly one thing Phase 12 does not: **which orders belong
 * to this customer**. Nothing here aggregates a status, transitions anything,
 * or re-decides what a customer may see about production — those questions are
 * answered by `aggregateOrderStatus` and `toCustomerTracking`, and asking them
 * a second way would eventually give a second answer.
 *
 * Every function takes a `CustomerIdentity`, which only `lib/account/identity`
 * produces. There is no exported function here that takes an order reference
 * alone, so there is no way to reach an order without saying whose it is.
 *
 * The guest path is untouched. `/orders/[reference]` still runs on the Phase 12
 * receipt and lookup grants, and nothing in this module weakens, bypasses or
 * substitutes for that check.
 */

/* ------------------------------------------------------------------ *
 * Ownership
 * ------------------------------------------------------------------ */

/**
 * Whether this order belongs to this customer.
 *
 * Written so that an absent owner can never match. `undefined === undefined`
 * would make every guest order belong to every customer, which is the exact
 * shape of the bug this check exists to prevent.
 */
export function ownsOrder(order: Order, identity: CustomerIdentity): boolean {
  return (
    typeof order.customerId === "string" &&
    order.customerId.length > 0 &&
    order.customerId === identity.id
  );
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

/*
 * Declared in `order-filters.ts`, which is client-safe, and re-exported here so
 * server callers keep one import path for the order domain.
 */
export {
  ORDER_FILTERS,
  matchesOrderFilter,
  parseOrderFilter,
  type CustomerOrderFilter,
} from "./order-filters";

/* ------------------------------------------------------------------ *
 * Summaries
 * ------------------------------------------------------------------ */

/** "Precision Gear + 1 more", or the single name, or nothing to name. */
function summarise(items: readonly OrderItem[]): string {
  const first = items[0];
  if (!first) return "No items";

  const rest = items.length - 1;
  return rest > 0 ? `${first.name} + ${rest} more` : first.name;
}

/**
 * The production roll-up for one order.
 *
 * Reads the *fulfilment* status to decide which parts are still being made —
 * that is a fulfilment question, and the item's own status is what answers it.
 * The stage then comes from the customer projection of that part's job.
 */
function rollUpManufacturing(
  items: readonly OrderItem[],
  jobs: Record<string, CustomerManufacturingTracking>,
): CustomerOrderManufacturing | undefined {
  let lowest = Number.POSITIVE_INFINITY;
  let stage: CustomerManufacturingStage | null = null;
  let itemsInProduction = 0;
  let held = false;
  let issue = false;

  for (const item of items) {
    if (!item.manufacturingJobId) continue;

    const tracking = jobs[item.manufacturingJobId];
    if (!tracking) continue;

    if (item.fulfillmentStatus === "failed") {
      issue = true;
      continue;
    }

    if (item.fulfillmentStatus !== "in_progress") continue;

    itemsInProduction += 1;
    if (tracking.hold) held = true;

    const index = stageIndex(tracking.stage);
    if (index >= 0 && index < lowest) {
      lowest = index;
      stage = tracking.stage;
    }
  }

  if (itemsInProduction === 0 && !issue) return undefined;

  return { stage, itemsInProduction, held, issue };
}

function toSummary(
  order: Order,
  jobs: Record<string, CustomerManufacturingTracking>,
): CustomerOrderSummary {
  const manufacturing = rollUpManufacturing(order.items, jobs);

  return {
    reference: order.reference,
    placedAt: order.placedAt,
    status: order.status,
    lineCount: order.items.length,
    unitCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    total: order.totals.total,
    currency: order.totals.currency,
    summary: summarise(order.items),
    provisional: order.provisional,
    demo: order.demo === true,
    ...(manufacturing ? { manufacturing } : {}),
  };
}

/** The customer projections for one order, keyed by job id. */
async function trackingFor(
  reference: string,
): Promise<Record<string, CustomerManufacturingTracking>> {
  const jobs = await orderRepository.findJobsForOrder(reference);
  return Object.fromEntries(jobs.map((job) => [job.id, toCustomerTracking(job)]));
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export interface ListCustomerOrdersOptions {
  filter?: CustomerOrderFilter;
  /** Cap for a preview list, e.g. the overview's recent orders. */
  limit?: number;
}

/**
 * This customer's orders, newest first.
 *
 * Filtered by ownership before anything else happens, so an order that is not
 * theirs is never read, summarised or counted.
 */
export async function listCustomerOrders(
  identity: CustomerIdentity,
  options: ListCustomerOrdersOptions = {},
): Promise<CustomerOrderSummary[]> {
  const filter = options.filter ?? "all";

  const owned = (await orderRepository.listOrders())
    .filter((order) => ownsOrder(order, identity))
    .filter((order) => matchesOrderFilter(order.status, filter))
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));

  const limited =
    options.limit === undefined ? owned : owned.slice(0, Math.max(options.limit, 0));

  return Promise.all(
    limited.map(async (order) => toSummary(order, await trackingFor(order.reference))),
  );
}

/** How many orders this customer has, before any filter. */
export async function countCustomerOrders(
  identity: CustomerIdentity,
): Promise<number> {
  const orders = await orderRepository.listOrders();
  return orders.filter((order) => ownsOrder(order, identity)).length;
}

/**
 * One of this customer's orders, with its Phase 12 tracking.
 *
 * Ownership is checked before the tracking is assembled. A reference belonging
 * to someone else and a reference that does not exist return the same
 * `undefined`, so the URL cannot be used to discover which references are real.
 */
export async function getCustomerOrder(
  identity: CustomerIdentity,
  reference: string,
): Promise<OrderTracking | undefined> {
  const normalised = reference.trim().toUpperCase();

  const order = await orderRepository.findOrder(normalised);
  if (!order || !ownsOrder(order, identity)) return undefined;

  return getOrderTracking(normalised);
}

/**
 * Every part of this customer's that is currently being made.
 *
 * One entry per part rather than per order, because a part is what has a stage.
 * Built only from `toCustomerTracking` output — no internal state, no machine,
 * no operator, no event type crosses into this list.
 */
export async function listActiveManufacturing(
  identity: CustomerIdentity,
  limit?: number,
): Promise<CustomerManufacturingItem[]> {
  const owned = (await orderRepository.listOrders()).filter((order) =>
    ownsOrder(order, identity),
  );

  const active: CustomerManufacturingItem[] = [];

  for (const order of owned) {
    const jobs = await trackingFor(order.reference);

    for (const item of order.items) {
      if (!item.manufacturingJobId) continue;
      if (item.fulfillmentStatus !== "in_progress") continue;

      const tracking = jobs[item.manufacturingJobId];
      if (!tracking?.stage) continue;

      active.push({
        orderReference: order.reference,
        itemId: item.id,
        itemName: item.name,
        stage: tracking.stage,
        // Never behind the current stage: finishing and rework map back along
        // the six, and a timeline that un-ticked printing would be telling the
        // customer that work they were told about has been undone.
        furthestStage: furthestStageInHistory(tracking.history) ?? tracking.stage,
        held: tracking.hold !== undefined,
        lastUpdatedAt: tracking.lastUpdatedAt,
        demo: order.demo === true,
      });
    }
  }

  active.sort((a, b) => Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt));

  return limit === undefined ? active : active.slice(0, Math.max(limit, 0));
}
