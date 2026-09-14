import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { published } from "@/content/pages";
import { SOLUTIONS } from "@/content/solutions";
import { FOOTER_COLUMNS, PRIMARY_NAV } from "@/lib/navigation";
import { ROUTES, categoryHref, productHref } from "@/lib/routes";

import { selectFeatured } from "./featured";
import { PRODUCTS } from "./products";
import { BROWSE_CATEGORIES } from "./taxonomy";

/**
 * The internal-link crawl.
 *
 * ── What this replaces ───────────────────────────────────────────────────
 *
 * Stage 19 began with five dead internal links in the storefront's own chrome:
 * three header destinations that did not exist, one footer category with no
 * page, and every featured product on the homepage. All five were visible in
 * the source and none was visible to the test suite, because a link's validity
 * is a fact about the *route table*, and nothing here could see the route table.
 *
 * So this test builds one. It walks `src/app` for `page.tsx` files, turns the
 * directory tree into route patterns exactly as the router does — dropping
 * `(group)` segments, keeping `[param]` ones — and then resolves every internal
 * destination the storefront can produce against it.
 *
 * ── Why a static crawl and not a browser ─────────────────────────────────
 *
 * Because this has to run in `npm test`, on every change, with no server and no
 * browser. A Playwright crawl is a better *end-to-end* check and is explicitly
 * out of scope for this stage; this is the check that fails in CI a second
 * after someone writes the wrong href, which is when it is cheapest to fix.
 *
 * Its limit is worth stating plainly: it resolves paths, not responses. It
 * proves a route exists and that a dynamic segment is on the allowlist the
 * route generates from. It does not prove the page renders — see the build.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..");
const app = join(src, "app");

/* ------------------------------------------------------------------ *
 * The route table, read from the filesystem
 * ------------------------------------------------------------------ */

/** Every route pattern the app router serves, e.g. "/shop/[category]". */
function routePatterns(): string[] {
  const patterns: string[] = [];

  const walk = (directory: string, segments: string[]) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    const hasPage = entries.some(
      (entry) => entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name),
    );
    if (hasPage) patterns.push(`/${segments.join("/")}`);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const name = entry.name;

      // Private folders are not routes at all.
      if (name.startsWith("_")) continue;

      // Route groups and parallel routes contribute no URL segment.
      const transparent = name.startsWith("(") || name.startsWith("@");

      walk(
        join(directory, name),
        transparent ? segments : [...segments, name],
      );
    }
  };

  walk(app, []);
  return patterns;
}

const PATTERNS = routePatterns();

/**
 * Whether a path resolves, and to what.
 *
 * Dynamic segments are not waved through. `/shop/[category]` and
 * `/shop/[category]/[slug]` are both generated with `dynamicParams = false`, so
 * their params are an allowlist rather than a wildcard — which is the whole
 * reason `/shop/functional` and `/shop/precision-gear` were 404s while looking
 * like perfectly ordinary links.
 */
function resolves(path: string): boolean {
  const segments = path.split("/").filter(Boolean);

  // The catalog's own allowlists, checked before the generic patterns.
  if (segments[0] === "shop") {
    if (segments.length === 1) return true;
    if (segments.length === 2) return BROWSE_CATEGORIES.includes(segments[1]!);
    if (segments.length === 3) {
      return PRODUCTS.some(
        (product) =>
          product.browseCategory === segments[1] && product.slug === segments[2],
      );
    }
    return false;
  }

  return PATTERNS.some((pattern) => {
    const parts = pattern.split("/").filter(Boolean);

    // A catch-all absorbs the rest of the path.
    const catchAll = parts.findIndex((part) => part.startsWith("[..."));
    if (catchAll !== -1) {
      return (
        segments.length >= catchAll &&
        parts
          .slice(0, catchAll)
          .every((part, index) => part === segments[index] || part.startsWith("["))
      );
    }

    // An optional catch-all also matches its own parent path.
    if (parts.length !== segments.length) return false;

    return parts.every(
      (part, index) => part.startsWith("[") || part === segments[index],
    );
  });
}

/** Strips the query and fragment; a link's route is the path alone. */
function pathOf(href: string): string {
  return href.split("#")[0]!.split("?")[0]!;
}

function assertResolves(href: string, source: string) {
  assert.ok(
    resolves(pathOf(href)),
    `${source}: "${href}" does not resolve to any route`,
  );
}

