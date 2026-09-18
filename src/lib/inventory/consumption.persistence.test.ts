import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { eq } from "drizzle-orm";

import { getDatabase, setDatabaseProvider } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "@/lib/db/pglite.testing";
import { inventoryItems, inventoryMovements, productConsumption } from "@/lib/db/schema";
import type { OperatorSession } from "@/lib/ops/operator";

import {
  checkConsumptionLines,
  getConsumptionForProducts,
  getProductConsumption,
  listConsumptionInputs,
  listProductsUsingItem,
  replaceProductConsumption,
} from "./consumption";
import { createInventoryItem, recordOpeningBalance } from "./service";

/**
 * Stage 22.7: a product's expected consumption, against real PostgreSQL
 * (PGlite, committed migrations including 0007). Lines are defined by an
 * operator and checked against the inventory; saving them never moves stock.
 */

const OPERATOR = { id: "7", name: "Planner", email: "planner@reality3d.example" } as unknown as OperatorSession;
const PRODUCT = "p-gear-20t";

let harness: TestDatabase;
let pla: string;
let label: string;
let resin: string;
let finished: string;
let retired: string;

before(async () => {
  harness = await createTestDatabase();
  setDatabaseProvider(harness);

  const created = await createInventoryItem(OPERATOR, { itemType: "RAW_MATERIAL", material: "pla", colour: "black", unit: "kg", unitCost: "1200" });
  assert.ok(created.ok && created.id, created.message);
  pla = created.id!;
  const labels = await createInventoryItem(OPERATOR, { itemType: "CONSUMABLE", name: "Shipping label", unit: "pcs", category: "Packaging", unitCost: "0.50" });
  assert.ok(labels.ok && labels.id, labels.message);
  label = labels.id!;
  const glue = await createInventoryItem(OPERATOR, { itemType: "CONSUMABLE", name: "Resin cleaner", unit: "L", category: "Workshop" });
  assert.ok(glue.ok && glue.id, glue.message);
  resin = glue.id!;

  const db = await getDatabase();
  finished = "inv_fixture_finished";
  retired = "inv_fixture_retired";
  await db.insert(inventoryItems).values([
    { id: finished, name: "Gear 20T", itemType: "FINISHED_PRODUCT", unit: "pcs", productId: "p-other", createdBy: "fixture", updatedBy: "fixture" },
    { id: retired, name: "Old tape", itemType: "CONSUMABLE", unit: "pcs", category: "Packaging", active: false, createdBy: "fixture", updatedBy: "fixture" },
  ]);
});

after(async () => {
  setDatabaseProvider(null);
  await harness.destroy();
});

const lines = (...rows: [string, string, string, string?][]) =>
  JSON.stringify(rows.map(([inventoryItemId, quantity, unit, notes]) => ({ inventoryItemId, quantity, unit, notes: notes ?? "" })));

async function stockSnapshot() {
  const db = await getDatabase();
  const items = await db.select({ id: inventoryItems.id, q: inventoryItems.currentQuantity }).from(inventoryItems);
  const movements = await db.select({ id: inventoryMovements.id }).from(inventoryMovements);
  return { items: JSON.stringify(items.sort((a, b) => a.id.localeCompare(b.id))), movements: movements.length };
}

test("inputs offered are active raw materials and consumables — never finished products or inactive items", async () => {
  const ids = (await listConsumptionInputs(OPERATOR)).map((input) => input.id);
  assert.ok(ids.includes(pla) && ids.includes(label) && ids.includes(resin));
  assert.ok(!ids.includes(finished));
  assert.ok(!ids.includes(retired));
});

test("a product with nothing defined reads as not defined, not as zero", async () => {
  const empty = await getProductConsumption(OPERATOR, "p-nothing");
  assert.equal(empty.lines.length, 0);
  assert.equal(empty.totalCostPaise, null);
});

test("a raw material and a consumable are saved in the item's unit, with a cost estimate — and stock does not move", async () => {
  const opening = await recordOpeningBalance(OPERATOR, { itemId: pla, quantity: "2", reference: "Stock-take sheet 1" });
  assert.ok(opening.ok, opening.message);
  const before = await stockSnapshot();
  assert.equal(before.movements, 1);

  const saved = await replaceProductConsumption(OPERATOR, PRODUCT, lines([pla, "85", "g", "Body and teeth"], [label, "1", "pcs"]));
  assert.ok(saved.ok, saved.message);
  assert.equal(saved.added, 2);
  assert.match(saved.message, /Stock is not changed/);

  const read = await getProductConsumption(OPERATOR, PRODUCT);
  const plaLine = read.lines.find((line) => line.inventoryItemId === pla)!;
  assert.equal(plaLine.quantity, 85, "0.085 kg in milli-units");
  assert.deepEqual(plaLine.display, { milli: 85_000, unit: "g" });
  assert.equal(plaLine.notes, "Body and teeth");
  assert.equal(plaLine.costPaise, 10_200);
  assert.equal(read.lines.find((line) => line.inventoryItemId === label)!.costPaise, 50);
  assert.equal(read.totalCostPaise, 10_250);

  const db = await getDatabase();
  const [row] = await db.select().from(productConsumption).where(eq(productConsumption.id, plaLine.id));
  assert.equal(row!.quantity, "0.085");
  assert.equal(row!.createdBy, OPERATOR.email);

  assert.deepEqual(await stockSnapshot(), before, "no balance changed and no movement was written");
});

