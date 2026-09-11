import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS } from "@/lib/catalog/products";
import { isQuoteOnly } from "@/lib/catalog/query";
import { calculateQuote } from "@/lib/pricing/calculateQuote";
import { PRICING_RULES } from "@/lib/pricing/rules";

import { catalogLineKey, customLineKey } from "./identity";
import { mergeGuestCart } from "./merge";
import { priceCart } from "./validation";
import { MAX_CART_LINES, MAX_LINE_QUANTITY, type Cart, type CatalogCartLine, type CustomCartLine } from "./types";

/**
 * Guest cart → signed-in cart.
 *
 * The merge is pure and is tested against the real catalog and the real pricing
 * rules, then priced the way every cart is. The point of pricing the result is
 * the claim the merge rests on: nothing a guest cart recorded about money
 * survives into what the customer is charged.
 */

const PRODUCT = PRODUCTS.find((product) => !isQuoteOnly(product));
assert.ok(PRODUCT, "the catalog has no purchasable product");

function catalogLine(
  overrides: { quantity?: number; color?: string; priceAtAdd?: number } = {},
): CatalogCartLine {
  const product = PRODUCT!;
  const configuration = {
    material: product.materials?.[0] ?? product.material,
    color: overrides.color ?? product.colors?.[0] ?? product.color ?? "black",
  };

  return {
    type: "catalog",
    id: catalogLineKey({ productId: product.id, configuration }),
    productId: product.id,
    quantity: overrides.quantity ?? 1,
    configuration,
    priceAtAdd: overrides.priceAtAdd ?? product.price,
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

function customLine(overrides: { modelId?: string; quantity?: number; finish?: string } = {}): CustomCartLine {
  const model = {
    modelId: overrides.modelId ?? "mdl_browser01",
    name: "bracket.stl",
    extension: ".stl",
    sizeBytes: 28884,
    formatLabel: "Binary STL",
  };
  const configuration = { material: "pla", quality: "precision", finish: overrides.finish ?? "standard" };
  const quantity = overrides.quantity ?? 1;
  const quoted = calculateQuote({ model, ...configuration, quantity });

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
    },
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

const cart = (id: string, ...lines: (CatalogCartLine | CustomCartLine)[]): Cart => ({
  id,
  lines,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

test("the same part in the same configuration becomes one line", () => {
  const result = mergeGuestCart(
    cart("account", catalogLine({ quantity: 2 })),
    cart("guest", catalogLine({ quantity: 3 })),
    [],
  );

  assert.equal(result.cart.lines.length, 1);
  assert.equal(result.cart.lines[0]?.quantity, 5);
  assert.equal(result.merged, 1);
  assert.equal(result.cart.id, "account", "the account cart's identity was replaced");
});

test("a combined quantity is clamped to the per-line maximum", () => {
  const result = mergeGuestCart(
    cart("account", catalogLine({ quantity: MAX_LINE_QUANTITY - 1 })),
    cart("guest", catalogLine({ quantity: 50 })),
    [],
  );
  assert.equal(result.cart.lines[0]?.quantity, MAX_LINE_QUANTITY);
});

test("a different configuration stays a separate line, after the account's lines", () => {
  const colors = PRODUCT!.colors ?? [];
  const other = colors[1] ?? "white";

  const result = mergeGuestCart(
    cart("account", catalogLine()),
    cart("guest", catalogLine({ color: other }), customLine()),
    [],
  );

  assert.equal(result.cart.lines.length, 3);
  assert.equal(result.cart.lines[0]?.id, catalogLine().id, "the account's line moved");
});

test("prices are re-read from the catalog, whatever either cart recorded", async () => {
  const result = mergeGuestCart(
    cart("account"),
    cart("guest", catalogLine({ priceAtAdd: 1 })),
    [],
  );

  const priced = await priceCart(result.cart);
  const line = priced.lines[0];

  assert.equal(line?.unitPrice, PRODUCT!.price, "a guest-recorded price was used");
  assert.ok(priced.issues.some((issue) => issue.code === "price_changed"));
  assert.equal(priced.checkoutReady, false);
});

test("merging custom quantities invalidates the quote rather than trusting it", async () => {
  const result = mergeGuestCart(
    cart("account", customLine({ quantity: 1 })),
    cart("guest", customLine({ quantity: 2 })),
    [],
  );

  assert.equal(result.cart.lines.length, 1);
  assert.equal(result.cart.lines[0]?.quantity, 3);

  const priced = await priceCart(result.cart);
  assert.ok(priced.issues.some((issue) => issue.code === "quote_stale"), "a stale custom quote was accepted");
});

test("a custom part whose file never left a browser is kept, and cannot be ordered", async () => {
  const result = mergeGuestCart(cart("account"), cart("guest", customLine({ modelId: "mdl_onlyinbrowser" })), []);

  assert.equal(result.cart.lines.length, 1, "the guest's custom line was dropped");

  const priced = await priceCart(result.cart);
  const blocking = priced.issues.find((issue) => issue.code === "model_file_pending");
  assert.ok(blocking);
  assert.equal(blocking.severity, "blocking");
});

test("a design id that is not the customer's verified design is kept and blocked", async () => {
  const result = mergeGuestCart(
    cart("account"),
    cart("guest", customLine({ modelId: "dsn_0123456789abcdef01234567" })),
    [],
  );

  const priced = await priceCart(result.cart);
  assert.ok(priced.issues.some((issue) => issue.code === "model_file_pending"));
  assert.equal(priced.checkoutReady, false);
});

test("lines beyond the cart limit stay in the guest cart instead of vanishing", () => {
  const colors = ["c0", "c1", "c2", "c3", "c4"];
  const account = cart(
    "account",
    ...Array.from({ length: MAX_CART_LINES - 2 }, (_, index) =>
      customLine({ modelId: `mdl_account${index}` }),
    ),
  );
  const guest = cart(
    "guest",
    ...colors.map((color) => catalogLine({ color })),
  );

  const result = mergeGuestCart(account, guest, []);

  assert.equal(result.cart.lines.length, MAX_CART_LINES);
  assert.equal(result.merged, 2);
  assert.equal(result.leftover.length, 3);
  assert.equal(result.merged + result.leftover.length, guest.lines.length, "a guest line went missing");
});

test("a guest cart is merged once, however many times sign-in runs", () => {
  const account = cart("account", catalogLine({ quantity: 2 }));
  const guest = cart("guest-1", catalogLine({ quantity: 3 }));

  const first = mergeGuestCart(account, guest, []);
  const again = mergeGuestCart(first.cart, guest, ["guest-1"]);

  assert.equal(again.alreadyMerged, true);
  assert.equal(again.cart.lines[0]?.quantity, 5, "the quantity was doubled");
});

test("an empty guest cart changes nothing", () => {
  const account = cart("account", catalogLine());
  const result = mergeGuestCart(account, cart("guest"), []);

  assert.equal(result.cart, account);
  assert.equal(result.merged, 0);
  assert.equal(result.alreadyMerged, false);
});
