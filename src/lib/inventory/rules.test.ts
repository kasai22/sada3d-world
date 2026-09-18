import assert from "node:assert/strict";
import test from "node:test";

import { combineCounts } from "./read";
import {
  CONSUMABLE_CATEGORIES,
  GROUP_LABEL,
  INVENTORY_ITEM_TYPES,
  INVENTORY_UNITS,
  applyDelta,
  groupOf,
  needsReason,
  paiseFromNumeric,
  paiseToNumeric,
  parseCost,
  formatQuantity,
  fromNumeric,
  parseQuantity,
  reconcile,
  reorderQuantity,
  stockStatus,
  stockValue,
  toNumeric,
} from "./rules";

/**
 * The inventory rules: exact quantities, the difference between unknown and
 * zero, reorder arithmetic and the no-negative-stock rule.
 */

test("quantities are exact to the thousandth, and anything else is refused", () => {
  assert.equal(parseQuantity("1.8"), 1800);
  assert.equal(parseQuantity("0"), 0);
  assert.equal(parseQuantity(" 12.345 "), 12345);
  for (const bad of ["-1", "1.2345", "abc", "", "1e3", "1,5", ".5", undefined, 5]) {
    assert.equal(parseQuantity(bad), null, String(bad));
  }
  assert.equal(toNumeric(1800 - 350), "1.450", "no floating-point drift");
  assert.equal(toNumeric(-350), "-0.350");
  assert.equal(fromNumeric("1.450"), 1450);
  assert.equal(fromNumeric("-0.350"), -350);
  assert.equal(fromNumeric("7"), 7000);
  assert.equal(fromNumeric(null), null);
  assert.equal(formatQuantity(1450, "kg"), "1.45 kg");
});

test("unknown stock is NOT TRACKED — never healthy and never out of stock", () => {
  assert.equal(stockStatus({ current: null, reorderLevel: 1000, targetStock: 5000 }), "NOT_TRACKED");
  assert.equal(stockStatus({ current: 0, reorderLevel: 1000, targetStock: 5000 }), "OUT_OF_STOCK", "zero is a known count");
  assert.equal(stockStatus({ current: 0, reorderLevel: null, targetStock: null }), "OUT_OF_STOCK");
  assert.equal(stockStatus({ current: 1000, reorderLevel: 1000, targetStock: 5000 }), "REORDER", "at the level reorders");
  assert.equal(stockStatus({ current: 1001, reorderLevel: 1000, targetStock: 5000 }), "HEALTHY");
  assert.equal(stockStatus({ current: 4000, reorderLevel: null, targetStock: 5000 }), "NO_REORDER_LEVEL", "healthy is not assumed");
});

test("reorder quantity is max(target − current, 0), and unknown when either is", () => {
  assert.equal(reorderQuantity({ current: 1800, reorderLevel: 2000, targetStock: 5000 }), 3200);
  assert.equal(reorderQuantity({ current: 6000, reorderLevel: 2000, targetStock: 5000 }), 0);
  assert.equal(reorderQuantity({ current: null, reorderLevel: 2000, targetStock: 5000 }), null);
  assert.equal(reorderQuantity({ current: 1800, reorderLevel: 2000, targetStock: null }), null);
});

test("stock value needs both quantity and cost", () => {
  assert.equal(stockValue(1800, 1200), 2160, "1.8 kg at ₹1,200/kg");
  assert.equal(stockValue(1800, null), null);
  assert.equal(stockValue(null, 1200), null);
  assert.equal(stockValue(0, 1200), 0, "a known empty shelf is worth nothing, knowingly");
});

test("a balance moves only in ways the ledger can explain, and never below zero", () => {
  assert.deepEqual(applyDelta(null, "OPENING_BALANCE", 2000), { ok: true, balance: 2000, delta: 2000 });
  assert.equal(applyDelta(null, "OPENING_BALANCE", 0).ok, true, "an empty shelf can be the opening count");
  assert.equal(applyDelta(2000, "OPENING_BALANCE", 100).ok, false, "only once");
  assert.equal(applyDelta(null, "PURCHASE", 1000).ok, false, "unknown + 1 kg is still unknown");
  assert.deepEqual(applyDelta(2000, "USAGE", 350), { ok: true, balance: 1650, delta: -350 });
  assert.deepEqual(applyDelta(2000, "RETURN", 500), { ok: true, balance: 2500, delta: 500 });
  assert.deepEqual(applyDelta(2000, "ADJUSTMENT_OUT", 2000), { ok: true, balance: 0, delta: -2000 });
  const negative = applyDelta(2000, "WASTE", 2001);
  assert.equal(negative.ok, false);
  assert.match(negative.ok ? "" : negative.reason, /below zero/);
  assert.equal(applyDelta(2000, "SALE", 0).ok, false, "a zero movement explains nothing");
  assert.equal(applyDelta(2000, "SALE", 1.5).ok, false, "not a milli-unit integer");
});