test("saving the same lines again changes nothing", async () => {
  const again = await replaceProductConsumption(OPERATOR, PRODUCT, lines([pla, "85", "g", "Body and teeth"], [label, "1", "pcs"]));
  assert.ok(again.ok);
  assert.equal(again.added + again.changed + again.removed, 0);
  assert.match(again.message, /No changes/);
});

test("editing a quantity updates the line; removing an item deactivates it and keeps the record", async () => {
  const edited = await replaceProductConsumption(OPERATOR, PRODUCT, lines([pla, "0.09", "kg", "Body and teeth"]));
  assert.ok(edited.ok, edited.message);
  assert.equal(edited.changed, 1);
  assert.equal(edited.removed, 1);

  const read = await getProductConsumption(OPERATOR, PRODUCT);
  assert.deepEqual(
    read.lines.map((line) => [line.inventoryItemId, line.quantity]),
    [[pla, 90]],
  );

  const db = await getDatabase();
  const labelRows = await db.select().from(productConsumption).where(eq(productConsumption.inventoryItemId, label));
  assert.equal(labelRows.length, 1, "the removed line is kept");
  assert.equal(labelRows[0]!.active, false);

  const readded = await replaceProductConsumption(OPERATOR, PRODUCT, lines([pla, "90", "g"], [label, "2", "pcs"]));
  assert.ok(readded.ok, readded.message);
  assert.equal(readded.added, 1, "an item removed earlier can be listed again");
  assert.equal((await getProductConsumption(OPERATOR, PRODUCT)).lines.length, 2);
});

test("invalid lines are refused per row and nothing is written", async () => {
  const before = await getProductConsumption(OPERATOR, PRODUCT);
  const cases: [string, RegExp][] = [
    [lines([pla, "5", "pcs"]), /incompatible/],
    [lines([pla, "0.5", "g"]), /Too precise/],
    [lines([finished, "1", "pcs"]), /Finished products cannot/],
    [lines([retired, "1", "pcs"]), /inactive/],
    [lines(["inv_does_not_exist", "1", "pcs"]), /does not exist/],
    [lines([pla, "0", "g"]), /greater than 0/],
    [lines([pla, "-2", "g"]), /number/],
    [lines([pla, "85", "g"], [pla, "10", "g"]), /already listed/],
    [lines([resin, "20", "g"]), /incompatible/],
  ];
  for (const [raw, message] of cases) {
    const result = await replaceProductConsumption(OPERATOR, PRODUCT, raw);
    assert.equal(result.ok, false, raw);
    const errors = !result.ok ? Object.values(result.errors) : [];
    assert.ok(errors.some((error) => message.test(error)), `${raw}: ${JSON.stringify(errors)}`);
    const check = await checkConsumptionLines(OPERATOR, raw);
    assert.equal(check.ok, false, `check agrees for ${raw}`);
  }
  assert.deepEqual(await getProductConsumption(OPERATOR, PRODUCT), before, "a refused save leaves the lines as they were");

  const bad = await replaceProductConsumption(OPERATOR, "../etc", lines([pla, "1", "g"]));
  assert.equal(bad.ok, false);
});

test("volume converts ml → L and an uncosted input leaves the estimate unavailable", async () => {
  const saved = await replaceProductConsumption(OPERATOR, "p-resin-part", lines([resin, "25", "ml"]));
  assert.ok(saved.ok, saved.message);
  const read = await getProductConsumption(OPERATOR, "p-resin-part");
  assert.equal(read.lines[0]!.quantity, 25, "0.025 L");
  assert.equal(read.lines[0]!.costPaise, null);
  assert.equal(read.totalCostPaise, null);
  assert.equal(read.missingCost, 1);
});

test("an item lists the products that use it; several products read in one call", async () => {
  const usage = await listProductsUsingItem(OPERATOR, pla);
  assert.deepEqual(
    usage.map((entry) => [entry.productId, entry.quantity]),
    [[PRODUCT, 90]],
  );
  assert.deepEqual(await listProductsUsingItem(OPERATOR, finished), []);

  const many = await getConsumptionForProducts(OPERATOR, [PRODUCT, "p-resin-part", "p-nothing", "bad id!"]);
  assert.equal(many.get(PRODUCT)!.lines.length, 2);
  assert.equal(many.get("p-resin-part")!.lines.length, 1);
  assert.equal(many.get("p-nothing")!.lines.length, 0);
  assert.equal(many.has("bad id!"), false);
});

test("the database refuses a second active line for the same item and a non-positive quantity", async () => {
  const db = await getDatabase();
  const base = { productId: PRODUCT, inventoryItemId: pla, createdBy: "t", updatedBy: "t" };
  await assert.rejects(db.insert(productConsumption).values({ ...base, id: "pcn_dup", quantity: "0.010" }));
  await assert.rejects(db.insert(productConsumption).values({ ...base, id: "pcn_zero", productId: "p-zero", quantity: "0" }));
  await assert.rejects(
    db.insert(productConsumption).values({ ...base, id: "pcn_orphan", productId: "p-orphan", inventoryItemId: "inv_missing", quantity: "1" }),
  );
});
