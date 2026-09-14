import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

import {
  CATALOG_CATEGORIES,
  CATALOG_ENTRIES,
  RETIRED_PRODUCT_IDS,
  RETIRED_SLUGS,
  VERIFIED_MODELS,
  type CatalogEntry,
} from "@/content/catalog";
import { analyzeModel } from "@/lib/models";
import { calculateCatalogQuote, calculateQuote } from "@/lib/pricing/calculateQuote";
import { productHref } from "@/lib/routes";

import { PRODUCTS } from "./products";
import { BROWSE_CATEGORIES } from "./taxonomy";
import type { Product } from "./types";
import { validateCatalog, validateProduct, type ValidationCode } from "./validation";

/**
 * The canonical catalog and the rules that guard it.
 *
 * Fixture products are built from a real, valid entry and changed in exactly
 * one way, so each test proves one rule rejects one defect.
 */

const spurEntry = CATALOG_ENTRIES.find((entry) => entry.product.id === "p-101");
assert.ok(spurEntry);
const VALID: Product = spurEntry.product;

function codes(product: Product): ValidationCode[] {
  return validateProduct(product).map((issue) => issue.code);
}

function entry(product: Partial<Product>, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return { ...spurEntry!, ...extra, product: { ...VALID, ...product } };
}

/* ------------------------------------------------------------------ *
 * The canonical catalog
 * ------------------------------------------------------------------ */

test("the canonical catalog validates with no issues", () => {
  const result = validateCatalog(CATALOG_ENTRIES);
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
});

test("every product intended for publication is published, and nothing else is", () => {
  const intended = CATALOG_ENTRIES.filter((e) => e.intent === "publish").map((e) => e.product.id);
  assert.deepEqual(PRODUCTS.map((product) => product.id), intended);
});

test("every published product passes validateProduct on its own", () => {
  for (const product of PRODUCTS) {
    assert.deepEqual(validateProduct(product), [], product.id);
  }
});

test("every published product records where its price came from and what is missing", () => {
  for (const item of CATALOG_ENTRIES) {
    assert.ok(item.priceBasis.length > 20, `${item.product.id} has no price basis`);
    if (item.product.approvalStatus !== "approved" || !item.product.image) {
      assert.ok(item.contentGaps.length > 0, `${item.product.id} hides its gaps`);
    }
  }
});

test("the catalog has no category without a product and no product without a category", () => {
  const result = validateCatalog(CATALOG_ENTRIES);
  assert.ok(!result.issues.some((issue) => issue.code === "empty-category" || issue.code === "orphan-product"));
  assert.ok(BROWSE_CATEGORIES.length > 0);
  for (const value of BROWSE_CATEGORIES) {
    assert.ok(PRODUCTS.some((product) => product.browseCategory === value), `${value} is empty`);
  }
});

/* ------------------------------------------------------------------ *
 * validateProduct — one rule each
 * ------------------------------------------------------------------ */

test("a missing name is rejected", () => {
  assert.ok(codes({ ...VALID, name: "" }).includes("missing-name"));
});

test("a slug that is not customer-facing is rejected", () => {
  for (const slug of ["payload_test", "SKU001", "Spur Gear", "spur--gear", ""]) {
    assert.ok(codes({ ...VALID, slug }).includes("invalid-slug"), slug);
  }
});

test("a slug that exposes the internal id is rejected", () => {
  assert.ok(codes({ ...VALID, slug: "p-101" }).includes("invalid-slug"));
});

test("test and development records are rejected", () => {
  for (const change of [
    { id: "SKU001" },
    { slug: "demo-product" },
    { name: "Paylaod Test" },
    { slug: "product-001" },
    { name: "Sample bracket" },
    { slug: "placeholder-part" },
  ]) {
    const found = codes({ ...VALID, ...change });
    assert.ok(
      found.includes("test-data") || found.includes("placeholder-id") || found.includes("retired-id"),
      JSON.stringify(change),
    );
  }
});

test("a retired pre-reset id or slug can never be reused", () => {
  assert.ok(codes({ ...VALID, id: "p-001" }).includes("retired-id"));
  assert.ok(codes({ ...VALID, slug: "precision-gear" }).includes("retired-slug"));
  assert.ok(RETIRED_PRODUCT_IDS.has("p-036") && RETIRED_PRODUCT_IDS.has("SKU001"));
});

test("a missing or unknown category is rejected", () => {
  assert.ok(codes({ ...VALID, category: "" }).includes("missing-category"));
  assert.ok(codes({ ...VALID, category: "brackets" }).includes("missing-category"));
});

