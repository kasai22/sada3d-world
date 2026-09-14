import type { PriceApprovalRecord } from "@/lib/catalog/commerce";

import type { Fact } from "./facts";
import type { Product, ProductModel } from "@/lib/catalog/types";

/**
 * The canonical catalog — shapes.
 *
 * ── One authoritative content source ─────────────────────────────────────
 *
 *   src/content/catalog  (this directory, reviewed in git)
 *          │  validateCatalog()
 *          ▼
 *   npm run content:import / content:reset  →  Payload
 *          │
 *          ▼
 *   catalog repository (lib/catalog/query.ts)  →  storefront
 *
 * The content reset replaced a local catalog and a Payload catalog that had
 * drifted apart (36 local, 37 Payload, 111 field differences). The local typed
 * catalog now has exactly one role: it is the **import source** for Payload.
 * The local `CatalogSource` still exists for builds and tests with no database,
 * but it serves the published subset of *this* dataset, so it cannot become a
 * second catalog — and `content:verify` proves Payload matches it.
 *
 * ── What an entry records beyond the product ─────────────────────────────
 *
 * The domain `Product` is what the storefront renders. An entry adds the
 * editorial facts nobody should have to infer from it: whether Reality 3D has
 * approved the product, where its price came from, and what is still missing.
 * Those are not decoration — readiness is computed from them.
 */

/** The editorial decision. The importer still refuses to publish an invalid entry. */
export type PublicationIntent = "publish" | "draft";

/** Who approved a product for sale, when, and where it is recorded. */
export interface ProductApproval {
  approvedBy: string;
  /** ISO date, YYYY-MM-DD. */
  approvedOn: string;
  reference: string;
}

/** How a product is sold. */
export type ProductClass =
  | "STANDARD_CATALOG_PRODUCT"
  | "CONFIGURABLE_PRODUCT"
  | "QUOTE_ONLY_PRODUCT"
  | "CUSTOM_MANUFACTURING_SERVICE";

export type PricingModel = "FIXED" | "CONFIGURABLE" | "QUOTE_ONLY";

export type VisualType = "REAL_PHOTO" | "APPROVED_RENDER";

/**
 * The commercial definition of a product — every business input it needs to be
 * sold, each in the state it is actually in.
 *
 * Stage 19.7. Launch requires the business decisions here to be APPROVED; a
 * PROPOSED value is a draft for review and never counts. See
 * `lib/catalog/launch.ts` for exactly what is required.
 */
export interface CommercialDefinition {
  productClass: Fact<ProductClass>;
  /** Stock-keeping unit. Assigned by the business; never generated. */
  sku: Fact<string>;
  /** Who buys it. */
  customer: Fact<readonly string[]>;
  /** What it is intended for, in one sentence. */
  useCase: Fact<string>;
  pricingModel: Fact<PricingModel>;
  /** Sign-off of the published copy: description, applications, limitations. */
  copy: Fact<string>;
  /** Grams. Not displayed; recorded only when measured on a real part. */
  weightGrams: Fact<number>;
  visual: {
    required: Fact<VisualType>;
    /** For a render: what it must show. Not a claim that one exists. */
    renderSpecification: Fact<string>;
    /** A role, not a person. */
    owner: string;
  };
  /** The decision to feature it on the homepage. Not required for launch. */
  featured: Fact<boolean>;
  /**
   * Business questions that must be answered before this product may launch.
   * Unanswered (MISSING) blocks launch; an APPROVED "NO" blocks it permanently
   * for this configuration. Stage 19.8.
   */
  openQuestions?: readonly OpenQuestion[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  answer: Fact<"YES" | "NO">;
}

export interface CatalogEntry {
  /**
   * The domain record. Its `approvalStatus`, `priceStatus` and `image` are the
   * commercial facts; everything below is the evidence for them.
   */
  product: Product;
  intent: PublicationIntent;
  /** Required when `product.approvalStatus` is "approved". */
  approval?: ProductApproval;
  /**
   * Price approvals, oldest first. Append-only in spirit: a change of price is
   * a new record, never an edit, so the history is the audit trail.
   * `product.priceStatus` may be "approved" only when one is in effect and its
   * amount is `product.price`.
   */
  priceApprovals?: readonly PriceApprovalRecord[];
  /**
   * How the current price was arrived at, in one sentence an auditor can check.
   */
  priceBasis: string;
  /**
   * Known gaps, stated rather than hidden. Reported by `content:verify`.
   */
  contentGaps: readonly string[];
  /** Stage 19.7: the commercial definition. Required for launch. */
  commercial: CommercialDefinition;
}

export interface CategoryDefinition {
  value: string;
  label: string;
  /** One technical line. Shown on the homepage category index. */
  description: string;
  children?: readonly CategoryDefinition[];
}

/**
 * A 3D model asset that has been parsed and measured.
 *
 * `catalog.test.ts` re-parses every file listed here and fails if any recorded
 * fact is wrong, so a product can only reference a model whose existence,
 * format, size, topology and dimensions have actually been checked.
 */
export interface ModelAsset extends ProductModel {
  /** Exact file size in bytes. */
  sizeBytes: number;
  /** Separately printed parts the file declares. */
  partCount: number;
  /** Overall envelope in millimetres, as measured from the file. */
  envelopeMm: { x: number; y: number; z: number };
  /** Where the geometry comes from. */
  source: string;
}
