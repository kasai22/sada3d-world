import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Stage 22.7 — Production & Consumption, structurally. The services are
 * covered by `consumption.persistence.test.ts`; this proves where they are
 * wired: only behind an operator, beside (never inside) the product's
 * approval, and never on a path that moves stock.
 */

const read = (file: string) => readFileSync(path.resolve(file), "utf8");
const PRODUCTS = "src/app/(admin)/admin/(console)/products";

function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} was not found`);
  const next = source.indexOf("export ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

test("both consumption writes refuse a caller who is not an operator before touching anything", () => {
  for (const [file, name] of [
    [`${PRODUCTS}/[id]/actions.ts`, "saveConsumptionAction"],
    [`${PRODUCTS}/actions.ts`, "createProductAction"],
  ] as const) {
    const body = bodyOf(read(file), name);
    const gate = body.indexOf("currentOperator()");
    const refusal = body.indexOf('"Unauthorized."');
    assert.ok(gate > 0 && refusal > gate, `${name} checks the operator first`);
    for (const call of ["replaceProductConsumption(", "checkConsumptionLines(", "catalogIdOf(", "createProduct("]) {
      const at = body.indexOf(call);
      if (at >= 0) assert.ok(at > refusal, `${name} calls ${call} only after refusing anonymous callers`);
    }
  }
});

test("the create page checks every line before the product exists", () => {
  const body = bodyOf(read(`${PRODUCTS}/actions.ts`), "createProductAction");
  assert.ok(body.indexOf("checkConsumptionLines(") < body.indexOf("createProduct(operator"), "lines are checked before creation");
  assert.ok(body.indexOf("createProduct(operator") < body.indexOf("replaceProductConsumption("), "lines are saved against the new id");
  assert.match(body, /consumption=unsaved/, "a failed save after creation is reported, not hidden");
});

test("Production & Consumption sits after Manufacturing on the workspace and the create form", () => {
  const workspace = read(`${PRODUCTS}/[id]/page.tsx`);
  assert.match(workspace, /const TABS = \["overview", "manufacturing", "production", "pricing", "media", "model", "seo", "launch"\]/);
  assert.match(workspace, /production: "Production & Consumption"/);
  assert.match(workspace, /getProductConsumption\(operator/);

  const form = read("src/components/ops/product/ProductForm.tsx");
  assert.match(form, /section === "manufacturing" \? \[section, "production"\]/);

  const create = read(`${PRODUCTS}/create/page.tsx`);
  assert.match(create, /listConsumptionInputs\(operator\)/);
  assert.match(create, /consumption=\{\{ inputs: inputs \?\? \[\], initial: \[\] \}\}/, "a new product starts with no lines, not invented ones");
});

test("defining consumption never moves stock", () => {
  const service = read("src/lib/inventory/consumption.ts");
  assert.doesNotMatch(service, /inventoryMovements|recordStockMovement|recordOpeningBalance|currentQuantity\s*:/);
  assert.doesNotMatch(service, /from "\.\/service"/);
  const writes = [...service.matchAll(/tx\.(insert|update|delete)\((\w+)\)/g)].map((match) => match[2]);
  assert.ok(writes.length > 0);
  assert.deepEqual([...new Set(writes)], ["productConsumption"], "the only table written is product_consumption");
  assert.doesNotMatch(service, /\.delete\(/, "removed lines are deactivated, not deleted");

  for (const file of [
    `${PRODUCTS}/[id]/actions.ts`,
    `${PRODUCTS}/actions.ts`,
    "src/app/(admin)/admin/(console)/orders/[reference]/page.tsx",
    "src/app/(admin)/admin/(console)/orders/[reference]/ExpectedConsumption.tsx",
    "src/lib/inventory/expected.ts",
  ]) {
    assert.doesNotMatch(read(file), /recordStockMovement|inventory\/service/, `${file} must not reach the stock ledger`);
  }
});

test("consumption lives outside Payload, so approval and publishing are unaffected", () => {
  for (const file of [
    "src/lib/ops/product-admin.ts",
    "src/lib/ops/product-form.ts",
    "src/payload/collections/Products.ts",
    "src/payload/workflow.ts",
  ]) {
    assert.doesNotMatch(read(file), /consumption/i, `${file} must not read or write consumption`);
  }
  assert.doesNotMatch(read("src/components/ops/product/ConsumptionEditor.tsx"), /approv|publish/i);
});

test("content import and reset never touch consumption", () => {
  const dir = path.resolve("src/lib/content");
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => /\.ts$/.test(name));
  assert.ok(files.length > 5);
  for (const name of files) {
    assert.doesNotMatch(readFileSync(path.join(dir, name), "utf8"), /product_consumption|productConsumption/, name);
  }
});

test("the migration is additive", () => {
  const sql = read("src/lib/db/migrations/0007_stage_22_7_product_consumption.sql");
  assert.match(sql, /CREATE TABLE "product_consumption"/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|ALTER TABLE "(?!product_consumption")/i);
});

test("customers never see consumption, cost or suppliers", () => {
  const scanned = [
    ...readdirSync(path.resolve("src/app/(site)"), { recursive: true, encoding: "utf8" }).map((name) => path.join("src/app/(site)", name)),
    ...readdirSync(path.resolve("src/app/api"), { recursive: true, encoding: "utf8" }).map((name) => path.join("src/app/api", name)),
  ].filter((file) => /\.tsx?$/.test(file));
  assert.ok(scanned.length > 10);
  for (const file of scanned) {
    assert.doesNotMatch(read(file), /product_consumption|productConsumption|ConsumptionEditor|lib\/inventory/, file);
  }
});

test("an inventory item shows the products that use it, read-only", () => {
  const page = read("src/app/(admin)/admin/(console)/inventory/page.tsx");
  assert.match(page, /listProductsUsingItem\(operator, ledger\.item\.id\)/);
  const panels = read("src/app/(admin)/admin/(console)/inventory/panels.tsx");
  assert.match(panels, /Used by products/);
  assert.match(panels, /never changes its stock/);
});
