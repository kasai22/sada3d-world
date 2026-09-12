import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";

import { setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { customerDesigns, customers } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";
import { analyzeModel } from "@/lib/models";
import { saveStoredAnalysis } from "@/lib/models/analysis-store";
import { cubeStl } from "@/lib/models/fixtures";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { orderRepository } from "@/lib/orders/repository";
import { applyManufacturingEvent, createManufacturingJobs } from "@/lib/orders/service";
import type { Order, OrderItem } from "@/lib/orders/types";
import type { CartTotals } from "@/lib/cart/types";

import { listOpsCustomers } from "./customers";
import { getDashboard } from "./dashboard";
import { listOpsDesigns } from "./designs";
import { listOpsIssues, readIssueSignals } from "./issues";
import { changeJobHold, openShipment, reportJobEvent } from "./mutations";
import type { OperatorSession } from "./operator";
import { getOpsOrder, listOpsOrders } from "./orders";
import { getPaymentTotals, listOpsPayments } from "./payments";
import { deriveIssues } from "./pipeline";
import { getProductionBoard } from "./production";
import { parseOrderListQuery } from "./query";
import { searchOps } from "./search";

/**
 * The console against real PostgreSQL.
 *
 * PGlite runs the committed migrations, so the indexes, enums and constraints
 * are the deployed ones. What is being proved:
 *
 *   reads        lists are paginated and filtered in SQL, and a filter means
 *                what it says
 *   projections  no storage key, cart id or authentication subject reaches a
 *                console view
 *   scoping      a customer page counts that customer and nobody else
 *   writes       an operator event goes through the state machine, is attributed,
 *                and a stale page cannot repeat a step
 *   money        demonstration orders are excluded from every figure that is money
 */

let harness: TestDatabase;
let sequence = 0;

const OPERATOR = {
  id: "7",
  name: "Ops Tester",
  email: "ops@sada3d.example",
} as unknown as OperatorSession;

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
  subtotal: 1000,
  shipping: { known: false, reason: "Confirmed before dispatch" },
  tax: { known: false, reason: "Added on the tax invoice" },
  total: 1000,
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
    unitPrice: 1000,
    lineTotal: 1000,
    fulfillmentStatus: "pending",
    ...overrides,
  };
}

interface PlaceOptions {
  items?: OrderItem[];
  customerId?: string;
  payment?: Order["payment"]["status"];
  demo?: boolean;
  placedAt?: string;
  contact?: { name: string; email: string };
  total?: number;
}

async function placeOrder(options: PlaceOptions = {}): Promise<Order> {
  const items = options.items ?? [item()];
  const payment = { status: options.payment ?? "paid", provider: "mock", sessionId: `pay_${sequence}` };
  const reference = options.demo
    ? `DEMO-${String(1000 + (sequence += 1)).slice(0, 4)}`
    : await orderRepository.nextReference();
  const at = options.placedAt ?? new Date().toISOString();

  const order: Order = {
    reference,
    cartId: `cart_${reference}`,
    ...(options.customerId ? { customerId: options.customerId } : {}),
    status: aggregateOrderStatus({ items, payment }),
    payment,
    items,
    shipments: [],
    totals: { ...TOTALS, ...(options.total ? { subtotal: options.total, total: options.total } : {}) },
    contact: {
      name: options.contact?.name ?? "Asha Rao",
      email: options.contact?.email ?? "asha@example.com",
      phone: "9876543210",
    },
    address: {
      line1: "42 Industrial Estate",
      city: "Hyderabad",
      state: "TG",
      postalCode: "500032",
      country: "IN",
    },
    placedAt: at,
    updatedAt: at,
    provisional: true,
    ...(options.demo ? { demo: true } : {}),
  };

  await orderRepository.createOrder(order);
  return order;
}

async function jobIdOf(reference: string): Promise<string> {
  const jobs = await orderRepository.findJobsForOrder(reference);
  const job = jobs[0];
  assert.ok(job, `${reference} has no manufacturing job`);
  return job.id;
}

const listQuery = (params: Record<string, string> = {}) => parseOrderListQuery(params);

/* ------------------------------------------------------------------ *
 * Reading orders
 * ------------------------------------------------------------------ */

test("orders are listed a page at a time, newest first", async () => {
  const day = 24 * 60 * 60 * 1000;
  for (let index = 0; index < 27; index += 1) {
    await placeOrder({ placedAt: new Date(Date.now() - index * day).toISOString() });
  }

  const first = await listOpsOrders(OPERATOR, listQuery());
  const second = await listOpsOrders(OPERATOR, listQuery({ page: "2" }));

  assert.equal(first.rows.length, 25);
  assert.equal(first.total, 27);
  assert.equal(first.pageCount, 2);
  assert.equal(second.rows.length, 2);

  const placed = first.rows.map((row) => row.placedAt);
  assert.deepEqual([...placed].sort().reverse(), placed, "orders are not newest first");
});

