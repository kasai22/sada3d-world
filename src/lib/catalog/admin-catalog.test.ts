import assert from "node:assert/strict";
import test from "node:test";

import { CATALOG_ENTRIES } from "@/content/catalog";
import { configuredConstraints, checkManufacturability } from "@/lib/manufacturing/manufacturability";
import { blockingApprovalReasons, checkProductWrite, nextProductId } from "@/payload/workflow";
import type { Product as PayloadProduct } from "@/payload-types";

import { effectivePriceApproval, type PriceApprovalRecord } from "./commerce";
import { selectFeatured } from "./featured";
import { FIXTURE_NOW, launchReadyProduct } from "./fixtures.testing";
import { approvalRecord, commercialFromDoc, entryFromPayloadDoc } from "./payload-entry";
import { applyPriceApprovals } from "./payload-mapping";
import { PRODUCTS } from "./products";
import { BROWSE_CATEGORIES, browseCategoriesFor } from "./taxonomy";
import { validateProduct } from "./validation";

/*
 * Stage 19.8: the administrator-managed catalog. Products are created and
 * approved in Payload; these tests pin what the admin cannot do by accident.
 */

const TODAY = "2026-09-14";
const APPROVAL = { reference: "Decision log #7", approvedBy: "Owner", approvedOn: "2026-09-14" };

/* ---- identity ---- */

test("admin-created products get the next stable id, never a retired one", () => {
  assert.equal(nextProductId([], new Set()), "p-101");
  assert.equal(nextProductId(["p-101", "p-102", "p-103"], new Set()), "p-104");
  assert.equal(nextProductId(["p-101", "p-102", "p-103"], new Set(["p-104", "p-105"])), "p-106");
  assert.equal(nextProductId(["p-101", "legacy-x"], new Set()), "p-102");
});

/* ---- the workflow on save ---- */

test("an approval an operator starts must be complete, and is stamped with operator and date", () => {
  const started = checkProductWrite(
    { priceStatus: "provisional", price: 10, commercialApproval: { reference: "Decision log #7" } },
    { today: TODAY, userName: "ops@sada3d" },
  );
  assert.deepEqual(started.errors, []);
  assert.deepEqual(started.data.commercialApproval, { reference: "Decision log #7", approvedBy: "ops@sada3d", approvedOn: TODAY });

  const noReference = checkProductWrite(
    { priceStatus: "provisional", price: 10, commercialApproval: { approvedBy: "Owner" } },
    { today: TODAY },
  );
  assert.ok(noReference.errors.some((e) => /commercial approval needs a reference/.test(e)));

  const untouched = checkProductWrite(
    { priceStatus: "provisional", price: 10, commercialApproval: { reference: null, approvedBy: null, approvedOn: null } },
    { today: TODAY, userName: "ops@sada3d" },
  );
  assert.deepEqual(untouched.errors, [], "saving a draft never fails for an approval nobody began");
  assert.equal(untouched.data.commercialApproval?.approvedBy, null, "and nothing is stamped onto it");
});

test("media cannot be approved without a source and a photo/render classification", () => {
  const result = checkProductWrite(
    { priceStatus: "provisional", price: 10, visual: { src: null, kind: null, approval: { reference: "Media log #1" } } },
    { today: TODAY, userName: "ops" },
  );
  assert.ok(result.errors.some((e) => /Media can only be approved/.test(e)));
});

test("an answered business question needs a reference", () => {
  const result = checkProductWrite(
    { priceStatus: "provisional", price: 10, openQuestions: [{ question: "Sell without ring gear?", answer: "yes" }] },
    { today: TODAY, userName: "ops" },
  );
  assert.ok(result.errors.some((e) => /needs a reference/.test(e)));
});

test("a price cannot be marked approved without a matching approval in effect", () => {
  assert.ok(checkProductWrite({ price: 450, priceStatus: "approved" }, { today: TODAY }).errors.length > 0);
  assert.ok(checkProductWrite({ price: 450, priceStatus: "approved" }, { today: TODAY, effectiveApprovedAmount: 400 }).errors.length > 0);
  assert.deepEqual(checkProductWrite({ price: 450, priceStatus: "approved" }, { today: TODAY, effectiveApprovedAmount: 450 }).errors, []);
});

test("a quote-only product needs no fixed price, and a fixed price is not quote-only", () => {
  assert.deepEqual(checkProductWrite({ price: 0, priceStatus: "quote-only" }, { today: TODAY }).errors, []);
  assert.ok(checkProductWrite({ price: 250, priceStatus: "quote-only" }, { today: TODAY }).errors.length > 0);
});

