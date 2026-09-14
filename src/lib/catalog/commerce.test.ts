import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CATALOG_ENTRIES, MANUFACTURING_CAPABILITY, LAUNCH_POLICY, PRICING_RULES_APPROVAL } from "@/content/catalog";
import { priceCart } from "@/lib/cart/validation";
import type { Cart, CatalogCartLine } from "@/lib/cart/types";
import { catalogLineKey } from "@/lib/cart/identity";
import { checkProductWrite } from "@/payload/workflow";

import {
  assessCommercial,
  catalogMode,
  effectivePriceApproval,
  isVisible,
  priceQualifier,
  purchaseBlockers,
  visibleProducts,
  type PriceApprovalRecord,
} from "./commerce";
import { runCatalogQuery } from "./engine";
import { applyPriceApprovals } from "./payload-mapping";
import { PRODUCTS } from "./products";
import { catalogSourceFrom, setCatalogSource } from "./source";
import type { CatalogQuery, Product } from "./types";
import { validateCatalog, validateEntryApprovals, validateProduct } from "./validation";

/**
 * Stage 19.6 — product approval and commercial content.
 *
 * Fixtures are the real spur gear, changed in one way each: approved or not,
 * priced or not, imaged or not. Nothing here asserts a business decision exists;
 * the tests prove what the system does once one is recorded.
 */

const spur = PRODUCTS.find((product) => product.id === "p-101")!;

const approved: Product = {
  ...spur,
  id: "p-901",
  slug: "approved-fixture",
  approvalStatus: "approved",
  priceStatus: "approved",
  image: { src: "/catalog/approved-fixture/front.jpg", alt: "Fixture", kind: "photo" },
};

/* ------------------------------------------------------------------ *
 * Mode
 * ------------------------------------------------------------------ */

test("development reviews, a production build launches, Vercel production always launches", () => {
  assert.equal(catalogMode({ NODE_ENV: "development" }), "review");
  assert.equal(catalogMode({ NODE_ENV: "test" }), "review");
  assert.equal(catalogMode({ NODE_ENV: "production" }), "launch");
  assert.equal(catalogMode({ NODE_ENV: "production", NEXT_PUBLIC_SADA_CATALOG_MODE: "review" }), "review");
  assert.equal(catalogMode({ NODE_ENV: "development", NEXT_PUBLIC_SADA_CATALOG_MODE: "launch" }), "launch");
  assert.equal(
    catalogMode({ NODE_ENV: "production", NEXT_PUBLIC_SADA_CATALOG_MODE: "review", VERCEL_ENV: "production" }),
    "launch",
  );
});

/* ------------------------------------------------------------------ *
 * Visibility
 * ------------------------------------------------------------------ */

test("draft products are hidden in every mode", () => {
  const draft = { ...spur, approvalStatus: "draft" as const };
  assert.equal(isVisible(draft, "review"), false);
  assert.equal(isVisible(draft, "launch"), false);
});

test("archived products are hidden in every mode", () => {
  const archived = { ...spur, approvalStatus: "archived" as const };
  assert.equal(isVisible(archived, "review"), false);
  assert.equal(isVisible(archived, "launch"), false);
});

test("a product with no approval status is treated as a draft", () => {
  assert.equal(isVisible({ ...spur, approvalStatus: undefined }, "review"), false);
});

test("provisional products are reviewable before launch and absent from the launch storefront", () => {
  assert.equal(isVisible(spur, "review"), true);
  assert.equal(isVisible(spur, "launch"), false);
  assert.equal(isVisible(approved, "launch"), true);
});

test("the launch storefront contains only approved products; today that is none", () => {
  assert.deepEqual(visibleProducts(PRODUCTS, "launch"), []);
  assert.equal(visibleProducts(PRODUCTS, "review").length, PRODUCTS.length);
  assert.deepEqual(visibleProducts([...PRODUCTS, approved], "launch").map((p) => p.id), ["p-901"]);
});

/* ------------------------------------------------------------------ *
 * Purchasability
 * ------------------------------------------------------------------ */

test("an unapproved product cannot be purchased in launch mode", () => {
  const codes = purchaseBlockers(spur, "launch").map((b) => b.code);
  assert.ok(codes.includes("product_not_approved"));
});

