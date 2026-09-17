import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_LINES,
  entryUnitsFor,
  formatPerUnit,
  isConsumableInput,
  lineCostPaise,
  parseConsumptionLines,
  preferredEntryUnit,
  rowsFromLines,
  toFriendly,
  toItemUnit,
} from "./consumption-rules";
import { expectedConsumption, type PerUnitInput } from "./expected";

/**
 * Stage 22.7: the pure rules behind a product's expected consumption. Units
 * convert only within mass and volume, quantities keep the ledger's precision,
 * and a missing cost is said, never zero.
 */

const line = (fields: Partial<Record<"inventoryItemId" | "quantity" | "unit" | "notes", string>>) => ({
  inventoryItemId: "inv_a",
  quantity: "85",
  unit: "g",
  notes: "",
  ...fields,
});

test("only mass and volume convert; every other unit is entered as itself", () => {
  assert.deepEqual(entryUnitsFor("kg"), ["g", "kg"]);
  assert.deepEqual(entryUnitsFor("g"), ["g", "kg"]);
  assert.deepEqual(entryUnitsFor("L"), ["ml", "L"]);
  assert.deepEqual(entryUnitsFor("pcs"), ["pcs"]);
  assert.deepEqual(entryUnitsFor("m"), ["m"]);
  assert.equal(preferredEntryUnit("kg"), "g");
  assert.equal(preferredEntryUnit("box"), "box");
});

test("a quantity is stored in the item's own unit: 85 g of a kg item is 0.085 kg", () => {
  assert.deepEqual(toItemUnit(85_000, "g", "kg"), { ok: true, milli: 85 });
  assert.deepEqual(toItemUnit(1_500, "kg", "g"), { ok: true, milli: 1_500_000 });
  assert.deepEqual(toItemUnit(250_000, "ml", "L"), { ok: true, milli: 250 });
  assert.deepEqual(toItemUnit(2_000, "pcs", "pcs"), { ok: true, milli: 2_000 });
});

test("unrelated units are refused, never guessed", () => {
  for (const [entry, item] of [
    ["pcs", "kg"],
    ["g", "pcs"],
    ["ml", "kg"],
    ["kg", "L"],
    ["m", "box"],
  ] as const) {
    const result = toItemUnit(1_000, entry, item);
    assert.equal(result.ok, false, `${entry} → ${item}`);
    assert.match(!result.ok ? result.reason : "", /incompatible/);
  }
});

test("a quantity finer than the ledger keeps is refused rather than rounded", () => {
  const result = toItemUnit(500, "g", "kg");
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.reason : "", /Too precise.*1 g/);
});

test("a stored quantity reads in its friendliest unit", () => {
  assert.deepEqual(toFriendly(85, "kg"), { milli: 85_000, unit: "g" });
  assert.deepEqual(toFriendly(1_200, "kg"), { milli: 1_200, unit: "kg" });
  assert.deepEqual(toFriendly(3_000, "pcs"), { milli: 3_000, unit: "pcs" });
  assert.equal(formatPerUnit(85, "kg"), "85 g");
  assert.equal(formatPerUnit(1_000, "pcs"), "1 pcs");
});

test("line cost comes from the real unit cost, to the paisa, and is null when the cost is missing", () => {
  assert.equal(lineCostPaise(85, 1_200), 10_200, "0.085 kg × ₹1,200 / kg = ₹102");
  assert.equal(lineCostPaise(1_000, 0.5), 50, "one label at fifty paise");
  assert.equal(lineCostPaise(85, null), null, "unknown is never zero");
});

test("finished products are never a manufacturing input", () => {
  assert.equal(isConsumableInput("FINISHED_PRODUCT"), false);
  assert.equal(isConsumableInput("RAW_MATERIAL"), true);
  assert.equal(isConsumableInput("CONSUMABLE"), true);
});

