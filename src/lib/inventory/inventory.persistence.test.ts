import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq, sql } from "drizzle-orm";

import type { CartTotals } from "@/lib/cart/types";
import { getDatabase, setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { inventoryItems, inventoryMovements, inventoryPurchases, suppliers } from "@/lib/db/schema";
import type { OperatorSession } from "@/lib/ops/operator";
import { aggregateOrderStatus } from "@/lib/orders/aggregate";
import { orderRepository } from "@/lib/orders/repository";
import { applyManufacturingEvent, createManufacturingJobs } from "@/lib/orders/service";
import type { Order } from "@/lib/orders/types";

import { getItemLedger, getInventorySummary, listInventoryItems, listInventoryMovements, listOpenPurchases } from "./read";
import { parseQuantity, toNumeric } from "./rules";
import {
  cancelPurchase,
  createInventoryItem,
  createPurchase,
  createSupplier,
  receivePurchase,
  recordOpeningBalance,
  recordStockMovement,
  syncInventoryDefinitions,
  updateInventoryItem,
} from "./service";

/**
 * The inventory domain against real PostgreSQL (PGlite, committed migrations,
 * including the append-only trigger). One database for the file; every test
 * creates its own items, so no test reads another's stock.
 */

const OPERATOR = { id: "7", name: "Stock Keeper", email: "stock@reality3d.example" } as unknown as OperatorSession;
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

let sequence = 0;

/**
 * A raw-material fixture row. Written directly: the service allows one item per
 * approved material and colour (six in all), and these ledger tests need many.
 * Thresholds and cost are written as the service writes them.
 */
async function newItem(overrides: { name?: string; reorderLevel?: string; targetStock?: string; unitCost?: string } = {}): Promise<string> {
  sequence += 1;
  const id = `inv_fixture_${sequence}`;
  const db = await getDatabase();
  await db.insert(inventoryItems).values({
    id,
    name: overrides.name ?? `Test filament ${sequence}`,
    itemType: "RAW_MATERIAL",
    unit: "kg",
    material: "pla",
    reorderLevel: overrides.reorderLevel ? toNumeric(parseQuantity(overrides.reorderLevel)!) : null,
    targetStock: overrides.targetStock ? toNumeric(parseQuantity(overrides.targetStock)!) : null,
    unitCost: overrides.unitCost ?? null,
    createdBy: "fixture",
    updatedBy: "fixture",
  });
  return id;
}

async function balanceOf(itemId: string): Promise<string | null> {
  const db = await getDatabase();
  const [row] = await db.select({ q: inventoryItems.currentQuantity }).from(inventoryItems).where(eq(inventoryItems.id, itemId));
  return row!.q;
}

async function printingJob(): Promise<{ jobId: string; queuedJobId: string; reference: string }> {
  const totals: CartTotals = {
    currency: "INR",
    subtotal: 500,
    shipping: { known: false, reason: "later" },
    tax: { known: false, reason: "later" },
    total: 500,
    excluded: [],
    unitCount: 2,
    provisional: true,
  };
  const items = ["a", "b"].map((suffix) => ({
    id: `inv-item-${(sequence += 1)}-${suffix}`,
    type: "custom" as const,
    name: `${suffix}.stl`,
    spec: "PLA / STANDARD",
    quantity: 1,
    unitPrice: 250,
    lineTotal: 250,
    fulfillmentStatus: "pending" as const,
  }));
  const payment = { status: "paid" as const, provider: "razorpay" };
  const reference = await orderRepository.nextReference();
  const order: Order = {
    reference,
    cartId: `cart-${reference}`,
    status: aggregateOrderStatus({ items, payment }),
    payment,
    items,
    shipments: [],
    totals,
    contact: { name: "Buyer", email: "buyer@example.com", phone: "9876543210" },
    address: { line1: "1 Road", city: "Pune", state: "MH", postalCode: "411001", country: "IN" },
    placedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    provisional: true,
  };
  await orderRepository.createOrder(order);
  await createManufacturingJobs(order, NOW.toISOString());
  const [first, second] = await orderRepository.findJobsForOrder(reference);
  for (const type of ["DESIGN_REVIEW_STARTED", "DESIGN_APPROVED", "FILE_PREPARED", "MATERIAL_PREPARED", "PRINT_STARTED"] as const) {
    const result = await applyManufacturingEvent(first!.id, { type });
    assert.ok(result.ok);
  }
  return { jobId: first!.id, queuedJobId: second!.id, reference };
}

/* ------------------------------------------------------------------ *
 * Items and the unknown/zero distinction
 * ------------------------------------------------------------------ */

test("a new item is NOT TRACKED: no quantity, no cost, no value — and not out of stock", async () => {
  const itemId = await newItem({ name: "PLA Grey (test)" });
  const items = await listInventoryItems(OPERATOR);
  const item = items.find((candidate) => candidate.id === itemId)!;
  assert.equal(item.current, null);
  assert.equal(item.unitCost, null);
  assert.equal(item.value, null);
  assert.equal(item.status, "NOT_TRACKED");

  const refused = await recordStockMovement(OPERATOR, { itemId, type: "ADJUSTMENT_IN", quantity: "1", notes: "found" });
  assert.equal(refused.ok, false, "an unknown balance cannot be adjusted");
  assert.match(refused.message, /opening stock/);
});

test("stock cannot be set directly; only movements change it", async () => {
  const itemId = await newItem();
  const refused = await updateInventoryItem(OPERATOR, { itemId, currentQuantity: "5" });
  assert.equal(refused.ok, false);
  assert.equal(await balanceOf(itemId), null);
});

test("opening balance → usage → purchase → return → adjustment, all reconciled to the balance", async () => {
  const itemId = await newItem();
  const { jobId, queuedJobId } = await printingJob();

  assert.ok((await recordOpeningBalance(OPERATOR, { itemId, quantity: "2", unitCost: "1100", reference: "Stock-take 2026-09-15", occurredAt: "2026-09-15" }, NOW)).ok);
  assert.equal((await recordOpeningBalance(OPERATOR, { itemId, quantity: "3", reference: "again" }, NOW)).ok, false, "only once");

  // Usage must name a job that has started printing.
  const unnamed = await recordStockMovement(OPERATOR, { itemId, type: "USAGE", quantity: "0.35" }, NOW);
  assert.match(unnamed.message, /production job/);
  const notPrinted = await recordStockMovement(OPERATOR, { itemId, type: "USAGE", quantity: "0.35", jobId: queuedJobId }, NOW);
  assert.match(notPrinted.message, /not started printing/);
  assert.ok((await recordStockMovement(OPERATOR, { itemId, type: "USAGE", quantity: "0.35", jobId }, NOW)).ok);

  assert.ok((await createPurchase(OPERATOR, { itemId, quantity: "1", unitCost: "1200", reference: "INV-77", receivedNow: true }, NOW)).ok);
  assert.ok((await recordStockMovement(OPERATOR, { itemId, type: "RETURN", quantity: "0.2", notes: "Unused spool section" }, NOW)).ok);

  const noReason = await recordStockMovement(OPERATOR, { itemId, type: "ADJUSTMENT_OUT", quantity: "0.05" }, NOW);
  assert.match(noReason.message, /Say why/);
  assert.ok((await recordStockMovement(OPERATOR, { itemId, type: "ADJUSTMENT_OUT", quantity: "0.05", notes: "Recount" }, NOW)).ok);

  assert.equal(await balanceOf(itemId), "2.800");

  const ledger = await getItemLedger(OPERATOR, itemId);
  assert.ok(ledger);
  assert.equal(ledger.reconciliation.opening, 2000);
  assert.equal(ledger.reconciliation.byType.PURCHASE, 1000);
  assert.equal(ledger.reconciliation.byType.USAGE, -350);
  assert.equal(ledger.reconciliation.byType.RETURN, 200);
  assert.equal(ledger.reconciliation.byType.ADJUSTMENT_OUT, -50);
  assert.equal(ledger.reconciliation.ledgerBalance, 2800);
  assert.equal(ledger.reconciliation.balanced, true);
  assert.equal(ledger.item.unitCost, 1200, "the latest purchase cost");
  assert.match(ledger.item.unitCostSource ?? "", /^purchase:pur_/);
  assert.equal(ledger.item.value, 3360);

  const movements = await listInventoryMovements(OPERATOR, { itemId });
  assert.equal(movements.total, 5);
  assert.ok(movements.rows.every((row) => row.createdBy === OPERATOR.email), "every movement names its operator");
  const usage = movements.rows.find((row) => row.type === "USAGE")!;
  assert.equal(usage.referenceType, "manufacturing_job");
  assert.equal(usage.referenceId, jobId);
});

test("stock never goes negative, and the refused movement leaves no trace", async () => {
  const itemId = await newItem();
  assert.ok((await recordOpeningBalance(OPERATOR, { itemId, quantity: "0.5", reference: "count" }, NOW)).ok);
  const refused = await recordStockMovement(OPERATOR, { itemId, type: "WASTE", quantity: "0.6", notes: "Tangled" }, NOW);
  assert.equal(refused.ok, false);
  assert.equal(await balanceOf(itemId), "0.500");
  assert.equal((await listInventoryMovements(OPERATOR, { itemId })).total, 1);
});

test("concurrent movements are serialised: the stock is never oversold", async () => {
  const itemId = await newItem();
  assert.ok((await recordOpeningBalance(OPERATOR, { itemId, quantity: "1", reference: "count" }, NOW)).ok);

  const attempts = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      recordStockMovement(OPERATOR, { itemId, type: "ADJUSTMENT_OUT", quantity: "0.3", notes: `Concurrent ${index}` }, NOW),
    ),
  );
  assert.equal(attempts.filter((attempt) => attempt.ok).length, 3, "only three 0.3 kg removals fit in 1 kg");
  assert.equal(await balanceOf(itemId), "0.100");

  const ledger = await getItemLedger(OPERATOR, itemId);
  assert.equal(ledger?.reconciliation.balanced, true);

  const receipts = await Promise.all(
    Array.from({ length: 4 }, () => createPurchase(OPERATOR, { itemId, quantity: "0.25", receivedNow: true }, NOW)),
  );
  assert.ok(receipts.every((receipt) => receipt.ok));
  assert.equal(await balanceOf(itemId), "1.100", "no receipt was lost to a race");
});

