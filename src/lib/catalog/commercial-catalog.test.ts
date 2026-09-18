import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CATALOG_ENTRIES, VERIFIED_MODELS, type CatalogEntry } from "@/content/catalog";
import { computeLaunchStatus } from "@/lib/content/launch-admin";
import { validatePlan } from "@/lib/content/plan";
import { categoryShapeProblems } from "@/payload/category-hooks";
import { Categories } from "@/payload/collections/Categories";
import { PriceApprovals } from "@/payload/collections/PriceApprovals";
import { Products } from "@/payload/collections/Products";
import { checkProductWrite, launchStage } from "@/payload/workflow";
import type { Product as PayloadProduct } from "@/payload-types";

import { verifyCatalogAssets } from "./catalog-assets";
import { categoryIndexFor, categoryTreeFromRecords } from "./category-tree";
import { isVisible, purchaseBlockers } from "./commerce";
import { selectFeatured } from "./featured";
import { APPROVED_CAPABILITY, FIXTURE_NOW, launchReadyEntry, launchReadyProduct } from "./fixtures.testing";
import { cardBadge } from "./format";
import { assessLaunch } from "./launch";
import { SALES_CLAIM } from "./merchandising";
import { toDomainProduct } from "./payload-mapping";
import { readinessLine, readinessPanel, sectionOf } from "./readiness-panel";
import { classRequiresSku, skuProblem } from "./sku";
import { catalogSourceFrom } from "./source";
import { browseCategoriesFor, facetLabel, SEED_CATEGORY_INDEX } from "./taxonomy";
import type { Product } from "./types";
import { validateProduct } from "./validation";

/*
 * Stage 20: the administrator-managed commercial catalog. These tests pin what
 * lets a business add real products from the admin — and what stops an
 * incomplete one from being approved, featured or sold.
 */

const approval = { reference: "TEST FIXTURE — not a business decision", approvedBy: "Test fixture", approvedOn: "2026-09-20" };
const approved = <T>(value: T) => ({ state: "APPROVED" as const, value, approval });
const launch = (entry: CatalogEntry, product: Product = entry.product) =>
  assessLaunch(entry, product, { now: FIXTURE_NOW, capability: APPROVED_CAPABILITY });

/* ------------------------------------------------------------------ *
 * Categories are CMS data
 * ------------------------------------------------------------------ */

const ADMIN_CATEGORIES = [
  { id: 1, value: "mechanical", name: "Mechanical", isBrowse: true, parent: null },
  { id: 2, value: "gears", name: "Gears", parent: 1 },
  { id: 3, value: "spacers", name: "Spacers", parent: 1 },
  { id: 20, value: "fixtures", name: "Fixtures", description: "Workholding fixtures.", isBrowse: true, parent: null, browseOrder: 2 },
  { id: 21, value: "jigs", name: "Jigs", description: "Drilling jigs.", parent: 20 },
];

test("an administrator's category becomes part of the tree — label, path, description, browse root", () => {
  const { tree, problems } = categoryTreeFromRecords(ADMIN_CATEGORIES);
  assert.deepEqual(problems, []);
  const index = categoryIndexFor(tree);
  assert.deepEqual(index.roots, ["mechanical", "fixtures"]);
  assert.deepEqual(index.path("jigs"), ["fixtures", "jigs"]);
  assert.equal(index.label("jigs"), "Jigs");
  assert.equal(index.description("fixtures"), "Workholding fixtures.");
  assert.equal(facetLabel("category", "jigs", index), "Jigs");
  assert.equal(SEED_CATEGORY_INDEX.has("jigs"), false, "the seed knows nothing of it — no code change was made");
});

test("categories that would break the storefront are left out of the tree and reported", () => {
  const { tree, problems } = categoryTreeFromRecords([
    { id: 1, value: "tools", name: "Tools", isBrowse: true },
    { id: 2, value: "orphan", name: "Orphan", parent: 99 },
    { id: 3, value: "Bad Value", name: "Bad", isBrowse: true },
    { id: 4, value: "not-browse", name: "Loose", isBrowse: false },
    { id: 5, value: "child-browse", name: "Child", parent: 1, isBrowse: true },
  ]);
  assert.deepEqual(tree.map((node) => node.value), ["tools"]);
  assert.equal(problems.length, 4);
  assert.deepEqual(categoryShapeProblems({ value: "Jigs & Fixtures", isBrowse: true }).length, 1);
  assert.deepEqual(categoryShapeProblems({ value: "jigs", parent: 20, isBrowse: false }), []);
  assert.equal(categoryShapeProblems({ value: "tools", parent: null, isBrowse: false }).length, 1);
});

