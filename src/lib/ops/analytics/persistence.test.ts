import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq, sql } from "drizzle-orm";

import type { CartTotals } from "@/lib/cart/types";
import { getDatabase, setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { customers, manufacturingJobs, orderItems, orders } from "@/lib/db/schema";
import { createInventoryItem, recordOpeningBalance, recordStockMovement } from "@/lib/inventory/service";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { orderRepository } from "@/lib/orders/repository";
import {
  applyManufacturingEvent,
  applyShipmentEvent,
  createManufacturingJobs,
  createShipment,
  setManufacturingHold,
} from "@/lib/orders/service";
import type { Order, OrderItem } from "@/lib/orders/types";
import type { ManufacturingEventType } from "@/lib/manufacturing/types";

import type { OperatorSession } from "../operator";
import { listOpsOrders } from "../orders";
import { ORDER_STAGES, parseOrderListQuery } from "../query";
import { getManufacturingSummary } from "./manufacturing";
import { getMaterialAnalytics } from "./materials";
import { getCustomerSummary, getOrderStageCounts, getOrderSummary } from "./orders";
import { getCategoryRevenue, getProductPerformance } from "./products";
import { parseRange, rangeFromDays } from "./range";
import { getRevenuePeriods, getRevenueSummary } from "./revenue";

/**
 * The analytics services against real PostgreSQL (PGlite, committed
 * migrations). One database for the file, emptied before each test, because
 * every figure here is an aggregate over the whole table and one test's orders
 * would be another's noise.
 *
 * What is being proved: each figure is exactly the records it claims to count —
 * demonstration, unpaid and cancelled orders stay out of money; business days
 * are Indian days; the quick-filter counts are the lists they open; and a large
 * table is aggregated in the database, not in the process.
 */

const OPERATOR = { id: "7", name: "Analytics Tester", email: "ops@reality3d.example" } as unknown as OperatorSession;

/** 16 Sep 2026, 12:00 IST. */
const NOW = new Date("2026-09-16T06:30:00.000Z");

let harness: TestDatabase;

before(async () => {
  harness = await createTestDatabase();
  setDatabaseProvider(harness);
});

after(async () => {
  setDatabaseProvider(null);
  await harness.destroy();
});

/** Runs a test against empty application tables. */
async function withDatabase(run: () => Promise<void>): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    sql`truncate table manufacturing_events, manufacturing_jobs, shipments, order_items, orders, customers, counters, checkout_reservations restart identity cascade`,
  );
  await run();
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

let sequence = 0;

function totals(total: number): CartTotals {
  return {
    currency: "INR",
    subtotal: total,
    shipping: { known: false, reason: "Confirmed before dispatch" },
    tax: { known: false, reason: "Added on the tax invoice" },
    total,
    excluded: ["Shipping", "GST"],
    unitCount: 1,
    provisional: true,
  };
}

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: `it-${(sequence += 1)}`,
    type: "catalog",
    name: "Spur Gear",
    spec: "PLA / BLACK",
    quantity: 1,
    unitPrice: 100,
    lineTotal: 100,
    fulfillmentStatus: "pending",
    ...overrides,
  };
}

interface PlaceOptions {
  total?: number;
  items?: OrderItem[];
  payment?: Order["payment"]["status"];
  provider?: string;
  placedAt?: string;
  demo?: boolean;
  cancelled?: boolean;
  customerId?: string;
  provisional?: boolean;
}

async function placeOrder(options: PlaceOptions = {}): Promise<Order> {
  sequence += 1;
  const items = options.items ?? [item()];
  const payment = { status: options.payment ?? "paid", provider: options.provider ?? "razorpay", sessionId: `pay_${sequence}` };
  const placedAt = options.placedAt ?? NOW.toISOString();
  const cancelledAt = options.cancelled ? placedAt : undefined;
  const reference = options.demo ? `DEMO-${String(sequence).padStart(5, "0")}` : await orderRepository.nextReference();

  const order: Order = {
    reference,
    cartId: `cart_${reference}`,
    ...(options.customerId ? { customerId: options.customerId } : {}),
    status: aggregateOrderStatus({ items, payment, cancelledAt }),
    payment,
    items,
    shipments: [],
    totals: totals(options.total ?? 100),
    contact: { name: "Asha Rao", email: `asha-${sequence}@example.com`, phone: "9876543210" },
    address: { line1: "42 Industrial Estate", city: "Hyderabad", state: "TG", postalCode: "500032", country: "IN" },
    placedAt,
    updatedAt: placedAt,
    ...(cancelledAt ? { cancelledAt } : {}),
    provisional: options.provisional ?? false,
    ...(options.demo ? { demo: true } : {}),
  };
  await orderRepository.createOrder(order);
  return order;
}

