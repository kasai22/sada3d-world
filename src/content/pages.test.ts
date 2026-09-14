import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTS } from "@/lib/catalog/products";
import {
  BROWSE_CATEGORIES,
  COLORS,
  MATERIALS as MATERIAL_FACETS,
  TECHNOLOGIES,
} from "@/lib/catalog/taxonomy";
import {
  FINISH_OPTIONS,
  MATERIAL_OPTIONS,
  QUALITY_OPTIONS,
} from "@/lib/custom-print/options";

import { CAPABILITY_METRICS, TECHNOLOGIES as HOME_TECHNOLOGIES } from "./home";
import { HOW_IT_WORKS_PAGE, PROCESS_STAGES } from "./how-it-works";
import { MATERIALS, MATERIALS_PAGE } from "./materials";
import { published, type InformationalPage } from "./pages";
import { SOLUTIONS, SOLUTIONS_PAGE } from "./solutions";

const PAGES: readonly InformationalPage[] = [
  MATERIALS_PAGE,
  SOLUTIONS_PAGE,
  HOW_IT_WORKS_PAGE,
];

/* ------------------------------------------------------------------ *
 * Publication state
 * ------------------------------------------------------------------ */

test("draft entries never reach a page", () => {
  const items = [
    { status: "published" as const, value: "a" },
    { status: "draft" as const, value: "b" },
    { status: "published" as const, value: "c" },
  ];

  assert.deepEqual(
    published(items).map((entry) => entry.value),
    ["a", "c"],
  );
});

test("published() is the only gate, so an unknown state is not published", () => {
  // Defensive: `status` is a union today, and the CMS will one day supply it as
  // a string from a database column. A value nobody anticipated must be hidden
  // rather than shown.
  const items = [{ status: "archived" as unknown as "published", value: "x" }];

  assert.deepEqual(published(items), []);
});

test("every page these routes render is itself published", () => {
  for (const page of PAGES) {
    assert.equal(page.status, "published", `${page.slug} is not published`);
  }
});

test("each page has at least one published entry to render", () => {
  assert.ok(published(MATERIALS).length > 0);
  assert.ok(published(SOLUTIONS).length > 0);
  assert.ok(published(PROCESS_STAGES).length > 0);
});

/* ------------------------------------------------------------------ *
 * SEO
 * ------------------------------------------------------------------ */

test("every page states a title, a description and a canonical", () => {
  for (const { slug, seo } of PAGES) {
    assert.ok(seo.title.length > 0, `${slug} has no title`);
    assert.ok(seo.description.length > 0, `${slug} has no description`);

    // Long enough to say something, short enough not to be truncated to
    // nonsense in a result list.
    assert.ok(
      seo.description.length >= 60 && seo.description.length <= 200,
      `${slug} description is ${seo.description.length} characters`,
    );

    assert.ok(seo.path.startsWith("/"), `${slug} canonical is not a path`);
    assert.equal(seo.path, `/${slug}`, `${slug} canonical does not match its route`);
  }
});

test("the three new pages are indexable", () => {
  for (const page of PAGES) {
    assert.equal(page.seo.index, true, `${page.slug} is excluded from the index`);
  }
});

test("no two pages claim the same canonical", () => {
  const paths = PAGES.map((page) => page.seo.path);
  assert.equal(new Set(paths).size, paths.length);
});

test("every page has exactly one h1's worth of title", () => {
  for (const page of PAGES) {
    assert.ok(page.intro.title.length > 0, `${page.slug} has no heading`);
    assert.ok(page.intro.lead.length > 0, `${page.slug} has no lead`);
  }
});

/* ------------------------------------------------------------------ *
 * Materials — content matched to the domain
 * ------------------------------------------------------------------ */