const jig: Product = {
  ...launchReadyProduct,
  id: "p-120",
  slug: "drill-jig-8mm",
  name: "Drill Jig",
  category: "jigs",
  browseCategory: "fixtures",
  image: undefined,
};

test("a product in an admin-created category is valid against the CMS tree — no deployment needed", () => {
  const cmsTree = categoryTreeFromRecords(ADMIN_CATEGORIES).tree;
  const againstSeed = validateProduct(jig).map((issue) => issue.code);
  const againstCms = validateProduct(jig, { categories: cmsTree }).map((issue) => issue.code);
  assert.ok(againstSeed.includes("missing-category"), "the seed tree does not know the category");
  assert.ok(!againstCms.includes("missing-category") && !againstCms.includes("invalid-browse-category"), againstCms.join(","));
});

test("the catalog source serves the CMS tree: query results, facets, browse routes and labels include it", async () => {
  const index = categoryIndexFor(categoryTreeFromRecords(ADMIN_CATEGORIES).tree);
  const source = catalogSourceFrom("test", async () => [jig], async () => index);
  const result = await source.query({ q: "", category: ["fixtures"], material: [], technology: [], color: [], availability: [], price: [], sort: "newest", page: 1 });
  assert.equal(result.total, 1, "a parent category filter matches its leaves");
  assert.equal(result.facets.category.fixtures, 1);
  assert.equal(result.facets.category.jigs, 1);
  assert.ok(result.categories.some((node) => node.value === "fixtures"), "the tree travels with the result to the filters");
  assert.deepEqual(browseCategoriesFor([jig], await source.categories()), ["fixtures"]);
});

test("a CMS product carries its category labels from the CMS records", () => {
  const doc = {
    id: 7,
    productId: "p-120",
    slug: "drill-jig-8mm",
    name: "Drill Jig",
    summary: "s",
    price: 100,
    priceStatus: "provisional",
    approvalStatus: "provisional",
    availability: "made-to-order",
    technology: "fdm",
    color: "black",
    category: { id: 21, value: "jigs", name: "Jigs" },
    browseCategory: { id: 20, value: "fixtures", name: "Fixtures" },
    material: { id: 3, value: "pla", _status: "published" },
  } as unknown as PayloadProduct;
  const mapped = toDomainProduct(doc);
  assert.ok(mapped.ok);
  assert.equal(mapped.product.categoryLabel, "Jigs");
  assert.equal(mapped.product.browseCategoryLabel, "Fixtures");
});

/* ------------------------------------------------------------------ *
 * Class-aware commercial completeness
 * ------------------------------------------------------------------ */

test("a complete standard catalog product is launch-ready; removing any requirement blocks it", () => {
  assert.equal(launch(launchReadyEntry).launch.ready, true);

  const noSku = launch({ ...launchReadyEntry, commercial: { ...launchReadyEntry.commercial, sku: { state: "MISSING", note: "none" } } });
  assert.ok(noSku.launch.reasons.includes("Missing SKU"));

  const provisionalPrice = { ...launchReadyProduct, priceStatus: "provisional" as const };
  assert.ok(launch({ ...launchReadyEntry, product: provisionalPrice }, provisionalPrice).launch.reasons.some((r) => /^Missing approved price/.test(r)));

  const noImage = { ...launchReadyProduct, image: undefined };
  const media = launch({ ...launchReadyEntry, product: noImage }, noImage);
  assert.equal(media.media, "MISSING");

  const noDescription = { ...launchReadyProduct, description: "" };
  assert.ok(launch({ ...launchReadyEntry, product: noDescription }, noDescription).launch.reasons.includes("Missing required commercial description"));
});