async function walk(jobId: string, events: ManufacturingEventType[], startAt: Date): Promise<void> {
  let at = startAt.getTime();
  for (const type of events) {
    at += 60_000;
    const result = await applyManufacturingEvent(jobId, { type, occurredAt: new Date(at).toISOString(), actor: "test" });
    assert.ok(result.ok, `${type}: ${result.ok ? "" : result.reason}`);
  }
}

const TO_PRINTING: ManufacturingEventType[] = [
  "DESIGN_REVIEW_STARTED",
  "DESIGN_APPROVED",
  "FILE_PREPARED",
  "MATERIAL_PREPARED",
  "PRINT_STARTED",
];
const TO_COMPLETED: ManufacturingEventType[] = [
  ...TO_PRINTING,
  "PRINT_COMPLETED",
  "POST_PROCESSING_COMPLETED",
  "QUALITY_APPROVED",
  "PACKAGING_STARTED",
  "PACKAGING_COMPLETED",
  "JOB_COMPLETED",
];

async function jobOf(reference: string): Promise<string> {
  const [job] = await orderRepository.findJobsForOrder(reference);
  assert.ok(job, `${reference} has no job`);
  return job.id;
}

const custom = (name = "bracket.stl", lineTotal = 1000) =>
  item({ type: "custom", name, spec: "PETG / STANDARD", unitPrice: lineTotal, lineTotal });

/* ------------------------------------------------------------------ *
 * Empty data
 * ------------------------------------------------------------------ */

test("with no data, every figure is zero, every average is absent and every bucket is still listed", () =>
  withDatabase(async () => {
    const range = parseRange({}, NOW);

    const revenue = await getRevenueSummary(OPERATOR, range, NOW);
    assert.deepEqual(revenue.figure, { amount: 0, orders: 0, averageOrderValue: null, mockPayments: 0, provisional: 0 });
    assert.deepEqual(revenue.stopped, { orders: 0, amount: 0 });
    assert.equal(revenue.series.length, 16);
    assert.ok(revenue.series.every((point) => point.amount === 0 && point.orders === 0));
    assert.ok(revenue.source && revenue.definition && revenue.generatedAt === NOW.toISOString(), "every figure is traced");

    for (const period of await getRevenuePeriods(OPERATOR, NOW)) {
      assert.equal(period.figure.amount, 0, period.id);
      assert.equal(period.figure.averageOrderValue, null, period.id);
    }

    const summary = await getOrderSummary(OPERATOR, range, NOW);
    assert.equal(summary.placed, 0);
    assert.equal(summary.open, 0);
    assert.deepEqual(summary.lines, { catalog: { lines: 0, units: 0 }, custom: { lines: 0, units: 0 } });

    assert.ok(Object.values(await getOrderStageCounts(OPERATOR)).every((value) => value === 0));

    const products = await getProductPerformance(OPERATOR, range, { now: NOW });
    assert.deepEqual(products.rows, []);
    assert.equal(products.distinct, 0);

    const categories = await getCategoryRevenue(OPERATOR, range, NOW);
    assert.deepEqual(categories.categories, []);
    assert.deepEqual(categories.browse, []);
    assert.equal(categories.uncategorised.lines, 0);
    assert.equal(categories.custom.lines, 0);

    const manufacturing = await getManufacturingSummary(OPERATOR, range, NOW);
    assert.equal(manufacturing.active, 0);
    assert.deepEqual(manufacturing.machines, []);
    assert.equal(manufacturing.utilisation.available, false, "utilisation is never calculated");

    const people = await getCustomerSummary(OPERATOR, range, NOW);
    assert.deepEqual(
      [people.orderingAccounts, people.guestOrders, people.newAccounts, people.repeatAccounts],
      [0, 0, 0, 0],
    );
  }));