test("an unapproved price cannot be charged in launch mode, even on an approved product", () => {
  const codes = purchaseBlockers({ ...approved, priceStatus: "provisional" }, "launch").map((b) => b.code);
  assert.deepEqual(codes, ["price_not_approved"]);
  assert.deepEqual(purchaseBlockers(approved, "launch"), []);
});

test("draft and archived products are never purchasable, even in review", () => {
  assert.equal(purchaseBlockers({ ...spur, approvalStatus: "draft" }, "review")[0]?.code, "product_not_approved");
  assert.equal(purchaseBlockers({ ...spur, approvalStatus: "archived" }, "review")[0]?.code, "product_not_approved");
  assert.deepEqual(purchaseBlockers(spur, "review"), []);
});

function cartWith(product: Product): Cart {
  const configuration = { material: product.material, color: product.color, quality: "standard" };
  const line: CatalogCartLine = {
    type: "catalog",
    id: catalogLineKey({ productId: product.id, configuration }),
    productId: product.id,
    quantity: 1,
    configuration,
    priceAtAdd: product.price,
    addedAt: "2026-09-13T00:00:00.000Z",
  };
  return { id: "cart_commerce", lines: [line], updatedAt: "2026-09-13T00:00:00.000Z" } as Cart;
}

async function withMode<T>(mode: "launch" | "review", catalog: readonly Product[], run: () => Promise<T>): Promise<T> {
  const previous = process.env.NEXT_PUBLIC_SADA_CATALOG_MODE;
  process.env.NEXT_PUBLIC_SADA_CATALOG_MODE = mode;
  setCatalogSource(catalogSourceFrom("fixture", async () => catalog));
  try {
    return await run();
  } finally {
    setCatalogSource(null);
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SADA_CATALOG_MODE;
    else process.env.NEXT_PUBLIC_SADA_CATALOG_MODE = previous;
  }
}

test("production checkout refuses a provisional product at the server trust boundary", async () => {
  // The fixture source hands the product over unfiltered, as a stale cart or a
  // misconfigured source might; the cart still refuses it.
  const cart = await withMode("launch", [spur], () => priceCart(cartWith(spur)));
  const codes = cart.issues.map((issue) => issue.code);

  assert.ok(codes.includes("product_not_approved"));
  assert.ok(codes.includes("price_not_approved"));
  assert.equal(cart.checkoutReady, false);
});

test("production checkout accepts an approved product at an approved price", async () => {
  const cart = await withMode("launch", [approved], () => priceCart(cartWith(approved)));
  assert.deepEqual(cart.issues, []);
  assert.equal(cart.checkoutReady, true);
});

test("review checkout allows a provisional price and says it is provisional", async () => {
  const cart = await withMode("review", [spur], () => priceCart(cartWith(spur)));
  const notice = cart.issues.find((issue) => issue.code === "price_provisional");

  assert.ok(notice);
  assert.equal(notice.severity, "notice");
  assert.equal(cart.checkoutReady, true);
});

test("a client-submitted amount is never the price", async () => {
  const tampered = cartWith(approved);
  (tampered.lines[0] as CatalogCartLine).priceAtAdd = 1;
  const cart = await withMode("launch", [approved], () => priceCart(tampered));

  assert.equal(cart.lines[0]?.unitPrice, approved.price);
  assert.equal(cart.checkoutReady, false, "a moved price must block, not be honoured");
});

/* ------------------------------------------------------------------ *
 * Provisional pricing as displayed
 * ------------------------------------------------------------------ */

test("a provisional price is labelled and an approved price is not", () => {
  assert.equal(priceQualifier(spur), "Provisional price");
  assert.equal(priceQualifier(approved), undefined);
  assert.equal(priceQualifier({ ...spur, price: 0, priceStatus: "quote-only" }), undefined);
});

test("every product card and the product page carry the provisional qualifier", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

  for (const path of [
    "components/marketplace/ProductGrid.tsx",
    "components/homepage/FeaturedProducts.tsx",
    "components/product/ProductSections.tsx",
  ]) {
    assert.match(read(path), /priceNote=\{priceQualifier\(product\)\}/, path);
  }
  assert.match(read("components/product/ProductHero.tsx"), /PROVISIONAL_PRICE_EXPLANATION/);
  assert.match(read("components/commerce/ProductCard.tsx"), /priceNote &&/);
});

