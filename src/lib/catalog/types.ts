/**
 * Catalog domain types.
 *
 * These describe the shape the UI consumes. Phase 14 replaces the local product
 * source with Payload; as long as it returns this shape, no component changes.
 */

export type MaterialValue = "pla" | "petg" | "abs" | "tpu" | "resin";
export type TechnologyValue = "fdm" | "sla" | "sls";
export type AvailabilityValue = "in-stock" | "made-to-order";

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** One short technical line. Used by search, not shown on the card. */
  summary: string;
  /** Leaf category value from the taxonomy. Ancestors are derived, not stored. */
  category: string;
  /** Top-level browse category, used to build the product URL. */
  browseCategory: string;
  material: MaterialValue;
  technology: TechnologyValue;
  /** Colour facet value. */
  color: string;
  /** Whole rupees. Formatting happens at render time. */
  price: number;
  currency: "INR";
  availability: AvailabilityValue;
  /** Set when a render exists in storage. Wired for R2 in Phase 16. */
  image?: { src: string; alt: string };
  /** Small corner label on the card, e.g. "New". */
  badge?: string;
}

export type SortValue =
  | "relevance"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "popularity";

export interface CatalogQuery {
  category: readonly string[];
  material: readonly string[];
  technology: readonly string[];
  color: readonly string[];
  availability: readonly string[];
  /** Price bracket values from the taxonomy. */
  price: readonly string[];
  /** Free-text search term. */
  q: string;
  sort: SortValue;
  /** 1-based. */
  page: number;
  /**
   * Category imposed by the route (/shop/[category]), applied on top of the
   * facets above.
   *
   * Deliberately separate from `category`: it lives in the path, not the query
   * string, so it must never appear as a removable chip or be serialised into a
   * URL. Keeping the two apart is what stops the visible state and the address
   * bar from disagreeing.
   */
  scopeCategory?: string;
}

/** Counts keyed by facet value, for a single facet. */
export type FacetCounts = Record<string, number>;

export interface CatalogFacets {
  category: FacetCounts;
  material: FacetCounts;
  technology: FacetCounts;
  color: FacetCounts;
  availability: FacetCounts;
  price: FacetCounts;
}

export interface CatalogResult {
  items: readonly Product[];
  /** Total matching the query, before pagination. */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  facets: CatalogFacets;
}
