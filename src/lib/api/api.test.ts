import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { DEVELOPMENT_CUSTOMER_ID } from "@/lib/account/development";
import { setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { DomainError, statusForError } from "@/lib/errors";
import { checkManufacturability } from "@/lib/manufacturing/manufacturability";
import { analyzeModel } from "@/lib/models";
import { cube3mf, openMesh3mf } from "@/lib/models/fixtures";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { orderRepository } from "@/lib/orders/repository";
import { createManufacturingJobs, applyManufacturingEvent } from "@/lib/orders/service";
import type { Order, OrderItem } from "@/lib/orders/types";
import { calculateQuote } from "@/lib/pricing/calculateQuote";
import type { CartTotals } from "@/lib/cart/types";

import { analysisDto, orderDetailDto, quoteDto, trackingItemDto } from "./dto";
import {
  applyCustomerCommand,
  authorizeOrderRead,
  listOrdersForApi,
  parseCommand,
} from "./orders";

/**
 * The API layer.
 *
 * Tested at the service and DTO boundary rather than by spinning up HTTP: that
 * is where the authorization, the projection and the error mapping actually
 * live, and a route handler in this codebase is four lines that call one of
 * these and hand the result to `ok()`.
 *
 * The security properties are the point:
 *
 *   · a signed-out caller cannot list orders
 *   · an order that is not yours and an order that does not exist are the same
 *     answer, with the same status
 *   · no DTO carries an internal identifier, an operator note or a payment
 *     session
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

async function placeOrder(customerId?: string, items = [item()]): Promise<Order> {
  const reference = await orderRepository.nextReference();
  const payment = {
    status: "paid" as const,
    provider: "mock",
    sessionId: "sess_secret_value",
  };

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
      line2: "Unit 4",
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

/** Runs work with no signed-in customer, restoring the environment after. */
async function signedOut<T>(work: () => Promise<T>): Promise<T> {
  const original = process.env.SADA_DEV_ACCOUNT;
  process.env.SADA_DEV_ACCOUNT = "0";
  try {
    return await work();
  } finally {
    if (original === undefined) delete process.env.SADA_DEV_ACCOUNT;
    else process.env.SADA_DEV_ACCOUNT = original;
  }
}

/* ------------------------------------------------------------------ *
 * Authorization
 * ------------------------------------------------------------------ */

test("listing orders without an identity is refused, not answered empty", async () => {
  await signedOut(async () => {
    await assert.rejects(
      () => listOrdersForApi(),
      (error: unknown) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.kind, "unauthorized");
        assert.equal(statusForError(error), 401);
        return true;
      },
    );
  });
});

test("a signed-in customer sees only their own orders", async () => {
  const mine = await placeOrder(DEVELOPMENT_CUSTOMER_ID);
  const theirs = await placeOrder("cus_someone_else");

  const references = (await listOrdersForApi()).map((order) => order.reference);

  assert.ok(references.includes(mine.reference));
  assert.ok(!references.includes(theirs.reference));
});

test("an unknown reference and someone else's order are indistinguishable", async () => {
  const theirs = await placeOrder("cus_someone_else");

  const foreign = await authorizeOrderRead(theirs.reference).catch((e: unknown) => e);
  const missing = await authorizeOrderRead("S3D-999999").catch((e: unknown) => e);

  assert.ok(foreign instanceof DomainError && missing instanceof DomainError);
  // Same kind, same status, same words. Nothing distinguishes them.
  assert.equal(foreign.kind, "not_found");
  assert.equal(missing.kind, "not_found");
  assert.equal(statusForError(foreign), 404);
  assert.equal(statusForError(missing), 404);
  assert.equal(foreign.message, missing.message);
});

test("a guest order is not readable without a grant", async () => {
  const guest = await placeOrder();

  await assert.rejects(
    () => authorizeOrderRead(guest.reference),
    (error: unknown) => error instanceof DomainError && error.kind === "not_found",
  );
});

