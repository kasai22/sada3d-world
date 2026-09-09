import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateOrderStatus, itemStatusForManufacturing } from "./aggregate";
import { authorizeOrderByEmail } from "./access";
import { FIXTURE_EMAIL, seedTrackingFixtures } from "./fixtures";
import { orderRepository } from "./repository";
import {
  applyShipmentEvent,
  applyManufacturingEvent,
  createShipment,
  getOrderTracking,
} from "./service";
import {
  itemStatusForShipment,
  transitionShipmentStatus,
  type ShipmentEventType,
} from "./shipment";
import type {
  OrderItem,
  OrderItemFulfillmentStatus,
  OrderPayment,
  ShipmentStatus,
} from "./types";

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

const PAID: OrderPayment = { status: "paid" };

const item = (
  status: OrderItemFulfillmentStatus,
  type: "catalog" | "custom" = "catalog",
): OrderItem => ({
  id: `i-${status}-${type}-${Math.random().toString(36).slice(2, 6)}`,
  type,
  name: type === "custom" ? "bracket.stl" : "Precision Gear",
  spec: "PLA / BLACK",
  quantity: 1,
  unitPrice: 399,
  lineTotal: 399,
  fulfillmentStatus: status,
});

const status = (items: OrderItem[], payment: OrderPayment = PAID, cancelledAt?: string) =>
  aggregateOrderStatus({ items, payment, cancelledAt });

test("a paid order with nothing started is confirmed", () => {
  assert.equal(status([item("pending")]), "confirmed");
});

test("one custom item printing puts the order in fulfilment", () => {
  assert.equal(status([item("in_progress", "custom")]), "fulfillment_in_progress");
});

test("one item delivered fulfils the order", () => {
  assert.equal(status([item("delivered", "custom")]), "fulfilled");
});

test("a shipped catalog item beside a printing custom item is partial", () => {
  assert.equal(
    status([item("shipped"), item("in_progress", "custom")]),
    "partially_fulfilled",
  );
});

test("every item shipped fulfils the order", () => {
  assert.equal(status([item("shipped"), item("delivered")]), "fulfilled");
});

test("a dispatched item beside one not yet started is partial", () => {
  assert.equal(status([item("shipped"), item("pending")]), "partially_fulfilled");
});

test("a ready item is still active, not fulfilled", () => {
  assert.equal(status([item("ready")]), "fulfillment_in_progress");
});

test("payment takes precedence over any progress", () => {
  assert.equal(
    status([item("shipped")], { status: "pending" }),
    "pending",
  );
  assert.equal(
    status([item("in_progress")], { status: "failed" }),
    "awaiting_payment",
  );
});

test("a failed payment is not a failed order", () => {
  // It is recoverable: the customer can pay again.
  assert.notEqual(status([item("pending")], { status: "failed" }), "failed");
});

test("an explicitly cancelled order is cancelled whatever its items say", () => {
  assert.equal(
    status([item("shipped"), item("in_progress")], PAID, "2026-09-01T00:00:00.000Z"),
    "cancelled",
  );
});

test("an order whose every item is cancelled is cancelled", () => {
  assert.equal(status([item("cancelled"), item("cancelled")]), "cancelled");
});

test("a cancelled item is ignored when the rest are fulfilled", () => {
  assert.equal(status([item("delivered"), item("cancelled")]), "fulfilled");
});

test("an order whose every item failed has failed", () => {
  assert.equal(status([item("failed"), item("failed")]), "failed");
});

test("one failed item beside one delivered is partial, not failed", () => {
  assert.equal(status([item("delivered"), item("failed")]), "partially_fulfilled");
});

test("an empty order is not in fulfilment", () => {
  assert.equal(status([]), "confirmed");
  assert.equal(status([], { status: "pending" }), "pending");
});

test("manufacturing state translates to one item status", () => {
  assert.equal(itemStatusForManufacturing("printing"), "in_progress");
  assert.equal(itemStatusForManufacturing("quality_check"), "in_progress");
  assert.equal(itemStatusForManufacturing("ready_for_dispatch"), "ready");
  assert.equal(itemStatusForManufacturing("completed"), "ready");
  assert.equal(itemStatusForManufacturing("failed"), "failed");
  assert.equal(itemStatusForManufacturing("cancelled"), "cancelled");
});

test("a completed job makes an item ready, never shipped", () => {
  // The handoff. Manufacturing finishing does not put a part in a van.
  assert.equal(itemStatusForManufacturing("completed"), "ready");
  assert.notEqual(itemStatusForManufacturing("completed"), "shipped");
});

/* ------------------------------------------------------------------ *
 * Shipment
 * ------------------------------------------------------------------ */

const shipmentWalk = (
  from: ShipmentStatus,
  events: readonly ShipmentEventType[],
): ShipmentStatus => {
  let state = from;
  for (const event of events) {
    const result = transitionShipmentStatus(state, event);
    assert.ok(result.ok, `${event} refused while ${state}`);
    state = result.status;
  }
  return state;
};