/* ------------------------------------------------------------------ *
 * Price approvals
 * ------------------------------------------------------------------ */

const record = (amount: number, effectiveFrom: string, reference = "list"): PriceApprovalRecord => ({
  amount,
  currency: "INR",
  effectiveFrom,
  reference,
  approvedBy: "Approver",
});

test("the price in effect is the latest approval whose date has arrived", () => {
  const records = [record(600, "2026-09-01"), record(650, "2026-10-01"), record(700, "2027-01-01")];
  assert.equal(effectivePriceApproval(records, new Date("2026-09-15"))?.amount, 600);
  assert.equal(effectivePriceApproval(records, new Date("2026-10-01T00:00:00Z"))?.amount, 650);
  assert.equal(effectivePriceApproval(records, new Date("2026-08-01")), undefined);
});

test("a correction on the same date supersedes the earlier record", () => {
  const records = [record(600, "2026-09-01", "v1"), record(620, "2026-09-01", "v1 corrected")];
  assert.equal(effectivePriceApproval(records, new Date("2026-09-02"))?.reference, "v1 corrected");
});

test("an approved price without a matching approval in effect is served as provisional", () => {
  const now = new Date("2026-10-02");
  const matching = applyPriceApprovals([approved], new Map([["p-901", [record(approved.price, "2026-10-01")]]]), now);
  assert.equal(matching.products[0]?.priceStatus, "approved");
  assert.deepEqual(matching.failures, []);

  const none = applyPriceApprovals([approved], new Map(), now);
  assert.equal(none.products[0]?.priceStatus, "provisional");
  assert.equal(none.failures.length, 1);

  const mismatch = applyPriceApprovals([approved], new Map([["p-901", [record(999, "2026-10-01")]]]), now);
  assert.equal(mismatch.products[0]?.priceStatus, "provisional");

  const future = applyPriceApprovals([approved], new Map([["p-901", [record(approved.price, "2027-01-01")]]]), now);
  assert.equal(future.products[0]?.priceStatus, "provisional");
});

test("price approval records are validated: whole rupees, INR, ISO date, approver and reference", () => {
  const entry = CATALOG_ENTRIES[0]!;
  const issues = validateEntryApprovals(
    {
      ...entry,
      priceApprovals: [
        { ...record(12.5, "2026-10-01") },
        { ...record(-1, "01/10/2026") },
        { ...record(500, "2026-10-01"), reference: "", approvedBy: "" },
      ],
    },
    new Date("2026-10-02"),
  );
  assert.ok(issues.length >= 4);
  assert.ok(issues.every((issue) => issue.code === "invalid-price-approval"));
});

/* ------------------------------------------------------------------ *
 * Validation: technical vs commercial
 * ------------------------------------------------------------------ */

test("technically valid is not commercially ready — the current catalog is both valid and unready", () => {
  for (const product of PRODUCTS) {
    assert.deepEqual(validateProduct(product), [], product.id);
    const commercial = assessCommercial(product);
    assert.equal(commercial.ready, false, product.id);
    assert.deepEqual(commercial.reasons, [
      "product approval is provisional, not approved",
      "price is provisional",
      "no approved product photo or render",
    ]);
  }
});

test("an image not marked photo or render is refused, so placeholder media cannot be published", () => {
  const codes = validateProduct({ ...spur, image: { src: "/catalog/x.jpg", alt: "x" } }).map((i) => i.code);
  assert.ok(codes.includes("invalid-image"));
  const external = validateProduct({ ...spur, image: { src: "http://example.com/x.jpg", alt: "x", kind: "photo" } });
  assert.ok(external.some((issue) => issue.code === "invalid-image"));
});

test("a draft or archived product intended for publication fails the catalog", () => {
  for (const approvalStatus of ["draft", "archived"] as const) {
    const entry = { ...CATALOG_ENTRIES[0]!, product: { ...CATALOG_ENTRIES[0]!.product, approvalStatus } };
    const result = validateCatalog([entry, ...CATALOG_ENTRIES.slice(1)]);
    assert.ok(result.issues.some((issue) => issue.code === "publication-conflict"), approvalStatus);
  }
});