test("an order reference is normalised before it is looked up", async () => {
  const mine = await placeOrder(DEVELOPMENT_CUSTOMER_ID);

  const tracking = await authorizeOrderRead(`  ${mine.reference.toLowerCase()}  `);
  assert.equal(tracking.order.reference, mine.reference);
});

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

test("only the customer command vocabulary is accepted", () => {
  assert.equal(parseCommand("cancel"), "cancel");

  for (const hostile of [
    "PRINT_STARTED",
    "JOB_COMPLETED",
    "printing",
    "",
    null,
    { command: "cancel" },
  ]) {
    assert.throws(
      () => parseCommand(hostile),
      (error: unknown) => error instanceof DomainError && error.kind === "validation",
      `${String(hostile)} was accepted as a command`,
    );
  }
});

test("a cancellation the machine allows is applied", async () => {
  const order = await placeOrder(DEVELOPMENT_CUSTOMER_ID);
  await createManufacturingJobs(order);

  const result = await applyCustomerCommand(order.reference, "cancel");

  assert.equal(result.applied, true);

  const stored = await orderRepository.findOrder(order.reference);
  assert.equal(stored?.status, "cancelled");
});

test("a cancellation the machine refuses comes back as a conflict", async () => {
  const order = await placeOrder(DEVELOPMENT_CUSTOMER_ID);
  await createManufacturingJobs(order);

  const jobs = await orderRepository.findJobsForOrder(order.reference);
  const jobId = jobs[0]?.id;
  assert.ok(jobId);

  // Walk it onto a machine, past the point Phase 12 allows cancellation.
  for (const type of [
    "DESIGN_REVIEW_STARTED",
    "DESIGN_APPROVED",
    "FILE_PREPARED",
    "MATERIAL_PREPARED",
    "PRINT_STARTED",
    "PRINT_COMPLETED",
    "POST_PROCESSING_COMPLETED",
    "QUALITY_APPROVED",
    "PACKAGING_STARTED",
    "PACKAGING_COMPLETED",
    "JOB_COMPLETED",
  ] as const) {
    await applyManufacturingEvent(jobId, { type });
  }

  await assert.rejects(
    () => applyCustomerCommand(order.reference, "cancel"),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.kind, "invalid_state_transition");
      assert.equal(statusForError(error), 409);
      return true;
    },
  );
});

test("a repeated cancellation is idempotent rather than a second event", async () => {
  const order = await placeOrder(DEVELOPMENT_CUSTOMER_ID);
  await createManufacturingJobs(order);

  const first = await applyCustomerCommand(order.reference, "cancel");
  const second = await applyCustomerCommand(order.reference, "cancel");

  assert.equal(first.applied, true);
  assert.equal(second.applied, false);

  const jobs = await orderRepository.findJobsForOrder(order.reference);
  const cancellations = (jobs[0]?.events ?? []).filter(
    (event) => event.type === "JOB_CANCELLED",
  );
  assert.equal(cancellations.length, 1, "a second cancellation event was written");
});

test("a command on someone else's order is a 404, not a 403", async () => {
  const theirs = await placeOrder("cus_someone_else");

  await assert.rejects(
    () => applyCustomerCommand(theirs.reference, "cancel"),
    (error: unknown) => {
      // 403 would confirm the order exists. 404 says nothing either way.
      assert.ok(error instanceof DomainError);
      assert.equal(error.kind, "not_found");
      return true;
    },
  );
});

/* ------------------------------------------------------------------ *
 * DTOs
 * ------------------------------------------------------------------ */