test("the shipment path runs pending to delivered", () => {
  assert.equal(
    shipmentWalk("pending", [
      "SHIPMENT_READY",
      "SHIPMENT_DISPATCHED",
      "SHIPMENT_IN_TRANSIT",
      "SHIPMENT_DELIVERED",
    ]),
    "delivered",
  );
});

test("a pending shipment cannot be delivered", () => {
  assert.equal(
    transitionShipmentStatus("pending", "SHIPMENT_DELIVERED").ok,
    false,
  );
});

test("a shipment cannot be dispatched before it is ready", () => {
  assert.equal(
    transitionShipmentStatus("pending", "SHIPMENT_DISPATCHED").ok,
    false,
  );
});

test("delivery is accepted without an in-transit scan", () => {
  assert.equal(shipmentWalk("shipped", ["SHIPMENT_DELIVERED"]), "delivered");
});

test("a delivered shipment cannot be reopened", () => {
  for (const event of [
    "SHIPMENT_READY",
    "SHIPMENT_DISPATCHED",
    "SHIPMENT_IN_TRANSIT",
    "SHIPMENT_FAILED",
    "SHIPMENT_CANCELLED",
  ] as ShipmentEventType[]) {
    assert.equal(
      transitionShipmentStatus("delivered", event).ok,
      false,
      `${event} reopened a delivered shipment`,
    );
  }
});

test("a shipment already in the network cannot be cancelled", () => {
  assert.equal(transitionShipmentStatus("shipped", "SHIPMENT_CANCELLED").ok, false);
  assert.equal(transitionShipmentStatus("in_transit", "SHIPMENT_CANCELLED").ok, false);
});

test("a repeated delivery scan changes nothing", () => {
  const result = transitionShipmentStatus("delivered", "SHIPMENT_DELIVERED");
  assert.ok(result.ok);
  assert.equal(result.changed, false);
});

test("a shipment's status becomes its items' fulfilment", () => {
  assert.equal(itemStatusForShipment("ready"), "ready");
  assert.equal(itemStatusForShipment("shipped"), "shipped");
  assert.equal(itemStatusForShipment("in_transit"), "shipped");
  assert.equal(itemStatusForShipment("delivered"), "delivered");
});

/* ------------------------------------------------------------------ *
 * The fixtures, which exercise the real machine end to end
 * ------------------------------------------------------------------ */

test("the seven scenarios seed through the real state machine", async () => {
  await seedTrackingFixtures();

  const references = [
    "DEMO-0001",
    "DEMO-0002",
    "DEMO-0003",
    "DEMO-0004",
    "DEMO-0005",
    "DEMO-0006",
    "DEMO-0007",
  ];

  for (const reference of references) {
    const order = await orderRepository.findOrder(reference);
    assert.ok(order, `${reference} was not seeded`);
    assert.equal(order.demo, true, `${reference} is not marked as a demo order`);
    assert.ok(reference.startsWith("DEMO-"), "a fixture used a real reference format");
  }
});

test("each fixture reaches the state it is meant to demonstrate", async () => {
  await seedTrackingFixtures();

  const expected: Record<string, string> = {
    "DEMO-0001": "queued",
    "DEMO-0002": "printing",
    "DEMO-0003": "quality_check",
    "DEMO-0004": "rework",
    "DEMO-0005": "completed",
    "DEMO-0006": "completed",
    "DEMO-0007": "printing",
  };

  for (const [reference, state] of Object.entries(expected)) {
    const jobs = await orderRepository.findJobsForOrder(reference);
    assert.equal(jobs[0]?.state, state, `${reference} is ${jobs[0]?.state}`);
  }
});

test("the mixed order is partially fulfilled with per-item status", async () => {
  await seedTrackingFixtures();

  const order = await orderRepository.findOrder("DEMO-0007");
  assert.ok(order);
  assert.equal(order.status, "partially_fulfilled");

  const catalog = order.items.find((entry) => entry.type === "catalog");
  const custom = order.items.find((entry) => entry.type === "custom");

  assert.equal(catalog?.fulfillmentStatus, "shipped");
  assert.equal(custom?.fulfillmentStatus, "in_progress");
  // The stocked part has no manufacturing job: it was not manufactured.
  assert.equal(catalog?.manufacturingJobId, undefined);
  assert.ok(custom?.manufacturingJobId);
});

test("a shipped fixture carries a real carrier reference or none at all", async () => {
  await seedTrackingFixtures();

  const order = await orderRepository.findOrder("DEMO-0006");
  const shipment = order?.shipments[0];

  assert.equal(shipment?.status, "in_transit");
  assert.ok(shipment?.trackingNumber, "a shipped parcel has no tracking number");

  const packed = await orderRepository.findOrder("DEMO-0005");
  // Not dispatched, so no carrier was invented for it.
  assert.equal(packed?.shipments[0]?.status, "pending");
  assert.equal(packed?.shipments[0]?.trackingNumber, undefined);
});