test("the movement ledger is append-only in the database itself", async () => {
  const itemId = await newItem();
  assert.ok((await recordOpeningBalance(OPERATOR, { itemId, quantity: "1", reference: "count" }, NOW)).ok);
  const db = await getDatabase();
  // Drizzle wraps the database error; the trigger's message is on the cause.
  const appendOnly = (error: unknown) =>
    /append-only/.test(`${(error as Error).message} ${((error as Error).cause as Error | undefined)?.message ?? ""}`);
  await assert.rejects(
    db.update(inventoryMovements).set({ notes: "rewritten" }).where(eq(inventoryMovements.itemId, itemId)),
    appendOnly,
  );
  await assert.rejects(db.delete(inventoryMovements).where(eq(inventoryMovements.itemId, itemId)), appendOnly);
  await assert.rejects(db.execute(sql`truncate table inventory_movements cascade`), appendOnly);
  assert.equal((await listInventoryMovements(OPERATOR, { itemId })).total, 1);
});

/* ------------------------------------------------------------------ *
 * Suppliers and purchases
 * ------------------------------------------------------------------ */

test("a purchase references its supplier, waits for receipt, and moves stock only when received", async () => {
  const itemId = await newItem();
  assert.ok((await createSupplier(OPERATOR, { name: "Filament Co (test)", supplierType: "Filament", leadTimeDays: "5", email: "sales@filament.example" })).ok);
  assert.equal((await createSupplier(OPERATOR, { name: "filament co (TEST)" })).ok, false, "names are unique, ignoring case");
  assert.equal((await createSupplier(OPERATOR, { name: "Bad Mail", email: "nope" })).ok, false);

  const db = await getDatabase();
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.name, "Filament Co (test)"));
  assert.equal(supplier?.leadTimeDays, 5);

  assert.ok((await createPurchase(OPERATOR, { itemId, supplierId: supplier!.id, quantity: "5", unitCost: "1150", reference: "PO-1" }, NOW)).ok);
  assert.equal((await createPurchase(OPERATOR, { itemId, supplierId: "sup_missing", quantity: "5" }, NOW)).ok, false);

  const open = (await listOpenPurchases(OPERATOR)).filter((purchase) => purchase.itemId === itemId);
  assert.equal(open.length, 1);
  assert.equal(open[0]?.supplierName, "Filament Co (test)");
  assert.equal(await balanceOf(itemId), null, "ordering moves nothing");

  // The item has never been counted: receipt needs the operator to say there was none before.
  const unconfirmed = await receivePurchase(OPERATOR, { purchaseId: open[0]!.id }, NOW);
  assert.equal(unconfirmed.ok, false);
  assert.match(unconfirmed.message, /not tracked yet/);

  assert.ok((await receivePurchase(OPERATOR, { purchaseId: open[0]!.id, startsFromZero: "on" }, NOW)).ok);
  assert.equal((await receivePurchase(OPERATOR, { purchaseId: open[0]!.id }, NOW)).ok, false, "received once");
  assert.equal((await cancelPurchase(OPERATOR, { purchaseId: open[0]!.id })).ok, false, "a received purchase cannot be cancelled");
  assert.equal(await balanceOf(itemId), "5.000");

  const movements = await listInventoryMovements(OPERATOR, { itemId });
  assert.deepEqual(movements.rows.map((row) => row.type).sort(), ["OPENING_BALANCE", "PURCHASE"]);
  const opening = movements.rows.find((row) => row.type === "OPENING_BALANCE")!;
  assert.equal(opening.delta, 0, "the confirmed empty shelf is recorded, not assumed");
  const purchase = movements.rows.find((row) => row.type === "PURCHASE")!;
  assert.equal(purchase.supplierName, "Filament Co (test)");
  assert.equal(purchase.unitCost, 1150);

  const [stored] = await db.select().from(inventoryPurchases).where(eq(inventoryPurchases.id, open[0]!.id));
  assert.equal(stored?.status, "received");
  assert.equal(stored?.movementId, purchase.id);
});

