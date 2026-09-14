import assert from "node:assert/strict";
import test from "node:test";

import { CATALOG_ENTRIES, type CatalogEntry } from "@/content/catalog";
import {
  APPROVED_CAPABILITY,
  FIXTURE_NOW,
  launchReadyEntry,
  launchReadyProduct,
} from "@/lib/catalog/fixtures.testing";
import { PRODUCTS } from "@/lib/catalog/products";
import type { Product } from "@/lib/catalog/types";

import { assessProduct, auditLaunchReadiness, canonicalEntries } from "./readiness";

const spur = CATALOG_ENTRIES.find((entry) => entry.product.id === "p-101")!;
const base: Product = spur.product;

const APPROVED_MANUFACTURING = { approved: true, reference: "TEST FIXTURE", scope: "all" };
const READY_OPTIONS = {
  now: FIXTURE_NOW,
  capability: APPROVED_CAPABILITY,
  manufacturing: APPROVED_MANUFACTURING,
  minimumApprovedProducts: 1,
  launchTargetApproved: true,
  missingLimitations: [],
};

const canonical = (entry: CatalogEntry) => canonicalEntries([entry]);

/* ---- technical ---- */

test("the published test product found on the live storefront is blocking", () => {
  const finding = assessProduct(
    { ...base, id: "SKU001", slug: "payload_test", name: "Paylaod Test", price: 20000 },
    canonical(spur),
  );
  assert.equal(finding.readiness, "blocking");
  assert.ok(finding.technical.some((reason) => /not in the canonical catalog/.test(reason)));
});

test("an unsupported material and process combination is blocking", () => {
  const finding = assessProduct({ ...base, material: "resin", materials: ["resin"], colors: ["black"] }, canonical(spur));
  assert.equal(finding.readiness, "blocking");
  assert.ok(finding.technical.some((reason) => /FDM cannot print Resin/.test(reason)));
  assert.ok(finding.reasons.some((reason) => /unsupported combination/.test(reason)));
});

test("claiming approval without the evidence is blocking, not merely unapproved", () => {
  const claimed = { ...base, approvalStatus: "approved" as const, priceStatus: "approved" as const };
  const finding = assessProduct(claimed, canonical({ ...spur, product: claimed }), { now: FIXTURE_NOW });

  assert.equal(finding.readiness, "blocking");
  assert.ok(finding.technical.some((reason) => /no approval record/.test(reason)));
  assert.ok(finding.technical.some((reason) => /no price approval is in effect/.test(reason)));
});

test("a product the canonical catalog holds as a draft is blocking when published", () => {
  assert.equal(assessProduct(base, canonical({ ...spur, intent: "draft" })).readiness, "blocking");
});

/* ---- the real products today ---- */

test("the current products are technically valid, not launch-ready, and say exactly why", () => {
  const finding = assessProduct(base, canonical(spur));

  assert.equal(finding.readiness, "provisional");
  assert.deepEqual(finding.technical, []);
  // Stage 19.8: PLA on FDM is approved, but a product is not manufacturing-approved
  // while launch-required limitations are unvalidated — and says which.
  assert.equal(finding.launch.manufacturing, "NOT_APPROVED");
  assert.ok(!finding.reasons.some((reason) => /Manufacturing process not approved|Material not approved/.test(reason)));
  assert.ok(finding.reasons.some((reason) => /^Manufacturing limitations not approved: Minimum wall thickness, Minimum feature size, Dimensional accuracy/.test(reason)));
  for (const expected of [
    /^Product not approved/,
    /^Missing approved price/,
    /^Missing approved image \(required: APPROVED_RENDER, PROPOSED\)/,
    /^Missing SKU$/,
    /^Product class not approved \(PROPOSED\)/,
    /^Pricing model not approved \(PROPOSED\)/,
    /^Product copy not approved \(PROPOSED\)/,
  ]) {
    assert.ok(finding.reasons.some((reason) => expected.test(reason)), `no reason matching ${expected}`);
  }
  assert.ok(!finding.reasons.some((reason) => reason === "Not ready"), "reasons must be actionable");
});

/* ---- each missing input blocks launch on its own ---- */

test("a fully approved product is launch-ready", () => {
  const finding = assessProduct(launchReadyProduct, canonical(launchReadyEntry), READY_OPTIONS);
  assert.equal(finding.readiness, "real", finding.reasons.join("; "));
});

test("an approved product without an approved price remains blocked from launch", () => {
  const product = { ...launchReadyProduct, priceStatus: "provisional" as const };
  const finding = assessProduct(product, canonical({ ...launchReadyEntry, product, priceApprovals: [] }), READY_OPTIONS);
  assert.equal(finding.readiness, "provisional");
  assert.deepEqual(finding.reasons, ["Missing approved price (current price is provisional)"]);
});

test("an approved product without approved media remains blocked from launch", () => {
  const product = { ...launchReadyProduct, image: undefined };
  const finding = assessProduct(product, canonical({ ...launchReadyEntry, product }), READY_OPTIONS);
  assert.deepEqual(finding.reasons, ["Missing approved image (required: REAL_PHOTO, APPROVED)"]);
});

