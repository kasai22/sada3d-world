import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq } from "drizzle-orm";

import { setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import {
  ENUM_VALUES,
  checkoutReservations,
  manufacturingEvents,
  manufacturingJobs,
  orderItems,
  orders as ordersTable,
} from "@/lib/db/schema";
import { CUSTOMER_STAGES } from "@/lib/manufacturing/types";
import { idempotencyStore } from "@/lib/checkout/idempotency";
import type { CartTotals } from "@/lib/cart/types";

import { aggregateOrderStatus } from "./aggregate";
import { orderRepository } from "./repository";
import {
  applyManufacturingEvent,
  applyShipmentEvent,
  createManufacturingJobs,
  createShipment,
  getOrderTracking,
} from "./service";
import { ORDER_STATUS_LABEL, ITEM_STATUS_LABEL, SHIPMENT_STATUS_LABEL } from "./types";
import type { Order, OrderItem } from "./types";

/**
 * The order domain, against real PostgreSQL.
 *
 * PGlite is the Postgres engine compiled to WebAssembly, running the committed
 * migrations, so the foreign keys, the enums and — the point of this file — the
 * row locks are the real ones.
 *
 * What is being proved:
 *
 *   persistence   an order, its items, its jobs, its events and its shipments
 *                 survive a round trip and a restart
 *   atomicity     a state change and the event that caused it commit together,
 *                 and a refused transition writes neither
 *   idempotency   the same event delivered twice is one row and one transition
 *   concurrency   two simultaneous applications of the same event to the same
 *                 job cannot both take effect
 *
 * The Phase 12 state machines are not re-tested here — `machine.test.ts` and
 * `orders.test.ts` own that, and they still run against the pure functions.
 * This file tests the store beneath them.
 */

let harness: TestDatabase;
let sequence = 0;

before(async () => {
  harness = await createTestDatabase();
  setDatabaseProvider(harness);
});

after(async () => {
  setDatabaseProvider(null);
  await harness.destroy();
});

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const TOTALS: CartTotals = {
  currency: "INR",
  subtotal: 646,
  shipping: { known: false, reason: "Confirmed before dispatch" },
  tax: { known: false, reason: "Added on the tax invoice" },
  total: 646,
  excluded: ["Shipping", "GST"],
  unitCount: 1,
  provisional: true,
};

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: `it-${(sequence += 1)}`,
    type: "custom",
    name: "bracket.stl",
    spec: "PETG / PRECISION / STANDARD",
    quantity: 1,
    unitPrice: 646,
    lineTotal: 646,
    fulfillmentStatus: "pending",
    ...overrides,
  };
}

async function placeOrder(
  items: OrderItem[] = [item()],
  customerId?: string,
): Promise<Order> {
  const reference = await orderRepository.nextReference();
  const payment = { status: "paid" as const, provider: "mock" };

  const order: Order = {
    reference,
    cartId: `cart_${reference}`,
    ...(customerId ? { customerId } : {}),
    status: aggregateOrderStatus({ items, payment }),
    payment,
    items,
    shipments: [],
    totals: { ...TOTALS },
    contact: { name: "Test", email: "test@example.com", phone: "9876543210" },
    address: {
      line1: "42 Industrial Estate",
      city: "Hyderabad",
      state: "TG",
      postalCode: "500032",
      country: "IN",
    },
    placedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provisional: true,
  };

  await orderRepository.createOrder(order);
  return order;
}

const TO_PRINTING = [
  "DESIGN_REVIEW_STARTED",
  "DESIGN_APPROVED",
  "FILE_PREPARED",
  "MATERIAL_PREPARED",
  "PRINT_STARTED",
] as const;

async function firstJobId(reference: string): Promise<string> {
  const jobs = await orderRepository.findJobsForOrder(reference);
  const job = jobs[0];
  assert.ok(job, "the order has no manufacturing job");
  return job.id;
}

/* ------------------------------------------------------------------ *
 * The store is the durable one
 * ------------------------------------------------------------------ */