test("a product filed in a non-leaf category, or under the wrong root, is rejected", () => {
  assert.ok(codes({ ...VALID, category: "mechanical" }).includes("category-not-leaf"));
  assert.ok(codes({ ...VALID, browseCategory: "automotive" }).includes("invalid-browse-category"));

  const tree = [
    ...CATALOG_CATEGORIES,
    { value: "components", label: "Components", description: "x", children: [{ value: "brackets", label: "Brackets", description: "x" }] },
  ];
  const mismatch = validateProduct({ ...VALID, category: "brackets" }, { categories: tree });
  assert.ok(mismatch.some((issue) => issue.code === "category-mismatch"));
});

test("an unknown material is rejected", () => {
  assert.ok(codes({ ...VALID, material: "carbon-fibre" as never }).includes("invalid-material"));
  assert.ok(codes({ ...VALID, materials: ["petg"] }).includes("invalid-material"));
});

test("a technology Reality 3D does not offer is rejected", () => {
  assert.ok(codes({ ...VALID, technology: "sls" }).includes("invalid-technology"));
});

test("physically impossible technology and material pairs are rejected", () => {
  // FDM + resin: resin is cured, not extruded.
  assert.ok(
    codes({ ...VALID, material: "resin", materials: ["resin"], colors: ["black"] }).includes(
      "incompatible-material-technology",
    ),
  );
  // SLA + filament: SLA is not an approved process (Stage 19.8), so it is refused outright.
  assert.ok(codes({ ...VALID, technology: "sla", qualityOptions: undefined }).includes("invalid-technology"));
  // A multi-material product where one of the offered materials cannot be printed.
  assert.ok(codes({ ...VALID, materials: ["pla", "resin"] }).includes("incompatible-material-technology"));
});

test("a colour the material is not offered in is rejected", () => {
  // Stage 19.8: PLA is offered in the approved black and white only.
  assert.ok(codes({ ...VALID, colors: ["black", "blue"] }).includes("color-not-offered"));
  assert.ok(codes({ ...VALID, colors: ["black", "orange"] }).includes("color-not-offered"));
  assert.ok(codes({ ...VALID, color: "carbon" }).includes("invalid-color"));
});

test("a quality option the configurator does not offer is rejected", () => {
  assert.ok(
    codes({ ...VALID, qualityOptions: [{ value: "ultra", label: "Ultra", layerHeight: "0.05 MM" }] }).includes(
      "invalid-quality",
    ),
  );
});

test("in stock is rejected because no stock records exist", () => {
  const issues = validateProduct({ ...VALID, availability: "in-stock" });
  assert.ok(issues.some((issue) => issue.code === "invalid-availability" && /stock records/.test(issue.message)));
});

test("negative, fractional and missing prices are rejected, as is a non-INR currency", () => {
  assert.ok(codes({ ...VALID, price: -1 }).includes("invalid-price"));
  assert.ok(codes({ ...VALID, price: 12.5 }).includes("invalid-price"));
  assert.ok(codes({ ...VALID, currency: "USD" as never }).includes("invalid-currency"));
});

test("price status must be stated, and quote-only must agree with a price of 0", () => {
  assert.ok(codes({ ...VALID, priceStatus: undefined }).includes("invalid-price-status"));
  assert.ok(codes({ ...VALID, priceStatus: "quote-only" }).includes("invalid-price-status"));
  assert.ok(codes({ ...VALID, price: 0, priceStatus: "provisional" }).includes("invalid-price-status"));
  assert.ok(!codes({ ...VALID, price: 0, priceStatus: "quote-only" }).includes("invalid-price-status"));
});

test("a product with neither an image nor a model is rejected", () => {
  assert.ok(codes({ ...VALID, model: undefined, image: undefined }).includes("missing-visual"));
  assert.ok(
    !codes({ ...VALID, model: undefined, image: { src: "/media/gear.jpg", alt: "Gear" } }).includes("missing-visual"),
  );
});

test("an unverified or mismatched 3D model reference is rejected", () => {
  assert.ok(codes({ ...VALID, model: { url: "/models/ghost.stl", format: "stl" } }).includes("invalid-model"));
  assert.ok(codes({ ...VALID, model: { url: "/models/spur-gear-24t.stl", format: "glb" } }).includes("invalid-model"));
  assert.ok(codes({ ...VALID, model: { url: "/models/cable-bracket.stl", format: "stl" } }).includes("invalid-model"));
});