/* ------------------------------------------------------------------ *
 * Revenue
 * ------------------------------------------------------------------ */

test("revenue counts paid, real, live orders on Indian business days — and nothing else", () =>
  withDatabase(async () => {
    await placeOrder({ total: 1000, placedAt: "2026-09-10T10:00:00.000Z" });
    // 00:30 IST on the 16th: today, although it is still the 15th in UTC.
    await placeOrder({ total: 2500, placedAt: "2026-09-15T19:00:00.000Z", provider: "mock", provisional: true });
    // 23:59 IST on Monday the 14th: this week.
    await placeOrder({ total: 600, placedAt: "2026-09-14T18:29:00.000Z" });
    // Last month: in the year, not the month.
    await placeOrder({ total: 300, placedAt: "2026-08-20T10:00:00.000Z" });

    // None of these is revenue.
    await placeOrder({ total: 9999, placedAt: "2026-09-12T10:00:00.000Z", demo: true });
    await placeOrder({ total: 700, placedAt: "2026-09-12T10:00:00.000Z", payment: "pending" });
    await placeOrder({ total: 800, placedAt: "2026-09-12T10:00:00.000Z", payment: "failed" });
    await placeOrder({ total: 400, placedAt: "2026-09-11T10:00:00.000Z", cancelled: true });
    // 00:30 IST tomorrow: after the range ends.
    await placeOrder({ total: 5000, placedAt: "2026-09-16T19:00:00.000Z" });

    const month = await getRevenueSummary(OPERATOR, parseRange({}, NOW), NOW);
    assert.deepEqual(month.figure, { amount: 4100, orders: 3, averageOrderValue: 1367, mockPayments: 1, provisional: 1 });
    assert.deepEqual(month.stopped, { orders: 1, amount: 400 }, "paid then cancelled is reported beside revenue");

    const byDay = new Map(month.series.map((point) => [point.key, point.amount]));
    assert.equal(byDay.get("2026-09-16"), 2500);
    assert.equal(byDay.get("2026-09-14"), 600);
    assert.equal(byDay.get("2026-09-15"), 0);
    assert.equal(byDay.get("2026-09-10"), 1000);
    assert.equal(month.series.reduce((sum, point) => sum + point.amount, 0), month.figure.amount);

    const periods = Object.fromEntries((await getRevenuePeriods(OPERATOR, NOW)).map((period) => [period.id, period.figure.amount]));
    assert.deepEqual(periods, { today: 2500, week: 3100, month: 4100, year: 4400 });

    const custom = await getRevenueSummary(OPERATOR, parseRange({ range: "custom", from: "2026-08-01", to: "2026-09-10" }, NOW), NOW);
    assert.equal(custom.figure.amount, 1300);

    const ytd = await getRevenueSummary(OPERATOR, parseRange({ range: "ytd" }, NOW), NOW);
    assert.equal(ytd.bucket, "month");
    assert.deepEqual(
      ytd.series.filter((point) => point.amount > 0),
      [
        { key: "2026-08", amount: 300, orders: 1 },
        { key: "2026-09", amount: 4100, orders: 3 },
      ],
    );
  }));

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

