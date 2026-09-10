import {
  INITIAL_STATE,
  transitionManufacturingState,
} from "@/lib/manufacturing/machine";
import { toCustomerTracking } from "@/lib/manufacturing/customer";
import type {
  ManufacturingEvent,
  ManufacturingEventType,
  ManufacturingHoldReason,
  ManufacturingJob,
  QualityResult,
} from "@/lib/manufacturing/types";

import { EVENTS, log } from "@/lib/observability";

import { aggregateOrderStatus, itemStatusForManufacturing } from "./aggregate";
import { orderRepository } from "./repository";
import {
  itemStatusForShipment,
  transitionShipmentStatus,
  type ShipmentEventType,
} from "./shipment";
import type { Order, OrderItem, Shipment } from "./types";

/**
 * Order and manufacturing service.
 *
 * The only way any of these four state machines changes. Every mutation here
 * takes an *event* and asks the machine whether it is allowed; nothing accepts
 * a target state. A caller that could say "set this job to completed" would be
 * a caller that could skip printing.
 *
 * After any change the order status is recomputed from its items by
 * `aggregateOrderStatus`. It is never assigned.
 */

export type EventResult<T> =
  | { ok: true; value: T; changed: boolean }
  | { ok: false; reason: string };

function now(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ *
 * Order assembly
 * ------------------------------------------------------------------ */

/** Recomputes the order's derived status and stamps it. */
function reconcile(order: Order): Order {
  return {
    ...order,
    status: aggregateOrderStatus({
      items: order.items,
      payment: order.payment,
      cancelledAt: order.cancelledAt,
    }),
    updatedAt: now(),
  };
}

function withItem(order: Order, itemId: string, patch: Partial<OrderItem>): Order {
  return reconcile({
    ...order,
    items: order.items.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item,
    ),
  });
}

/**
 * Creates the manufacturing jobs an order needs.
 *
 * Custom items only. A stocked catalog product goes straight to fulfilment, and
 * giving it a job would mean recording production events for something that was
 * never produced.
 */