test("unsupported technical and commercial claims are rejected", () => {
  for (const description of [
    "Held to ±0.1 mm.",
    "ISO 9001 certified.",
    "Tensile strength of 50 MPa.",
    "Heat deflection at 60 °C.",
    "Food-safe PLA.",
    "In stock and ships within 24 hours.",
    "Weighs 34 g.",
  ]) {
    assert.ok(codes({ ...VALID, description }).includes("unsupported-claim"), description);
  }
});

/* ------------------------------------------------------------------ *
 * validateCatalog
 * ------------------------------------------------------------------ */

test("duplicate ids and duplicate slugs are rejected", () => {
  const dupId = validateCatalog([entry({}), entry({ slug: "spur-gear-24t-black" })]);
  assert.ok(dupId.issues.some((issue) => issue.code === "duplicate-id"));

  const dupSlug = validateCatalog([entry({}), entry({ id: "p-199" })]);
  assert.ok(dupSlug.issues.some((issue) => issue.code === "duplicate-slug"));
});

test("an orphan product and an empty category both fail the catalog", () => {
  const orphan = validateCatalog([entry({ category: "brackets" })]);
  assert.ok(orphan.issues.some((issue) => issue.code === "orphan-product"));

  // Without the spacer, "spacers" has nothing filed in it.
  const empty = validateCatalog([entry({})]);
  assert.ok(empty.issues.some((issue) => issue.code === "empty-category" && issue.subject === "spacers"));
});

test("a test category name fails the catalog", () => {
  const tree = [{ ...CATALOG_CATEGORIES[0]!, children: [...(CATALOG_CATEGORIES[0]!.children ?? []), { value: "v-gears002", label: "test", description: "x" }] }];
  const result = validateCatalog(CATALOG_ENTRIES, tree);
  assert.ok(result.issues.some((issue) => issue.code === "test-data"));
});

test("an invalid draft is reported but does not block, and is never publishable", () => {
  const draft = entry({ id: "p-150", slug: "gear-draft", model: undefined }, { intent: "draft" });
  const result = validateCatalog([...CATALOG_ENTRIES, draft]);

  assert.equal(result.ok, true);
  assert.ok(!result.publishable.includes(draft));
  assert.ok(result.drafts.some((d) => d.entry === draft && d.issues.some((i) => i.code === "missing-visual")));
});

test("an invalid product intended for publication blocks the catalog", () => {
  const broken = entry({ id: "p-151", slug: "gear-broken", technology: "sls" });
  const result = validateCatalog([...CATALOG_ENTRIES, broken]);

  assert.equal(result.ok, false);
  assert.ok(!result.publishable.includes(broken));
});

/* ------------------------------------------------------------------ *
 * Ids, slugs and URLs
 * ------------------------------------------------------------------ */

test("product ids are stable application ids and URLs are built from slugs", () => {
  for (const product of PRODUCTS) {
    assert.match(product.id, /^p-\d{3,}$/);
    assert.equal(productHref(product), `/shop/${product.browseCategory}/${product.slug}`);
    assert.ok(!productHref(product).includes(product.id), `${product.id} leaks into its URL`);
  }
});

test("no source file outside the retirement record names a retired id or slug", () => {
  /*
   * Stale reference cleanup, enforced. Tests may mention retired ids to prove
   * they are refused, and the retirement list must name them; nothing else
   * should — not the homepage, solutions, fixtures, sitemap inputs or docs in src.
   */
  const src = join(process.cwd(), "src");
    // readiness.ts records the Stage 19 finding by name; it is history, not a reference.
  const allowed = new Set(["content/catalog/retired.ts", "lib/catalog/validation.ts", "lib/content/readiness.ts", "payload-types.ts"]);
  const ids = /["'`](p-0\d\d|SKU001)["'`]/;
  const slugs = [...RETIRED_SLUGS].filter((slug) => slug.includes("-") || slug.includes("_"));

  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "migrations") walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;

      const path = relative(src, full).split(sep).join("/");
      if (allowed.has(path)) continue;

      const text = readFileSync(full, "utf8");
      if (ids.test(text)) offenders.push(`${path}: retired id`);
      for (const slug of slugs) {
        if (new RegExp(`["'\`/]${slug}["'\`]`).test(text)) offenders.push(`${path}: ${slug}`);
      }
    }
  };
  walk(src);

  assert.deepEqual(offenders, []);
});

/* ------------------------------------------------------------------ *
 * Prices
 * ------------------------------------------------------------------ */

test("every catalog price is what the quote engine charges for the same selections", () => {
  for (const item of CATALOG_ENTRIES) {
    const { product } = item;
    const model = VERIFIED_MODELS.find((asset) => asset.url === product.model?.url);
    assert.ok(model, product.id);

    const quote = calculateCatalogQuote({
      material: product.material,
      quality: "standard",
      finish: "standard",
      quantity: model.partCount,
    });

    assert.equal(quote.status, "available");
    assert.equal(product.price, quote.status === "available" ? quote.quote.total : -1, product.id);
    assert.equal(product.priceStatus, "provisional", `${product.id} is priced by provisional rules`);
  }
});