test("each quick-filter count is exactly the order list it opens", () =>
  withDatabase(async () => {
    const fresh = await placeOrder({ payment: "pending" });
    const paid = await placeOrder();
    const producing = await placeOrder({ items: [custom()] });
    await createManufacturingJobs(producing);
    const ready = await placeOrder({ items: [item({ fulfillmentStatus: "ready" })] });
    const shipped = await placeOrder({
      items: [item({ fulfillmentStatus: "shipped" }), item({ fulfillmentStatus: "in_progress" })],
    });
    const completed = await placeOrder({ items: [item({ fulfillmentStatus: "delivered" })] });
    const cancelled = await placeOrder({ cancelled: true });
    const demo = await placeOrder({ payment: "pending", demo: true });

    const counts = await getOrderStageCounts(OPERATOR);
    assert.deepEqual(counts, { new: 2, paid: 1, production: 1, ready: 1, shipped: 1, completed: 1, cancelled: 1 });

    for (const stage of ORDER_STAGES) {
      const page = await listOpsOrders(OPERATOR, parseOrderListQuery({ stage }));
      assert.equal(page.total, counts[stage], `${stage}: the chip says ${counts[stage]}, the list has ${page.total}`);
    }

    const references = async (stage: string) =>
      (await listOpsOrders(OPERATOR, parseOrderListQuery({ stage }))).rows.map((row) => row.reference).sort();
    assert.deepEqual(await references("new"), [fresh.reference, demo.reference].sort());
    assert.deepEqual(await references("paid"), [paid.reference]);
    assert.deepEqual(await references("production"), [producing.reference]);
    assert.deepEqual(await references("ready"), [ready.reference]);
    assert.deepEqual(await references("shipped"), [shipped.reference]);
    assert.deepEqual(await references("completed"), [completed.reference]);
    assert.deepEqual(await references("cancelled"), [cancelled.reference]);

    const summary = await getOrderSummary(OPERATOR, parseRange({}, NOW), NOW);
    assert.equal(summary.placed, 7, "the demonstration order is not business");
    assert.equal(summary.demoPlaced, 1);
    assert.equal(summary.byStatus.cancelled, 1);
    assert.equal(summary.byPayment.pending, 1);
    assert.equal(summary.byPayment.paid, 6);
    assert.equal(summary.lines.custom.lines, 1);
    assert.equal(summary.lines.catalog.lines, 7);
    assert.equal(summary.series.find((point) => point.key === "2026-09-16")?.orders, 7);
  }));

test("a page size can be asked for, and pages still add up", () =>
  withDatabase(async () => {
    for (let index = 0; index < 7; index += 1) await placeOrder();
    const first = await listOpsOrders(OPERATOR, parseOrderListQuery({}), 5);
    const second = await listOpsOrders(OPERATOR, parseOrderListQuery({ page: "2" }), 5);
    assert.equal(first.rows.length, 5);
    assert.equal(first.pageCount, 2);
    assert.equal(second.rows.length, 2);
  }));

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

test("product performance sums real sold lines by name, and carries nothing about the customer", () =>
  withDatabase(async () => {
    await placeOrder({
      items: [item({ quantity: 2, lineTotal: 400 }), custom("bracket.stl", 1000)],
    });
    await placeOrder({
      items: [
        item({ quantity: 1, lineTotal: 200 }),
        item({ name: "Spacer", quantity: 5, lineTotal: 50, fulfillmentStatus: "cancelled" }),
      ],
    });
    await placeOrder({ payment: "pending", items: [item({ quantity: 10, lineTotal: 2000 })] });
    await placeOrder({ demo: true, items: [item({ quantity: 10, lineTotal: 2000 })] });
    await placeOrder({ cancelled: true, items: [item({ name: "Hinge", quantity: 1, lineTotal: 90 })] });

    const performance = await getProductPerformance(OPERATOR, parseRange({}, NOW), { now: NOW });
    assert.deepEqual(performance.rows, [
      { type: "custom", productId: null, name: "bracket.stl", sku: null, categoryName: null, units: 1, revenue: 1000, orders: 1 },
      { type: "catalog", productId: null, name: "Spur Gear", sku: null, categoryName: null, units: 3, revenue: 600, orders: 2 },
    ]);
    assert.equal(performance.distinct, 2);
    assert.deepEqual(performance.byType, {
      catalog: { units: 3, revenue: 600, orders: 2 },
      custom: { units: 1, revenue: 1000, orders: 1 },
    });
    assert.deepEqual(performance.totals, { units: 4, revenue: 1600 });

    const serialised = JSON.stringify(performance);
    assert.ok(!/asha|@example\.com|9876543210|Industrial/i.test(serialised), "customer data reached product analytics");
    assert.ok(!/best.?sell/i.test(serialised), "no best-seller claim");

    const limited = await getProductPerformance(OPERATOR, parseRange({}, NOW), { limit: 1, now: NOW });
    assert.equal(limited.rows.length, 1);
    assert.equal(limited.distinct, 2, "the total is not the page");
  }));

/* ------------------------------------------------------------------ *
 * Manufacturing
 * ------------------------------------------------------------------ */