test("'received now' on an untracked item without confirmation records nothing at all", async () => {
  const itemId = await newItem();
  const result = await createPurchase(OPERATOR, { itemId, quantity: "1", receivedNow: true }, NOW);
  assert.equal(result.ok, false);
  const db = await getDatabase();
  assert.equal((await db.select().from(inventoryPurchases).where(eq(inventoryPurchases.itemId, itemId))).length, 0);
  assert.equal(await balanceOf(itemId), null);
});

test("an ordered purchase can be cancelled without moving stock", async () => {
  const itemId = await newItem();
  assert.ok((await createPurchase(OPERATOR, { itemId, quantity: "2" }, NOW)).ok);
  const [open] = (await listOpenPurchases(OPERATOR)).filter((purchase) => purchase.itemId === itemId);
  assert.ok((await cancelPurchase(OPERATOR, { purchaseId: open!.id })).ok);
  assert.equal(await balanceOf(itemId), null);
  assert.equal((await listInventoryMovements(OPERATOR, { itemId })).total, 0);
});

/* ------------------------------------------------------------------ *
 * Thresholds, costs, summary, definitions
 * ------------------------------------------------------------------ */

test("reorder level, target and cost drive status, reorder quantity and valuation — honestly", async () => {
  const before = await getInventorySummary(OPERATOR);

  const low = await newItem({ reorderLevel: "1", targetStock: "5", unitCost: "1000" });
  assert.ok((await recordOpeningBalance(OPERATOR, { itemId: low, quantity: "0.8", reference: "count" }, NOW)).ok);
  const empty = await newItem({ reorderLevel: "1", targetStock: "5" });
  assert.ok((await recordOpeningBalance(OPERATOR, { itemId: empty, quantity: "0", reference: "count" }, NOW)).ok);
  await newItem({ reorderLevel: "1" });

  const items = await listInventoryItems(OPERATOR);
  const lowView = items.find((item) => item.id === low)!;
  assert.equal(lowView.status, "REORDER");
  assert.equal(lowView.reorderQuantity, 4200);
  assert.equal(lowView.value, 800);
  assert.equal(items.find((item) => item.id === empty)!.status, "OUT_OF_STOCK");

  const after = await getInventorySummary(OPERATOR);
  assert.equal(after.items - before.items, 3);
  assert.equal(after.tracked - before.tracked, 2);
  assert.equal(after.notTracked - before.notTracked, 1, "the untracked item is not counted as out of stock");
  assert.equal(after.lowStock - before.lowStock, 1);
  assert.equal(after.outOfStock - before.outOfStock, 1);
  assert.equal(after.missingCost - before.missingCost, 1, "the empty item has no cost");
  assert.equal(after.valuationComplete, false, "a tracked item without a cost makes the valuation incomplete");

  assert.ok((await updateInventoryItem(OPERATOR, { itemId: empty, unitCost: "900" })).ok);
  assert.ok((await updateInventoryItem(OPERATOR, { itemId: low, clear: ["targetStock"] })).ok);
  const updated = (await listInventoryItems(OPERATOR)).find((item) => item.id === low)!;
  assert.equal(updated.targetStock, null);
  assert.equal(updated.reorderQuantity, null);
  assert.ok((await updateInventoryItem(OPERATOR, { itemId: low, unitCost: "12.5" })).ok, "costs are kept to the paisa");
  assert.equal((await listInventoryItems(OPERATOR)).find((item) => item.id === low)!.unitCost, 12.5);
  assert.equal((await updateInventoryItem(OPERATOR, { itemId: low, unitCost: "12.555" })).ok, false, "no fractions of a paisa");
});