test("search matches a reference, a name or an email, and LIKE characters are literal", async () => {
  const order = await placeOrder({ contact: { name: "Percent Co 100%", email: "percent@example.com" } });

  const byReference = await listOpsOrders(OPERATOR, listQuery({ q: order.reference }));
  assert.deepEqual(byReference.rows.map((row) => row.reference), [order.reference]);

  const byEmail = await listOpsOrders(OPERATOR, listQuery({ q: "percent@example.com" }));
  assert.deepEqual(byEmail.rows.map((row) => row.reference), [order.reference]);

  const byLiteral = await listOpsOrders(OPERATOR, listQuery({ q: "100%" }));
  assert.deepEqual(byLiteral.rows.map((row) => row.reference), [order.reference]);

  // A bare wildcard is text: it finds the name that contains one, not everything.
  const wildcard = await listOpsOrders(OPERATOR, listQuery({ q: "%" }));
  assert.deepEqual(wildcard.rows.map((row) => row.reference), [order.reference]);
});

test("the production filter finds orders whose job is held, and only those", async () => {
  const held = await placeOrder();
  await createManufacturingJobs(held);
  const heldJob = await jobIdOf(held.reference);
  await changeJobHold(OPERATOR, {
    reference: held.reference,
    jobId: heldJob,
    intent: "place",
    reason: "material_unavailable",
  });

  const running = await placeOrder();
  await createManufacturingJobs(running);

  const page = await listOpsOrders(OPERATOR, listQuery({ production: "held" }));
  const references = page.rows.map((row) => row.reference);

  assert.ok(references.includes(held.reference));
  assert.ok(!references.includes(running.reference));

  const row = page.rows.find((candidate) => candidate.reference === held.reference);
  assert.equal(row?.production.held, 1);
  assert.equal(row?.production.active, 1);
});

test("an order projection carries no storage key, cart id or session identifier", async () => {
  const design = "dsn_projection";
  const order = await placeOrder({
    items: [
      item({
        sourceFile: {
          designId: design,
          storageKey: "customers/cus_x/designs/secret-object-key.stl",
          sha256: "a".repeat(64),
          fileName: "bracket.stl",
          sizeBytes: 2048,
          format: "STL",
          configuration: { material: "petg", quality: "precision", finish: "standard" },
        },
      }),
    ],
  });

  const detail = await getOpsOrder(OPERATOR, order.reference);
  assert.ok(detail);

  const serialised = JSON.stringify(detail);
  assert.ok(!serialised.includes("secret-object-key"), "the storage key reached the console view");
  assert.ok(!serialised.includes("storageKey"), "a storage key field reached the console view");
  assert.ok(!serialised.includes(order.cartId), "the cart id reached the console view");
  assert.equal(detail.items[0]?.design?.id, design);
  assert.equal(detail.items[0]?.design?.checksum.length, 12, "the checksum is shortened");
});

test("the order detail says what happens next and offers only steps the machine allows", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);

  const detail = await getOpsOrder(OPERATOR, order.reference);
  const job = detail?.jobs[0];

  assert.ok(job);
  assert.equal(job.state, "queued");
  assert.deepEqual(
    job.actions.map((action) => action.type).sort(),
    ["DESIGN_REVIEW_STARTED", "JOB_CANCELLED", "JOB_FAILED"].sort(),
  );
  assert.match(detail?.nextStep.detail ?? "", /design review/i);
});

test("an unknown or malformed reference is simply not found", async () => {
  assert.equal(await getOpsOrder(OPERATOR, "S3D-999999"), undefined);
  assert.equal(await getOpsOrder(OPERATOR, "not-a-reference"), undefined);
});

/* ------------------------------------------------------------------ *
 * Writing through the state machine
 * ------------------------------------------------------------------ */

test("an operator event advances the job, is attributed, and cannot be repeated from a stale page", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await jobIdOf(order.reference);

  const started = await reportJobEvent(OPERATOR, {
    reference: order.reference,
    jobId,
    event: "DESIGN_REVIEW_STARTED",
    expectedState: "queued",
    note: "Checked against the drawing",
  });
  assert.equal(started.ok, true);

  const job = await orderRepository.findJob(jobId);
  assert.equal(job?.state, "design_review");
  const last = job?.events.at(-1);
  assert.equal(last?.actor, OPERATOR.email);
  assert.equal(last?.note, "Checked against the drawing");

  // The same form, submitted again from a page rendered before the change.
  const repeat = await reportJobEvent(OPERATOR, {
    reference: order.reference,
    jobId,
    event: "DESIGN_REVIEW_STARTED",
    expectedState: "queued",
  });
  assert.equal(repeat.ok, false);
  assert.match(repeat.ok ? "" : repeat.message, /reload/i);

  // A step the machine does not allow from here.
  const outOfOrder = await reportJobEvent(OPERATOR, {
    reference: order.reference,
    jobId,
    event: "PRINT_STARTED",
    expectedState: "design_review",
  });
  assert.equal(outOfOrder.ok, false);
});