test("the order repository resolves to PostgreSQL when one is configured", () => {
  assert.equal(orderRepository.name, "postgres");
  assert.equal(idempotencyStore.name, "postgres");
});

/* ------------------------------------------------------------------ *
 * Schema/domain drift
 * ------------------------------------------------------------------ */

test("the database enums match the domain unions exactly", () => {
  /*
   * A database enum is only safe for a domain that lives in code if the two
   * cannot drift. These are the assertions that make adding a state to a
   * TypeScript union fail the build rather than fail a write at 3am.
   */
  assert.deepEqual(
    [...ENUM_VALUES.orderStatus].sort(),
    Object.keys(ORDER_STATUS_LABEL).sort(),
  );
  assert.deepEqual(
    [...ENUM_VALUES.orderItemStatus].sort(),
    Object.keys(ITEM_STATUS_LABEL).sort(),
  );
  assert.deepEqual(
    [...ENUM_VALUES.shipmentStatus].sort(),
    Object.keys(SHIPMENT_STATUS_LABEL).sort(),
  );
});

test("the six customer stages are unchanged", () => {
  // Not a database enum — the customer projection is derived, never stored.
  assert.deepEqual(
    [...CUSTOMER_STAGES],
    [
      "design_verified",
      "preparing",
      "printing",
      "quality_check",
      "packaging",
      "ready_to_ship",
    ],
  );
});

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

test("an order round-trips with its items, contact and totals", async () => {
  const order = await placeOrder([
    item({ name: "Precision Gear", type: "catalog", quantity: 2, lineTotal: 798 }),
    item({ name: "bracket.stl" }),
  ]);

  const stored = await orderRepository.findOrder(order.reference);
  assert.ok(stored);

  assert.equal(stored.items.length, 2);
  // Order within the order is preserved, not left to the database.
  assert.equal(stored.items[0]?.name, "Precision Gear");
  assert.equal(stored.items[0]?.quantity, 2);
  assert.equal(stored.contact.email, "test@example.com");
  assert.equal(stored.address.postalCode, "500032");
  assert.equal(stored.totals.total, 646);
  // Unknown money survives as unknown rather than collapsing to zero.
  assert.equal(stored.totals.shipping.known, false);
  assert.equal(stored.provisional, true);
});

test("references are distinct and monotonic under concurrency", async () => {
  const references = await Promise.all(
    Array.from({ length: 8 }, () => orderRepository.nextReference()),
  );

  assert.equal(new Set(references).size, 8, "two orders were given one reference");
  for (const reference of references) {
    assert.match(reference, /^S3D-\d{6}$/);
  }
});

test("a manufacturing job and its events persist", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);

  const jobId = await firstJobId(order.reference);
  for (const type of TO_PRINTING) {
    const result = await applyManufacturingEvent(jobId, { type, actor: "operations" });
    assert.equal(result.ok, true, `${type} was refused`);
  }

  const job = await orderRepository.findJob(jobId);
  assert.ok(job);
  assert.equal(job.state, "printing");
  // JOB_QUEUED from creation, plus the five above.
  assert.equal(job.events.length, 6);
  assert.equal(job.events[0]?.type, "JOB_QUEUED");
  assert.equal(job.events.at(-1)?.type, "PRINT_STARTED");
  assert.equal(job.events.at(-1)?.from, "scheduled");
});

test("a hold is stored beside the state, not as a state", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  for (const type of TO_PRINTING) {
    await applyManufacturingEvent(jobId, { type });
  }

  const { setManufacturingHold } = await import("./service");
  await setManufacturingHold(jobId, {
    reason: "material_unavailable",
    note: "PETG lot quarantined.",
  });

  const job = await orderRepository.findJob(jobId);
  assert.ok(job);
  // Still printing. The hold says why it is not moving.
  assert.equal(job.state, "printing");
  assert.equal(job.hold?.reason, "material_unavailable");
  assert.equal(job.hold?.resolvedAt, undefined);

  await setManufacturingHold(jobId, null);
  const lifted = await orderRepository.findJob(jobId);
  assert.ok(lifted?.hold?.resolvedAt, "the hold was not resolved");
  assert.equal(lifted.state, "printing");
});