test("the ledger reconciles to the balance: opening + purchases − usage ± adjustments", () => {
  const result = reconcile(
    { OPENING_BALANCE: 1000, PURCHASE: 2000, USAGE: -1150, ADJUSTMENT_OUT: -50 },
    1800,
  );
  assert.equal(result.opening, 1000);
  assert.equal(result.byType.PURCHASE, 2000);
  assert.equal(result.byType.SALE, 0);
  assert.equal(result.ledgerBalance, 1800);
  assert.equal(result.balanced, true);
  assert.equal(reconcile({ OPENING_BALANCE: 1000 }, 999).balanced, false);
  assert.equal(reconcile({}, null).balanced, true, "an untracked item has no ledger");
});

/* ------------------------------------------------------------------ *
 * Stage 22.6: kinds, units, costs to the paisa, reasons
 * ------------------------------------------------------------------ */

test("every item type belongs to one of three kinds, and no existing type was removed", () => {
  assert.deepEqual([...INVENTORY_ITEM_TYPES], ["RAW_MATERIAL", "FINISHED_PRODUCT", "CONSUMABLE", "PACKAGING", "SPARE_PART", "OTHER"]);
  assert.equal(groupOf("RAW_MATERIAL"), "RAW_MATERIAL");
  assert.equal(groupOf("FINISHED_PRODUCT"), "FINISHED_PRODUCT");
  for (const type of ["CONSUMABLE", "PACKAGING", "SPARE_PART", "OTHER"] as const) assert.equal(groupOf(type), "CONSUMABLE", type);
  assert.deepEqual(Object.values(GROUP_LABEL), ["Raw materials", "Finished products", "Consumables"]);
});

test("units are chosen per item from a fixed list, and consumable categories are a grouping only", () => {
  assert.deepEqual([...INVENTORY_UNITS], ["pcs", "g", "kg", "ml", "L", "m", "pack", "box"]);
  assert.deepEqual([...CONSUMABLE_CATEGORIES], ["Printing consumables", "Packaging", "Post-processing", "Maintenance", "Workshop", "Other"]);
});

test("costs are exact to the paisa: parsed, stored and valued without floats drifting", () => {
  assert.equal(parseCost("0.5"), 50);
  assert.equal(parseCost("0.50"), 50);
  assert.equal(parseCost("250"), 25000);
  assert.equal(parseCost("₹ 1250.75"), 125075);
  assert.equal(parseCost(12), 1200);
  for (const bad of ["", "abc", "-1", "1.234", "1,000", "0.", ".5", "123456789", null, undefined]) {
    assert.equal(parseCost(bad), null, String(bad));
  }
  assert.equal(paiseToNumeric(50), "0.50");
  assert.equal(paiseToNumeric(125075), "1250.75");
  assert.equal(paiseFromNumeric("0.50"), 50);
  assert.equal(paiseFromNumeric("1200"), 120000, "a whole-rupee value from before the widening");
  assert.equal(paiseFromNumeric(null), null);

  assert.equal(stockValue(10_000, 0.5), 5, "10 labels × ₹0.50");
  assert.equal(stockValue(2_000, 250), 500, "2 packs × ₹250 — per pack, not per piece");
  assert.equal(stockValue(3_000, 0.1), 0.3, "0.1 × 3 is exactly 0.30");
  assert.equal(stockValue(1_333, 0.07), 0.09, "rounded to the paisa");
});

test("usage says why unless it is for a production job; adjustments and waste always do", () => {
  assert.equal(needsReason("USAGE", { hasJob: true }), false);
  assert.equal(needsReason("USAGE", { hasJob: false }), true);
  for (const type of ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WASTE"] as const) {
    assert.equal(needsReason(type, { hasJob: true }), true, type);
  }
  for (const type of ["SALE", "RETURN", "PURCHASE", "OPENING_BALANCE"] as const) {
    assert.equal(needsReason(type, { hasJob: false }), false, type);
  }
});

test("per-kind counts add up, and a valuation is complete only when every tracked item has a cost", () => {
  const row = (overrides: Partial<Parameters<typeof combineCounts>[0][number]>) => ({
    items: 0, tracked: 0, outOfStock: 0, lowStock: 0, noReorderLevel: 0, missingCost: 0, valuePaise: 0, ...overrides,
  });
  const counts = combineCounts([row({ items: 4, tracked: 3, outOfStock: 1, lowStock: 1, valuePaise: 12_345 }), row({ items: 2, tracked: 1, missingCost: 1 })]);
  assert.equal(counts.items, 6);
  assert.equal(counts.notTracked, 2);
  assert.equal(counts.reorderRequired, 2);
  assert.equal(counts.valueOfCosted, 123.45);
  assert.equal(counts.valuationComplete, false);
  assert.equal(combineCounts([]).valuationComplete, false, "nothing tracked is not a complete valuation");
  assert.equal(combineCounts([row({ items: 1, tracked: 1, valuePaise: 50 })]).valuationComplete, true);
});
