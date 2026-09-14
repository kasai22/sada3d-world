import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { canonicalLaunchCheck, selectFeatured, type LaunchCheck } from "./featured";
import { APPROVED_CAPABILITY, FIXTURE_NOW, launchReadyEntry, launchReadyProduct } from "./fixtures.testing";
import { assessLaunch } from "./launch";
import { PRODUCTS } from "./products";
import type { Product } from "./types";

/**
 * Featured products (Stage 19.7): a featured flag is honoured only for a product
 * that is launch-ready by the release gate's own assessment.
 */

const BROWSE = ["mechanical"];

/** Launch check against the fixture entry with manufacturing approved. */
const readyCheck: LaunchCheck = (product) =>
  assessLaunch({ ...launchReadyEntry, product: { ...launchReadyEntry.product, ...product } }, product, {
    now: FIXTURE_NOW,
    capability: APPROVED_CAPABILITY,
  });

const product = (overrides: Partial<Product> = {}): Product => ({ ...launchReadyProduct, ...overrides });

test("a launch-ready product flagged as featured is selected", () => {
  const { products, rejected } = selectFeatured([product()], 8, BROWSE, readyCheck);
  assert.deepEqual(products.map((p) => p.id), ["p-101"]);
  assert.deepEqual(rejected, []);
});

test("a product that is not flagged is never featured and never reported", () => {
  const { products, rejected } = selectFeatured([product({ featured: false })], 8, BROWSE, readyCheck);
  assert.deepEqual(products, []);
  assert.deepEqual(rejected, []);
});

test("featuring requires product approval", () => {
  for (const approvalStatus of ["provisional", "proposed", "draft", "archived"] as const) {
    assert.equal(
      selectFeatured([product({ approvalStatus })], 8, BROWSE, readyCheck).rejected[0]?.reason,
      "not-approved",
      approvalStatus,
    );
  }
});

test("featuring requires an approved price — a provisional price is refused", () => {
  const provisional = product({ priceStatus: "provisional" });
  assert.equal(selectFeatured([provisional], 8, BROWSE, readyCheck).rejected[0]?.reason, "price-not-approved");
});

test("featuring requires an approved photo or render, not any image", () => {
  assert.equal(selectFeatured([product({ image: undefined })], 8, BROWSE, readyCheck).rejected[0]?.reason, "no-image");
  assert.equal(
    selectFeatured([product({ image: { src: "/catalog/x.jpg", alt: "x" } })], 8, BROWSE, readyCheck).rejected[0]?.reason,
    "no-image",
  );
});

test("featuring requires approved manufacturing capability", () => {
  const unapproved = () => ({ approved: false, reasons: ["Material not approved: PLA on FDM"] });
  assert.equal(
    selectFeatured([product()], 8, BROWSE, (p) =>
      assessLaunch(launchReadyEntry, p, { now: FIXTURE_NOW, capability: unapproved }),
    ).rejected[0]?.reason,
    "manufacturing-not-approved",
  );
});

test("featuring requires approved commercial decisions", () => {
  const check: LaunchCheck = (p) =>
    assessLaunch({ ...launchReadyEntry, commercial: { ...launchReadyEntry.commercial, sku: { state: "MISSING", note: "x" } } }, p, {
      now: FIXTURE_NOW,
      capability: APPROVED_CAPABILITY,
    });
  assert.equal(selectFeatured([product()], 8, BROWSE, check).rejected[0]?.reason, "not-launch-ready");
});

test("a quote-only part and a part without a category page are not featured", () => {
  assert.equal(
    selectFeatured([product({ price: 0, priceStatus: "quote-only" })], 8, BROWSE, readyCheck).rejected[0]?.reason,
    "quote-only",
  );
  assert.equal(selectFeatured([product()], 8, [], readyCheck).rejected[0]?.reason, "unknown-category");
});

test("unpublishing or archiving a featured product removes it with no other edit", () => {
  const catalog = [product()];
  assert.equal(selectFeatured(catalog, 8, BROWSE, readyCheck).products.length, 1);
  assert.equal(selectFeatured([], 8, BROWSE, readyCheck).products.length, 0);
  assert.equal(selectFeatured([product({ approvalStatus: "archived" })], 8, BROWSE, readyCheck).products.length, 0);
});

test("the real catalog features nothing, because nothing is launch-ready", () => {
  const flagged = PRODUCTS.map((p) => ({ ...p, featured: true }));
  const { products, rejected } = selectFeatured(flagged, 8, BROWSE, canonicalLaunchCheck);
  assert.deepEqual(products, []);
  assert.equal(rejected.length, PRODUCTS.length);
});

test("the homepage holds no product ids to go stale", () => {
  const home = readFileSync(join(process.cwd(), "src/content/home.ts"), "utf8");
  assert.ok(!/["']p-\d{3,}["']/.test(home), "content/home.ts names a product id");
});
