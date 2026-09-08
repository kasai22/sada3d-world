import type { CatalogQuery, SortValue } from "./types";

/**
 * URL is the source of truth for marketplace state.
 *
 * Filters, search, sort and page all live in the query string so results are
 * shareable, survive refresh, work with browser history, and can move to
 * server-side querying without a rewrite.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** An unfiltered query — used for catalog-wide counts such as the category rail. */
export const EMPTY_QUERY: CatalogQuery = {
  category: [],
  material: [],
  technology: [],
  color: [],
  availability: [],
  price: [],
  q: "",
  sort: "relevance",
  page: 1,
};

export const FACET_KEYS = [
  "category",
  "material",
  "technology",
  "color",
  "availability",
  "price",
] as const;

export type FacetKey = (typeof FACET_KEYS)[number];

export const SORT_OPTIONS: readonly { value: SortValue; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "popularity", label: "Popularity" },
];

const SORT_VALUES = new Set(SORT_OPTIONS.map((option) => option.value));

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

export function parseQuery(params: SearchParams): CatalogQuery {
  const rawSort = typeof params.sort === "string" ? params.sort : "";
  const rawPage = typeof params.page === "string" ? Number(params.page) : 1;

  return {
    category: toArray(params.category),
    material: toArray(params.material),
    technology: toArray(params.technology),
    color: toArray(params.color),
    availability: toArray(params.availability),
    price: toArray(params.price),
    q: typeof params.q === "string" ? params.q.trim() : "",
    sort: SORT_VALUES.has(rawSort as SortValue) ? (rawSort as SortValue) : "relevance",
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
  };
}

/**
 * Serialises a query back to a URL.
 *
 * Defaults are omitted so the canonical `/shop` never carries `?sort=relevance`
 * or `?page=1`.
 */
export function buildHref(
  pathname: string,
  query: CatalogQuery,
  overrides: Partial<CatalogQuery> = {},
): string {
  const merged: CatalogQuery = { ...query, ...overrides };
  const search = new URLSearchParams();

  for (const key of FACET_KEYS) {
    for (const value of merged[key]) search.append(key, value);
  }

  if (merged.q) search.set("q", merged.q);
  if (merged.sort !== "relevance") search.set("sort", merged.sort);
  if (merged.page > 1) search.set("page", String(merged.page));

  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Adds or removes one facet value. Any filter change returns to page 1. */
export function toggleFacet(
  query: CatalogQuery,
  facet: FacetKey,
  value: string,
): CatalogQuery {
  const current = query[facet];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];

  return { ...query, [facet]: next, page: 1 };
}

export function removeFacet(
  query: CatalogQuery,
  facet: FacetKey,
  value: string,
): CatalogQuery {
  return { ...query, [facet]: query[facet].filter((e) => e !== value), page: 1 };
}

/** Clears every filter and the search term, keeping sort. */
export function clearFilters(query: CatalogQuery): CatalogQuery {
  return {
    ...query,
    category: [],
    material: [],
    technology: [],
    color: [],
    availability: [],
    price: [],
    q: "",
    page: 1,
  };
}

export function activeFilterCount(query: CatalogQuery): number {
  return FACET_KEYS.reduce((total, key) => total + query[key].length, 0);
}

export function hasActiveFilters(query: CatalogQuery): boolean {
  return activeFilterCount(query) > 0 || query.q.length > 0;
}

/** Every selected facet value, flattened, for the chip row. */
export function activeFilters(
  query: CatalogQuery,
): readonly { facet: FacetKey; value: string }[] {
  return FACET_KEYS.flatMap((facet) =>
    query[facet].map((value) => ({ facet, value })),
  );
}