test("a product with no approval status fails technical validation", () => {
  assert.ok(validateProduct({ ...spur, approvalStatus: undefined }).some((i) => i.code === "invalid-approval-status"));
});

/* ------------------------------------------------------------------ *
 * The CMS workflow guard
 * ------------------------------------------------------------------ */

const TODAY = { today: "2026-10-01" };

test("publishing a draft or archived product is refused", () => {
  for (const approvalStatus of ["draft", "archived"]) {
    const result = checkProductWrite({ _status: "published", approvalStatus, price: 650, priceStatus: "provisional" }, TODAY);
    assert.equal(result.errors.length, 1, approvalStatus);
  }
  assert.deepEqual(
    checkProductWrite({ _status: "published", approvalStatus: "provisional", price: 650, priceStatus: "provisional" }, TODAY).errors,
    [],
  );
});

test("approving requires a reference, and stamps the approver and date", () => {
  const missing = checkProductWrite({ approvalStatus: "approved", price: 650, priceStatus: "provisional" }, { ...TODAY, userName: "Operator" });
  assert.ok(missing.errors.some((e) => /reference/.test(e)));

  const stamped = checkProductWrite(
    { approvalStatus: "approved", approval: { reference: "Decision log #4" }, price: 650, priceStatus: "provisional" },
    { ...TODAY, userName: "Operator" },
  );
  assert.deepEqual(stamped.errors, []);
  assert.equal(stamped.data.approval?.approvedBy, "Operator");
  assert.equal(stamped.data.approval?.approvedOn, "2026-10-01");
});

test("an approved price is refused unless an approval in effect matches it", () => {
  const write = { approvalStatus: "provisional", price: 650, priceStatus: "approved" };
  assert.equal(checkProductWrite(write, TODAY).errors.length, 1);
  assert.equal(checkProductWrite(write, { ...TODAY, effectiveApprovedAmount: 700 }).errors.length, 1);
  assert.deepEqual(checkProductWrite(write, { ...TODAY, effectiveApprovedAmount: 650 }).errors, []);
});

test("quote-only and a price of 0 must agree", () => {
  assert.equal(checkProductWrite({ price: 0, priceStatus: "provisional" }, TODAY).errors.length, 1);
  assert.equal(checkProductWrite({ price: 650, priceStatus: "quote-only" }, TODAY).errors.length, 1);
});

/* ------------------------------------------------------------------ *
 * Counts, per mode
 * ------------------------------------------------------------------ */

const ALL: CatalogQuery = {
  category: [], material: [], technology: [], color: [], availability: [], price: [], q: "", sort: "relevance", page: 1,
};

test("catalog counts are computed over what the mode makes visible, and stay consistent", () => {
  const review = runCatalogQuery(visibleProducts([...PRODUCTS, approved], "review"), ALL);
  const launch = runCatalogQuery(visibleProducts([...PRODUCTS, approved], "launch"), ALL);

  assert.equal(review.total, PRODUCTS.length + 1);
  assert.equal(launch.total, 1);
  assert.equal(launch.facets.material.pla, 1);
  assert.equal(
    Object.values(review.facets.technology).reduce((sum, n) => sum + n, 0),
    review.total,
    "every visible product is counted under exactly one technology",
  );
});

/* ------------------------------------------------------------------ *
 * Business approvals are honest
 * ------------------------------------------------------------------ */

test("no business approval is recorded as given without a reference", () => {
  for (const approval of [MANUFACTURING_CAPABILITY, PRICING_RULES_APPROVAL]) {
    assert.ok(!approval.approved || Boolean(approval.reference?.trim()), approval.scope);
  }
  assert.ok(LAUNCH_POLICY.minimumApprovedProducts >= 1 && LAUNCH_POLICY.reference.length > 0);
});

test("no canonical product claims approval today", () => {
  for (const entry of CATALOG_ENTRIES) {
    assert.notEqual(entry.product.approvalStatus, "approved", entry.product.id);
    assert.notEqual(entry.product.priceStatus, "approved", entry.product.id);
    assert.equal(entry.priceApprovals, undefined, entry.product.id);
  }
});