export async function createManufacturingJobs(
  order: Order,
  /** When the job entered production, if that is known. Defaults to now. */
  queuedAt?: string,
): Promise<Order> {
  let next = order;

  for (const item of order.items) {
    if (item.type !== "custom" || item.manufacturingJobId) continue;

    const id = `job_${order.reference}_${item.id}`;
    const timestamp = queuedAt ?? now();

    const job: ManufacturingJob = {
      id,
      orderItemId: item.id,
      orderReference: order.reference,
      state: INITIAL_STATE,
      events: [
        {
          id: `${id}_queued`,
          type: "JOB_QUEUED",
          occurredAt: timestamp,
          from: INITIAL_STATE,
          to: INITIAL_STATE,
        },
      ],
      qualityResult: "pending",
      reworkCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await orderRepository.createJob(job);
    next = withItem(next, item.id, {
      manufacturingJobId: id,
      fulfillmentStatus: "in_progress",
    });
  }

  if (next !== order) await orderRepository.saveOrder(next);
  return next;
}

/* ------------------------------------------------------------------ *
 * Manufacturing events
 * ------------------------------------------------------------------ */

export interface ManufacturingEventInput {
  /**
   * Stable identifier for this report.
   *
   * What makes an event idempotent: the same id applied twice is one event
   * reported twice. A caller that cannot supply one gets a generated id, and
   * with it no protection against its own retries.
   */
  id?: string;
  type: ManufacturingEventType;
  occurredAt?: string;
  /** Internal. Never reaches a customer. */
  actor?: string;
  note?: string;
}

/**
 * Applies a manufacturing event.
 *
 * Serialised per job, so two reports of the same milestone are decided against
 * the state that is genuinely current rather than both against the state before
 * either landed.
 */
export async function applyManufacturingEvent(
  jobId: string,
  input: ManufacturingEventInput,
): Promise<EventResult<ManufacturingJob>> {
  return orderRepository.applyExclusively(jobId, async () => {
    const job = await orderRepository.findJob(jobId);
    if (!job) return { ok: false as const, reason: "That job does not exist." };

    const eventId = input.id ?? `${jobId}_${job.events.length}_${input.type}`;

    // The same report delivered twice. Nothing is appended and nothing moves.
    if (job.events.some((event) => event.id === eventId)) {
      return { ok: true as const, value: job, changed: false };
    }

    const result = transitionManufacturingState(job.state, input.type);
    if (!result.ok) {
      /*
       * A refused transition is worth seeing: it is either an operator surface
       * reporting out of order or a customer asking for something the machine
       * does not allow, and both are worth knowing about. Identifiers only —
       * the reason is the machine's own words and carries nothing private.
       */
      log.warn(EVENTS.orderEventRefused, {
        jobId,
        orderReference: job.orderReference,
        from: job.state,
        type: input.type,
        reason: result.reason,
      });
      return { ok: false as const, reason: result.reason };
    }

    if (!result.changed) {
      // A valid repeat of a milestone already reached: recorded as having been
      // seen, but it moves nothing and appends no transition.
      return { ok: true as const, value: job, changed: false };
    }

    const event: ManufacturingEvent = {
      id: eventId,
      type: input.type,
      occurredAt: input.occurredAt ?? now(),
      actor: input.actor,
      note: input.note,
      from: job.state,
      to: result.state,
    };

    /*
     * Quality is its own fact, kept beside the state rather than inside it.
     * Entering inspection resets the result to pending — the part has not been
     * judged yet — and the two outcomes set it explicitly.
     */
    let qualityResult: QualityResult = job.qualityResult;
    if (result.state === "quality_check") qualityResult = "pending";
    if (input.type === "QUALITY_APPROVED") qualityResult = "approved";
    if (input.type === "QUALITY_REJECTED") qualityResult = "rejected";

    const updated: ManufacturingJob = {
      ...job,
      state: result.state,
      events: [...job.events, event],
      qualityResult,
      reworkCount:
        result.state === "rework" ? job.reworkCount + 1 : job.reworkCount,
      updatedAt: event.occurredAt,
    };

    await orderRepository.saveJob(updated);
    await syncItemToJob(updated);

    /*
     * Emitted after the write, so a line in the log means a committed
     * transition rather than an attempted one. No actor and no note: both are
     * internal and neither is needed to find the record.
     */
    log.info(EVENTS.orderStateTransition, {
      jobId,
      orderReference: job.orderReference,
      eventId,
      type: input.type,
      from: event.from,
      to: event.to,
    });

    return { ok: true as const, value: updated, changed: true };
  });
}

/**
 * Reflects a job's state onto the item it makes, and the order onto that.
 *
 * A translation, not a shared value: `itemStatusForManufacturing` is the one
 * place the two vocabularies meet, and the item keeps its own status.
 */
async function syncItemToJob(job: ManufacturingJob): Promise<void> {
  const order = await orderRepository.findOrder(job.orderReference);
  if (!order) return;

  const item = order.items.find((entry) => entry.id === job.orderItemId);
  if (!item) return;

  // An item already dispatched is past manufacturing; the shipment owns it now.
  if (item.fulfillmentStatus === "shipped" || item.fulfillmentStatus === "delivered") {
    return;
  }

  const status = itemStatusForManufacturing(job.state);
  if (!status || status === item.fulfillmentStatus) return;

  await orderRepository.saveOrder(withItem(order, item.id, { fulfillmentStatus: status }));
}

/* ------------------------------------------------------------------ *
 * Holds and quality
 * ------------------------------------------------------------------ */

/**
 * Puts a job on hold, or lifts the hold.
 *
 * The state is untouched. A held job is still in a meaningful state, and that
 * is the whole reason holds are separate.
 */
export async function setManufacturingHold(
  jobId: string,
  hold: { reason: ManufacturingHoldReason; note?: string } | null,
  /** When the interruption began, if that is known. Defaults to now. */
  occurredAt?: string,
): Promise<EventResult<ManufacturingJob>> {
  return orderRepository.applyExclusively(jobId, async () => {
    const job = await orderRepository.findJob(jobId);
    if (!job) return { ok: false as const, reason: "That job does not exist." };

    const timestamp = occurredAt ?? now();

    const updated: ManufacturingJob = {
      ...job,
      hold: hold
        ? { reason: hold.reason, note: hold.note, startedAt: timestamp }
        : job.hold
          ? { ...job.hold, resolvedAt: timestamp }
          : undefined,
      updatedAt: timestamp,
    };

    await orderRepository.saveJob(updated);
    return { ok: true as const, value: updated, changed: true };
  });
}

/* ------------------------------------------------------------------ *
 * Shipments
 * ------------------------------------------------------------------ */

export interface CreateShipmentInput {
  orderReference: string;
  itemIds: readonly string[];
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

/**
 * Opens a shipment for items that are ready.
 *
 * An item joins a parcel only once it has reached `ready`. That is the
 * manufacturing-to-fulfilment handoff, and it is checked here rather than
 * assumed: a part that is still printing cannot be put in a box.
 */
export async function createShipment(
  input: CreateShipmentInput,
): Promise<EventResult<Order>> {
  const order = await orderRepository.findOrder(input.orderReference);
  if (!order) return { ok: false, reason: "That order does not exist." };

  const items = order.items.filter((item) => input.itemIds.includes(item.id));
  if (items.length === 0) {
    return { ok: false, reason: "No items were given for this shipment." };
  }

  const notReady = items.filter((item) => item.fulfillmentStatus !== "ready");
  if (notReady.length > 0) {
    return {
      ok: false,
      reason: `${notReady[0]?.name} is not ready to dispatch.`,
    };
  }

  const shipment: Shipment = {
    id: `shp_${order.reference}_${order.shipments.length + 1}`,
    orderReference: order.reference,
    status: "pending",
    itemIds: items.map((item) => item.id),
    carrier: input.carrier,
    trackingNumber: input.trackingNumber,
    trackingUrl: input.trackingUrl,
    updatedAt: now(),
  };

  let next: Order = { ...order, shipments: [...order.shipments, shipment] };
  for (const item of items) {
    next = withItem(next, item.id, { shipmentId: shipment.id });
  }

  await orderRepository.saveOrder(next);
  return { ok: true, value: next, changed: true };
}

export async function applyShipmentEvent(
  orderReference: string,
  shipmentId: string,
  event: ShipmentEventType,
  /** When the carrier reported it, if that is known. Defaults to now. */
  occurredAt?: string,
): Promise<EventResult<Order>> {
  const order = await orderRepository.findOrder(orderReference);
  if (!order) return { ok: false, reason: "That order does not exist." };

  const shipment = order.shipments.find((entry) => entry.id === shipmentId);
  if (!shipment) return { ok: false, reason: "That shipment does not exist." };

  const result = transitionShipmentStatus(shipment.status, event);
  if (!result.ok) return { ok: false, reason: result.reason };
  if (!result.changed) return { ok: true, value: order, changed: false };

  const timestamp = occurredAt ?? now();
  const updatedShipment: Shipment = {
    ...shipment,
    status: result.status,
    shippedAt: result.status === "shipped" ? timestamp : shipment.shippedAt,
    deliveredAt: result.status === "delivered" ? timestamp : shipment.deliveredAt,
    updatedAt: timestamp,
  };

  let next: Order = {
    ...order,
    shipments: order.shipments.map((entry) =>
      entry.id === shipmentId ? updatedShipment : entry,
    ),
  };

  // The parcel's state is what its items' fulfilment now reflects.
  const status = itemStatusForShipment(result.status);
  for (const itemId of shipment.itemIds) {
    next = withItem(next, itemId, { fulfillmentStatus: status });
  }

  await orderRepository.saveOrder(next);
  return { ok: true, value: next, changed: true };
}

/* ------------------------------------------------------------------ *
 * Payment
 * ------------------------------------------------------------------ */

/** Records the commercial outcome. Says nothing about manufacturing. */
export async function setPaymentState(
  reference: string,
  status: Order["payment"]["status"],
): Promise<EventResult<Order>> {
  const order = await orderRepository.findOrder(reference);
  if (!order) return { ok: false, reason: "That order does not exist." };

  const next = reconcile({ ...order, payment: { ...order.payment, status } });
  await orderRepository.saveOrder(next);
  return { ok: true, value: next, changed: true };
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export async function findOrder(reference: string): Promise<Order | undefined> {
  return orderRepository.findOrder(reference);
}

/**
 * The tracking a customer is allowed to see.
 *
 * Assembled by projection: manufacturing detail passes through
 * `toCustomerTracking`, which builds its result from safe fields rather than
 * copying the job and removing what should not be there.
 */
export interface OrderTracking {
  order: Order;
  jobs: Record<string, ReturnType<typeof toCustomerTracking>>;
}

export async function getOrderTracking(
  reference: string,
): Promise<OrderTracking | undefined> {
  const order = await orderRepository.findOrder(reference);
  if (!order) return undefined;

  const jobs = await orderRepository.findJobsForOrder(reference);

  return {
    order,
    jobs: Object.fromEntries(jobs.map((job) => [job.id, toCustomerTracking(job)])),
  };
}

export { aggregateOrderStatus, reconcile as reconcileOrder };