test("a held job keeps its state and hides the internal note", async () => {
  await seedTrackingFixtures();

  const tracking = await getOrderTracking("DEMO-0007");
  assert.ok(tracking);

  const job = Object.values(tracking.jobs)[0];
  assert.ok(job);
  assert.equal(job.state, "printing", "the hold changed the state");
  assert.equal(job.hold?.reason, "material_unavailable");
  assert.ok(!JSON.stringify(job).includes("quarantined"), "an operator note leaked");
});

/* ------------------------------------------------------------------ *
 * Service invariants
 * ------------------------------------------------------------------ */

test("an item cannot be shipped before it is ready", async () => {
  await seedTrackingFixtures();

  const result = await createShipment({
    orderReference: "DEMO-0002",
    itemIds: ["DEMO-0002-01"],
  });

  assert.equal(result.ok, false, "a printing part was put in a parcel");
});

test("a shipment event cannot be applied to a shipment that does not exist", async () => {
  await seedTrackingFixtures();
  const result = await applyShipmentEvent("DEMO-0001", "shp_nope", "SHIPMENT_READY");
  assert.equal(result.ok, false);
});

test("the same manufacturing event id applied twice moves the job once", async () => {
  await seedTrackingFixtures();

  const jobs = await orderRepository.findJobsForOrder("DEMO-0001");
  const jobId = jobs[0]?.id;
  assert.ok(jobId);

  const first = await applyManufacturingEvent(jobId, {
    id: "dup-1",
    type: "DESIGN_REVIEW_STARTED",
  });
  const second = await applyManufacturingEvent(jobId, {
    id: "dup-1",
    type: "DESIGN_REVIEW_STARTED",
  });

  assert.ok(first.ok && first.changed);
  assert.ok(second.ok);
  assert.equal(second.ok && second.changed, false);

  const job = await orderRepository.findJob(jobId);
  const applied = job?.events.filter((event) => event.id === "dup-1") ?? [];
  assert.equal(applied.length, 1, "the event was recorded twice");
});

test("concurrent reports of the same milestone leave one transition", async () => {
  await seedTrackingFixtures();

  const jobs = await orderRepository.findJobsForOrder("DEMO-0003");
  const jobId = jobs[0]?.id;
  assert.ok(jobId);

  // Two operator surfaces reporting the same approval at the same moment.
  const [a, b] = await Promise.all([
    applyManufacturingEvent(jobId, { id: "race-a", type: "QUALITY_APPROVED" }),
    applyManufacturingEvent(jobId, { id: "race-b", type: "QUALITY_APPROVED" }),
  ]);

  assert.ok(a.ok);
  assert.ok(b.ok);

  const job = await orderRepository.findJob(jobId);
  assert.equal(job?.state, "approved");

  const approvals = job?.events.filter((event) => event.type === "QUALITY_APPROVED") ?? [];
  assert.equal(approvals.length, 1, `${approvals.length} approvals were recorded`);
});

test("an invalid event is refused with a reason and changes nothing", async () => {
  await seedTrackingFixtures();

  const jobs = await orderRepository.findJobsForOrder("DEMO-0001");
  const jobId = jobs[0]?.id;
  assert.ok(jobId);

  const before = await orderRepository.findJob(jobId);
  const result = await applyManufacturingEvent(jobId, { type: "JOB_COMPLETED" });
  const after = await orderRepository.findJob(jobId);

  assert.equal(result.ok, false);
  assert.equal(after?.state, before?.state);
  assert.equal(after?.events.length, before?.events.length);
});

/* ------------------------------------------------------------------ *
 * Authorization
 * ------------------------------------------------------------------ */

test("an order opens to the reference and the email together", async () => {
  await seedTrackingFixtures();

  const granted = await authorizeOrderByEmail("DEMO-0002", FIXTURE_EMAIL);
  assert.equal(granted.ok, true);
});

test("the reference alone opens nothing", async () => {
  await seedTrackingFixtures();

  const denied = await authorizeOrderByEmail("DEMO-0002", "someone@else.example");
  assert.equal(denied.ok, false);
});

test("a wrong email and an unknown reference give the same answer", async () => {
  await seedTrackingFixtures();

  const wrongEmail = await authorizeOrderByEmail("DEMO-0003", "nobody@example.com");
  const noSuchOrder = await authorizeOrderByEmail("S3D-999999", FIXTURE_EMAIL);

  assert.deepEqual(wrongEmail, noSuchOrder);
});

test("guessing is throttled after repeated failures", async () => {
  await seedTrackingFixtures();

  const reference = "DEMO-0005";
  let last = await authorizeOrderByEmail(reference, "a@guess.example");

  for (let i = 0; i < 6; i += 1) {
    last = await authorizeOrderByEmail(reference, `guess-${i}@example.com`);
  }

  assert.equal(last.ok, false);
  assert.equal(last.ok === false && last.reason, "throttled");
});

test("case and spacing in an email do not deny a legitimate customer", async () => {
  await seedTrackingFixtures();

  const granted = await authorizeOrderByEmail(
    "DEMO-0001",
    `  ${FIXTURE_EMAIL.toUpperCase()} `,
  );
  assert.equal(granted.ok, true);
});