test("approval guard: every launch reason blocks except approval, publication and seed membership", () => {
  const reasons = [
    "• Product not approved (provisional)",
    "• Not published",
    "• Not in the canonical catalog — administrator-managed",
    "• Missing approved price (current price is provisional)",
    "• Missing SKU",
    "• Open business decision unanswered: Sell without ring gear?",
  ].join("\n");
  assert.deepEqual(blockingApprovalReasons(reasons), [
    "Missing approved price (current price is provisional)",
    "Missing SKU",
    "Open business decision unanswered: Sell without ring gear?",
  ]);
  assert.deepEqual(blockingApprovalReasons("• Product not approved (provisional)\n• Not published"), []);
});

/* ---- a Payload record is assessed on its own terms ---- */

const spur = CATALOG_ENTRIES.find((entry) => entry.product.id === "p-101")!;

function adminDoc(overrides: Record<string, unknown> = {}): PayloadProduct {
  const p = spur.product;
  return {
    id: 41,
    _status: "published",
    productId: "p-104",
    slug: "admin-spur-gear",
    name: "Admin spur gear",
    summary: p.summary,
    description: p.description,
    price: p.price,
    priceStatus: "provisional",
    approvalStatus: "provisional",
    currency: "INR",
    availability: p.availability,
    category: { id: 1, value: p.category },
    browseCategory: { id: 2, value: p.browseCategory },
    material: { id: 3, value: p.material },
    materials: [{ id: 3, value: p.material }],
    technology: p.technology,
    color: p.color,
    colors: (p.colors ?? []).map((value) => ({ value })),
    qualityOptions: p.qualityOptions,
    specifications: p.specifications,
    model: p.model,
    source: "admin",
    sku: "SADA-GEAR-24",
    productClass: "STANDARD_CATALOG_PRODUCT",
    pricingModel: "FIXED",
    customers: [{ value: "Educators" }],
    useCase: "Mechanism mock-ups",
    visualRequirement: "REAL_PHOTO",
    ...overrides,
  } as unknown as PayloadProduct;
}

test("values entered in the admin are PROPOSED, never APPROVED, until a complete approval record exists", () => {
  const entered = commercialFromDoc(adminDoc());
  assert.equal(entered.sku.state, "PROPOSED");
  assert.equal(entered.productClass.state, "PROPOSED");

  const partial = commercialFromDoc(adminDoc({ commercialApproval: { reference: "Decision log #7", approvedBy: "", approvedOn: null } }));
  assert.equal(partial.sku.state, "PROPOSED", "a partial record approves nothing");

  const approved = commercialFromDoc(adminDoc({ commercialApproval: APPROVAL }));
  assert.equal(approved.sku.state, "APPROVED");
  assert.equal(commercialFromDoc(adminDoc({ sku: null, commercialApproval: APPROVAL })).sku.state, "MISSING", "an approval does not invent a missing value");

  assert.equal(approvalRecord({ reference: "x", approvedBy: "y", approvedOn: "14/09/2026" }), undefined);
});

test("an admin product is assessed from its own record, with every blocker listed", () => {
  const result = entryFromPayloadDoc(adminDoc(), [], FIXTURE_NOW);
  assert.ok(result.ok);
  assert.equal(result.launch.launch.ready, false);
  const reasons = result.launch.launch.reasons.join("\n");
  assert.match(reasons, /Missing approved price/);
  assert.match(reasons, /not approved \(PROPOSED\)/);
  assert.equal(result.product.launch?.ready, false, "the storefront receives the summary");
});

test("an unanswered or refused business question blocks launch", () => {
  const unanswered = entryFromPayloadDoc(
    adminDoc({ openQuestions: [{ questionId: "q1", question: "Sell without ring gear?", answer: "unanswered" }] }),
    [],
    FIXTURE_NOW,
  );
  assert.ok(unanswered.ok && unanswered.launch.launch.reasons.some((r) => /Open business decision unanswered/.test(r)));

  const refused = entryFromPayloadDoc(
    adminDoc({ openQuestions: [{ questionId: "q1", question: "Sell without ring gear?", answer: "no", ...APPROVAL }] }),
    [],
    FIXTURE_NOW,
  );
  assert.ok(refused.ok && refused.launch.launch.reasons.some((r) => /Blocked by business decision/.test(r)));
});

test("an unapproved material or process is not approved manufacturing for an admin product", () => {
  const result = entryFromPayloadDoc(adminDoc({ material: { id: 9, value: "abs" }, materials: [{ id: 9, value: "abs" }] }), [], FIXTURE_NOW);
  assert.ok(result.ok);
  assert.equal(result.launch.manufacturing, "NOT_APPROVED");
  assert.ok(result.launch.launch.reasons.some((r) => /Material not approved: ABS/.test(r)));
});