test("media is MISSING → PROPOSED → APPROVED; an image without its approval is proposed, not approved", () => {
  const { approval: _approval, ...unapprovedImage } = launchReadyProduct.image!;
  const proposed = { ...launchReadyProduct, image: unapprovedImage };
  const result = launch({ ...launchReadyEntry, product: proposed }, proposed);
  assert.equal(result.media, "PROPOSED");
  assert.ok(result.launch.reasons.some((r) => /is proposed: record its media approval/.test(r)));
  assert.equal(launch(launchReadyEntry).media, "APPROVED");
});

test("an approved image whose file does not exist, or filed under another product, is rejected", () => {
  const missing = validateProduct(launchReadyProduct, { mediaFiles: new Set() }).map((issue) => issue.message);
  assert.ok(missing.some((m) => /does not exist/.test(m)));
  const present = validateProduct(launchReadyProduct, { mediaFiles: new Set([launchReadyProduct.image!.src]) });
  assert.ok(!present.some((issue) => /does not exist/.test(issue.message)));
  const wrong = validateProduct({ ...launchReadyProduct, image: { ...launchReadyProduct.image!, src: "/catalog/other-part/front.jpg" } });
  assert.ok(wrong.some((issue) => /not this product's media/.test(issue.message)));
});

test("a quote-only product needs no SKU and no fixed price", () => {
  const product = { ...launchReadyProduct, price: 0, priceStatus: "quote-only" as const };
  const entry: CatalogEntry = {
    ...launchReadyEntry,
    product,
    priceApprovals: [],
    commercial: {
      ...launchReadyEntry.commercial,
      sku: { state: "MISSING", note: "quote-only" },
      productClass: approved("QUOTE_ONLY_PRODUCT" as const),
      pricingModel: approved("QUOTE_ONLY" as const),
    },
  };
  const result = launch(entry, product);
  assert.equal(result.price, "QUOTE_ONLY");
  assert.deepEqual(result.launch.reasons, []);
  assert.equal(classRequiresSku("QUOTE_ONLY_PRODUCT"), false);
  assert.equal(classRequiresSku("STANDARD_CATALOG_PRODUCT"), true);
});

test("a configurable product needs a configuration and an approved pricing mechanism", () => {
  const entry: CatalogEntry = {
    ...launchReadyEntry,
    commercial: {
      ...launchReadyEntry.commercial,
      productClass: approved("CONFIGURABLE_PRODUCT" as const),
      pricingModel: approved("CONFIGURABLE" as const),
    },
  };
  const single = { ...launchReadyProduct, materials: ["pla" as const], colors: ["black"], qualityOptions: undefined };
  const reasons = launch({ ...entry, product: single }, single).launch.reasons;
  assert.ok(reasons.some((r) => /^Missing configuration definition/.test(r)));
  assert.ok(reasons.some((r) => /^Configurable pricing mechanism not approved: .*provisional/.test(r)));

  const choices = { ...launchReadyProduct, materials: ["pla" as const, "petg" as const] };
  assert.ok(!launch({ ...entry, product: choices }, choices).launch.reasons.some((r) => /configuration definition/.test(r)));
});

test("a malformed SKU blocks launch and is refused by the admin field; duplicates are refused by the import plan and the unique index", () => {
  for (const bad of ["rg-001", "RG 001", "RG--001", "R1", " RG-001", "RG-001-"]) assert.ok(skuProblem(bad), bad);
  for (const good of ["RG-001", "RG-GEAR-024", "P101"]) assert.equal(skuProblem(good), undefined, good);

  const malformed = launch({ ...launchReadyEntry, commercial: { ...launchReadyEntry.commercial, sku: approved("rg 001") } });
  assert.ok(malformed.launch.reasons.some((r) => /^SKU "rg 001" is malformed/.test(r)));

  const sku = field(Products.fields, "sku") as { unique?: boolean; validate?: (v: string) => true | string };
  assert.equal(sku.unique, true);
  assert.notEqual(sku.validate!("rg 001"), true);
  assert.equal(sku.validate!("RG-001"), true);

  const [a, b] = CATALOG_ENTRIES;
  const withSku = (entry: CatalogEntry) => ({ ...entry, commercial: { ...entry.commercial, sku: { state: "PROPOSED" as const, value: "RG-001", source: "test" } } });
  const problems = validatePlan([withSku(a!), withSku(b!)]);
  assert.ok(problems.some((problem) => /SKU "RG-001" is also used by/.test(problem.reason)));
});

test("a coming-soon material blocks launch for an otherwise complete product", () => {
  const abs = { ...launchReadyProduct, material: "abs" as const };
  const result = assessLaunch({ ...launchReadyEntry, product: abs }, abs, { now: FIXTURE_NOW });
  assert.equal(result.launch.ready, false);
  assert.equal(result.manufacturing, "NOT_APPROVED");
});

/* ------------------------------------------------------------------ *
 * Approval and launch stage
 * ------------------------------------------------------------------ */

test("the launch stage is derived: NOT READY → READY FOR REVIEW → APPROVED → LAUNCH READY", () => {
  const blocked = ["Missing SKU", "Product not approved (status: provisional)", "Not published"];
  assert.equal(launchStage(blocked, { approvalStatus: "provisional", _status: "published" }), "NOT READY");

  const complete = launch({ ...launchReadyEntry, product: { ...launchReadyProduct, approvalStatus: "provisional" } }, { ...launchReadyProduct, approvalStatus: "provisional" });
  assert.deepEqual(complete.launch.reasons, ["Product not approved (status: provisional)"]);
  assert.equal(launchStage(complete.launch.reasons, { approvalStatus: "proposed", _status: "draft" }), "READY FOR REVIEW");
  assert.equal(launchStage([], { approvalStatus: "approved", _status: "draft" }), "APPROVED");
  assert.equal(launchStage([], { approvalStatus: "approved", _status: "published" }), "LAUNCH READY");
});

test("a checkbox cannot make an incomplete product launch-ready: approved or published alone is NOT READY", () => {
  assert.equal(launchStage(["Missing approved image"], { approvalStatus: "approved", _status: "published" }), "NOT READY");
  const provisional = { ...launchReadyProduct, approvalStatus: "provisional" as const };
  assert.equal(isVisible(provisional, "launch"), false, "a published but unapproved product is not in the launch catalog");
  assert.ok(purchaseBlockers(provisional, "launch").some((blocker) => blocker.code === "product_not_approved"));
});

test("approval is auditable: the record carries reference, approver and date, stamped from the operator", () => {
  const result = checkProductWrite(
    { approvalStatus: "approved", approval: { reference: "Board minutes 2026-10-02 §4" }, price: 650, priceStatus: "provisional" },
    { today: "2026-10-02", userName: "owner@reality3d.in" },
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.data.approval, { reference: "Board minutes 2026-10-02 §4", approvedBy: "owner@reality3d.in", approvedOn: "2026-10-02" });
  assert.ok(checkProductWrite({ approvalStatus: "approved", approval: {}, price: 650, priceStatus: "provisional" }, { today: "2026-10-02" }).errors.length >= 2);
});

test("approval, price, SKU and media approval cannot be bulk-edited; there is no bulk approval", () => {
  for (const name of ["approvalStatus", "approval", "commercialApproval", "price", "priceStatus", "sku", "openQuestions"]) {
    assert.equal((field(Products.fields, name) as { admin?: { disableBulkEdit?: boolean } }).admin?.disableBulkEdit, true, name);
  }
  const visual = field(Products.fields, "visual") as { fields: unknown[] };
  assert.equal((field(visual.fields, "approval") as { admin?: { disableBulkEdit?: boolean } }).admin?.disableBulkEdit, true);
  assert.equal((field(Products.fields, "featured") as { admin?: { disableBulkEdit?: boolean } }).admin?.disableBulkEdit, undefined, "merchandising stays bulk-editable");
});

test("the admin readiness panel files each blocker under the section that fixes it", () => {
  assert.equal(sectionOf("Technical: Model is not verified"), "TECHNICAL");
  assert.equal(sectionOf("Material not approved: ABS — coming soon, not available for production"), "MANUFACTURING");
  assert.equal(sectionOf("Manufacturing limitations not approved: Minimum wall thickness"), "MANUFACTURING");
  assert.equal(sectionOf("Missing approved price (current price is provisional)"), "PRICE");
  assert.equal(sectionOf("Missing approved image (required: REAL_PHOTO, PROPOSED)"), "MEDIA");
  assert.equal(sectionOf("Missing SKU"), "COMMERCIAL");
  assert.equal(sectionOf("Product not approved (status: draft)"), "PRODUCT APPROVAL");
  assert.equal(sectionOf("Not published"), "PUBLICATION");

  const reasons = ["Missing approved price (current price is provisional)", "Missing SKU", "Not published"];
  const panel = readinessPanel({
    assessment: { technical: { status: "PASS", reasons: [] }, price: "PROVISIONAL", media: "APPROVED", manufacturing: "APPROVED", commercial: "INCOMPLETE" },
    reasons,
    approvalStatus: "draft",
    published: false,
    material: "pla",
    technology: "fdm",
    stage: "NOT READY",
  });
  assert.match(panel, /TECHNICAL\n✓ Valid/);
  assert.match(panel, /MANUFACTURING\n✓ FDM \/ PLA approved/);
  assert.match(panel, /PRICE\n✕ Missing approved price[^\n]*\n {2}→ Pricing tab, and Catalog › Price approvals/);
  assert.match(panel, /COMMERCIAL\n✕ Missing SKU\n {2}→ Basic information \(SKU\)/);
  assert.match(panel, /FINAL\nNOT READY$/);
  assert.equal(readinessLine(reasons), "TECH ✓ · MFG ✓ · COMM ✕ · PRICE ✕ · MEDIA ✓ · APPROVAL ✓");
});

test("the admin launch status exposes stage, panel and list summary for a CMS product", async () => {
  const p = launchReadyProduct;
  const doc = {
    id: 5,
    _status: "draft",
    productId: "p-120",
    slug: "drill-jig-8mm",
    name: "Drill Jig",
    summary: p.summary,
    description: p.description,
    price: p.price,
    priceStatus: "provisional",
    // Submitted for approval. (A draft approval status is itself technically unpublishable.)
    approvalStatus: "proposed",
    currency: "INR",
    availability: p.availability,
    category: { id: 21, value: "jigs", name: "Jigs" },
    browseCategory: { id: 20, value: "fixtures", name: "Fixtures" },
    material: { id: 3, value: "pla" },
    materials: [{ id: 3, value: "pla" }],
    technology: "fdm",
    color: "black",
    colors: [{ value: "black" }],
    model: p.model,
    source: "admin",
  };
  const status = await computeLaunchStatus({ findByID: async () => doc, find: async () => ({ docs: [] }) } as never, 5, undefined, {
    categories: categoryTreeFromRecords(ADMIN_CATEGORIES).tree,
    models: VERIFIED_MODELS,
  });
  assert.equal(status.stage, "NOT READY");
  assert.equal(status.technical, "PASS", "an admin category and a verified model are technically valid");
  assert.match(status.panel, /^TECHNICAL\n✓ Valid/);
  assert.match(status.panel, /PUBLICATION\n✕ Not published/);
  assert.match(status.readiness, /^TECH ✓ · MFG ✕/);
});

/* ------------------------------------------------------------------ *
 * Merchandising
 * ------------------------------------------------------------------ */

test("featured requires launch-ready; recommended is an editorial label, never a sales ranking", () => {
  const recommendedNotReady = { ...launchReadyProduct, id: "p-130", featured: true, recommended: true, launch: { ready: false, price: "APPROVED", media: "APPROVED", manufacturing: "NOT_APPROVED", commercial: "COMPLETE" } } as const;
  assert.deepEqual(selectFeatured([recommendedNotReady], 8, [launchReadyProduct.browseCategory]).products, []);

  assert.equal(cardBadge({ ...launchReadyProduct, recommended: true, launch: { ready: true, price: "APPROVED", media: "APPROVED", manufacturing: "APPROVED", commercial: "COMPLETE" } }), "Recommended · Made to order");
  assert.equal(cardBadge({ ...launchReadyProduct, launch: { ready: false, price: "PROVISIONAL", media: "MISSING", manufacturing: "NOT_APPROVED", commercial: "INCOMPLETE" } }), "Provisional · Not ready");

  for (const claim of ["Best seller", "Bestseller", "TOP-SELLING", "Most popular", "#1 in gears", "Number one"]) assert.ok(SALES_CLAIM.test(claim), claim);
  assert.ok(!SALES_CLAIM.test("Recommended") && !SALES_CLAIM.test("New"));
  const badge = field(Products.fields, "badge") as { validate: (v: string) => true | string };
  assert.notEqual(badge.validate("Best Seller"), true);
  assert.ok(validateProduct({ ...launchReadyProduct, badge: "Best seller" }).some((issue) => /sales ranking/.test(issue.message)));
});

/* ------------------------------------------------------------------ *
 * 3D models and catalog files, verified from disk
 * ------------------------------------------------------------------ */

test("the repository's model files verify from disk with the envelopes recorded for the seed", async () => {
  const assets = await verifyCatalogAssets();
  for (const seed of VERIFIED_MODELS) {
    const found = assets.models.find((model) => model.url === seed.url);
    assert.ok(found, `${seed.url} did not verify`);
    assert.equal(found.partCount, seed.partCount);
    for (const axis of ["x", "y", "z"] as const) assert.ok(Math.abs(found.envelopeMm[axis] - seed.envelopeMm[axis]) < 0.05, `${seed.url} ${axis}`);
  }
});

test("an unparseable, unsupported or oversized model file is not verified, so no product can launch with it", async () => {
  const root = mkdtempSync(join(tmpdir(), "reality3d-assets-"));
  mkdirSync(join(root, "public", "models"), { recursive: true });
  mkdirSync(join(root, "public", "catalog", "drill-jig-8mm"), { recursive: true });
  writeFileSync(join(root, "public", "models", "broken.stl"), "solid broken\nnot a facet\nendsolid");
  writeFileSync(join(root, "public", "models", "fake.glb"), "not a gltf binary at all");
  writeFileSync(join(root, "public", "models", "part.step"), "ISO-10303-21;");
  writeFileSync(join(root, "public", "catalog", "drill-jig-8mm", "front.jpg"), "x");
  // A single oversized triangle-free cube is not needed: an open 300 mm sliver is refused as open and oversized.
  const big = "solid big\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 300 0 0\nvertex 0 300 0\nendloop\nendfacet\nendsolid big\n";
  writeFileSync(join(root, "public", "models", "big.stl"), big);

  const assets = await verifyCatalogAssets(root);
  assert.deepEqual(assets.models, []);
  assert.deepEqual(assets.rejectedModels.map((model) => model.url).sort(), ["/models/big.stl", "/models/broken.stl", "/models/fake.glb", "/models/part.step"]);
  assert.ok(assets.mediaFiles.has("/catalog/drill-jig-8mm/front.jpg"));

  const withBroken = validateProduct({ ...launchReadyProduct, model: { url: "/models/broken.stl", format: "stl" } }, { models: assets.models });
  assert.ok(withBroken.some((issue) => issue.code === "invalid-model" && /not a verified model file/.test(issue.message)));
});

/* ------------------------------------------------------------------ *
 * Security
 * ------------------------------------------------------------------ */

const anonymous = { req: { user: null } } as never;
const operator = { req: { user: { id: 1, collection: "users" } } } as never;

test("anonymous visitors and customers (who are not CMS users) cannot create, change or delete catalog records", () => {
  for (const collection of [Products, Categories, PriceApprovals]) {
    for (const action of ["create", "update", "delete"] as const) {
      const rule = collection.access?.[action] as ((args: never) => unknown) | undefined;
      assert.ok(rule, `${collection.slug} ${action}`);
      assert.equal(Boolean(rule(anonymous)), false, `${collection.slug} ${action} for an anonymous visitor`);
    }
  }
  // Price approvals are append-only even for operators.
  assert.equal(Boolean((PriceApprovals.access!.update as (args: never) => unknown)(operator)), false);
  assert.equal(Boolean((PriceApprovals.access!.delete as (args: never) => unknown)(operator)), false);
  // The public reads published records only.
  assert.deepEqual((Products.access!.read as (args: never) => unknown)(anonymous), { _status: { equals: "published" } });
});

test("a client cannot set a catalog price: the cart and quote APIs accept no price field, and the server re-prices every line", async () => {
  const { priceLine } = await import("@/lib/cart/validation");
  const { PRODUCTS } = await import("./products");
  const product = PRODUCTS[0]!;
  const priced = await priceLine({
    type: "catalog",
    id: `${product.id}:x`,
    productId: product.id,
    quantity: 1,
    configuration: { material: product.material, color: product.color, quality: product.qualityOptions?.[0]?.value },
    priceAtAdd: 1,
    addedAt: "2026-01-01T00:00:00.000Z",
  } as never);
  assert.equal(priced.unitPrice, product.price, "the catalog price, not the price stored on the line");
});

/* ---- helpers ---- */

function field(fields: readonly unknown[], name: string): unknown {
  for (const candidate of fields as { name?: string; fields?: unknown[]; tabs?: { fields: unknown[] }[] }[]) {
    if (candidate.name === name) return candidate;
    const nested = [...(candidate.fields ? [candidate.fields] : []), ...(candidate.tabs ?? []).map((tab) => tab.fields)];
    for (const group of nested) {
      if (candidate.name && candidate.fields && group === candidate.fields) continue; // named groups are searched explicitly
      const found = field(group, name);
      if (found) return found;
    }
  }
  return undefined;
}

test("regression: the seed products, as the CMS stores them (SEO included), stay technically valid", async () => {
  const { planProducts } = await import("@/lib/content/plan");
  const { PRODUCTS } = await import("./products");
  const assets = await verifyCatalogAssets();
  for (const row of planProducts()) {
    const product = PRODUCTS.find((candidate) => candidate.id === row.productId)!;
    const issues = validateProduct({ ...product, seo: row.seo }, { models: assets.models, mediaFiles: assets.mediaFiles });
    assert.deepEqual(issues, [], `${row.productId}: ${issues.map((issue) => issue.message).join("; ")}`);
  }
});

/* ------------------------------------------------------------------ *
 * Found by the real-database check (Stage 20)
 * ------------------------------------------------------------------ */

test("rules that must hold on every save apply to draft saves too (Payload skips field validators for drafts)", () => {
  const base = { price: 0, priceStatus: "quote-only" };
  assert.ok(checkProductWrite({ ...base, sku: "vrf 1" }, { today: "2026-10-02" }).errors.some((e) => /SKU "vrf 1"/.test(e)));
  assert.ok(checkProductWrite({ ...base, badge: "Best Seller" }, { today: "2026-10-02" }).errors.some((e) => /sales ranking/.test(e)));
  assert.ok(checkProductWrite({ ...base, model: { url: "https://example.com/part.stl" } }, { today: "2026-10-02" }).errors.some((e) => /under \/models\//.test(e)));
  assert.deepEqual(checkProductWrite({ ...base, sku: "VRF-001", badge: "New", model: { url: "/models/spur-gear-24t.stl" } }, { today: "2026-10-02" }).errors, []);
});

test("the launch computation reads the latest version and leaves the caller's request context as it found it", async () => {
  const p = launchReadyProduct;
  const doc = { id: 9, _status: "draft", productId: "p-121", slug: "guide-block", name: "Guide Block", summary: p.summary, description: p.description, price: 0, priceStatus: "quote-only", approvalStatus: "proposed", availability: p.availability, category: { id: 2, value: "gears", name: "Gears" }, browseCategory: { id: 1, value: "mechanical", name: "Mechanical" }, material: { id: 3, value: "pla" }, technology: "fdm", color: "black", model: p.model, source: "admin" };
  const reads: unknown[] = [];
  const payload = {
    // Payload merges a passed context into the request — reproduce that.
    findByID: async (args: { req?: { context: Record<string, unknown> }; context?: Record<string, unknown>; draft?: boolean }) => {
      reads.push(args.draft);
      if (args.req && args.context) args.req.context = { ...args.req.context, ...args.context };
      return doc;
    },
    find: async () => ({ docs: [] }),
  };
  const req = { context: { caller: true } } as never as { context: Record<string, unknown> };
  await computeLaunchStatus(payload as never, 9, req as never, { models: VERIFIED_MODELS });
  assert.deepEqual(req.context, { caller: true }, "no recursion flag is left on the caller's request");
  assert.deepEqual(reads, [true], "the latest version is assessed, not a stale published row");
});

test("the approval guard does not skip on a request-wide context flag", async () => {
  const { enforceApprovalPrerequisites } = await import("@/payload/product-hooks");
  const source = (await import("node:fs")).readFileSync(join(process.cwd(), "src/payload/product-hooks.ts"), "utf8");
  const guard = source.slice(source.indexOf("export const enforceApprovalPrerequisites"));
  assert.ok(!/launchStatusNested/.test(guard.slice(0, guard.indexOf("computeLaunchStatus"))), "no early return on launchStatusNested");
  assert.equal(typeof enforceApprovalPrerequisites, "function");
});
