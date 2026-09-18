import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { getDatabase, setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { inventoryMovements } from "@/lib/db/schema";
import type { OperatorSession } from "@/lib/ops/operator";

import { getInventorySummary, getItemLedger, listInventoryItems, listSuppliers } from "./read";
import {
  createInventoryItem,
  createPurchase,
  createSupplier,
  recordOpeningBalance,
  recordStockMovement,
  updateInventoryItem,
} from "./service";

/**
 * Stage 22.6: raw materials, finished products and consumables in one inventory,
 * against real PostgreSQL (PGlite, committed migrations including 0006). One
 * ledger, one supplier list, one purchase flow; costs to the paisa; unknown is
 * never zero. Every item here is created through the service, as an operator
 * would — nothing is seeded.
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

async function supplier(name: string): Promise<string> {
  assert.ok((await createSupplier(OPERATOR, { name, supplierType: "Packaging" })).ok);
  const found = (await listSuppliers(OPERATOR)).find((row) => row.name === name);
  assert.ok(found);
  return found.id;
}

async function consumable(fields: Record<string, unknown>): Promise<string> {
  const result = await createInventoryItem(OPERATOR, { itemType: "CONSUMABLE", unit: "pcs", category: "Packaging", ...fields });
  assert.ok(result.ok && result.id, result.message);
  return result.id!;
}

/* ------------------------------------------------------------------ *
 * Creation, per kind
 * ------------------------------------------------------------------ */

test("a consumable is created with its own unit, category, cost to the paisa, supplier and notes — and no stock", async () => {
  const supplierId = await supplier("Mailer Co");
  const id = await consumable({
    name: "Shipping label 100×150",
    sku: "LBL-100",
    unit: "pcs",
    reorderLevel: "200",
    targetStock: "1000",
    unitCost: "0.50",
    supplierId,
    notes: "Thermal labels for dispatch",
  });

  const item = (await listInventoryItems(OPERATOR, { group: "CONSUMABLE" })).find((row) => row.id === id)!;
  assert.equal(item.itemType, "CONSUMABLE");
  assert.equal(item.group, "CONSUMABLE");
  assert.equal(item.category, "Packaging");
  assert.equal(item.unit, "pcs");
  assert.equal(item.unitCost, 0.5, "fifty paise, not zero and not rounded to a rupee");
  assert.equal(item.supplierName, "Mailer Co");
  assert.equal(item.notes, "Thermal labels for dispatch");
  assert.equal(item.current, null);
  assert.equal(item.status, "NOT_TRACKED", "no stock was entered, so none is known");
  assert.equal(item.value, null);
});

test("a consumable needs a name, a known category and a known unit; a supplier must exist", async () => {
  const refusals: [Record<string, unknown>, RegExp][] = [
    [{ name: "" }, /name/],
    [{ name: "Glue", category: "Snacks" }, /category/],
    [{ name: "Glue", unit: "roll" }, /unit/],
    [{ name: "Glue", unitCost: "1.234" }, /two decimals/],
    [{ name: "Glue", unitCost: "-1" }, /two decimals/],
    [{ name: "Glue", supplierId: "sup_missing" }, /supplier does not exist/],
    [{ name: "Glue", reorderLevel: "1.2345" }, /three decimals/],
  ];
  for (const [fields, message] of refusals) {
    const result = await createInventoryItem(OPERATOR, { itemType: "CONSUMABLE", unit: "ml", category: "Workshop", ...fields });
    assert.equal(result.ok, false, JSON.stringify(fields));
    assert.match(result.message, message, JSON.stringify(fields));
  }
  for (const unit of ["pcs", "g", "kg", "ml", "L", "m", "pack", "box"]) {
    assert.ok((await createInventoryItem(OPERATOR, { itemType: "CONSUMABLE", name: `Unit test ${unit}`, unit, category: "Other" })).ok, unit);
  }
});

test("a raw material is an approved material in an approved colour, named from them, defined once", async () => {
  const created = await createInventoryItem(OPERATOR, { itemType: "RAW_MATERIAL", material: "petg", colour: "white", unit: "kg", name: "ignored" });
  assert.ok(created.ok, created.message);
  const item = (await listInventoryItems(OPERATOR, { group: "RAW_MATERIAL" })).find((row) => row.id === created.id)!;
  assert.equal(item.name, "PETG White", "the name follows the material and colour, not the form");
  assert.equal(item.category, "Filament");
  assert.equal(item.status, "NOT_TRACKED");

  const duplicate = await createInventoryItem(OPERATOR, { itemType: "RAW_MATERIAL", material: "petg", colour: "white", unit: "kg" });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.message, /already defined/);

  for (const [fields, message] of [
    [{ material: "abs", colour: "black" }, /ABS is coming soon/],
    [{ material: "resin", colour: "black" }, /coming soon/],
    [{ material: "nylon", colour: "black" }, /Choose the material/],
    [{ material: "pla", colour: "orange" }, /approved colour/],
    [{ material: "pla" }, /approved colour/],
  ] as const) {
    const result = await createInventoryItem(OPERATOR, { itemType: "RAW_MATERIAL", unit: "kg", ...fields });
    assert.equal(result.ok, false, JSON.stringify(fields));
    assert.match(result.message, message);
  }
});