test("manufacturing counts active jobs by stage, holds, milestones and dispatches from the records", () =>
  withDatabase(async () => {
    const start = new Date("2026-09-15T04:00:00.000Z");
    const range = rangeFromDays("custom", "2026-09-15", "2026-09-16");

    const printing = await placeOrder({ items: [custom("printing.stl")] });
    await createManufacturingJobs(printing, start.toISOString());
    await walk(await jobOf(printing.reference), TO_PRINTING, start);
    const db = await getDatabase();
    await db.update(manufacturingJobs).set({ machineId: "bambu-a1-01" }).where(eq(manufacturingJobs.id, await jobOf(printing.reference)));

    const waiting = await placeOrder({ items: [custom("waiting.stl")] });
    await createManufacturingJobs(waiting, start.toISOString());
    const held = await setManufacturingHold(await jobOf(waiting.reference), { reason: "material_unavailable" }, start.toISOString());
    assert.ok(held.ok);

    const finished = await placeOrder({ items: [custom("finished.stl")] });
    await createManufacturingJobs(finished, start.toISOString());
    await walk(await jobOf(finished.reference), TO_COMPLETED, start);
    const opened = await createShipment({ orderReference: finished.reference, itemIds: [finished.items[0]!.id] });
    assert.ok(opened.ok, opened.ok ? "" : opened.reason);
    const shipmentId = opened.value.shipments[0]!.id;
    assert.ok((await applyShipmentEvent(finished.reference, shipmentId, "SHIPMENT_READY", "2026-09-15T08:00:00.000Z")).ok);
    assert.ok((await applyShipmentEvent(finished.reference, shipmentId, "SHIPMENT_DISPATCHED", "2026-09-15T09:00:00.000Z")).ok);

    const demo = await placeOrder({ demo: true, items: [custom("demo.stl")] });
    await createManufacturingJobs(demo, start.toISOString());

    const summary = await getManufacturingSummary(OPERATOR, range, NOW);
    const stage = Object.fromEntries(summary.stages.map((entry) => [entry.stage.id, [entry.count, entry.held]]));
    assert.deepEqual(stage, {
      queued: [2, 1],
      printing: [1, 0],
      post_processing: [0, 0],
      quality: [0, 0],
      ready: [0, 0],
    });
    assert.equal(summary.active, 3);
    assert.equal(summary.held, 1);
    assert.equal(summary.demoActive, 1);
    assert.equal(summary.heldForMaterial, 1);
    assert.deepEqual(summary.inRange, { started: 3, completed: 1, failed: 0, rejected: 0, dispatched: 1 });
    assert.deepEqual(summary.machines, [{ machineId: "bambu-a1-01", activeJobs: 1 }]);

    const before = await getManufacturingSummary(OPERATOR, rangeFromDays("custom", "2026-09-01", "2026-09-14"), NOW);
    assert.deepEqual(before.inRange, { started: 0, completed: 0, failed: 0, rejected: 0, dispatched: 0 });
    assert.equal(before.active, 3, "what is on the floor does not depend on the range");
  }));

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

test("customer figures are counts of accounts and guest orders, never a list", () =>
  withDatabase(async () => {
    const db = await getDatabase();
    await db.insert(customers).values([
      { id: "cus_new", authProvider: "supabase", authSubject: "s-new", createdAt: new Date("2026-09-05T10:00:00.000Z") },
      { id: "cus_old", authProvider: "supabase", authSubject: "s-old", createdAt: new Date("2025-01-05T10:00:00.000Z") },
      { id: "cus_demo", authProvider: "supabase", authSubject: "s-demo", createdAt: new Date("2025-01-05T10:00:00.000Z") },
    ]);

    await placeOrder({ customerId: "cus_new", placedAt: "2026-09-06T10:00:00.000Z" });
    await placeOrder({ customerId: "cus_old", placedAt: "2026-09-07T10:00:00.000Z" });
    await placeOrder({ customerId: "cus_old", placedAt: "2026-03-07T10:00:00.000Z" });
    await placeOrder({ placedAt: "2026-09-08T10:00:00.000Z" });
    await placeOrder({ customerId: "cus_demo", placedAt: "2026-09-08T10:00:00.000Z", demo: true });
    await placeOrder({ customerId: "cus_demo", placedAt: "2026-09-08T10:00:00.000Z", demo: true });

    const people = await getCustomerSummary(OPERATOR, parseRange({}, NOW), NOW);
    assert.equal(people.orderingAccounts, 2);
    assert.equal(people.guestOrders, 1);
    assert.equal(people.newAccounts, 1);
    assert.equal(people.repeatAccounts, 1, "only cus_old has two paid real orders");
    assert.deepEqual(
      Object.keys(people).sort(),
      ["definition", "generatedAt", "guestOrders", "newAccounts", "orderingAccounts", "range", "repeatAccounts", "source"],
      "the summary carries counts and provenance only",
    );
  }));