/* ---- media ---- */

test("media filed under another product, or named as placeholder, is rejected", () => {
  const codes = (image: NonNullable<typeof launchReadyProduct.image>) =>
    validateProduct({ ...launchReadyProduct, image }).map((issue) => issue.message);

  assert.ok(codes({ ...launchReadyProduct.image!, src: "/catalog/hex-shaft-spacer/front.jpg" }).some((m) => /not this product's media/.test(m)));
  assert.ok(codes({ ...launchReadyProduct.image!, src: "/catalog/spur-gear-24t/placeholder.jpg" }).some((m) => /placeholder media/.test(m)));
  assert.deepEqual(validateProduct(launchReadyProduct).filter((issue) => /image/i.test(issue.code)), []);
});

/* ---- prices ---- */

const approvalOf = (amount: number, effectiveFrom: string): PriceApprovalRecord => ({
  amount,
  currency: "INR",
  effectiveFrom,
  reference: `Price log ${amount}`,
  approvedBy: "Owner",
});

test("an older price approval does not authorise a newer price", () => {
  const product = { ...launchReadyProduct, price: 520, priceStatus: "approved" as const };
  const { products, failures } = applyPriceApprovals(
    [product],
    new Map([[product.id, [approvalOf(450, "2026-09-01")]]]),
    FIXTURE_NOW,
  );
  assert.equal(products[0]!.priceStatus, "provisional");
  assert.match(failures[0]!.reason, /does not match/);
});

test("a future-dated approval is not yet in effect; the latest in-effect approval wins", () => {
  const records = [approvalOf(450, "2026-09-01"), approvalOf(520, "2026-12-01")];
  assert.equal(effectivePriceApproval(records, FIXTURE_NOW)?.amount, 450);
  assert.equal(effectivePriceApproval(records, new Date("2026-12-02T00:00:00Z"))?.amount, 520);
});

/* ---- featuring ---- */

test("only launch-ready products are featured, judged by the server-computed launch summary", () => {
  const ready = { ...launchReadyProduct, id: "p-201", launch: { ready: true, price: "APPROVED", media: "APPROVED", manufacturing: "APPROVED", commercial: "COMPLETE" } } as const;
  const notReady = { ...ready, id: "p-202", launch: { ...ready.launch, ready: false, commercial: "INCOMPLETE" } } as const;
  const provisional = { ...ready, id: "p-203", approvalStatus: "provisional" } as const;

  const selection = selectFeatured([ready, notReady, provisional], 8, [launchReadyProduct.browseCategory]);
  assert.deepEqual(selection.products.map((p) => p.id), ["p-201"]);
  assert.deepEqual(
    selection.rejected.map((r) => [r.id, r.reason]),
    [["p-202", "not-launch-ready"], ["p-203", "not-approved"]],
  );
});

test("no seed product is featured today: none is launch-ready", () => {
  assert.deepEqual(selectFeatured(PRODUCTS).products, []);
});

/* ---- browse categories follow the served catalog ---- */

test("browse categories come from the served products, so an admin product's category appears", () => {
  assert.deepEqual(browseCategoriesFor(PRODUCTS), [...BROWSE_CATEGORIES], "the seed agrees with the static list");
  assert.deepEqual(browseCategoriesFor([]), []);
  const other = BROWSE_CATEGORIES[0]!;
  assert.deepEqual(browseCategoriesFor([{ browseCategory: other }, { browseCategory: other }]), [other]);
  assert.deepEqual(browseCategoriesFor([{ browseCategory: "not-a-root" }]), [], "only real root categories are routable");
});

/* ---- the approved build volume ---- */

test("the approved Bambu Lab A1 build volume refuses an oversize part and nothing else is invented", () => {
  const constraints = configuredConstraints();
  assert.deepEqual(constraints, { buildVolumeMm: { x: 256, y: 256, z: 256 } });

  const analysis = (x: number, y: number, z: number) =>
    ({
      format: "stl",
      unit: { declared: true },
      warnings: [],
      objects: [],
      objectCount: 1,
      boundingBox: { size: { x, y, z } },
    }) as never;

  assert.equal(checkManufacturability(analysis(300, 20, 20), constraints).manufacturable, false);
  assert.equal(checkManufacturability(analysis(250, 250, 250), constraints).manufacturable, true);
  assert.equal(checkManufacturability(analysis(250, 250, 250), constraints).constraints, "configured");
});