test("the order DTO carries nothing internal", async () => {
  const order = await placeOrder(DEVELOPMENT_CUSTOMER_ID);
  const stored = await orderRepository.findOrder(order.reference);
  assert.ok(stored);

  const serialised = JSON.stringify(orderDetailDto(stored));

  for (const internal of [
    "sess_secret_value",
    "cartId",
    "cart_",
    "customerId",
    DEVELOPMENT_CUSTOMER_ID,
    "sessionId",
    "42 Industrial Estate",
    "Unit 4",
    "9876543210",
    "test@example.com",
  ]) {
    assert.ok(
      !serialised.includes(internal),
      `${internal} reached the order DTO`,
    );
  }

  // And the things it must carry are there.
  const dto = orderDetailDto(stored);
  assert.equal(dto.reference, order.reference);
  assert.equal(dto.paid, true);
  assert.equal(dto.delivery.city, "Hyderabad");
  assert.equal(dto.items.length, 1);
});

test("the tracking DTO carries no internal manufacturing detail", async () => {
  const order = await placeOrder(DEVELOPMENT_CUSTOMER_ID);
  await createManufacturingJobs(order);

  const jobs = await orderRepository.findJobsForOrder(order.reference);
  const jobId = jobs[0]?.id;
  assert.ok(jobId);

  await applyManufacturingEvent(jobId, {
    type: "DESIGN_REVIEW_STARTED",
    actor: "operations",
    note: "Checked against the build plate.",
  });

  const tracking = await authorizeOrderRead(order.reference);
  const first = tracking.order.items[0];
  assert.ok(first?.manufacturingJobId);

  const dto = trackingItemDto(
    first.id,
    first.name,
    first.fulfillmentStatus,
    tracking.jobs[first.manufacturingJobId],
  );

  const serialised = JSON.stringify(dto);
  for (const internal of [
    "operations",
    "Checked against",
    "DESIGN_REVIEW_STARTED",
    "design_review",
    "machineId",
    jobId,
  ]) {
    assert.ok(!serialised.includes(internal), `${internal} reached the tracking DTO`);
  }

  // The customer stage is there, which is the whole point of the endpoint.
  assert.equal(dto.manufacturing?.stage, "design_verified");
});

test("the quote DTO reports geometry as supplied and not priced", () => {
  const response = calculateQuote({
    model: { name: "part.3mf", extension: ".3mf", sizeBytes: 2048 },
    material: "petg",
    quantity: 2,
    geometry: {
      dimensionsMm: { x: 82, y: 41, z: 16 },
      volumeMm3: 12_000,
      partCount: 1,
    },
  });

  assert.equal(response.status, "available");
  if (response.status !== "available") return;

  const dto = quoteDto(response.quote);

  // The price is still derived from the configuration, and says so.
  assert.equal(dto.basis, "configuration");
  assert.equal(dto.geometry.state, "supplied_not_priced");
  assert.ok(dto.geometry.reason);
  assert.equal(dto.provisional, true);

  // The breakdown always sums to the total.
  assert.equal(
    dto.lines.reduce((sum, line) => sum + line.amount, 0),
    dto.total,
  );

  // The internal rule-set identifier is not a client's business.
  assert.ok(!JSON.stringify(dto).includes("demo-2026-01"));
});

test("a quote with no geometry says so rather than implying it was measured", () => {
  const response = calculateQuote({
    model: { name: "part.stl", extension: ".stl", sizeBytes: 2048 },
    material: "pla",
    quantity: 1,
  });

  assert.equal(response.status, "available");
  if (response.status !== "available") return;

  assert.equal(quoteDto(response.quote).geometry.state, "absent");
});

test("supplying geometry does not change the price", () => {
  const base = {
    model: { name: "part.stl", extension: ".stl", sizeBytes: 2048 },
    material: "pla",
    quantity: 3,
  };

  const without = calculateQuote(base);
  const with_ = calculateQuote({
    ...base,
    geometry: {
      dimensionsMm: { x: 200, y: 200, z: 200 },
      volumeMm3: 8_000_000,
      partCount: 4,
    },
  });

  assert.equal(without.status, "available");
  assert.equal(with_.status, "available");
  if (without.status !== "available" || with_.status !== "available") return;

  /*
   * A part 8 million cubic millimetres in volume costs exactly what the same
   * configuration costs with no measurements at all — because no rule prices
   * volume. If this ever fails, a geometry-dependent rule has been added and
   * `basis` must become "geometry" in the same change.
   */
  assert.equal(with_.quote.total, without.quote.total);
});

