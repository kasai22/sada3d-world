/**
 * Catalog domain types.
 *
 * These describe the shape the UI consumes. Phase 14 replaces the local product
 * source with Payload; as long as it returns this shape, no component changes.
 */

export type MaterialValue = "pla" | "petg" | "abs" | "tpu" | "resin";
export type TechnologyValue = "fdm" | "sla" | "sls";
export type AvailabilityValue = "in-stock" | "made-to-order";

/**
 * Whether a catalog price is a commercial decision or a derived figure.
 *
 *   approved     backed by a price approval record in effect today; the only
 *                status a launch-mode checkout will charge
 *   provisional  derived from the provisional pricing rules; not approved, and
 *                labelled "Provisional price" wherever it is shown
 *   quote-only   no catalog price; always paired with `price: 0`
 *
 * Stage 19.6 renamed "verified" to "approved": the status records a business
 * decision, and no product ever carried "verified".
 */
export type PriceStatus = "approved" | "provisional" | "quote-only";

/**
 * Business approval of a product — independent of whether it is technically
 * valid, and independent of whether it is published.
 *
 *   draft        being written; never visible, never publishable
 *   proposed     submitted for review; content not yet signed off
 *   provisional  reviewed and usable before launch, explicitly not final
 *   approved     signed off by Reality 3D for sale
 *   archived     withdrawn; never visible, never publishable
 *
 * Publication (Payload's draft/published) is the other axis. A product is
 * launchable only when it is approved AND published AND commercially complete;
 * see `lib/catalog/commerce.ts`.
 */
export type ApprovalStatus = "draft" | "proposed" | "provisional" | "approved" | "archived";

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  "draft",
  "proposed",
  "provisional",
  "approved",
  "archived",
];

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
  /**
   * What the image is. A launchable product needs a real photograph or an
   * approved render; an image with no kind counts as unapproved media.
   */
  kind?: "photo" | "render";
  /**
   * Stage 19.8: who approved this image as a true visual of this product, when,
   * and where it is recorded. A file existing is never an approval.
   */
  approval?: { reference: string; approvedBy: string; approvedOn: string };
}

/**
 * Launch status computed on the server from the product's full record. Never
 * read from a client, never persisted; carried on the product so featuring and
 * the storefront can honour it without re-deriving commercial state.
 */
export interface LaunchSummary {
  ready: boolean;
  price: "APPROVED" | "PROVISIONAL" | "QUOTE_ONLY" | "MISSING";
  media: "APPROVED" | "PROPOSED" | "MISSING";
  manufacturing: "APPROVED" | "NOT_APPROVED";
  commercial: "COMPLETE" | "INCOMPLETE";
}

/**
 * A mesh the viewer can render.
 *
 * Local demo assets under /models today; Phase 16 supplies an authorised R2
 * URL. Absent means the product falls back to the placeholder stage.
 */
export interface ProductModel {
  url: string;
  format: "stl" | "obj" | "glb" | "gltf";
}

/**
 * The order every catalog source returns products in: by id, compared by code
 * unit. "Relevance" is source order, so this is part of what a visitor sees —
 * a CMS returning newest-first and a local catalog returning file order once
 * showed the same three parts in opposite orders. Deliberately not
 * `localeCompare` or a database collation, which can disagree about hyphens.
 */
export function catalogOrder(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /**
   * Stage 22: the stock-keeping unit, when the business has assigned one. Never
   * generated. Snapshotted onto order lines; not shown on the storefront.
   */
  sku?: string;
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
  /**
   * Optional in the type so fixtures and older records still describe a
   * product; `validateProduct` refuses to publish a product without one.
   */
  priceStatus?: PriceStatus;
  /** Optional in the type for fixtures; validation requires it. */
  approvalStatus?: ApprovalStatus;
  /** Editorial request to feature. Honoured only for launchable products. */
  featured?: boolean;
  /** Server-computed; see LaunchSummary. */
  launch?: LaunchSummary;
  availability: AvailabilityValue;
  /** Set when a render exists in storage. Wired for R2 in Phase 16. */
  image?: ProductImage;
  /** Additional views. The gallery only appears when there is more than one. */
  gallery?: readonly ProductImage[];
  /** Renderable mesh, when one exists for this part. */
  model?: ProductModel;
  /** Small corner label on the card, e.g. "New". */
  badge?: string;
  /** Stage 20: an editorial "Recommended" label — never a sales ranking. */
  recommended?: boolean;
  /** Stage 20: page title and meta description, when the administrator set them. */
  seo?: { title?: string; description?: string };
  /** Stage 20: display labels of the product's categories, from its source's tree. */
  categoryLabel?: string;
  browseCategoryLabel?: string;

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
  /** Stage 20: the category tree of the source that produced this result. */
  categories: readonly import("./category-tree").CategoryNode[];
}