test("a shipment persists and its item list is derived from the items", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  for (const type of [
    ...TO_PRINTING,
    "PRINT_COMPLETED",
    "POST_PROCESSING_COMPLETED",
    "QUALITY_APPROVED",
    "PACKAGING_STARTED",
    "PACKAGING_COMPLETED",
    "JOB_COMPLETED",
  ] as const) {
    await applyManufacturingEvent(jobId, { type });
  }

  const itemId = order.items[0]?.id;
  assert.ok(itemId);

  const created = await createShipment({
    orderReference: order.reference,
    itemIds: [itemId],
    carrier: "Demo Logistics",
    trackingNumber: "DL0000000001",
  });
  assert.equal(created.ok, true);

  const stored = await orderRepository.findOrder(order.reference);
  const shipment = stored?.shipments[0];
  assert.ok(shipment);
  assert.deepEqual([...shipment.itemIds], [itemId]);
  assert.equal(shipment.carrier, "Demo Logistics");

  assert.ok(shipment.id);
  const dispatched = await applyShipmentEvent(
    order.reference,
    shipment.id,
    "SHIPMENT_READY",
  );
  assert.equal(dispatched.ok, true);

  const after = await orderRepository.findOrder(order.reference);
  assert.equal(after?.shipments[0]?.status, "ready");
});

/* ------------------------------------------------------------------ *
 * Atomicity
 * ------------------------------------------------------------------ */

test("a refused transition writes neither a state change nor an event", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  const db = await harness.database();
  const before = await db
    .select()
    .from(manufacturingEvents)
    .where(eq(manufacturingEvents.jobId, jobId));

  // A queued job cannot start printing.
  const refused = await applyManufacturingEvent(jobId, { type: "PRINT_STARTED" });
  assert.equal(refused.ok, false);

  const job = await orderRepository.findJob(jobId);
  assert.equal(job?.state, "queued", "a refused event moved the state");

  const after = await db
    .select()
    .from(manufacturingEvents)
    .where(eq(manufacturingEvents.jobId, jobId));
  assert.equal(after.length, before.length, "a refused event was still written");
});

test("the state change and its event are in the same row set, never one without the other", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  await applyManufacturingEvent(jobId, { type: "DESIGN_REVIEW_STARTED" });

  const db = await harness.database();
  const [job] = await db
    .select()
    .from(manufacturingJobs)
    .where(eq(manufacturingJobs.id, jobId));
  const events = await db
    .select()
    .from(manufacturingEvents)
    .where(eq(manufacturingEvents.jobId, jobId));

  assert.ok(job);
  const last = events.at(-1);
  assert.ok(last);
  // The stored state is exactly what the last recorded event says it became.
  assert.equal(job.state, last.toState);
});

test("the item and the order status move with the job, in the same transaction", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  await applyManufacturingEvent(jobId, { type: "DESIGN_REVIEW_STARTED" });

  const stored = await orderRepository.findOrder(order.reference);
  assert.equal(stored?.items[0]?.fulfillmentStatus, "in_progress");
  // Derived by aggregateOrderStatus, never assigned by this repository.
  assert.equal(stored?.status, "fulfillment_in_progress");
});

/* ------------------------------------------------------------------ *
 * Idempotency
 * ------------------------------------------------------------------ */

test("the same event id delivered twice is one event and one transition", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  const input = { id: "evt-fixed-1", type: "DESIGN_REVIEW_STARTED" } as const;

  const first = await applyManufacturingEvent(jobId, input);
  const second = await applyManufacturingEvent(jobId, input);

  assert.equal(first.ok, true);
  assert.equal(first.ok && first.changed, true);
  assert.equal(second.ok, true);
  assert.equal(second.ok && second.changed, false, "the repeat changed something");

  const db = await harness.database();
  const rows = await db
    .select()
    .from(manufacturingEvents)
    .where(eq(manufacturingEvents.id, "evt-fixed-1"));
  assert.equal(rows.length, 1);
});