test("a product with incomplete commercial metadata remains blocked from launch", () => {
  const commercial = { ...launchReadyEntry.commercial, sku: { state: "MISSING" as const, note: "unassigned" } };
  const finding = assessProduct(launchReadyProduct, canonical({ ...launchReadyEntry, commercial }), READY_OPTIONS);
  assert.deepEqual(finding.reasons, ["Missing SKU"]);

  const proposedCopy = { ...launchReadyEntry.commercial, copy: { state: "PROPOSED" as const, value: "x", source: "draft" } };
  const second = assessProduct(launchReadyProduct, canonical({ ...launchReadyEntry, commercial: proposedCopy }), READY_OPTIONS);
  assert.deepEqual(second.reasons, ["Product copy not approved (PROPOSED)"]);
});

test("an unapproved manufacturing capability is not treated as approved", () => {
  // ABS exists in the software and has a pricing factor, but the business did not approve it.
  const abs = { ...launchReadyProduct, material: "abs" as const, materials: ["abs" as const] };
  const finding = assessProduct(abs, canonical({ ...launchReadyEntry, product: abs }), { now: FIXTURE_NOW });
  assert.equal(finding.launch.manufacturing, "NOT_APPROVED");
  assert.ok(finding.reasons.some((reason) => /^Material not approved: ABS/.test(reason)));
  assert.notEqual(finding.readiness, "real");
});

test("a price approval that is not yet effective does not authorise the price", () => {
  const entry = {
    ...launchReadyEntry,
    priceApprovals: [{ ...launchReadyEntry.priceApprovals![0]!, effectiveFrom: "2027-01-01" }],
  };
  const finding = assessProduct(launchReadyProduct, canonical(entry), READY_OPTIONS);
  assert.equal(finding.readiness, "blocking");
  assert.ok(finding.technical.some((reason) => /no price approval is in effect/.test(reason)));
});

test("an image contradicting the approved visual requirement is refused", () => {
  const product = { ...launchReadyProduct, image: { ...launchReadyProduct.image!, kind: "render" as const } };
  const finding = assessProduct(product, canonical({ ...launchReadyEntry, product }), READY_OPTIONS);
  assert.equal(finding.readiness, "blocking");
  assert.ok(finding.technical.some((reason) => /REAL_PHOTO but the image is a render/.test(reason)));
});

test("an APPROVED fact without a reference is a false record, not an approval", () => {
  const commercial = {
    ...launchReadyEntry.commercial,
    sku: { state: "APPROVED" as const, value: "X", approval: { reference: "", approvedOn: "", approvedBy: "" } },
  };
  const finding = assessProduct(launchReadyProduct, canonical({ ...launchReadyEntry, commercial }), READY_OPTIONS);
  assert.equal(finding.readiness, "blocking");
});

/* ---- the launch verdict ---- */

test("the real catalog today: technical PASS, launch NOT READY, catalog size reported truthfully", () => {
  const report = auditLaunchReadiness(PRODUCTS);

  assert.equal(report.technical.pass, true);
  assert.equal(report.commercial.approvedProducts, 0);
  assert.equal(report.pricing.approved, 0);
  assert.equal(report.pricing.provisional, PRODUCTS.length);
  assert.equal(report.media.missing, PRODUCTS.length);
  assert.equal(report.manufacturing.approved, false, "limitations are still missing");
  assert.equal(report.manufacturing.technologies.approved, 1);
  assert.equal(report.manufacturing.materials.approved, 3);
  assert.deepEqual(report.catalog, {
    target: 12,
    targetApproved: false,
    defined: CATALOG_ENTRIES.length,
    published: PRODUCTS.length,
    launchReady: 0,
    gap: 12,
  });
  assert.ok(!report.manufacturing.limitations.missingForLaunch.includes("Maximum build volume"));
  assert.ok(report.manufacturing.limitations.missingForLaunch.includes("Minimum wall thickness"));
  assert.ok(report.launch.reasons.some((reason) => /Launch target not approved/.test(reason)));
  assert.equal(report.launch.ready, false);
});

test("launch is READY only when every condition holds", () => {
  const entries = [launchReadyEntry];
  assert.equal(auditLaunchReadiness([launchReadyProduct], entries, READY_OPTIONS).launch.ready, true);

  for (const [label, override] of [
    ["manufacturing", { manufacturing: { approved: false, reference: null, scope: "" } }],
    ["catalog size", { minimumApprovedProducts: 2 }],
    ["limitations", { missingLimitations: ["Maximum build volume"] }],
    ["launch target", { launchTargetApproved: false }],
  ] as const) {
    assert.equal(
      auditLaunchReadiness([launchReadyProduct], entries, { ...READY_OPTIONS, ...override }).launch.ready,
      false,
      label,
    );
  }
});

test("the audit counts every product exactly once", () => {
  const report = auditLaunchReadiness(PRODUCTS);
  assert.equal(report.counts.real + report.counts.provisional + report.counts.blocking, PRODUCTS.length);
});