test("a finished product is a catalog product, named by the catalog", async () => {
  const catalog = [{ id: "p-101", name: "Spur Gear, 24 Teeth" }];
  const created = await createInventoryItem(OPERATOR, { itemType: "FINISHED_PRODUCT", productId: "p-101", unit: "pcs", name: "Wrong name" }, catalog);
  assert.ok(created.ok, created.message);
  const item = (await listInventoryItems(OPERATOR, { group: "FINISHED_PRODUCT" })).find((row) => row.id === created.id)!;
  assert.equal(item.name, "Spur Gear, 24 Teeth");
  assert.equal(item.productId, "p-101");

  assert.match((await createInventoryItem(OPERATOR, { itemType: "FINISHED_PRODUCT", productId: "p-999", unit: "pcs" }, catalog)).message, /not in the catalog/);
  assert.match((await createInventoryItem(OPERATOR, { itemType: "FINISHED_PRODUCT", unit: "pcs" }, catalog)).message, /catalog product/);
  assert.match((await createInventoryItem(OPERATOR, { itemType: "FINISHED_PRODUCT", productId: "p-101", unit: "pcs" }, catalog)).message, /already defined/);
});

/* ------------------------------------------------------------------ *
 * The shared ledger, purchases and costs
 * ------------------------------------------------------------------ */

test("consumables move through the same ledger: opening, purchase at paise, usage with a reason, waste, adjustment, return", async () => {
  const supplierId = await supplier("Adhesive House");
  const id = await consumable({ name: "Bed adhesive 250 ml", unit: "ml", category: "Printing consumables", reorderLevel: "100", targetStock: "500" });

  assert.ok((await recordOpeningBalance(OPERATOR, { itemId: id, quantity: "120", unitCost: "0.40", reference: "Shelf count" }, NOW)).ok);
  const purchase = await createPurchase(OPERATOR, { itemId: id, supplierId, quantity: "250", unitCost: "0.36", reference: "INV-9", receivedNow: true }, NOW);
  assert.ok(purchase.ok, purchase.message);

  const noReason = await recordStockMovement(OPERATOR, { itemId: id, type: "USAGE", quantity: "20" }, NOW);
  assert.equal(noReason.ok, false, "usage that is not for a job must say why");
  assert.match(noReason.message, /not recorded against a production job/);
  assert.ok((await recordStockMovement(OPERATOR, { itemId: id, type: "USAGE", quantity: "20", notes: "Bed prep, weekly" }, NOW)).ok);

  assert.equal((await recordStockMovement(OPERATOR, { itemId: id, type: "WASTE", quantity: "5" }, NOW)).ok, false, "waste needs a reason");
  assert.ok((await recordStockMovement(OPERATOR, { itemId: id, type: "WASTE", quantity: "5", notes: "Spilled" }, NOW)).ok);
  assert.equal((await recordStockMovement(OPERATOR, { itemId: id, type: "ADJUSTMENT_OUT", quantity: "1" }, NOW)).ok, false);
  assert.ok((await recordStockMovement(OPERATOR, { itemId: id, type: "ADJUSTMENT_OUT", quantity: "1", notes: "Recount" }, NOW)).ok);
  assert.ok((await recordStockMovement(OPERATOR, { itemId: id, type: "RETURN", quantity: "6" }, NOW)).ok);

  const ledger = (await getItemLedger(OPERATOR, id))!;
  assert.equal(ledger.item.current, 350_000, "120 + 250 − 20 − 5 − 1 + 6 = 350 ml");
  assert.equal(ledger.reconciliation.balanced, true);
  assert.equal(ledger.item.unitCost, 0.36, "the latest purchase cost");
  assert.equal(ledger.item.value, 126, "350 ml × ₹0.36");
  assert.equal(ledger.item.status, "HEALTHY");

  const db = await getDatabase();
  const movements = await db.select().from(inventoryMovements);
  const received = movements.find((row) => row.itemId === id && row.type === "PURCHASE")!;
  assert.equal(received.unitCost, "0.36", "the movement keeps the paise it was bought at");
  assert.equal(received.supplierId, supplierId);
});

