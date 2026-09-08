/**
 * Catalog domain types.
 *
 * These describe the shape the UI consumes. Phase 14 replaces the local product
 * source with Payload; as long as it returns this shape, no component changes.
 */

export type MaterialValue = "pla" | "petg" | "abs" | "tpu" | "resin";
export type TechnologyValue = "fdm" | "sla" | "sls";
export type AvailabilityValue = "in-stock" | "made-to-order";

/** A single row in the technical specifications table. */
export interface ProductSpecification {
  label: string;
  value: string;
}

/** A print-quality variant this part is offered in. */
export interface QualityOption {
  value: string;
  label: string;
  /** e.g. "0.16 MM". */
  layerHeight: string;
}

export interface ProductImage {
  src: string;
  alt: string;
}

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
  image?: ProductImage;
  /** Additional views. The gallery only appears when there is more than one. */
  gallery?: readonly ProductImage[];
  /** Small corner label on the card, e.g. "New". */
  badge?: string;

  /* ---- detail-page fields ----
   *
   * All optional. A product without them renders a shorter page rather than a
   * page with empty sections, and nothing is ever substituted for a missing
   * value. See the note at the top of products.ts about demo data.
   */

  /** Two sentences at most. Engineering-plain. */
  description?: string;
  /** Where the part is used. Rendered only when present. */
  applications?: readonly string[];
  /**
   * Materials this specific part can be made in, including `material` as the
   * default. Absent or single-entry means the material is fixed and is shown
   * as metadata rather than as a selector.
   */
  materials?: readonly MaterialValue[];
  /** Colour facet values this part is offered in, including `color`. */
  colors?: readonly string[];
  /** Print qualities offered. Single entry is shown as metadata, not a choice. */
  qualityOptions?: readonly QualityOption[];
  /** Only rows that are actually known for this part. */
  specifications?: readonly ProductSpecification[];
  /** Short, factual notes about the material as used in this part. */
  materialNotes?: readonly string[];
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