test("every material is one the manufacturing domain knows", () => {
  const known = new Set<string>(MATERIAL_FACETS.map((facet) => facet.value));

  for (const material of published(MATERIALS)) {
    assert.ok(
      known.has(material.value),
      `"${material.value}" is not a material the catalog or the quote engine narrows against`,
    );
  }
});

test("the material page describes every material the configurator offers", () => {
  const described = new Set<string>(
    published(MATERIALS).map((material) => material.value),
  );

  for (const option of MATERIAL_OPTIONS) {
    assert.ok(
      described.has(option.value),
      `${option.value} can be ordered and is not described on /materials`,
    );
  }
});

test("every colour a material claims is a real colour", () => {
  const known = new Set(COLORS.map((color) => color.value));

  for (const material of MATERIALS) {
    assert.ok(material.colors.length > 0, `${material.value} lists no colours`);

    for (const color of material.colors) {
      assert.ok(
        known.has(color),
        `${material.value} claims colour "${color}", which is not in the taxonomy`,
      );
    }
  }
});

test("every colour a catalog part is actually made in is offered by its material", () => {
  /*
   * The join that makes the colour lists real rather than decorative. A part in
   * graphite PLA and a materials page that does not offer PLA in graphite are
   * two statements about the same thing, and one of them is wrong.
   */
  for (const product of PRODUCTS) {
    const material = MATERIALS.find((entry) => entry.value === product.material);
    assert.ok(material, `${product.id} uses an undescribed material`);

    for (const color of [product.color, ...(product.colors ?? [])]) {
      assert.ok(
        material.colors.includes(color),
        `${product.id} is offered in ${color} ${material.value}, which /materials does not list`,
      );
    }
  }
});

test("material property ratings are relative scales, not measurements", () => {
  for (const material of MATERIALS) {
    for (const [name, rating] of Object.entries(material.properties)) {
      assert.ok(
        Number.isInteger(rating) && rating >= 1 && rating <= 5,
        `${material.value}.${name} is ${rating}, which is not a 1–5 rating`,
      );
    }
  }
});

test("no material states an engineering figure the repository cannot support", () => {
  /*
   * The rule the file header sets, enforced. A tensile strength, a heat
   * deflection temperature or a tolerance on this page is a number an engineer
   * would design against, and there is no datasheet behind any of them.
   */
  const forbidden = [
    /\bMPa\b/i,
    /\bGPa\b/i,
    /\bg\/cm/i,
    /tensile/i,
    /\bshore\s/i,
    /±\s*\d/,
    /\bISO\s*\d/i,
    /\bASTM\b/i,
    /\bRoHS\b/i,
    /\bUL\s*94\b/i,
    /\d+\s*°\s*C/i,
  ];

  const prose = MATERIALS.flatMap((material) => [
    material.description,
    ...material.bestFor,
    ...material.avoidFor,
    ...material.applications,
  ]);

  for (const line of prose) {
    for (const pattern of forbidden) {
      assert.ok(
        !pattern.test(line),
        `material copy states an unsupported technical value: "${line}"`,
      );
    }
  }
});

