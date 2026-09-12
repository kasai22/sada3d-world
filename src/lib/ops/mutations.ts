import { UNREADABLE, asRecord, isOptionalText, isText } from "@/lib/api/action-input";
import {
  TERMINAL_STATES,
  isHoldActive,
  type ManufacturingEventType,
  type ManufacturingHoldReason,
} from "@/lib/manufacturing/types";
import { EVENTS, log } from "@/lib/observability";
import { parseOrderReference } from "@/lib/orders/reference";
import { orderRepository } from "@/lib/orders/repository";
import {
  applyManufacturingEvent,
  applyShipmentEvent,
  createShipment,
  setManufacturingHold,
} from "@/lib/orders/service";
import { availableShipmentEvents, type ShipmentEventType } from "@/lib/orders/shipment";

import {
  EVENT_LOG_LABEL,
  HOLD_REASONS,
  HOLD_REASON_LABEL,
  MANUFACTURING_STATE_LABEL,
  SHIPMENT_EVENT_ACTION_LABEL,
} from "./labels";
import type { OperatorSession } from "./operator";
import { consoleJobEvents } from "./pipeline";
import type { OpsActionResult } from "./types";

/**
 * What an operator can change, and the checks in front of each change.
 *
 * ── Events, never states ─────────────────────────────────────────────────
 *
 * Every change is reported to the order service as an event, and the service
 * asks the state machine whether it applies — exactly the path the Phase 12
 * fixtures and the customer cancellation route use. Nothing here names a target
 * state, and nothing here writes to a table.
 *
 * ── The checks this layer adds ───────────────────────────────────────────
 *
 * Only the ones the service cannot know about a console:
 *
 *   input shape       bounded text, closed sets, a real order reference
 *   belongs-to        the job or shipment is part of the order the form named,
 *                     so a crafted request cannot steer one order's page at
 *                     another order's job
 *   stale page        the state the operator was looking at is still the state,
 *                     so two people working one order cannot each apply a step
 *                     the other already took
 *   one parcel        an item already in a parcel is not put in a second one
 *
 * ── Attribution ──────────────────────────────────────────────────────────
 *
 * Manufacturing events record the operator's email as the actor — internal, in
 * the job's event log, never in the customer projection. Log lines carry the
 * operator's user id and record identifiers, never names, notes or addresses.
 */

export const MAX_NOTE_LENGTH = 500;
export const MAX_ID_LENGTH = 256;
export const MAX_SHIPMENT_ITEMS = 50;

const refuse = (message: string): OpsActionResult => ({ ok: false, message });

const STALE = "This changed since the page loaded. Reload it to see the current state.";

function applied(
  operator: OperatorSession,
  action: string,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  log.info(EVENTS.opsActionApplied, { operatorId: operator.id, action, ...fields });
}

function refused(
  operator: OperatorSession,
  action: string,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  log.warn(EVENTS.opsActionRefused, { operatorId: operator.id, action, ...fields });
}

