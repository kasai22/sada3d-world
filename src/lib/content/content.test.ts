import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS } from "@/lib/catalog/products";
import { BROWSE_CATEGORIES, categoryPath } from "@/lib/catalog/taxonomy";
import { toDomainCatalog, toDomainProduct } from "@/lib/catalog/payload-mapping";
import type { Product as PayloadProduct } from "@/payload-types";

import { planCategories, planMaterials, planProducts, validatePlan } from "./plan";
import { compareProducts, compareQueries, parityQueries } from "./verify";

/**
 * CMS content: the plan, the mapping and the parity check.
 *
 * All three are pure, which is deliberate — it is what lets the risky half of a
 * CMS migration be tested without a database. What cannot be tested here is
 * Payload actually reading and writing these rows; that needs `DATABASE_URL`
 * and is what `content:import` and `content:verify` are for.
 */

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

test("the plan holds together", () => {
  assert.deepEqual(validatePlan(), []);
});

test("every category in the taxonomy is planned exactly once", () => {
  const rows = planCategories();
  const values = rows.map((row) => row.value);

  assert.equal(new Set(values).size, values.length, "a category was planned twice");

  // Every category a product refers to, and every ancestor of it.
  for (const product of PRODUCTS) {
    for (const value of categoryPath(product.category)) {
      assert.ok(values.includes(value), `${value} is not in the plan`);
    }
  }
});

test("a parent is always planned before its children", () => {
  const seen = new Set<string>();

  for (const row of planCategories()) {
    if (row.parent) {
      assert.ok(
        seen.has(row.parent),
        `${row.value} is planned before its parent ${row.parent}`,
      );
    }
    seen.add(row.value);
  }
});

test("the category tree survives flattening", () => {
  const rows = planCategories();
  const byValue = new Map(rows.map((row) => [row.value, row]));

  // mechanical → gears, mechanical → spacers
  assert.equal(byValue.get("mechanical")?.parent, null);
  assert.equal(byValue.get("mechanical")?.depth, 0);
  assert.equal(byValue.get("gears")?.parent, "mechanical");
  assert.equal(byValue.get("gears")?.depth, 1);
  assert.equal(byValue.get("spacers")?.parent, "mechanical");
});

test("no pre-reset or operator test category is planned", () => {
  // Every one of these was in Payload or the old tree before the reset.
  const values = new Set(planCategories().map((row) => row.value));
  for (const stale of ["functional", "custom-products", "automotive", "lifestyle", "18% GST", "v-gears", "v-gears002"]) {
    assert.ok(!values.has(stale), `${stale} is still planned`);
  }
});

test("browse categories are the published roots, in rail order", () => {
  const rows = planCategories().filter((row) => row.isBrowse);

  assert.equal(rows.length, BROWSE_CATEGORIES.length);

  const ordered = [...rows]
    .sort((a, b) => a.browseOrder - b.browseOrder)
    .map((row) => row.value);
  assert.deepEqual(ordered, [...BROWSE_CATEGORIES]);

  for (const row of rows) {
    assert.equal(row.depth, 0, `${row.value} is a browse category but not a root`);
    assert.equal(row.status, "published");
  }
});

test("a category is published only when a publishable product sits beneath it", () => {
  for (const row of planCategories()) {
    const underneath = PRODUCTS.some((product) => categoryPath(product.category).includes(row.value));
    assert.equal(row.status, underneath ? "published" : "draft", row.value);
  }
});

test("every planned product carries the publication status validation gave it", () => {
  const published = new Set(PRODUCTS.map((product) => product.id));
  for (const row of planProducts()) {
    assert.equal(row.status, published.has(row.productId) ? "published" : "draft", row.productId);
  }
});