/* ------------------------------------------------------------------ *
 * A large table
 * ------------------------------------------------------------------ */

test("a large order table is aggregated in the database, exactly", { timeout: 120_000 }, () =>
  withDatabase(async () => {
    const db = await getDatabase();
    const ORDERS = 5000;
    const NAMES = 40;
    const expected = { amount: 0, orders: 0, units: 0, lineRevenue: 0, names: new Set<string>() };

    for (let offset = 0; offset < ORDERS; offset += 500) {
      const orderRows: (typeof orders.$inferInsert)[] = [];
      const itemRows: (typeof orderItems.$inferInsert)[] = [];

      for (let index = offset; index < Math.min(offset + 500, ORDERS); index += 1) {
        const reference = `LOAD-${String(index).padStart(6, "0")}`;
        // Spread across the month so far, a few hours apart.
        const placedAt = new Date(Date.parse("2026-09-01T00:00:00.000Z") + (index % 360) * 3_600_000);
        const paid = index % 5 !== 0;
        const demo = index % 17 === 0;
        const total = 100 + (index % 23) * 10;
        const quantity = 1 + (index % 3);
        const lineTotal = total;
        const name = `Part ${index % NAMES}`;

        orderRows.push({
          reference,
          cartId: `cart-${reference}`,
          status: paid ? "confirmed" : "pending",
          paymentStatus: paid ? "paid" : "pending",
          paymentProvider: "razorpay",
          totals: totals(total),
          contactName: "Load Test",
          contactEmail: "load@example.com",
          contactPhone: "9876543210",
          addressLine1: "1 Test Road",
          addressCity: "Hyderabad",
          addressState: "TG",
          addressPostalCode: "500032",
          addressCountry: "IN",
          placedAt,
          updatedAt: placedAt,
          provisional: false,
          demo,
        });
        itemRows.push({
          id: `${reference}-01`,
          orderReference: reference,
          type: "catalog",
          name,
          spec: "PLA",
          quantity,
          unitPrice: Math.round(lineTotal / quantity),
          lineTotal,
          fulfillmentStatus: "pending",
        });

        if (paid && !demo && placedAt >= new Date("2026-08-31T18:30:00.000Z")) {
          expected.amount += total;
          expected.orders += 1;
          expected.units += quantity;
          expected.lineRevenue += lineTotal;
          expected.names.add(name);
        }
      }

      await db.insert(orders).values(orderRows);
      await db.insert(orderItems).values(itemRows);
    }

    const range = parseRange({}, NOW);
    const started = performance.now();
    const [revenue, summary, products, stages] = await Promise.all([
      getRevenueSummary(OPERATOR, range, NOW),
      getOrderSummary(OPERATOR, range, NOW),
      getProductPerformance(OPERATOR, range, { now: NOW }),
      getOrderStageCounts(OPERATOR),
    ]);
    const elapsed = performance.now() - started;

    assert.equal(revenue.figure.amount, expected.amount);
    assert.equal(revenue.figure.orders, expected.orders);
    assert.equal(revenue.series.reduce((sum, point) => sum + point.amount, 0), expected.amount);
    assert.equal(summary.placed + summary.demoPlaced, ORDERS);
    assert.equal(products.totals.units, expected.units);
    assert.equal(products.totals.revenue, expected.lineRevenue);
    assert.equal(products.distinct, expected.names.size);
    assert.equal(products.rows.length, 10, "a page of products, not every product");
    assert.equal(stages.new + stages.paid, ORDERS);

    // PGlite is single-threaded WebAssembly; a real Postgres is faster. This bounds a regression to N+1.
    assert.ok(elapsed < 30_000, `analytics over ${ORDERS} orders took ${Math.round(elapsed)} ms`);
    console.log(`[analytics] ${ORDERS} orders aggregated in ${Math.round(elapsed)} ms (PGlite)`);
  }));

