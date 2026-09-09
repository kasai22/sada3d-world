import type { ShipmentStatus } from "./types";

/**
 * The shipment state machine.
 *
 * Separate from manufacturing on purpose. A part being printed says nothing
 * about where a parcel is, and there is no edge in this graph that can be
 * reached from a manufacturing state — an item becomes ready first, and only a
 * ready item joins a shipment.
 */

export type ShipmentEventType =
  | "SHIPMENT_READY"
  | "SHIPMENT_DISPATCHED"
  | "SHIPMENT_IN_TRANSIT"
  | "SHIPMENT_DELIVERED"
  | "SHIPMENT_FAILED"
  | "SHIPMENT_CANCELLED";

interface Rule {
  from: readonly ShipmentStatus[];
  to: ShipmentStatus;
}

const RULES: Record<ShipmentEventType, Rule> = {
  SHIPMENT_READY: { from: ["pending"], to: "ready" },
  SHIPMENT_DISPATCHED: { from: ["ready"], to: "shipped" },
  SHIPMENT_IN_TRANSIT: { from: ["shipped"], to: "in_transit" },
  /*
   * Delivery is accepted from `shipped` as well as `in_transit`. Not every
   * carrier reports movement between the two, and refusing a delivery
   * confirmation because an optional scan never arrived would leave a delivered
   * parcel marked as shipped forever.
   */
  SHIPMENT_DELIVERED: { from: ["shipped", "in_transit"], to: "delivered" },
  SHIPMENT_FAILED: { from: ["shipped", "in_transit"], to: "failed" },
  /** Only before it leaves. A parcel in the network is not ours to cancel. */
  SHIPMENT_CANCELLED: { from: ["pending", "ready"], to: "cancelled" },
};

export const SHIPMENT_TERMINAL: readonly ShipmentStatus[] = [
  "delivered",
  "failed",
  "cancelled",
];

export type ShipmentTransitionResult =
  | { ok: true; status: ShipmentStatus; changed: boolean }
  | { ok: false; reason: string };

/**
 * Applies a shipment event.
 *
 * Same contract as the manufacturing machine: repeats are accepted and change
 * nothing, and anything the graph does not allow is refused with a reason.
 * `pending → delivered` is not a transition, and neither is anything that
 * skips dispatch.
 */
export function transitionShipmentStatus(
  current: ShipmentStatus,
  event: ShipmentEventType,
): ShipmentTransitionResult {
  const rule = RULES[event];

  if (current === rule.to) return { ok: true, status: current, changed: false };

  if (SHIPMENT_TERMINAL.includes(current)) {
    return { ok: false, reason: `A ${current} shipment cannot be reopened.` };
  }

  if (!rule.from.includes(current)) {
    return {
      ok: false,
      reason: `${event} is not valid while the shipment is ${current.replace(/_/g, " ")}.`,
    };
  }

  return { ok: true, status: rule.to, changed: true };
}

export function availableShipmentEvents(
  current: ShipmentStatus,
): ShipmentEventType[] {
  return (Object.keys(RULES) as ShipmentEventType[]).filter((event) => {
    const result = transitionShipmentStatus(current, event);
    return result.ok && result.changed;
  });
}

/** The fulfilment status an item takes from the parcel carrying it. */
export function itemStatusForShipment(
  status: ShipmentStatus,
): "ready" | "shipped" | "delivered" | "failed" | "cancelled" {
  switch (status) {
    case "pending":
    case "ready":
      return "ready";
    case "shipped":
    case "in_transit":
      return "shipped";
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}