test("materials join the facet list to the homepage content", () => {
  const rows = planMaterials();

  const petg = rows.find((row) => row.value === "petg");
  assert.ok(petg);
  assert.equal(petg.name, "PETG");
  assert.equal(petg.code, "Glycol-modified PET");
  assert.ok(petg.description && petg.description.length > 0);
  assert.equal(petg.properties?.strength, 4);
  assert.ok(petg.applications.includes("Enclosures"));
  assert.ok(petg.swatches.length > 0);
  assert.deepEqual(petg.technologies, ["fdm"]);
  assert.ok(petg.bestFor.length > 0 && petg.avoidFor.length > 0);
  assert.equal(petg.seo.title, "PETG");

  assert.deepEqual(rows.find((row) => row.value === "resin")?.technologies, ["sla"]);
});

test("the price multiplier is not imported into the CMS", () => {
  /*
   * It is what a customer is charged by. `lib/pricing` owns it, and a CMS field
   * carrying it would put pricing behind an editorial UI.
   */
  const serialised = JSON.stringify(planMaterials());
  assert.ok(!serialised.includes("multiplier"), "a pricing multiplier reached the plan");
});

test("every product is planned with its stable identifier and slug", () => {
  const rows = planProducts();
  assert.ok(rows.length >= PRODUCTS.length);

  for (const product of PRODUCTS) {
    const row = rows.find((entry) => entry.productId === product.id);
    assert.ok(row, `${product.id} was not planned`);
    assert.equal(row.slug, product.slug);
    assert.equal(row.price, product.price);
    assert.equal(row.priceStatus, product.priceStatus);
  }
});

test("a product's default material is always among its offered materials", () => {
  for (const row of planProducts()) {
    assert.ok(
      row.materials.includes(row.material),
      `${row.productId} does not offer its own default material`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Mapping out of Payload
 * ------------------------------------------------------------------ */

const category = (value: string, id = 1) =>
  ({ id, value, name: value, updatedAt: "", createdAt: "" }) as never;

const material = (value: string, id = 10) =>
  ({ id, value, name: value.toUpperCase(), updatedAt: "", createdAt: "" }) as never;

function payloadProduct(overrides: Partial<PayloadProduct> = {}): PayloadProduct {
  return {
    id: 1,
    name: "Precision Gear",
    productId: "p-001",
    slug: "precision-gear",
    summary: "Spur gear, 24 teeth.",
    price: 399,
    currency: "INR",
    availability: "in-stock",
    category: category("gears", 1),
    browseCategory: category("mechanical", 2),
    material: material("pla"),
    technology: "fdm",
    color: "black",
    updatedAt: "",
    createdAt: "",
    ...overrides,
  } as PayloadProduct;
}

test("a complete document maps to a domain product", () => {
  const result = toDomainProduct(payloadProduct());
  assert.ok(result.ok);

  assert.equal(result.product.id, "p-001");
  assert.equal(result.product.category, "gears");
  assert.equal(result.product.browseCategory, "mechanical");
  assert.equal(result.product.material, "pla");
  assert.equal(result.product.currency, "INR");
});

test("a product whose category was deleted or unpublished is dropped, not half-built", () => {
  // An unresolved relationship arrives as a bare id rather than a document.
  const result = toDomainProduct(payloadProduct({ category: 99 }));

  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.failure.reason.includes("category"));
});

test("a product with an unknown material is refused rather than widening the domain", () => {
  const result = toDomainProduct(
    payloadProduct({ material: material("carbon-fibre") }),
  );

  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.failure.reason.includes("material"));
});

test("a product with no stable identifier is refused", () => {
  const result = toDomainProduct(payloadProduct({ productId: "" }));
  assert.equal(result.ok, false);
});

test("empty CMS arrays map to absent, not to empty arrays", () => {
  const result = toDomainProduct(
    payloadProduct({ applications: [], colors: [], specifications: [] }),
  );
  assert.ok(result.ok);

  assert.equal(result.product.applications, undefined);
  assert.equal(result.product.colors, undefined);
  assert.equal(result.product.specifications, undefined);
});

test("optional fields survive the round trip when present", () => {
  const result = toDomainProduct(
    payloadProduct({
      description: "A 24-tooth spur gear.",
      badge: "In stock",
      applications: [{ value: "Prototyping" }, { value: "Assemblies" }],
      colors: [{ value: "black" }, { value: "white" }],
      qualityOptions: [
        { value: "standard", label: "Standard", layerHeight: "0.20 MM" },
      ],
      specifications: [{ label: "Teeth", value: "24" }],
      materialNotes: [{ value: "Matte finish" }],
      materials: [material("pla"), material("petg", 11)],
      model: { url: "/models/precision-gear.stl", format: "stl" },
    }),
  );
  assert.ok(result.ok);

  assert.deepEqual(result.product.applications, ["Prototyping", "Assemblies"]);
  assert.deepEqual(result.product.colors, ["black", "white"]);
  assert.equal(result.product.qualityOptions?.[0]?.layerHeight, "0.20 MM");
  assert.deepEqual(result.product.specifications, [{ label: "Teeth", value: "24" }]);
  assert.deepEqual(result.product.materialNotes, ["Matte finish"]);
  assert.deepEqual([...(result.product.materials ?? [])], ["pla", "petg"]);
  assert.equal(result.product.model?.format, "stl");
});

test("one broken product does not take the catalog down with it", () => {
  const { products, failures } = toDomainCatalog([
    payloadProduct(),
    payloadProduct({ id: 2, productId: "p-002", slug: "broken", category: 99 }),
    payloadProduct({ id: 3, productId: "p-003", slug: "planetary-carrier" }),
  ]);

  assert.equal(products.length, 2);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.productId, "p-002");
});

/* ------------------------------------------------------------------ *
 * Parity
 * ------------------------------------------------------------------ */

test("the canonical catalog is served in catalog order, as the Payload source serves it", () => {
  const ids = PRODUCTS.map((product) => product.id);
  assert.deepEqual(ids, [...ids].sort());

  // Payload returns newest-first; mapping must restore catalog order.
  const reversed = [...PRODUCTS].reverse();
  assert.notDeepEqual(compareQueries(PRODUCTS, reversed), []);
});

test("a catalog compared against itself has no differences", () => {
  const { missing, extra, differences } = compareProducts(PRODUCTS, PRODUCTS);

  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);
  assert.deepEqual(differences, []);
  assert.deepEqual(compareQueries(PRODUCTS, PRODUCTS), []);
});