test("definitions come from the decision ledger and the catalog, carry no stock, and sync idempotently", async () => {
  const catalog = [
    { id: "p-101", name: "Spur Gear, 24 Teeth" },
    { id: "p-102", name: "Planetary Gear Set" },
    { id: "p-103", name: "Hex Shaft Spacer, 8 mm Bore" },
  ];
  const first = await syncInventoryDefinitions(OPERATOR, catalog);
  assert.ok(first.ok);
  assert.equal(first.created, 9, "PLA, PETG, TPU × black, white, plus three products");

  const second = await syncInventoryDefinitions(OPERATOR, catalog);
  assert.equal(second.created, 0, "the second sync changes nothing");

  const items = await listInventoryItems(OPERATOR);
  const defined = items.filter((item) => item.material && ["pla", "petg", "tpu", "abs", "resin"].includes(item.material) && item.colour);
  assert.deepEqual(
    defined.map((item) => `${item.material}/${item.colour}`).sort(),
    ["petg/black", "petg/white", "pla/black", "pla/white", "tpu/black", "tpu/white"],
    "no roadmap material (ABS, resin) becomes inventory",
  );
  assert.ok(defined.every((item) => item.status === "NOT_TRACKED" && item.unitCost === null && item.unit === "kg"));

  const products = items.filter((item) => item.itemType === "FINISHED_PRODUCT" && item.productId);
  assert.deepEqual(products.map((item) => item.productId).sort(), ["p-101", "p-102", "p-103"]);
  assert.ok(products.every((item) => item.status === "NOT_TRACKED" && item.sku === null));

  // A tracked definition keeps its stock through another sync.
  const pla = defined.find((item) => item.material === "pla" && item.colour === "black")!;
  assert.ok((await recordOpeningBalance(OPERATOR, { itemId: pla.id, quantity: "3", reference: "count" }, NOW)).ok);
  await syncInventoryDefinitions(OPERATOR, catalog);
  assert.equal(await balanceOf(pla.id), "3.000");

  assert.equal((await createInventoryItem(OPERATOR, { name: "Dup", itemType: "FINISHED_PRODUCT", unit: "pcs", productId: "p-101" })).ok, false);
  assert.equal((await createInventoryItem(OPERATOR, { name: "Bad link", itemType: "RAW_MATERIAL", unit: "kg", productId: "p-999" })).ok, false);
});