/* ------------------------------------------------------------------ *
 * The route table itself
 * ------------------------------------------------------------------ */

test("the three pages Stage 19 added exist as routes", () => {
  for (const path of ["/materials", "/solutions", "/how-it-works"]) {
    assert.ok(
      PATTERNS.includes(path),
      `${path} is linked from the header and has no page.tsx`,
    );
  }
});

test("the public routes the storefront is navigated by all exist", () => {
  for (const path of [
    "/",
    "/shop",
    "/shop/[category]",
    "/shop/[category]/[slug]",
    "/custom-print",
    "/materials",
    "/solutions",
    "/how-it-works",
    "/cart",
    "/checkout",
    "/orders",
  ]) {
    assert.ok(PATTERNS.includes(path), `${path} is missing from the route table`);
  }
});

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

test("every header link resolves", () => {
  for (const item of PRIMARY_NAV) {
    assertResolves(item.href, `header "${item.label}"`);
  }
});

test("the header offers all five primary destinations", () => {
  assert.deepEqual(
    PRIMARY_NAV.map((item) => item.href),
    [
      ROUTES.shop,
      ROUTES.customPrint,
      ROUTES.materials,
      ROUTES.solutions,
      ROUTES.howItWorks,
    ],
  );
});

test("every footer link resolves", () => {
  for (const column of FOOTER_COLUMNS) {
    for (const link of column.links) {
      assertResolves(link.href, `footer ${column.title} / "${link.label}"`);
    }
  }
});

test("the footer no longer links to a category with no page", () => {
  // The specific dead link this stage found. /shop/functional is a taxonomy
  // node, not a route.
  const hrefs = FOOTER_COLUMNS.flatMap((column) =>
    column.links.map((link) => link.href),
  );

  assert.ok(!hrefs.includes("/shop/functional"));
});

/* ------------------------------------------------------------------ *
 * Product and category links
 * ------------------------------------------------------------------ */

test("every product's canonical URL resolves", () => {
  for (const product of PRODUCTS) {
    assertResolves(productHref(product), product.id);
  }
});

test("every browse category resolves", () => {
  for (const category of BROWSE_CATEGORIES) {
    assertResolves(categoryHref(category), `category rail "${category}"`);
  }
});

test("no featured product points at a 404", () => {
  /*
   * Content reset: the featured grid only renders products with an approved
   * image, and none has one yet, so it currently renders nothing. The URLs are
   * still checked for every referenced product — they are what the grid will
   * link to the moment an image is attached.
   */
  // Stage 19.6: featuring is a flag, so every product that could be featured is
  // checked — the moment one is approved and flagged, this is its URL.
  const { products } = selectFeatured(PRODUCTS.map((product) => ({ ...product, featured: true })));

  for (const product of [...products, ...PRODUCTS]) {
    assertResolves(productHref(product), `featured ${product.id}`);
  }
});

test("the two-segment product URL that shipped is genuinely unroutable", () => {
  /*
   * Guards the guard. If `/shop/precision-gear` ever started resolving — a
   * browse category called "precision-gear", say — this crawl would go quiet
   * about exactly the defect it was written for.
   */
  assert.equal(resolves("/shop/precision-gear"), false);
  assert.equal(resolves("/shop/functional"), false);
});