test("a material says both what it is for and what it is not for", () => {
  for (const material of MATERIALS) {
    assert.ok(material.bestFor.length > 0, `${material.value} has no "choose it for"`);
    assert.ok(
      material.avoidFor.length > 0,
      `${material.value} has no counterweight, so every material reads as correct`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Solutions — backed by the catalog
 * ------------------------------------------------------------------ */

test("every catalog-backed solution points at a browse category that has a page", () => {
  for (const solution of published(SOLUTIONS)) {
    if (!solution.browseCategory) continue;
    assert.ok(
      BROWSE_CATEGORIES.includes(solution.browseCategory),
      `solution "${solution.name}" points at "${solution.browseCategory}", which has no /shop page`,
    );
  }
});

test("every catalog-backed solution has real parts behind it", () => {
  for (const solution of published(SOLUTIONS)) {
    if (!solution.browseCategory) continue;
    const count = PRODUCTS.filter(
      (product) => product.browseCategory === solution.browseCategory,
    ).length;

    assert.ok(
      count > 0,
      `solution "${solution.name}" describes work Reality 3D has no published parts for`,
    );
  }
});

test("an editorial solution is served by custom print and claims no catalog parts", () => {
  /*
   * A solution with no browse category is backed by the custom-print path, so
   * its primary action has to be the upload. One that said "browse" would send
   * the reader to a catalog it has just declined to name.
   */
  const editorial = published(SOLUTIONS).filter((solution) => !solution.browseCategory);
  assert.ok(editorial.length > 0);

  for (const solution of editorial) {
    assert.equal(solution.primaryAction, "custom", `${solution.name} has no category to browse`);
  }
});

test("no two solutions claim the same anchor", () => {
  const values = SOLUTIONS.map((solution) => solution.value);
  assert.equal(new Set(values).size, values.length);
});

test("each solution commits to one primary next step", () => {
  for (const solution of published(SOLUTIONS)) {
    assert.ok(
      solution.primaryAction === "browse" || solution.primaryAction === "custom",
      `solution "${solution.name}" has no primary action`,
    );
    assert.ok(solution.problem.length > 0);
    assert.ok(solution.suitableParts.length > 0);
  }
});

/* ------------------------------------------------------------------ *
 * How it works — stages that exist
 * ------------------------------------------------------------------ */

test("every process stage names who performs it", () => {
  for (const stage of published(PROCESS_STAGES)) {
    assert.ok(
      ["customer", "system", "sada"].includes(stage.actor),
      `stage "${stage.name}" has no actor`,
    );
  }
});

test("manufacturing is never presented as automated", () => {
  /*
   * The one claim this page could most easily overstate. Nothing in the product
   * decides on its own that a part can be made, so the manufacturing and
   * quality stages must be attributed to people.
   */
  const byValue = new Map(PROCESS_STAGES.map((stage) => [stage.value, stage]));

  assert.equal(byValue.get("manufacture")?.actor, "sada");
  assert.equal(byValue.get("quality")?.actor, "sada");
  assert.equal(byValue.get("ship")?.actor, "sada");
});

test("the stages that really are automated are marked so", () => {
  const byValue = new Map(PROCESS_STAGES.map((stage) => [stage.value, stage]));

  // Geometry analysis and quote calculation both run without anyone in the loop.
  assert.equal(byValue.get("validate")?.actor, "system");
  assert.equal(byValue.get("quote")?.actor, "system");
});

test("stages are numbered in order, with no gaps", () => {
  const stages = published(PROCESS_STAGES);

  stages.forEach((stage, index) => {
    assert.equal(
      stage.index,
      String(index + 1).padStart(2, "0"),
      `stage "${stage.name}" is numbered ${stage.index}`,
    );
  });
});

test("the limits a customer would otherwise meet late are stated on the page", () => {
  const byValue = new Map(PROCESS_STAGES.map((stage) => [stage.value, stage]));

  // Payment is not live, quotes are provisional, and STEP is not analysed
  // automatically. Each is a real limit of the current implementation and each
  // must be visible at the stage it applies to.
  assert.match(byValue.get("order")?.caveat ?? "", /payment is not live/i);
  assert.match(byValue.get("quote")?.caveat ?? "", /provisional/i);
  assert.match(byValue.get("validate")?.caveat ?? "", /STEP/);
});

/* ------------------------------------------------------------------ *
 * Homepage claims
 * ------------------------------------------------------------------ */

test("every capability figure is derived from something the software enforces", () => {
  const values = CAPABILITY_METRICS.map((metric) => metric.value);

  assert.ok(values.includes(String(MATERIAL_OPTIONS.length)));
  assert.ok(values.includes(String(FINISH_OPTIONS.length)));

  // The finest layer height shown must be one the configurator will accept.
  const offered = QUALITY_OPTIONS.map((option) => option.layerHeight);
  const finest = values.find((value) => /MM$/.test(value));
  assert.ok(
    finest && offered.includes(finest),
    `the homepage shows "${finest}" as its finest layer height, which is not on offer`,
  );
});

test("the homepage claims no tolerance", () => {
  /*
   * Removed in Stage 19 and kept removed. Nothing in this repository measures a
   * produced part, and a tolerance is the number an engineering customer trusts
   * most.
   */
  const prose = CAPABILITY_METRICS.flatMap((metric) => [metric.value, metric.label]);

  for (const line of prose) {
    assert.ok(!/±/.test(line), `the homepage states a tolerance: "${line}"`);
    assert.ok(!/toleranc/i.test(line), `the homepage states a tolerance: "${line}"`);
  }
});

test("the homepage advertises only technologies the storefront can filter on", () => {
  const offered = new Set(TECHNOLOGIES.map((technology) => technology.label));

  for (const technology of HOME_TECHNOLOGIES) {
    assert.ok(
      offered.has(technology.code),
      `the homepage advertises ${technology.code}, which the catalog does not offer`,
    );
  }
});

test("no advertised technology is without a material that can be printed with it", () => {
  /*
   * The check that caught SLS. A technology with no material behind it is a
   * capability claim with nothing under it, however confidently the homepage
   * states it.
   *
   * Content reset: asked of the materials rather than the catalog parts. The
   * catalog is small and all FDM, but SLA is a real, orderable capability —
   * resin is offered by the custom-print configurator — so the question is
   * whether a material that is actually offered is printed with it.
   */
  const orderable = new Set(MATERIAL_OPTIONS.map((option) => option.value));

  for (const technology of HOME_TECHNOLOGIES) {
    const label = technology.code.toLowerCase();
    const backed = MATERIALS.some(
      (material) =>
        orderable.has(material.value) &&
        (material.technologies as readonly string[]).includes(label),
    );

    assert.ok(backed, `${technology.code} is advertised and no offered material is printed with it`);
  }
});

test("a material's colours are exactly the colours the configurator offers for it", () => {
  /*
   * Content reset: the materials page listed five PLA colours where four could
   * be ordered. Colours on /materials, colours a catalog part may offer, and
   * colours custom print will accept are now one list.
   */
  for (const option of MATERIAL_OPTIONS) {
    const material = MATERIALS.find((entry) => entry.value === option.value);
    assert.ok(material, `${option.value} has no material record`);

    const configured = option.colors
      .map((hex) => COLORS.find((color) => color.hex.toLowerCase() === hex.toLowerCase())?.value)
      .sort();

    assert.deepEqual([...material.colors].sort(), configured, `${option.value} colours have drifted`);
  }
});

test("every material names the processes it is printed with, and no others exist", () => {
  const offered = new Set(TECHNOLOGIES.map((technology) => technology.value));

  for (const material of published(MATERIALS)) {
    assert.ok(material.technologies.length > 0, `${material.value} names no technology`);
    for (const technology of material.technologies) {
      assert.ok(offered.has(technology), `${material.value} claims ${technology}, which is not offered`);
    }
  }
});

test("no catalog part claims a technology the storefront does not offer", () => {
  const offered = new Set(TECHNOLOGIES.map((technology) => technology.value));

  for (const product of PRODUCTS) {
    assert.ok(
      offered.has(product.technology),
      `${product.id} claims "${product.technology}", which is not offered`,
    );
  }
});

test("only approved materials are published on /materials (Stage 19.8)", () => {
  assert.deepEqual(
    published(MATERIALS).map((material) => material.value).sort(),
    ["petg", "pla", "tpu"],
  );
  for (const material of published(MATERIALS)) {
    assert.deepEqual([...material.colors].sort(), ["black", "white"], material.value);
    assert.deepEqual([...material.technologies], ["fdm"], material.value);
  }
});
