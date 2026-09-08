import { PRODUCTS } from "./products";
import { PRICE_BRACKETS, categoryPath } from "./taxonomy";
import type {
  CatalogFacets,
  CatalogQuery,
  CatalogResult,
  FacetCounts,
  Product,
  SortValue,
} from "./types";

export const PAGE_SIZE = 12;

/** A price of 0 means the part is quoted from the customer's own geometry. */
export function isQuoteOnly(product: Product): boolean {
  return product.price === 0;
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return value === 0 ? "On quote" : INR.format(value);
}

/* ------------------------------------------------------------------ *
 * Predicates
 * ------------------------------------------------------------------ */

type Facet = "category" | "material" | "technology" | "color" | "availability" | "price";

function matchesPrice(product: Product, brackets: readonly string[]): boolean {
  if (brackets.length === 0) return true;
  if (isQuoteOnly(product)) return false;

  return brackets.some((value) => {
    const bracket = PRICE_BRACKETS.find((b) => b.value === value);
    if (!bracket) return false;
    if (product.price < bracket.min) return false;
    return bracket.max === undefined || product.price < bracket.max;
  });
}

function matchesFacet(product: Product, facet: Facet, selected: readonly string[]): boolean {
  if (selected.length === 0) return true;

  switch (facet) {
    case "category":
      // Selecting a parent matches everything filed beneath it.
      return categoryPath(product.category).some((value) => selected.includes(value));
    case "material":
      return selected.includes(product.material);
    case "technology":
      return selected.includes(product.technology);
    case "color":
      return selected.includes(product.color);
    case "availability":
      return selected.includes(product.availability);
    case "price":
      return matchesPrice(product, selected);
  }
}

function matchesSearch(product: Product, term: string): boolean {
  if (!term) return true;
  const haystack =
    `${product.name} ${product.summary} ${product.material} ${product.technology} ${product.color} ${product.category}`.toLowerCase();
  // Every whitespace-separated token must appear somewhere.
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

/** Applies every facet except the one named, which is how facet counts stay useful. */
function filter(query: CatalogQuery, except?: Facet): Product[] {
  const facets: Facet[] = [
    "category",
    "material",
    "technology",
    "color",
    "availability",
    "price",
  ];

  return PRODUCTS.filter((product) => {
    if (!matchesSearch(product, query.q)) return false;

    // The route scope always applies and is never excluded from facet counts —
    // counts on a category page describe that category.
    if (
      query.scopeCategory &&
      !categoryPath(product.category).includes(query.scopeCategory)
    ) {
      return false;
    }

    return facets.every(
      (facet) => facet === except || matchesFacet(product, facet, query[facet]),
    );
  });
}

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

function sortProducts(products: Product[], sort: SortValue): Product[] {
  const sorted = [...products];

  switch (sort) {
    case "price-asc":
    case "price-desc": {
      const direction = sort === "price-asc" ? 1 : -1;
      // Quote-only parts have no comparable price, so they always sit last.
      return sorted.sort((a, b) => {
        if (isQuoteOnly(a) !== isQuoteOnly(b)) return isQuoteOnly(a) ? 1 : -1;
        return (a.price - b.price) * direction;
      });
    }
    case "newest":
      // No timestamps in the local catalog; id order stands in for recency.
      return sorted.sort((a, b) => b.id.localeCompare(a.id));
    case "popularity":
      // No telemetry yet. In-stock parts surface first, then by price.
      return sorted.sort((a, b) => {
        const stock = Number(b.availability === "in-stock") - Number(a.availability === "in-stock");
        return stock !== 0 ? stock : a.price - b.price;
      });
    case "relevance":
    default:
      return sorted;
  }
}

/* ------------------------------------------------------------------ *
 * Facet counts
 * ------------------------------------------------------------------ */

function countBy(products: readonly Product[], pick: (p: Product) => readonly string[]): FacetCounts {
  const counts: FacetCounts = {};
  for (const product of products) {
    for (const value of pick(product)) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

function priceCounts(products: readonly Product[]): FacetCounts {
  const counts: FacetCounts = {};
  for (const bracket of PRICE_BRACKETS) {
    counts[bracket.value] = products.filter(
      (p) => matchesPrice(p, [bracket.value]),
    ).length;
  }
  return counts;
}

function buildFacets(query: CatalogQuery): CatalogFacets {
  return {
    // Each facet is counted against the results of every *other* facet, so the
    // numbers say what would happen if you added that filter.
    category: countBy(filter(query, "category"), (p) => categoryPath(p.category)),
    material: countBy(filter(query, "material"), (p) => [p.material]),
    technology: countBy(filter(query, "technology"), (p) => [p.technology]),
    color: countBy(filter(query, "color"), (p) => [p.color]),
    availability: countBy(filter(query, "availability"), (p) => [p.availability]),
    price: priceCounts(filter(query, "price")),
  };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * The single boundary between catalog data and the marketplace UI.
 *
 * Phase 14 swaps the local PRODUCTS import for a Payload query. As long as this
 * returns a CatalogResult, no component changes. Synchronous today; the call
 * sites already await it so it can become async without a refactor.
 */
export function queryCatalog(query: CatalogQuery): CatalogResult {
  const matched = sortProducts(filter(query), query.sort);

  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const start = (page - 1) * PAGE_SIZE;

  return {
    items: matched.slice(start, start + PAGE_SIZE),
    total,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
    facets: buildFacets(query),
  };
}

/** Total catalog size, for the shop landing copy. */
export function catalogSize(): number {
  return PRODUCTS.length;
}

/* ------------------------------------------------------------------ *
 * Product detail
 * ------------------------------------------------------------------ */

/**
 * Resolves one product by its browse category and slug.
 *
 * The category must match the product's own — /shop/lifestyle/precision-gear is
 * not a valid address for a mechanical part and returns undefined so the route
 * can 404 rather than serve the same product under two URLs.
 */
export function getProduct(
  browseCategory: string,
  slug: string,
): Product | undefined {
  return PRODUCTS.find(
    (product) => product.slug === slug && product.browseCategory === browseCategory,
  );
}

/**
 * Every valid category/slug pair, for generateStaticParams. With
 * dynamicParams disabled this doubles as the allowlist that makes unknown
 * products a routing-level 404.
 */
export function productParams(): { category: string; slug: string }[] {
  return PRODUCTS.map((product) => ({
    category: product.browseCategory,
    slug: product.slug,
  }));
}

/**
 * Related parts: nearest first.
 *
 * Same leaf category, then same browse category, then same material. Local and
 * deterministic — no recommendation engine, and the ordering is replaceable
 * without touching the UI.
 */
export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const others = PRODUCTS.filter((candidate) => candidate.id !== product.id);

  const score = (candidate: Product): number => {
    if (candidate.category === product.category) return 0;
    if (candidate.browseCategory === product.browseCategory) return 1;
    if (candidate.material === product.material) return 2;
    return 3;
  };

  return others
    .map((candidate) => ({ candidate, rank: score(candidate) }))
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/** Stable technical identifier derived from the product id, e.g. PART_00001. */
export function partId(product: Product): string {
  const digits = product.id.replace(/\D/g, "");
  return `PART_${digits.padStart(5, "0")}`;
}