test("lines are parsed per row: quantity must be positive, a unit chosen, an item named", () => {
  const { errors } = parseConsumptionLines(
    JSON.stringify([
      line({ inventoryItemId: "" }),
      line({ inventoryItemId: "inv_b", quantity: "0" }),
      line({ inventoryItemId: "inv_c", quantity: "-3" }),
      line({ inventoryItemId: "inv_d", quantity: "abc" }),
      line({ inventoryItemId: "inv_e", quantity: "1.2345" }),
      line({ inventoryItemId: "inv_f", unit: "" }),
      line({ inventoryItemId: "inv_g", notes: "x".repeat(201) }),
      line({ inventoryItemId: "bad id!" }),
      line({ inventoryItemId: "inv_ok" }),
    ]),
  );
  assert.match(errors[0]!, /Choose a material/);
  assert.match(errors[1]!, /greater than 0/);
  assert.match(errors[2]!, /number/);
  assert.match(errors[3]!, /number/);
  assert.match(errors[4]!, /three decimals/);
  assert.match(errors[5]!, /Choose a unit/);
  assert.match(errors[6]!, /200 characters/);
  assert.match(errors[7]!, /does not exist/);
  assert.equal(errors[8], undefined);
});

test("the same item twice is refused on the later row", () => {
  const { errors } = parseConsumptionLines(JSON.stringify([line({}), line({ inventoryItemId: "inv_b" }), line({ quantity: "5" })]));
  assert.deepEqual(Object.keys(errors), ["2"]);
  assert.match(errors[2]!, /already listed \(row 1\)/);
});

test("empty input means no lines; unreadable or oversized input is a problem, not a silent drop", () => {
  assert.deepEqual(parseConsumptionLines(""), { lines: [], errors: {} });
  assert.deepEqual(parseConsumptionLines(null), { lines: [], errors: {} });
  assert.ok(parseConsumptionLines("{not json").problem);
  assert.ok(parseConsumptionLines(JSON.stringify({})).problem);
  assert.ok(parseConsumptionLines(JSON.stringify(Array.from({ length: MAX_LINES + 1 }, (_, i) => line({ inventoryItemId: `i${i}` })))).problem);
});

test("saved lines become form rows in their friendly unit", () => {
  assert.deepEqual(rowsFromLines([{ inventoryItemId: "inv_a", display: { milli: 85_000, unit: "g" }, notes: null }]), [
    { inventoryItemId: "inv_a", quantity: "85", unit: "g", notes: "" },
  ]);
  assert.equal(rowsFromLines([{ inventoryItemId: "x", display: { milli: 1_250_500, unit: "g" }, notes: "n" }])[0]!.quantity, "1250.5");
});

const perUnit = (inventoryItemId: string, quantity: number, costPaise: number | null, unit = "kg"): PerUnitInput => ({
  inventoryItemId,
  item: { name: inventoryItemId.toUpperCase(), sku: null, unit, typeLabel: "Raw material" },
  quantity,
  costPaise,
});

test("expected order consumption is per-unit × quantity, summed by input, with gaps named", () => {
  const map = new Map([
    ["p-1", { lines: [perUnit("pla", 85, 10_200), perUnit("label", 1_000, 50, "pcs")] }],
    ["p-2", { lines: [perUnit("pla", 40, 4_800)] }],
    ["p-3", { lines: [] }],
  ]);
  const result = expectedConsumption(
    [
      { productId: "p-1", name: "Gear", quantity: 3 },
      { productId: "p-2", name: "Spacer", quantity: 2 },
      { productId: "p-3", name: "Bracket", quantity: 1 },
      { productId: "p-9", name: "Unknown", quantity: 1 },
    ],
    map,
  );
  const pla = result.inputs.find((input) => input.inventoryItemId === "pla")!;
  assert.equal(pla.quantity, 85 * 3 + 40 * 2);
  assert.equal(pla.display, "335 g");
  assert.equal(pla.costPaise, 10_200 * 3 + 4_800 * 2);
  assert.equal(result.inputs.find((input) => input.inventoryItemId === "label")!.display, "3 pcs");
  assert.deepEqual(result.covered, ["Gear", "Spacer"]);
  assert.deepEqual(result.undefinedFor, ["Bracket", "Unknown"], "no consumption is not zero consumption");
  assert.equal(result.totalCostPaise, 10_200 * 3 + 4_800 * 2 + 150);
});

test("one uncosted input makes the order's estimated cost unavailable", () => {
  const map = new Map([["p-1", { lines: [perUnit("pla", 85, 10_200), perUnit("glue", 2, null, "L")] }]]);
  const result = expectedConsumption([{ productId: "p-1", name: "Gear", quantity: 1 }], map);
  assert.equal(result.inputs.find((input) => input.inventoryItemId === "glue")!.costPaise, null);
  assert.equal(result.totalCostPaise, null);
  assert.equal(expectedConsumption([], map).totalCostPaise, null, "nothing defined is not ₹0");
});