test("the analysis DTO preserves measurement states rather than flattening them", async () => {
  const analysis = await analyzeModel({
    fileName: "open.3mf",
    bytes: openMesh3mf(),
  });
  const dto = analysisDto(analysis, checkManufacturability(analysis));

  /*
   * Not null, not zero: a state and a reason. Captured into a local so the
   * union narrows — the point of the assertion is that a client receives
   * something it can explain, not a blank.
   */
  const volume = dto.volume;
  if (volume.state === "available") assert.fail("an open mesh reported a volume");
  assert.equal(volume.state, "unavailable");
  assert.ok(volume.reason.length > 0, "no reason was given for the missing volume");
  assert.equal(dto.surfaceArea.state, "available");

  assert.equal(dto.manufacturability.manufacturable, false);
  assert.ok(
    dto.manufacturability.findings.some((finding) => finding.code === "open_mesh"),
  );
  // No build volume is configured, and the response says so rather than passing.
  assert.equal(dto.manufacturability.constraints, "unconfigured");
});

test("a closed model is manufacturable and reports its measurements", async () => {
  const analysis = await analyzeModel({ fileName: "cube.3mf", bytes: cube3mf() });
  const dto = analysisDto(analysis, checkManufacturability(analysis));

  assert.equal(dto.manufacturability.manufacturable, true);
  assert.equal(dto.volume.state, "available");
  assert.equal(dto.boundingBoxMm.x, 10);
  assert.equal(dto.objectCount, 1);
  assert.match(dto.identity, /^mdl_/);
});

/* ------------------------------------------------------------------ *
 * Error mapping
 * ------------------------------------------------------------------ */

test("every domain error kind maps to a sensible status", async () => {
  const { errorBody } = await import("@/lib/errors");
  const {
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    IdempotencyConflictError,
    InvalidStateTransitionError,
    ModelParseError,
    ManufacturabilityError,
    InfrastructureError,
  } = await import("@/lib/errors");

  const expectations: [DomainError, number][] = [
    [new ValidationError("x"), 400],
    [new UnauthorizedError(), 401],
    [new ForbiddenError(), 403],
    [new NotFoundError(), 404],
    [new ConflictError("x"), 409],
    [new IdempotencyConflictError(), 409],
    [new InvalidStateTransitionError("x"), 409],
    [new ModelParseError("x"), 422],
    [new ManufacturabilityError("x"), 422],
    [new InfrastructureError(), 503],
  ];

  for (const [error, status] of expectations) {
    assert.equal(statusForError(error), status, `${error.kind} mapped wrongly`);
    assert.equal(errorBody(error).error.code, error.kind);
  }
});

test("an unexpected error reveals nothing", async () => {
  const { errorBody } = await import("@/lib/errors");

  const body = errorBody(
    new Error("connection to 10.0.0.4:5432 failed: password authentication failed"),
  );

  assert.equal(statusForError(new Error("x")), 500);
  assert.equal(body.error.code, "internal");
  assert.ok(!body.error.message.includes("10.0.0.4"));
  assert.ok(!body.error.message.includes("password"));
});

test("field errors survive into the response body", async () => {
  const { errorBody, ValidationError } = await import("@/lib/errors");

  const body = errorBody(
    new ValidationError("Some of these details need correcting.", [
      { field: "contact.email", message: "Enter an email address." },
    ]),
  );

  assert.equal(body.error.issues?.length, 1);
  assert.equal(body.error.issues?.[0]?.field, "contact.email");
});