test("the catalog quote and the custom-print quote agree for the same selections", () => {
  const selections = { material: "petg", quality: "precision", finish: "standard", quantity: 3 };
  const custom = calculateQuote({ ...selections, model: { name: "part.stl", extension: ".stl", sizeBytes: 10 } });
  const catalog = calculateCatalogQuote(selections);

  assert.equal(custom.status, "available");
  assert.equal(catalog.status, "available");
  assert.deepEqual(
    catalog.status === "available" ? catalog.quote : null,
    custom.status === "available" ? custom.quote : null,
  );
  assert.equal(calculateCatalogQuote({ ...selections, material: "carbon" }).status, "invalid");
});

/* ------------------------------------------------------------------ *
 * 3D models — parsed, not trusted
 * ------------------------------------------------------------------ */

function fileOf(url: string): Buffer {
  return readFileSync(join(process.cwd(), "public", url));
}

test("every verified STL exists, parses as a closed mesh and measures as recorded", async () => {
  for (const asset of VERIFIED_MODELS.filter((model) => model.format === "stl")) {
    const bytes = fileOf(asset.url);
    assert.equal(bytes.length, asset.sizeBytes, `${asset.url} size`);

    const analysis = await analyzeModel({ fileName: asset.url, bytes: new Uint8Array(bytes) });
    assert.equal(analysis.topology.topology, "closed", `${asset.url} is not a closed mesh`);
    assert.equal(analysis.topology.degenerateTriangles, 0);
    assert.equal(analysis.objectCount, asset.partCount);
    assert.ok(!analysis.warnings.some((warning) => warning.code === "non_finite_coordinates"));

    for (const axis of ["x", "y", "z"] as const) {
      assert.ok(
        Math.abs(analysis.boundingBox.size[axis] - asset.envelopeMm[axis]) < 0.05,
        `${asset.url} ${axis}: measured ${analysis.boundingBox.size[axis]}, recorded ${asset.envelopeMm[axis]}`,
      );
    }
  }
});

test("every verified GLB is valid glTF 2.0 with the recorded parts and envelope", () => {
  for (const asset of VERIFIED_MODELS.filter((model) => model.format === "glb")) {
    const bytes = fileOf(asset.url);
    assert.equal(bytes.length, asset.sizeBytes);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF");
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length, "declared length does not match the file");

    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as {
      nodes: { mesh?: number; matrix?: number[] }[];
      meshes: { primitives: { attributes: { POSITION: number } }[] }[];
      accessors: { min: number[]; max: number[] }[];
    };

    const parts = gltf.nodes.filter((node) => node.mesh !== undefined);
    assert.equal(parts.length, asset.partCount);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const node of parts) {
      const accessor = gltf.accessors[gltf.meshes[node.mesh!]!.primitives[0]!.attributes.POSITION]!;
      const offset = node.matrix ? [node.matrix[12]!, node.matrix[13]!, node.matrix[14]!] : [0, 0, 0];
      for (let axis = 0; axis < 3; axis += 1) {
        assert.ok(Number.isFinite(accessor.min[axis]) && Number.isFinite(accessor.max[axis]));
        min[axis] = Math.min(min[axis]!, accessor.min[axis]! + offset[axis]!);
        max[axis] = Math.max(max[axis]!, accessor.max[axis]! + offset[axis]!);
      }
    }

    const size = { x: max[0]! - min[0]!, y: max[1]! - min[1]!, z: max[2]! - min[2]! };
    for (const axis of ["x", "y", "z"] as const) {
      assert.ok(Math.abs(size[axis] - asset.envelopeMm[axis]) < 0.05, `${asset.url} ${axis}: ${size[axis]}`);
    }
  }
});

test("model dimensions stated in specifications match the measured model", () => {
  const spec = (product: Product, label: string) =>
    product.specifications?.find((row) => row.label === label)?.value;

  const spur = PRODUCTS.find((product) => product.id === "p-101")!;
  assert.equal(spec(spur, "Outside diameter"), "49.9 MM");
  assert.equal(spec(spur, "Face width"), "8 MM");

  const spacer = PRODUCTS.find((product) => product.id === "p-103")!;
  assert.equal(spec(spacer, "Length"), "34 MM");
  assert.equal(spec(spacer, "Across flats"), "19.05 MM");
});