/* ------------------------------------------------------------------ *
 * Revenue by category (Stage 22)
 * ------------------------------------------------------------------ */

const snapshot = (productId: string, categoryId: string, categoryName: string, sku?: string) => ({
  productId,
  ...(sku ? { sku } : {}),
  categoryId,
  categoryName,
  browseCategoryId: "mechanical",
  browseCategoryName: "Mechanical",
  recordedAt: NOW.toISOString(),
});

test("category revenue counts the revenue population, from recorded categories only", () =>
  withDatabase(async () => {
    const gear = (overrides: Partial<OrderItem> = {}) =>
      item({ name: "Spur Gear, 24 Teeth", catalog: snapshot("p-101", "gears", "Gears", "R3D-G24"), ...overrides });
    const spacer = (overrides: Partial<OrderItem> = {}) =>
      item({ name: "Hex Shaft Spacer", catalog: snapshot("p-103", "spacers", "Spacers"), ...overrides });

    await placeOrder({ items: [gear({ quantity: 2, lineTotal: 500 }), spacer({ quantity: 4, lineTotal: 200 })] });
    // Renamed since: the same product id, a newer name — one product, the newest name.
    await placeOrder({
      placedAt: new Date(NOW.getTime() + 60_000).toISOString(),
      items: [gear({ name: "Spur Gear 24T", quantity: 1, lineTotal: 250 })],
    });
    // A line placed before Stage 22: its category is unknown.
    await placeOrder({ placedAt: "2026-09-05T10:00:00.000Z", items: [item({ name: "Spur Gear, 24 Teeth", quantity: 1, lineTotal: 90 })] });
    // A custom print: no category, reported beside the categories.
    await placeOrder({ items: [custom("bracket.stl", 1000)] });

    // None of these count.
    await placeOrder({ demo: true, items: [gear({ lineTotal: 9999 })] });
    await placeOrder({ payment: "pending", items: [gear({ lineTotal: 8888 })] });
    await placeOrder({ payment: "failed", items: [gear({ lineTotal: 7777 })] });
    await placeOrder({ cancelled: true, items: [spacer({ lineTotal: 6666 })] });
    await placeOrder({ items: [spacer({ lineTotal: 5555, fulfillmentStatus: "cancelled" }), gear({ lineTotal: 1 })] });
    await placeOrder({ placedAt: "2026-08-20T10:00:00.000Z", items: [gear({ lineTotal: 4444 })] });

    const range = parseRange({}, NOW);
    const revenue = await getCategoryRevenue(OPERATOR, range, NOW);

    assert.deepEqual(revenue.categories, [
      { id: "gears", name: "Gears", parentName: "Mechanical", units: 4, revenue: 751, orders: 3 },
      { id: "spacers", name: "Spacers", parentName: "Mechanical", units: 4, revenue: 200, orders: 1 },
    ]);
    assert.deepEqual(revenue.browse, [{ id: "mechanical", name: "Mechanical", parentName: null, units: 8, revenue: 951, orders: 3 }]);
    assert.deepEqual(revenue.categorised, { lines: 4, units: 8, revenue: 951 });
    assert.equal(revenue.uncategorised.revenue, 90, "historical revenue is shown as uncategorised, not assigned");
    assert.equal(revenue.uncategorised.lines, 1);
    assert.equal(revenue.uncategorised.firstPlaced, "2026-09-05T10:00:00Z");
    assert.deepEqual(revenue.custom, { lines: 1, units: 1, revenue: 1000, orders: 1 });

    // Category, uncategorised and custom revenue reconcile to product revenue exactly.
    const products = await getProductPerformance(OPERATOR, range, { limit: 100, now: NOW });
    assert.equal(revenue.categorised.revenue + revenue.uncategorised.revenue + revenue.custom.revenue, products.totals.revenue);

    const recorded = products.rows.find((row) => row.productId === "p-101")!;
    assert.equal(recorded.name, "Spur Gear 24T", "the newest name");
    assert.equal(recorded.sku, "R3D-G24");
    assert.equal(recorded.categoryName, "Gears");
    assert.equal(recorded.units, 4);
    const legacy = products.rows.find((row) => row.productId === null && row.type === "catalog")!;
    assert.equal(legacy.name, "Spur Gear, 24 Teeth", "a line without an id is not merged into a product by name");
    assert.equal(legacy.categoryName, null);

    // A narrower range excludes by placement date.
    const august = await getCategoryRevenue(OPERATOR, parseRange({ range: "custom", from: "2026-08-01", to: "2026-08-31" }, NOW), NOW);
    assert.deepEqual(august.categories.map((row) => [row.id, row.revenue]), [["gears", 4444]]);
  }));