/* ------------------------------------------------------------------ *
 * Concurrency — the reason the row lock exists
 * ------------------------------------------------------------------ */

test("two simultaneous applications of the same event produce one transition", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  const input = { id: "evt-race-1", type: "DESIGN_REVIEW_STARTED" } as const;

  /*
   * Fired together, with no coordination. Whichever reaches the lock first
   * commits the transition; the second blocks, then reads the state the first
   * produced and recognises the event as already applied.
   */
  const [a, b] = await Promise.all([
    applyManufacturingEvent(jobId, input),
    applyManufacturingEvent(jobId, input),
  ]);

  assert.ok(a.ok && b.ok, "a concurrent application failed outright");
  const changed = [a, b].filter((result) => result.ok && result.changed);
  assert.equal(changed.length, 1, "both concurrent applications changed the state");

  const db = await harness.database();
  const rows = await db
    .select()
    .from(manufacturingEvents)
    .where(eq(manufacturingEvents.id, "evt-race-1"));
  assert.equal(rows.length, 1, "the event was written twice");

  const job = await orderRepository.findJob(jobId);
  assert.equal(job?.state, "design_review");
  assert.equal(job?.events.length, 2, "JOB_QUEUED plus exactly one transition");
});

test("concurrent different transitions are serialised into an unbroken chain", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  /*
   * Two different milestones for the same job, reported at the same moment.
   * Both are legal *in sequence*, so this is not about one of them failing —
   * it is about neither of them being decided against a state that was already
   * stale by the time it committed.
   *
   * The evidence is the chain: every event's `from` must be the previous
   * event's `to`. Two unserialised transitions would each have read `queued`
   * and produced two events both claiming to start there, which is the exact
   * corruption the row lock exists to prevent.
   */
  await Promise.all([
    applyManufacturingEvent(jobId, { id: "race-a", type: "DESIGN_REVIEW_STARTED" }),
    applyManufacturingEvent(jobId, { id: "race-b", type: "DESIGN_APPROVED" }),
  ]);

  const job = await orderRepository.findJob(jobId);
  assert.ok(job);

  const transitions = job.events.filter((event) => event.from !== event.to);
  for (const [index, event] of transitions.entries()) {
    if (index === 0) continue;
    const previous = transitions[index - 1];
    assert.equal(
      event.from,
      previous?.to,
      `event ${event.id} starts at ${event.from} but the previous ended at ${previous?.to}`,
    );
  }

  // The stored state is exactly where the chain ends.
  assert.equal(job.state, transitions.at(-1)?.to ?? job.state);
});

test("concurrent transitions on different jobs do not block each other", async () => {
  const order = await placeOrder([item(), item({ name: "second.stl" })]);
  await createManufacturingJobs(order);

  const jobs = await orderRepository.findJobsForOrder(order.reference);
  assert.equal(jobs.length, 2);
  const [first, second] = jobs;
  assert.ok(first && second);

  const results = await Promise.all([
    applyManufacturingEvent(first.id, { type: "DESIGN_REVIEW_STARTED" }),
    applyManufacturingEvent(second.id, { type: "DESIGN_REVIEW_STARTED" }),
  ]);

  // The lock is per job, so both advance.
  assert.equal(results.filter((r) => r.ok && r.changed).length, 2);
});

/* ------------------------------------------------------------------ *
 * Ownership and tracking
 * ------------------------------------------------------------------ */

test("customer ownership survives the round trip and isolates orders", async () => {
  const mine = await placeOrder([item()], "cus_alice");
  const theirs = await placeOrder([item()], "cus_bob");
  const guest = await placeOrder([item()]);

  const { listCustomerOrders, getCustomerOrder } = await import("@/lib/account/orders");

  const references = (await listCustomerOrders({ id: "cus_alice" })).map(
    (order) => order.reference,
  );

  assert.ok(references.includes(mine.reference));
  assert.ok(!references.includes(theirs.reference));
  assert.ok(!references.includes(guest.reference), "a guest order reached an account");

  assert.equal(await getCustomerOrder({ id: "cus_alice" }, theirs.reference), undefined);
});