function cleanNote(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/* ------------------------------------------------------------------ *
 * Manufacturing events
 * ------------------------------------------------------------------ */

export async function reportJobEvent(
  operator: OperatorSession,
  input: unknown,
): Promise<OpsActionResult> {
  const record = asRecord(input);
  const reference = parseOrderReference(record?.reference);

  if (
    !record ||
    !reference ||
    !isText(record.jobId, MAX_ID_LENGTH) ||
    !record.jobId ||
    !isText(record.event, 64) ||
    !isOptionalText(record.expectedState, 64) ||
    !isOptionalText(record.note, MAX_NOTE_LENGTH)
  ) {
    return refuse(UNREADABLE);
  }

  const job = await orderRepository.findJob(record.jobId);
  if (!job || job.orderReference !== reference) {
    return refuse("That job is not part of this order.");
  }

  if (record.expectedState && record.expectedState !== job.state) return refuse(STALE);

  const event = record.event as ManufacturingEventType;
  if (!consoleJobEvents(job.state).includes(event)) {
    return refuse(
      `That step is not available while the job is ${MANUFACTURING_STATE_LABEL[job.state].toLowerCase()}.`,
    );
  }

  const result = await applyManufacturingEvent(job.id, {
    type: event,
    actor: operator.email,
    note: cleanNote(record.note),
  });

  if (!result.ok) {
    refused(operator, "job_event", { orderReference: reference, jobId: job.id, type: event });
    return refuse(result.reason);
  }

  applied(operator, "job_event", {
    orderReference: reference,
    jobId: job.id,
    type: event,
    changed: result.changed,
  });

  return {
    ok: true,
    message: result.changed ? `${EVENT_LOG_LABEL[event]}.` : "Already recorded. Nothing changed.",
  };
}

/* ------------------------------------------------------------------ *
 * Holds
 * ------------------------------------------------------------------ */

export async function changeJobHold(
  operator: OperatorSession,
  input: unknown,
): Promise<OpsActionResult> {
  const record = asRecord(input);
  const reference = parseOrderReference(record?.reference);

  if (
    !record ||
    !reference ||
    !isText(record.jobId, MAX_ID_LENGTH) ||
    !record.jobId ||
    (record.intent !== "place" && record.intent !== "lift") ||
    !isOptionalText(record.reason, 64) ||
    !isOptionalText(record.note, MAX_NOTE_LENGTH)
  ) {
    return refuse(UNREADABLE);
  }

  const job = await orderRepository.findJob(record.jobId);
  if (!job || job.orderReference !== reference) {
    return refuse("That job is not part of this order.");
  }

  if (TERMINAL_STATES.includes(job.state)) {
    return refuse(`A ${MANUFACTURING_STATE_LABEL[job.state].toLowerCase()} job cannot be held.`);
  }

  const held = isHoldActive(job.hold);

  if (record.intent === "place") {
    const reason = record.reason as ManufacturingHoldReason;
    if (!HOLD_REASONS.includes(reason)) return refuse("Choose why production is being held.");
    if (held) return refuse("This job is already on hold. Lift the current hold first.");

    const result = await setManufacturingHold(job.id, { reason, note: cleanNote(record.note) });
    if (!result.ok) return refuse(result.reason);

    applied(operator, "hold_placed", { orderReference: reference, jobId: job.id, reason });
    return { ok: true, message: `Held for ${HOLD_REASON_LABEL[reason].toLowerCase()}.` };
  }

  if (!held) return refuse("This job is not on hold.");

  const result = await setManufacturingHold(job.id, null);
  if (!result.ok) return refuse(result.reason);

  applied(operator, "hold_lifted", { orderReference: reference, jobId: job.id });
  return { ok: true, message: "Hold lifted." };
}

/* ------------------------------------------------------------------ *
 * Shipments
 * ------------------------------------------------------------------ */

function trackingUrl(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 500) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function openShipment(
  operator: OperatorSession,
  input: unknown,
): Promise<OpsActionResult> {
  const record = asRecord(input);
  const reference = parseOrderReference(record?.reference);
  const itemIds = record?.itemIds;

  if (
    !record ||
    !reference ||
    !Array.isArray(itemIds) ||
    itemIds.length > MAX_SHIPMENT_ITEMS ||
    !itemIds.every((id) => isText(id, 128) && id.length > 0) ||
    !isOptionalText(record.carrier, 80) ||
    !isOptionalText(record.trackingNumber, 80)
  ) {
    return refuse(UNREADABLE);
  }

  if (itemIds.length === 0) return refuse("Choose at least one ready item for the shipment.");

  const url = trackingUrl(record.trackingUrl);
  if (url === null) return refuse("The tracking link must be a full http or https address.");

  const order = await orderRepository.findOrder(reference);
  if (!order) return refuse("That order could not be found.");

  const wanted = new Set(itemIds as string[]);
  const items = order.items.filter((item) => wanted.has(item.id));

  if (items.length !== wanted.size) return refuse("Some of those items are not part of this order.");
  if (items.some((item) => item.shipmentId)) {
    return refuse("An item you chose is already in a shipment. Reload the page.");
  }

  const result = await createShipment({
    orderReference: reference,
    itemIds: items.map((item) => item.id),
    carrier: cleanNote(record.carrier),
    trackingNumber: cleanNote(record.trackingNumber),
    trackingUrl: url,
  });

  if (!result.ok) {
    refused(operator, "shipment_opened", { orderReference: reference, items: items.length });
    return refuse(result.reason);
  }

  applied(operator, "shipment_opened", { orderReference: reference, items: items.length });
  return {
    ok: true,
    message: `Shipment opened for ${items.length === 1 ? "1 item" : `${items.length} items`}.`,
  };
}

export async function reportShipmentEvent(
  operator: OperatorSession,
  input: unknown,
): Promise<OpsActionResult> {
  const record = asRecord(input);
  const reference = parseOrderReference(record?.reference);

  if (
    !record ||
    !reference ||
    !isText(record.shipmentId, MAX_ID_LENGTH) ||
    !record.shipmentId ||
    !isText(record.event, 64) ||
    !isOptionalText(record.expectedStatus, 32)
  ) {
    return refuse(UNREADABLE);
  }

  const order = await orderRepository.findOrder(reference);
  const shipment = order?.shipments.find((entry) => entry.id === record.shipmentId);
  if (!order || !shipment) return refuse("That shipment is not part of this order.");

  if (record.expectedStatus && record.expectedStatus !== shipment.status) return refuse(STALE);

  const event = record.event as ShipmentEventType;
  if (!availableShipmentEvents(shipment.status).includes(event)) {
    return refuse("That update is not available for this shipment right now.");
  }

  const result = await applyShipmentEvent(reference, shipment.id, event);
  if (!result.ok) {
    refused(operator, "shipment_event", { orderReference: reference, shipmentId: shipment.id, type: event });
    return refuse(result.reason);
  }

  applied(operator, "shipment_event", {
    orderReference: reference,
    shipmentId: shipment.id,
    type: event,
    changed: result.changed,
  });

  return {
    ok: true,
    message: result.changed
      ? `${SHIPMENT_EVENT_ACTION_LABEL[event].replace(/^Mark /, "Marked ").replace(/^Cancel /, "Cancelled ")}.`
      : "Already recorded. Nothing changed.",
  };
}
