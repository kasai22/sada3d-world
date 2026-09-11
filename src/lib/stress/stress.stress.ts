import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { after, before, test } from "node:test";

import { eq } from "drizzle-orm";

import { listCustomerOrders } from "@/lib/account/orders";
import {
  MAX_TRACKED,
  enforceRateLimit,
  resetRateLimits,
  trackedRateLimitCount,
  type RateLimitRule,
} from "@/lib/api/rate-limit";
import type { CartTotals } from "@/lib/cart/types";
import { getDatabase, setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { geometryAnalyses } from "@/lib/db/schema";
import { RateLimitedError } from "@/lib/errors";
import { analyzeModel } from "@/lib/models";
import { findStoredAnalysis, saveStoredAnalysis } from "@/lib/models/analysis-store";
import { setLogSink } from "@/lib/observability";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { orderRepository } from "@/lib/orders/repository";
import { createManufacturingJobs } from "@/lib/orders/service";
import type { Order, OrderItem } from "@/lib/orders/types";
import { calculateQuote } from "@/lib/pricing/calculateQuote";

/**
 * Stage 18 stress and concurrency.
 *
 * Aimed at what this stage changed, against real PostgreSQL (PGlite) where a
 * store is involved. The concurrency that Phase 15 already proves — distinct
 * references, one transition for a doubly-delivered event, one winner among
 * competing checkout reservations — is in `orders/persistence.test.ts` and is
 * not repeated here.
 *
 * Time limits are deliberately loose: they catch a return to quadratic or
 * whole-table behaviour, not a slow machine. The measured durations are written
 * as test diagnostics.
 *
 * ── Run on its own: `npm run test:stress` ────────────────────────────────
 *
 * Named `*.stress.ts` so the default `npm test` glob does not include it. Each
 * PGlite database reserves a large WebAssembly heap, and `node --test` runs
 * files in parallel. With this file alongside the five other PGlite suites,
 * the process intermittently failed to commit memory ("Fatal process out of
 * memory: Zone") on a machine with 14 GB of RAM free but little commit charge
 * left. This is the heaviest of them — a thousand seeded orders — so it is a
 * separate gate rather than a reason for the ordinary suite to be flaky.
 */

let harness: TestDatabase;

before(async () => {
  setLogSink({ name: "silent", write: () => undefined });
  harness = await createTestDatabase();
  setDatabaseProvider(harness);
});

after(async () => {
  setDatabaseProvider(null);
  await harness.destroy();
  setLogSink(null);
});

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

const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

async function storeOrder(customerId: string | undefined, placedIndex: number): Promise<Order> {
  const reference = await orderRepository.nextReference();
  const items: OrderItem[] = [
    {
      id: `${reference}-01`,
      type: "custom",
      name: "bracket.stl",
      spec: "PETG / PRECISION / STANDARD",
      quantity: 1,
      unitPrice: 646,
      lineTotal: 646,
      fulfillmentStatus: "pending",
    },
  ];
  const payment = { status: "paid" as const, provider: "mock" };
  const placedAt = new Date(BASE_TIME + placedIndex * 1_000).toISOString();

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
    placedAt,
    updatedAt: placedAt,
    provisional: true,
  };

  await orderRepository.createOrder(order);
  return createManufacturingJobs(order);
}

/** A flat binary STL grid: `cells × cells × 2` triangles. */
function gridStl(cells: number): Uint8Array {
  const count = cells * cells * 2;
  const bytes = new Uint8Array(84 + 50 * count);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, count, true);

  let offset = 84;
  const vertex = (x: number, y: number) => {
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, 0, true);
    offset += 12;
  };

  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      offset += 12;
      vertex(i, j);
      vertex(i + 1, j);
      vertex(i + 1, j + 1);
      offset += 2;

      offset += 12;
      vertex(i, j);
      vertex(i + 1, j + 1);
      vertex(i, j + 1);
      offset += 2;
    }
  }

  return bytes;
}

const elapsed = (since: number) => Math.round(performance.now() - since);

/* ------------------------------------------------------------------ *
 * Orders at volume
 * ------------------------------------------------------------------ */