test("negative stock is refused for consumables too, and the refused movement leaves no trace", async () => {
  const id = await consumable({ name: "Nozzle 0.4 mm brass", unit: "pcs", category: "Maintenance" });
  assert.ok((await recordOpeningBalance(OPERATOR, { itemId: id, quantity: "2", reference: "count" }, NOW)).ok);
  const refused = await recordStockMovement(OPERATOR, { itemId: id, type: "USAGE", quantity: "3", notes: "Swap" }, NOW);
  assert.equal(refused.ok, false);
  const ledger = (await getItemLedger(OPERATOR, id))!;
  assert.equal(ledger.item.current, 2000);
  assert.equal(ledger.reconciliation.balanced, true);
});

test("stock is never edited directly; suppliers, notes and a consumable's category are", async () => {
  const supplierId = await supplier("Workshop Supply");
  const id = await consumable({ name: "IPA 1 L", unit: "L", category: "Workshop" });

  assert.equal((await updateInventoryItem(OPERATOR, { itemId: id, currentQuantity: "5" })).ok, false);
  assert.equal((await updateInventoryItem(OPERATOR, { itemId: id, supplierId: "sup_missing" })).ok, false);
  assert.ok((await updateInventoryItem(OPERATOR, { itemId: id, supplierId, notes: "Cleaning", category: "Post-processing" })).ok);
  let item = (await listInventoryItems(OPERATOR)).find((row) => row.id === id)!;
  assert.equal(item.supplierName, "Workshop Supply");
  assert.equal(item.category, "Post-processing");
  assert.equal(item.notes, "Cleaning");
  assert.equal(item.current, null);

  assert.equal((await updateInventoryItem(OPERATOR, { itemId: id, category: "Snacks" })).ok, false);
  assert.ok((await updateInventoryItem(OPERATOR, { itemId: id, clear: ["supplierId", "notes"] })).ok);
  item = (await listInventoryItems(OPERATOR)).find((row) => row.id === id)!;
  assert.equal(item.supplierId, null);
  assert.equal(item.notes, null);

  const raw = (await listInventoryItems(OPERATOR, { group: "RAW_MATERIAL" }))[0]!;
  const refused = await updateInventoryItem(OPERATOR, { itemId: raw.id, category: "Packaging" });
  assert.equal(refused.ok, false, "only a consumable's category can change");
});

/* ------------------------------------------------------------------ *
 * Reads: filters and per-kind figures
 * ------------------------------------------------------------------ */

test("items are found by name, SKU, category, material, colour and supplier, within their kind", async () => {
  const supplierId = await supplier("Box Mart");
  await consumable({ name: "Corrugated box 20 cm", sku: "BOX-20", unit: "box", category: "Packaging", supplierId });

  const byName = await listInventoryItems(OPERATOR, { group: "CONSUMABLE", q: "corrugated" });
  assert.deepEqual(byName.map((item) => item.sku), ["BOX-20"]);
  assert.equal((await listInventoryItems(OPERATOR, { group: "CONSUMABLE", q: "box-20" })).length, 1, "SKU, case-insensitive");
  assert.ok((await listInventoryItems(OPERATOR, { group: "CONSUMABLE", q: "maintenance" })).every((item) => item.category === "Maintenance"));
  assert.deepEqual((await listInventoryItems(OPERATOR, { supplierId })).map((item) => item.name), ["Corrugated box 20 cm"]);
  assert.ok((await listInventoryItems(OPERATOR, { group: "RAW_MATERIAL", colour: "white" })).every((item) => item.colour === "white"));
  assert.equal((await listInventoryItems(OPERATOR, { group: "RAW_MATERIAL", q: "corrugated" })).length, 0, "the kind is respected");
  assert.equal((await listInventoryItems(OPERATOR, { group: "CONSUMABLE", q: "100%_" })).length, 0, "search text is literal");
});

test("the summary counts each kind separately and never calls unknown stock zero", async () => {
  const summary = await getInventorySummary(OPERATOR);
  const sum = (key: "items" | "tracked" | "notTracked") =>
    summary.byGroup.RAW_MATERIAL[key] + summary.byGroup.FINISHED_PRODUCT[key] + summary.byGroup.CONSUMABLE[key];
  assert.equal(sum("items"), summary.items);
  assert.equal(sum("tracked"), summary.tracked);
  assert.equal(sum("notTracked"), summary.notTracked);

  const consumables = await listInventoryItems(OPERATOR, { group: "CONSUMABLE" });
  assert.equal(summary.byGroup.CONSUMABLE.items, consumables.length);
  assert.equal(summary.byGroup.CONSUMABLE.notTracked, consumables.filter((item) => item.current === null).length);
  assert.equal(summary.byGroup.RAW_MATERIAL.items, 1, "only the one raw material defined in this file");
  assert.equal(summary.byGroup.RAW_MATERIAL.outOfStock, 0, "an untracked material is not out of stock");
  assert.equal(summary.byGroup.CONSUMABLE.valuationComplete, false, "some tracked consumables have no cost");
  assert.ok(Math.abs(summary.byGroup.CONSUMABLE.valueOfCosted - 126) < 0.001, "only the costed consumable is valued, to the paisa");
});