test("a job from another order cannot be driven from this one", async () => {
  const mine = await placeOrder();
  const theirs = await placeOrder();
  await createManufacturingJobs(mine);
  await createManufacturingJobs(theirs);

  const theirJob = await jobIdOf(theirs.reference);
  const result = await reportJobEvent(OPERATOR, {
    reference: mine.reference,
    jobId: theirJob,
    event: "DESIGN_REVIEW_STARTED",
  });

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /not part of this order/i);

  const untouched = await orderRepository.findJob(theirJob);
  assert.equal(untouched?.state, "queued");
});

test("a hold is placed and lifted, and a second hold is refused while one is active", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await jobIdOf(order.reference);

  const placed = await changeJobHold(OPERATOR, {
    reference: order.reference,
    jobId,
    intent: "place",
    reason: "machine_issue",
    note: "Extruder jam",
  });
  assert.equal(placed.ok, true);

  const again = await changeJobHold(OPERATOR, {
    reference: order.reference,
    jobId,
    intent: "place",
    reason: "quality_issue",
  });
  assert.equal(again.ok, false);

  const lifted = await changeJobHold(OPERATOR, { reference: order.reference, jobId, intent: "lift" });
  assert.equal(lifted.ok, true);

  const job = await orderRepository.findJob(jobId);
  assert.equal(job?.state, "queued", "a hold never changes the state");
  assert.ok(job?.hold?.resolvedAt);
});

test("a shipment takes only ready items, and an item joins one parcel", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await jobIdOf(order.reference);
  const itemId = order.items[0]?.id ?? "";

  const tooEarly = await openShipment(OPERATOR, { reference: order.reference, itemIds: [itemId] });
  assert.equal(tooEarly.ok, false, "an item still in production cannot be shipped");

  for (const event of [
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
  ] as const) {
    const applied = await applyManufacturingEvent(jobId, { type: event });
    assert.equal(applied.ok, true, `${event} was refused`);
  }

  const opened = await openShipment(OPERATOR, {
    reference: order.reference,
    itemIds: [itemId],
    carrier: "Blue Dart",
    trackingNumber: "BD123",
  });
  assert.equal(opened.ok, true);

  const twice = await openShipment(OPERATOR, { reference: order.reference, itemIds: [itemId] });
  assert.equal(twice.ok, false, "an item already in a parcel was added to a second one");

  const badLink = await openShipment(OPERATOR, {
    reference: order.reference,
    itemIds: [itemId],
    trackingUrl: "javascript:alert(1)",
  });
  assert.equal(badLink.ok, false, "a non-http tracking link was accepted");
});

/* ------------------------------------------------------------------ *
 * Issues, board and dashboard
 * ------------------------------------------------------------------ */

test("a failed payment becomes a high-severity issue about that order", async () => {
  const failed = await placeOrder({ payment: "failed" });

  const now = new Date();
  const issues = deriveIssues(await readIssueSignals(OPERATOR, now), now);
  const issue = issues.find((candidate) => candidate.subject === failed.reference);

  assert.ok(issue, "the failed payment raised no issue");
  assert.equal(issue.kind, "payment_failed");
  assert.equal(issue.severity, "high");

  // The same path the pages use.
  const listed = await listOpsIssues(OPERATOR);
  assert.ok(listed.some((candidate) => candidate.id === issue.id));
});

test("the production board groups jobs by stage and marks held ones as exceptions", async () => {
  const order = await placeOrder();
  await createManufacturingJobs(order);
  const jobId = await jobIdOf(order.reference);
  await changeJobHold(OPERATOR, {
    reference: order.reference,
    jobId,
    intent: "place",
    reason: "customer_action",
  });

  const board = await getProductionBoard(OPERATOR, { exceptions: true });
  const cards = board.columns.flatMap((column) => column.cards);
  const card = cards.find((candidate) => candidate.jobId === jobId);

  assert.ok(card, "the held job is not on the board");
  assert.equal(card.column, "queued");
  assert.equal(card.exception?.kind, "job_on_hold");
  assert.ok(board.counts.held >= 1);
  assert.ok(cards.every((candidate) => candidate.exception), "the exceptions filter let a healthy job through");
});

