import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS } from "@/lib/catalog/products";
import { calculateQuote } from "@/lib/pricing/calculateQuote";
import { PRICING_RULES } from "@/lib/pricing/rules";

import {
  addLine,
  cartFingerprint,
  catalogLineKey,
  clampQuantity,
  customLineKey,
  mergeCarts,
  removeLine,
  setLineQuantity,
} from "./identity";
import { calculateCartTotals, unitCount } from "./totals";
import { priceCart, priceLine } from "./validation";
import type { Cart, CatalogCartLine, CustomCartLine } from "./types";

/* ------------------------------------------------------------------ *
 * Fixtures
 *
 * Built from the real catalog and the real pricing rules, so a test that
 * passes says something about the system rather than about its mocks.
 * ------------------------------------------------------------------ */

const GEAR = PRODUCTS.find((p) => p.slug === "precision-gear");
const BRACKET = PRODUCTS.find((p) => p.slug === "cable-bracket");
const CUSTOM = PRODUCTS.find((p) => p.price === 0);

function catalogLine(overrides: Partial<CatalogCartLine> = {}): CatalogCartLine {
  const configuration = {
    material: "pla",
    color: "black",
    quality: "precision",
    ...overrides.configuration,
  };

  const productId = overrides.productId ?? GEAR?.id ?? "p-001";

  return {
    ...overrides,
    type: "catalog",
    id: catalogLineKey({ productId, configuration }),
    productId,
    quantity: overrides.quantity ?? 1,
    configuration,
    priceAtAdd: overrides.priceAtAdd ?? GEAR?.price ?? 399,
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

function customLine(overrides: Partial<CustomCartLine> = {}): CustomCartLine {
  const model = {
    modelId: "mdl_test0001",
    name: "gear.stl",
    extension: ".stl",
    sizeBytes: 28884,
    formatLabel: "Binary STL",
    triangles: 576,
    ...overrides.model,
  };
  const configuration = {
    material: "pla",
    quality: "precision",
    finish: "standard",
    ...overrides.configuration,
  };
  const quantity = overrides.quantity ?? 2;

  const quoted = calculateQuote({
    model: {
      name: model.name,
      extension: model.extension,
      sizeBytes: model.sizeBytes,
      triangles: model.triangles,
    },
    material: configuration.material,
    quality: configuration.quality,
    finish: configuration.finish,
    quantity,
  });

  return {
    type: "custom",
    id: customLineKey({ model, configuration }),
    quantity,
    model,
    configuration,
    quote: {
      rulesVersion: PRICING_RULES.version,
      total: quoted.status === "available" ? quoted.quote.total : 0,
      basis: "configuration",
      provisional: true,
      quotedAt: "2026-01-01T00:00:00.000Z",
      ...overrides.quote,
    },
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

const cartOf = (...lines: (CatalogCartLine | CustomCartLine)[]): Cart => ({
  id: "cart_test",
  lines,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

/* ------------------------------------------------------------------ *
 * Line identity
 * ------------------------------------------------------------------ */

test("the same product in the same configuration is one line", () => {
  const line = catalogLine();
  const lines = addLine(addLine([], line), { ...line, quantity: 2 });

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.quantity, 3);
});

test("the same product in a different material is a separate line", () => {
  const pla = catalogLine({ configuration: { material: "pla", color: "black" } });
  const petg = catalogLine({ configuration: { material: "petg", color: "black" } });

  const lines = addLine(addLine([], pla), petg);
  assert.equal(lines.length, 2);
});

test("the same product in a different colour is a separate line", () => {
  const black = catalogLine({ configuration: { material: "pla", color: "black" } });
  const white = catalogLine({ configuration: { material: "pla", color: "white" } });

  assert.equal(addLine(addLine([], black), white).length, 2);
});

test("the same product at a different quality is a separate line", () => {
  const a = catalogLine({
    configuration: { material: "pla", color: "black", quality: "standard" },
  });
  const b = catalogLine({
    configuration: { material: "pla", color: "black", quality: "high-detail" },
  });

  assert.equal(addLine(addLine([], a), b).length, 2);
});

test("different products are separate lines", () => {
  const gear = catalogLine();
  const bracket = catalogLine({ productId: BRACKET?.id ?? "p-020" });

  assert.equal(addLine(addLine([], gear), bracket).length, 2);
});

test("a custom line never merges with a catalog line", () => {
  const lines = addLine(addLine([], catalogLine()), customLine());
  assert.equal(lines.length, 2);
});

test("custom lines sharing only a material stay separate", () => {
  const first = customLine({ model: { modelId: "mdl_a" } as never });
  const second = customLine({ model: { modelId: "mdl_b" } as never });

  const lines = addLine(addLine([], first), second);
  assert.equal(lines.length, 2, "two different models were merged");
});

test("the same model in a different finish is a separate job", () => {
  const standard = customLine();
  const smooth = customLine({
    configuration: { material: "pla", quality: "precision", finish: "smooth" },
  });

  assert.equal(addLine(addLine([], standard), smooth).length, 2);
});

test("merging preserves the position of an existing line", () => {
  const gear = catalogLine();
  const bracket = catalogLine({ productId: BRACKET?.id ?? "p-020" });

  const lines = addLine(addLine(addLine([], gear), bracket), gear);
  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.id, gear.id, "the merged line moved");
  assert.equal(lines[0]?.quantity, 2);
});

test("quantity is clamped to a whole number in range", () => {
  assert.equal(clampQuantity(0), 1);
  assert.equal(clampQuantity(-4), 1);
  assert.equal(clampQuantity(2.7), 2);
  assert.equal(clampQuantity(9999), 500);
  assert.equal(clampQuantity(Number.NaN), 1);
});

test("setting quantity to zero removes the line", () => {
  const line = catalogLine();
  assert.equal(setLineQuantity([line], line.id, 0).length, 0);
});

test("removing a line leaves the others alone", () => {
  const gear = catalogLine();
  const bracket = catalogLine({ productId: BRACKET?.id ?? "p-020" });
  const lines = removeLine([gear, bracket], gear.id);

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.id, bracket.id);
});

/* ------------------------------------------------------------------ *
 * Merging carts
 * ------------------------------------------------------------------ */

test("a guest cart merges into an account cart by the same identity rule", () => {
  const account = cartOf(catalogLine());
  const guest = cartOf(
    catalogLine({ quantity: 2 }),
    catalogLine({ productId: BRACKET?.id ?? "p-020" }),
  );

  const merged = mergeCarts(account, guest);
  assert.equal(merged.lines.length, 2);
  assert.equal(merged.lines[0]?.quantity, 3);
  assert.equal(merged.id, account.id, "the account cart lost its identity");
});

test("merging never drops a guest line", () => {
  const merged = mergeCarts(cartOf(), cartOf(catalogLine(), customLine()));
  assert.equal(merged.lines.length, 2);
});

/* ------------------------------------------------------------------ *
 * Totals
 * ------------------------------------------------------------------ */

test("the subtotal is the sum of the line totals", async () => {
  const cart = await priceCart(cartOf(catalogLine({ quantity: 2 })));
  const line = cart.lines[0];

  assert.ok(line?.lineTotal);
  assert.equal(cart.totals.subtotal, line.lineTotal);
  assert.equal(line.lineTotal, (GEAR?.price ?? 0) * 2);
});

test("shipping and tax are unknown rather than zero", () => {
  const totals = calculateCartTotals([]);

  assert.equal(totals.shipping.known, false);
  assert.equal(totals.tax.known, false);
  assert.deepEqual([...totals.excluded], ["Shipping", "GST"]);
});

test("an unknown component is left out of the total, not counted as nothing", async () => {
  const cart = await priceCart(cartOf(catalogLine({ quantity: 3 })));
  assert.equal(cart.totals.total, cart.totals.subtotal);
  assert.ok(cart.totals.excluded.length > 0);
});

test("a known shipping amount joins the total", async () => {
  const cart = await priceCart(cartOf(catalogLine()), {
    shipping: { known: true, amount: 120 },
  });

  assert.equal(cart.totals.total, cart.totals.subtotal + 120);
  assert.deepEqual([...cart.totals.excluded], ["GST"]);
});

test("the header count is total units, not lines", async () => {
  const cart = await priceCart(
    cartOf(catalogLine({ quantity: 2 }), customLine({ quantity: 3 })),
  );

  assert.equal(cart.totals.unitCount, 5);
  assert.equal(unitCount(cart.lines.map((l) => l.line)), 5);
});

test("a line that cannot be priced contributes nothing rather than a guess", async () => {
  const cart = await priceCart(cartOf(catalogLine({ productId: "p-does-not-exist" })));

  assert.equal(cart.lines[0]?.lineTotal, null);
  assert.equal(cart.totals.subtotal, 0);
});

/* ------------------------------------------------------------------ *
 * Price trust
 * ------------------------------------------------------------------ */

test("the catalog price wins over the price stored on the line", async () => {
  // A tampered store claiming the gear costs one rupee.
  const priced = await priceLine(catalogLine({ priceAtAdd: 1 }));

  assert.equal(priced.unitPrice, GEAR?.price);
  assert.notEqual(priced.unitPrice, 1);
});

test("a price that moved since it was added blocks checkout and says so", async () => {
  const cart = await priceCart(cartOf(catalogLine({ priceAtAdd: 349 })));
  const issue = cart.issues.find((entry) => entry.code === "price_changed");

  assert.ok(issue, "no price change was reported");
  assert.equal(issue.severity, "blocking");
  assert.match(issue.message, /₹349/);
  assert.equal(cart.checkoutReady, false);
});

test("a product that left the catalog cannot be checked out", async () => {
  const cart = await priceCart(cartOf(catalogLine({ productId: "p-removed" })));

  assert.equal(cart.issues[0]?.code, "product_unavailable");
  assert.equal(cart.checkoutReady, false);
});

test("a quote-only product cannot be bought as a catalog line", async () => {
  const cart = await priceCart(cartOf(catalogLine({ productId: CUSTOM?.id ?? "p-036" })));

  assert.ok(cart.issues.some((issue) => issue.code === "product_not_purchasable"));
  assert.equal(cart.checkoutReady, false);
});

/* ------------------------------------------------------------------ *
 * Custom lines
 * ------------------------------------------------------------------ */

test("a custom line is priced by re-running the quote engine", async () => {
  const line = customLine();
  const priced = await priceLine(line);

  const expected = calculateQuote({
    model: {
      name: line.model.name,
      extension: line.model.extension,
      sizeBytes: line.model.sizeBytes,
      triangles: line.model.triangles,
    },
    material: line.configuration.material,
    quality: line.configuration.quality,
    finish: line.configuration.finish,
    quantity: line.quantity,
  });

  assert.equal(expected.status, "available");
  assert.equal(priced.lineTotal, expected.status === "available" ? expected.quote.total : -1);
});

test("a stored quote total is never trusted as the price", async () => {
  const priced = await priceLine(customLine({ quote: { total: 5 } as never }));

  assert.notEqual(priced.lineTotal, 5);
  assert.ok(priced.issues.some((issue) => issue.code === "quote_stale"));
});

test("a quote from older rules needs review", async () => {
  const priced = await priceLine(
    customLine({ quote: { rulesVersion: "demo-2020-01" } as never }),
  );

  const issue = priced.issues.find((entry) => entry.code === "quote_stale");
  assert.ok(issue);
  assert.equal(issue.severity, "blocking");
});

test("a custom part cannot be ordered while its file is only in the browser", async () => {
  const priced = await priceLine(customLine());
  const issue = priced.issues.find((entry) => entry.code === "model_file_pending");

  assert.ok(issue, "a part with no stored file was allowed through");
  assert.equal(issue.severity, "blocking");
});

test("a cart holding a custom part is not checkout ready", async () => {
  assert.equal((await priceCart(cartOf(customLine()))).checkoutReady, false);
});

test("a catalog-only cart with no problems is checkout ready", async () => {
  assert.equal((await priceCart(cartOf(catalogLine()))).checkoutReady, true);
});

test("an empty cart is not checkout ready", async () => {
  assert.equal((await priceCart(cartOf())).checkoutReady, false);
});

/* ------------------------------------------------------------------ *
 * Reconciliation
 * ------------------------------------------------------------------ */

test("pricing the same cart twice gives the same total", async () => {
  const cart = cartOf(catalogLine({ quantity: 3 }), catalogLine({
    productId: BRACKET?.id ?? "p-020",
    quantity: 2,
  }));

  const first = await priceCart(cart);
  const second = await priceCart(cart);

  assert.equal(first.totals.total, second.totals.total);
  assert.equal(
    first.totals.subtotal,
    (GEAR?.price ?? 0) * 3 + (BRACKET?.price ?? 0) * 2,
  );
});

test("the fingerprint changes with quantity and not with order", () => {
  const gear = catalogLine();
  const bracket = catalogLine({ productId: BRACKET?.id ?? "p-020" });

  assert.equal(
    cartFingerprint(cartOf(gear, bracket)),
    cartFingerprint(cartOf(bracket, gear)),
  );
  assert.notEqual(
    cartFingerprint(cartOf(gear)),
    cartFingerprint(cartOf({ ...gear, quantity: 2 })),
  );
});