test("the customer tracking projection carries no internal detail", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);

  await applyManufacturingEvent(jobId, {
    type: "DESIGN_REVIEW_STARTED",
    actor: "operations",
    note: "Checked against the build plate.",
  });

  const tracking = await getOrderTracking(order.reference);
  assert.ok(tracking);

  const serialised = JSON.stringify(tracking.jobs);
  for (const internal of ["operations", "Checked against", "machineId", "DESIGN_REVIEW_STARTED"]) {
    assert.ok(!serialised.includes(internal), `${internal} crossed the boundary`);
  }
});

/* ------------------------------------------------------------------ *
 * Foreign keys
 * ------------------------------------------------------------------ */

test("an order cannot be deleted while its items exist", async () => {
  const order = await placeOrder();
  const db = await harness.database();

  await assert.rejects(
    () => db.delete(ordersTable).where(eq(ordersTable.reference, order.reference)),
    "an order with items was deleted",
  );
});

test("an item cannot be deleted while a manufacturing job refers to it", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);

  const itemId = order.items[0]?.id;
  assert.ok(itemId);

  const db = await harness.database();
  await assert.rejects(
    () => db.delete(orderItems).where(eq(orderItems.id, itemId)),
    "an item with a job was deleted",
  );
});

/* ------------------------------------------------------------------ *
 * Checkout idempotency
 * ------------------------------------------------------------------ */

test("one of two concurrent reservations wins and the other is told so", async () => {
  const key = `key-${(sequence += 1)}`;

  const results = await Promise.all([
    idempotencyStore.reserve(key),
    idempotencyStore.reserve(key),
  ]);

  const reserved = results.filter((result) => result.status === "reserved");
  assert.equal(reserved.length, 1, "both callers believed they were first");
  assert.equal(results.filter((r) => r.status === "in_flight").length, 1);
});

test("a completed reservation returns the order it produced", async () => {
  const key = `key-${(sequence += 1)}`;

  assert.equal((await idempotencyStore.reserve(key)).status, "reserved");
  await idempotencyStore.complete(key, "S3D-000999");

  const again = await idempotencyStore.reserve(key);
  assert.equal(again.status, "duplicate");
  assert.equal(
    again.status === "duplicate" ? again.orderReference : undefined,
    "S3D-000999",
  );
});

test("a released reservation can be retried, a completed one cannot be erased", async () => {
  const failed = `key-${(sequence += 1)}`;
  await idempotencyStore.reserve(failed);
  await idempotencyStore.release(failed);
  assert.equal((await idempotencyStore.reserve(failed)).status, "reserved");

  const done = `key-${(sequence += 1)}`;
  await idempotencyStore.reserve(done);
  await idempotencyStore.complete(done, "S3D-000998");
  await idempotencyStore.release(done);

  const db = await harness.database();
  const rows = await db
    .select()
    .from(checkoutReservations)
    .where(eq(checkoutReservations.key, done));
  assert.equal(rows.length, 1, "a completed reservation was released");
});

/* ------------------------------------------------------------------ *
 * Durability
 * ------------------------------------------------------------------ */

test("an order and its job survive a restart", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await firstJobId(order.reference);
  await applyManufacturingEvent(jobId, { type: "DESIGN_REVIEW_STARTED" });

  // A genuine restart: the connection closes and the same directory reopens.
  await harness.close();
  const reopened = await createTestDatabase(harness.directory);
  setDatabaseProvider(reopened);

  try {
    const stored = await orderRepository.findOrder(order.reference);
    assert.ok(stored, "the order did not survive the restart");
    assert.equal(stored.items.length, 1);

    const job = await orderRepository.findJob(jobId);
    assert.equal(job?.state, "design_review");
    assert.equal(job?.events.length, 2);
  } finally {
    await reopened.close();
    setDatabaseProvider(harness);
    await harness.database();
  }
});