test("a customer with more orders than one IN list holds reads exactly their own, with every job", async (t) => {
  // Past the repository's 1,000-value chunk, so the chunk boundary is exercised.
  const MANY = 1_005;
  const customer = "cus_stress_many";

  const seeding = performance.now();
  const mine = new Set<string>();
  for (let index = 0; index < MANY; index += 1) {
    mine.add((await storeOrder(customer, index)).reference);
  }
  const theirs = await storeOrder("cus_stress_other", MANY + 1);
  const guest = await storeOrder(undefined, MANY + 2);
  t.diagnostic(`seeded ${MANY + 2} orders with jobs in ${elapsed(seeding)} ms`);

  const reading = performance.now();
  const listed = await orderRepository.listOrdersForCustomer(customer);
  const jobs = await orderRepository.findJobsForOrders([...mine]);
  const summaries = await listCustomerOrders({ id: customer });
  const readMs = elapsed(reading);
  t.diagnostic(`listed ${listed.length} orders, ${jobs.length} jobs and the account summaries in ${readMs} ms`);

  assert.equal(listed.length, MANY);
  assert.deepEqual(new Set(listed.map((order) => order.reference)), mine);
  assert.ok(listed.every((order) => order.customerId === customer));

  for (let index = 1; index < listed.length; index += 1) {
    const newer = listed[index - 1];
    const older = listed[index];
    assert.ok(newer && older && Date.parse(newer.placedAt) >= Date.parse(older.placedAt), "not newest first");
  }

  // The job link is derived from the jobs table, across chunks, for every item.
  assert.ok(listed.every((order) => order.items.every((item) => item.manufacturingJobId)));

  assert.equal(jobs.length, MANY);
  assert.ok(jobs.every((job) => mine.has(job.orderReference) && job.events.length >= 1));

  assert.equal(summaries.length, MANY);
  const summarised = new Set(summaries.map((summary) => summary.reference));
  assert.equal(summarised.has(theirs.reference), false);
  assert.equal(summarised.has(guest.reference), false);

  assert.ok(readMs < 30_000, `reading one customer's orders took ${readMs} ms`);
});

/* ------------------------------------------------------------------ *
 * The analysis cache
 * ------------------------------------------------------------------ */

test("a corrupt cached analysis is removed and replaced by a fresh one", async () => {
  const bytes = gridStl(4);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const analysis = await analyzeModel({ fileName: "part.stl", bytes });

  // Under the right key, carrying the identity of a different file.
  await saveStoredAnalysis(sha256, {
    ...analysis,
    identity: "mdl_00000000000000000000000000000000.v1",
  });

  assert.equal(await findStoredAnalysis(sha256), null);

  const db = await getDatabase();
  const remaining = await db.select().from(geometryAnalyses).where(eq(geometryAnalyses.sha256, sha256));
  assert.equal(remaining.length, 0, "the corrupt row was left in place");

  // Removed, so the real analysis can now be recorded and served.
  await saveStoredAnalysis(sha256, analysis);
  const served = await findStoredAnalysis(sha256);
  assert.equal(served?.identity, analysis.identity);
  assert.equal(served?.objectCount, analysis.objectCount);
});

test("concurrent saves of one analysis leave one row and no error", async () => {
  const bytes = gridStl(5);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const analysis = await analyzeModel({ fileName: "part.stl", bytes });

  await Promise.all(Array.from({ length: 12 }, () => saveStoredAnalysis(sha256, analysis)));

  const db = await getDatabase();
  const rows = await db.select().from(geometryAnalyses).where(eq(geometryAnalyses.sha256, sha256));
  assert.equal(rows.length, 1);
});

/* ------------------------------------------------------------------ *
 * Hot paths without a store
 * ------------------------------------------------------------------ */

test("a burst from one subject is allowed exactly the limit", () => {
  resetRateLimits();
  const rule: RateLimitRule = { name: "stress.burst", limit: 20, windowMs: 60_000 };

  let allowed = 0;
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    try {
      enforceRateLimit(rule, "cus_burst", 1_000);
      allowed += 1;
    } catch (error) {
      assert.ok(error instanceof RateLimitedError);
    }
  }

  assert.equal(allowed, 20);
});

test("the limiter stays bounded and fast under a flood of fresh subjects", (t) => {
  resetRateLimits();
  const rule: RateLimitRule = { name: "stress.flood", limit: 5, windowMs: 10 * 60_000 };

  const started = performance.now();
  for (let index = 0; index < 200_000; index += 1) {
    enforceRateLimit(rule, `anon:source:${index}`, 1_000 + index);
  }
  const ms = elapsed(started);
  t.diagnostic(`200,000 fresh subjects in ${ms} ms, ${trackedRateLimitCount()} tracked`);

  assert.ok(trackedRateLimitCount() <= MAX_TRACKED);
  assert.ok(ms < 10_000, `the limiter took ${ms} ms`);
});

test("quoting is deterministic under a burst", (t) => {
  const request = {
    model: { name: "part.stl", extension: ".stl", sizeBytes: 2048 },
    material: "pla",
    quantity: 3,
  };

  const first = JSON.stringify(calculateQuote(request));
  const started = performance.now();
  for (let index = 0; index < 5_000; index += 1) {
    assert.equal(JSON.stringify(calculateQuote(request)), first);
  }
  const ms = elapsed(started);
  t.diagnostic(`5,000 quotes in ${ms} ms`);

  assert.ok(ms < 15_000, `5,000 quotes took ${ms} ms`);
});

test("a quarter-million-triangle model is analysed in bounded time", async (t) => {
  const cells = 354;
  const bytes = gridStl(cells);

  const started = performance.now();
  const analysis = await analyzeModel({ fileName: "part.stl", bytes });
  const ms = elapsed(started);
  t.diagnostic(`${cells * cells * 2} triangles (${(bytes.length / 1024 / 1024).toFixed(1)} MB) in ${ms} ms`);

  assert.equal(analysis.triangleCount.state, "available");
  if (analysis.triangleCount.state === "available") {
    assert.equal(analysis.triangleCount.value, cells * cells * 2);
  }
  assert.ok(ms < 30_000, `analysis took ${ms} ms`);
});