test("a solution only sends people to a category that resolves", () => {
  for (const solution of published(SOLUTIONS)) {
    // Editorial solutions link custom print only; see content/solutions.ts.
    if (!solution.browseCategory) continue;
    assertResolves(
      categoryHref(solution.browseCategory),
      `solution "${solution.name}"`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * The source sweep
 * ------------------------------------------------------------------ */

/** Every `.ts`/`.tsx` file under a directory. */
function sourceFiles(root: string): string[] {
  const files: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
        files.push(full);
    }
  };

  walk(root);
  return files;
}

/**
 * Customer-facing source. The ops console and the API are excluded: neither is
 * part of the storefront, and /ops has its own not-found handling.
 */
const STOREFRONT = [
  join(app, "(site)"),
  join(src, "components"),
  join(src, "content"),
];

test("no component builds a product URL by hand", () => {
  /*
   * The rule Phase 7 exists to enforce, checked as a rule rather than as six
   * corrected call sites. `/shop/${...}` in any file is a URL assembled outside
   * `lib/routes`, and assembling one outside `lib/routes` is how the homepage
   * came to build an address the router does not serve.
   */
  const offenders: string[] = [];

  for (const root of [join(src, "app"), join(src, "components"), join(src, "content")]) {
    for (const file of sourceFiles(root)) {
      const contents = readFileSync(file, "utf8");
      if (contents.includes("`/shop/${") || contents.includes('"/shop/" +')) {
        offenders.push(relative(src, file).split(sep).join("/"));
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these build a shop URL by hand instead of using lib/routes: ${offenders.join(", ")}`,
  );
});

test("every literal internal link in the storefront resolves", () => {
  /*
   * The crawl proper. Literal `href="/..."` strings are the ones no helper and
   * no type can vouch for — someone typed a path — so every one of them is
   * resolved against the route table.
   *
   * Non-literal hrefs (`href={productHref(product)}`) are not read here. They
   * are covered by the helper's own tests and by the per-product assertions
   * above, which is stronger than regexing an expression out of source.
   */
  const broken: string[] = [];

  for (const root of STOREFRONT) {
    for (const file of sourceFiles(root)) {
      const contents = readFileSync(file, "utf8");

      for (const match of contents.matchAll(/href="(\/[^"]*)"/g)) {
        const href = match[1]!;

        // Fragment-only and protocol-relative links are not routes.
        if (href.startsWith("//")) continue;
        if (!resolves(pathOf(href))) {
          broken.push(`${relative(src, file).split(sep).join("/")} → ${href}`);
        }
      }
    }
  }

  assert.deepEqual(broken, [], `dead internal links:\n${broken.join("\n")}`);
});

/* ------------------------------------------------------------------ *
 * The sitemap
 * ------------------------------------------------------------------ */

test("every URL in the sitemap resolves", async () => {
  /*
   * A sitemap is a list of URLs handed straight to a crawler, so a dead entry
   * is a 404 reported to Google rather than one a visitor stumbles into. It is
   * built from the same helpers the pages link with, and this proves the result
   * of that.
   */
  const broken: string[] = [];

  for (const entry of await sitemap()) {
    const { pathname } = new URL(entry.url);
    if (!resolves(pathname)) broken.push(entry.url);
  }

  assert.deepEqual(broken, [], `dead sitemap entries: ${broken.join(", ")}`);
});

test("the sitemap lists the three pages Stage 19 added", async () => {
  const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);

  for (const path of [ROUTES.materials, ROUTES.solutions, ROUTES.howItWorks]) {
    assert.ok(paths.includes(path), `${path} is not in the sitemap`);
  }
});

test("the sitemap lists every product and every browse category", async () => {
  const paths = new Set((await sitemap()).map((entry) => new URL(entry.url).pathname));

  for (const product of PRODUCTS) {
    assert.ok(paths.has(productHref(product)), `${product.id} is not in the sitemap`);
  }

  for (const category of BROWSE_CATEGORIES) {
    assert.ok(paths.has(categoryHref(category)), `${category} is not in the sitemap`);
  }
});

test("the sitemap lists nothing that is behind an identity", async () => {
  const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);

  for (const path of paths) {
    for (const prefix of ["/account", "/cart", "/checkout", "/orders", "/ops", "/admin", "/api"]) {
      assert.ok(
        !path.startsWith(prefix),
        `the sitemap offers ${path} to crawlers, and it is not public content`,
      );
    }
  }
});

test("robots disallows every private surface and points at the sitemap", async () => {
  const { rules, sitemap: sitemapUrl } = robots();
  const disallow = Array.isArray(rules) ? [] : [rules.disallow ?? []].flat();

  for (const prefix of ["/ops", "/account", "/cart", "/checkout", "/orders", "/admin"]) {
    assert.ok(
      disallow.some((entry) => entry.startsWith(prefix)),
      `robots.txt does not disallow ${prefix}`,
    );
  }

  assert.ok(String(sitemapUrl).endsWith("/sitemap.xml"));
});

test("robots does not block the pages the header links to", async () => {
  const { rules } = robots();
  const disallow = Array.isArray(rules) ? [] : [rules.disallow ?? []].flat();

  for (const item of PRIMARY_NAV) {
    assert.ok(
      !disallow.some((entry) => item.href.startsWith(entry)),
      `robots.txt blocks "${item.label}" (${item.href}), which is in the main navigation`,
    );
  }
});