test("a dropped field is caught by the comparison", () => {
  const [first, ...rest] = PRODUCTS;
  assert.ok(first);

  // Exactly the failure an import bug produces: everything present but one
  // field lost in translation.
  const damaged = [{ ...first, qualityOptions: undefined }, ...rest];
  const { differences } = compareProducts(PRODUCTS, damaged);

  assert.ok(differences.some((d) => d.field === "qualityOptions"));
});

test("a missing product is caught, and so is an unexpected one", () => {
  const withoutFirst = PRODUCTS.slice(1);
  assert.deepEqual(compareProducts(PRODUCTS, withoutFirst).missing, [PRODUCTS[0]?.id]);

  const first = PRODUCTS[0];
  assert.ok(first);
  const withExtra = [...PRODUCTS, { ...first, id: "p-999", slug: "ghost" }];
  assert.deepEqual(compareProducts(PRODUCTS, withExtra).extra, ["p-999"]);
});

test("a changed price is caught by the query comparison, not only field by field", () => {
  const [first, ...rest] = PRODUCTS;
  assert.ok(first);

  // A price change moves a product between brackets, so the facet counts differ.
  const repriced = [{ ...first, price: first.price + 5000 }, ...rest];
  const differences = compareQueries(PRODUCTS, repriced);

  assert.ok(differences.length > 0, "a repriced product produced no query difference");
});

test("the parity sweep exercises every facet, sort and page", () => {
  const queries = parityQueries();

  // Stage 19.8: fewer facet values exist (three materials, one technology).
  assert.ok(queries.length > 15);
  assert.ok(queries.some((q) => q.scopeCategory !== undefined));
  assert.ok(queries.some((q) => q.material.length > 0));
  assert.ok(queries.some((q) => q.price.length > 0));
  assert.ok(queries.some((q) => q.sort === "price-asc"));
  assert.ok(queries.some((q) => q.q !== ""));
  assert.ok(queries.some((q) => q.page > 1));
});