/* ------------------------------------------------------------------ *
 * Stage 22.5: material usage
 * ------------------------------------------------------------------ */

const printedIn = (material: string, lineTotal: number, quantity = 1): OrderItem =>
  item({
    type: "custom",
    name: `${material}-part.stl`,
    spec: `${material.toUpperCase()} / STANDARD`,
    quantity,
    unitPrice: lineTotal / quantity,
    lineTotal,
    sourceFile: {
      designId: `dsn_${(sequence += 1)}`,
      storageKey: `designs/test/${sequence}.stl`,
      sha256: "a".repeat(64),
      fileName: `${material}-part.stl`,
      sizeBytes: 1024,
      format: "STL",
      configuration: { material, quality: "standard", finish: "none" },
    },
  });

test("material usage reports recorded materials only, and the gaps as gaps", () =>
  withDatabase(async () => {
    const range = parseRange({}, NOW);

    const empty = await getMaterialAnalytics(OPERATOR, range, NOW);
    assert.deepEqual(empty.sales, []);
    assert.deepEqual(empty.usage, []);
    assert.deepEqual(empty.catalogUnrecorded, { lines: 0, units: 0, revenue: 0 });
    assert.equal(empty.rawItems, 0, "no raw material is defined, so usage is not tracked rather than zero");

    await placeOrder({ items: [printedIn("petg", 600, 2), printedIn("pla", 300)] });
    await placeOrder({ items: [printedIn("petg", 400)] });
    await placeOrder({ items: [custom("unknown.stl", 250), item({ lineTotal: 90, quantity: 3 })] });
    // Not revenue: not counted.
    await placeOrder({ payment: "pending", items: [printedIn("tpu", 999)] });
    await placeOrder({ demo: true, items: [printedIn("pla", 888)] });

    const created = await createInventoryItem(OPERATOR, { itemType: "RAW_MATERIAL", unit: "kg", material: "pla", colour: "black" });
    assert.ok(created.ok && created.id, created.message);
    const itemId = created.id!;
    assert.ok((await recordOpeningBalance(OPERATOR, { itemId, quantity: "5", reference: "Stock-take", occurredAt: "2026-09-10" }, NOW)).ok);
    const waste = await recordStockMovement(OPERATOR, { itemId, type: "WASTE", quantity: "0.25", notes: "Failed first layer", occurredAt: "2026-09-15" }, NOW);
    assert.ok(waste.ok, waste.message);

    const data = await getMaterialAnalytics(OPERATOR, range, NOW);
    assert.deepEqual(data.sales, [
      { material: "PETG", lines: 2, units: 3, revenue: 1000, orders: 2 },
      { material: "PLA", lines: 1, units: 1, revenue: 300, orders: 1 },
    ]);
    assert.deepEqual(data.customUnrecorded, { lines: 1, revenue: 250 }, "a custom line without a recorded material is reported, not guessed");
    assert.deepEqual(data.catalogUnrecorded, { lines: 1, units: 3, revenue: 90 }, "catalog lines carry no material");
    assert.equal(data.rawItems, 1);
    assert.deepEqual(
      data.usage.map(({ name, material, colour, used, wasted, movements }) => ({ name, material, colour, used, wasted, movements })),
      [{ name: "PLA Black", material: "pla", colour: "black", used: 0, wasted: 250, movements: 1 }],
      "the opening balance is not usage; waste is counted in milli-units",
    );
    assert.equal(data.range, range);
    assert.match(data.definition, /Catalog lines record no material/);
  }));
