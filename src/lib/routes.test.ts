import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTS } from "./catalog/products";
import { BROWSE_CATEGORIES } from "./catalog/taxonomy";
import {
  ROUTES,
  categoryHref,
  materialHref,
  processStageHref,
  productHref,
  shopFilterHref,
  solutionHref,
} from "./routes";

/* ------------------------------------------------------------------ *
 * Product URLs
 * ------------------------------------------------------------------ */

test("a product URL carries its category", () => {
  const href = productHref({ browseCategory: "mechanical", slug: "precision-gear" });

  assert.equal(href, "/shop/mechanical/precision-gear");
});

test("every product in the catalog gets a three-segment URL", () => {
  for (const product of PRODUCTS) {
    const href = productHref(product);
    const segments = href.split("/").filter(Boolean);

    assert.equal(
      segments.length,
      3,
      `${product.id} produced ${href}, which is not /shop/[category]/[slug]`,
    );
    assert.equal(segments[0], "shop");
  }
});

test("a product URL never collapses to the two-segment form that 404'd", () => {
  /*
   * The regression this module exists for. The homepage built `/shop/{slug}`,
   * which looks like a product URL, is a well-formed string, and resolves to
   * nothing — /shop/[category] would reject "precision-gear" as a category.
   */
  for (const product of PRODUCTS) {
    assert.notEqual(productHref(product), `/shop/${product.slug}`);
  }
});

test("a product URL is addressable by the route that serves it", () => {
  // Both /shop/[category] and /shop/[category]/[slug] are generated with
  // dynamicParams disabled, so the category has to be on the browse allowlist
  // or the URL is a routing-level 404 however well-formed it looks.
  const browse = new Set(BROWSE_CATEGORIES);

  for (const product of PRODUCTS) {
    assert.ok(
      browse.has(product.browseCategory),
      `${product.id} is filed under "${product.browseCategory}", which has no /shop page`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Category and filter URLs
 * ------------------------------------------------------------------ */

test("a category URL is the shop scoped to one category", () => {
  assert.equal(categoryHref("automotive"), "/shop/automotive");
});

test("a filter URL encodes its value rather than interpolating it", () => {
  assert.equal(shopFilterHref("material", "petg"), "/shop?material=petg");

  // The reason this is built with URLSearchParams: a value carrying a reserved
  // character has to survive as one parameter, not become two.
  assert.equal(
    shopFilterHref("color", "black&white"),
    "/shop?color=black%26white",
  );
});

/* ------------------------------------------------------------------ *
 * Informational routes
 * ------------------------------------------------------------------ */

test("every named route is an absolute path", () => {
  for (const [name, href] of Object.entries(ROUTES)) {
    assert.ok(href.startsWith("/"), `${name} is "${href}", which is not a path`);
    assert.ok(!href.includes("//"), `${name} has an empty segment`);
    assert.ok(!/\s/.test(href), `${name} contains whitespace`);
  }
});

test("the three pages Stage 19 added are named routes", () => {
  assert.equal(ROUTES.materials, "/materials");
  assert.equal(ROUTES.solutions, "/solutions");
  assert.equal(ROUTES.howItWorks, "/how-it-works");
});

test("section links are fragments on their page, not separate routes", () => {
  assert.equal(materialHref("petg"), "/materials#petg");
  assert.equal(solutionHref("prototyping"), "/solutions#prototyping");
  assert.equal(processStageHref("quote"), "/how-it-works#quote");
});