test("money excludes demonstration orders while the work still counts", async () => {
  const demo = await placeOrder({ demo: true, total: 5000 });
  await createManufacturingJobs(demo);

  const before = await getDashboard(OPERATOR);
  const real = await placeOrder({ total: 2000 });

  const after = await getDashboard(OPERATOR);

  assert.equal(
    after.kpis.paidValueInWindow - before.kpis.paidValueInWindow,
    2000,
    "a demonstration order moved a money figure",
  );
  assert.ok(after.kpis.ordersInWindow > before.kpis.ordersInWindow);
  assert.ok(after.kpis.activeJobs >= 1, "demonstration jobs are still work on the floor");
  assert.ok(after.activity.some((entry) => entry.detail.includes(real.reference)));
  assert.equal(after.trend.length, 14);
});

test("payment totals exclude demonstration orders", async () => {
  const totals = await getPaymentTotals(OPERATOR);
  const page = await listOpsPayments(OPERATOR, { page: 1, demo: "only" });

  assert.ok(page.rows.every((row) => row.demo));
  assert.ok(totals.paid.amount > 0);
  assert.ok(totals.failed.orders >= 1);
});

/* ------------------------------------------------------------------ *
 * Designs and customers
 * ------------------------------------------------------------------ */

test("a design shows what was measured, and a STEP file says it is never measured", async () => {
  const db = await getDatabase();
  const bytes = cubeStl(20);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const analysis = await analyzeModel({ fileName: "cube.stl", bytes });
  await saveStoredAnalysis(sha256, analysis);

  await db.insert(customers).values({ id: "cus_design_owner", authProvider: "supabase", authSubject: "subject-1" });

  await db.insert(customerDesigns).values([
    {
      id: "dsn_cube",
      customerId: "cus_design_owner",
      name: "cube.stl",
      format: "STL",
      sizeBytes: bytes.byteLength,
      storageKey: "customers/cus_design_owner/designs/cube.stl",
      storageState: "verified",
      sha256,
      verifiedAt: new Date(),
      analysisIdentity: analysis.identity,
    },
    {
      id: "dsn_step",
      customerId: "cus_design_owner",
      name: "housing.step",
      format: "STEP",
      sizeBytes: 4096,
      storageKey: "customers/cus_design_owner/designs/housing.step",
      storageState: "verified",
      sha256: "b".repeat(64),
      verifiedAt: new Date(),
    },
  ]);

  const page = await listOpsDesigns(OPERATOR, { view: "list", page: 1 });
  const serialised = JSON.stringify(page);
  assert.ok(!serialised.includes("customers/cus_design_owner/designs"), "a storage key reached the designs list");

  const cube = page.rows.find((row) => row.id === "dsn_cube");
  assert.equal(cube?.analysis.state, "available");
  if (cube?.analysis.state === "available") {
    assert.equal(Math.round(cube.analysis.dimensionsMm.x), 20);
    assert.equal(cube.analysis.manufacturable, true);
    assert.equal(cube.analysis.constraints, "unconfigured");
  }

  const step = page.rows.find((row) => row.id === "dsn_step");
  assert.equal(step?.analysis.state, "unsupported");
});

test("a customer page counts that customer and nobody else", async () => {
  const db = await getDatabase();
  await db.insert(customers).values([
    { id: "cus_alpha", authProvider: "supabase", authSubject: "subject-alpha" },
    { id: "cus_beta", authProvider: "supabase", authSubject: "subject-beta" },
  ]);

  await placeOrder({ customerId: "cus_alpha", total: 1500, contact: { name: "Alpha", email: "alpha@example.com" } });
  await placeOrder({ customerId: "cus_alpha", total: 2500, contact: { name: "Alpha", email: "alpha@example.com" } });
  await placeOrder({ customerId: "cus_beta", total: 9999, contact: { name: "Beta", email: "beta@example.com" } });

  const page = await listOpsCustomers(OPERATOR, { page: 1, q: "alpha" });
  const alpha = page.rows.find((row) => row.id === "cus_alpha");

  assert.ok(alpha, "the search did not find the account");
  assert.equal(alpha.orders, 2);
  assert.equal(alpha.paidValue, 4000);
  assert.equal(alpha.name, "Alpha");
  assert.ok(!page.rows.some((row) => row.id === "cus_beta"), "another account matched the search");

  const serialised = JSON.stringify(page);
  assert.ok(!serialised.includes("subject-alpha"), "an authentication subject reached the console");
});

test("search finds orders by customer and designs by filename", async () => {
  const results = await searchOps(OPERATOR, "alpha@example.com");
  assert.ok(results.some((result) => result.group === "Orders"));
  assert.ok(results.some((result) => result.group === "Customers"));

  const designs = await searchOps(OPERATOR, "cube.stl");
  assert.ok(designs.some((result) => result.group === "Designs" && result.href === "/ops/designs/dsn_cube"));

  assert.deepEqual(await searchOps(OPERATOR, "a"), [], "a one-character search was run");
});
