import type {
  Category as PayloadCategory,
  Material as PayloadMaterial,
  Media as PayloadMedia,
  Product as PayloadProduct,
} from "@/payload-types";

import { effectivePriceApproval, type PriceApprovalRecord } from "./commerce";
import {
  APPROVAL_STATUSES,
  type ApprovalStatus,
  type AvailabilityValue,
  type MaterialValue,
  type PriceStatus,
  type Product,
  type ProductImage,
  type QualityOption,
  type TechnologyValue,
} from "./types";

/**
 * Payload document to domain product.
 *
 * ── Why a mapping exists at all ──────────────────────────────────────────
 *
 * The generated Payload types are a description of a database, and they change
 * whenever a field is added. `Product` is the contract the marketplace, the
 * cart, the quote engine and the order domain are all written against. Letting
 * the CMS type reach any of them would make a CMS field rename a storefront
 * refactor.
 *
 * So the boundary is here, it is one direction, and it is pure — which also
 * makes it the part of the CMS integration that can be tested without a
 * database.
 *
 * ── CMS content is editable, therefore it is untrusted ───────────────────
 *
 * Every field an operator can leave empty, break, or point at a deleted
 * document is handled. A product that cannot be mapped is *dropped* rather than
 * rendered half-built: a card with no category cannot be filtered, a product
 * with no material cannot be quoted, and showing either would push the failure
 * into a component that has no way to describe it.
 *
 * Dropping is visible — the product simply is not in the catalog — and it is
 * recoverable by fixing the document. Rendering a broken one is neither.
 */

/** A relationship is either an id or the populated document. */
function related<T extends { id: number }>(value: number | T | null | undefined): T | null {
  return typeof value === "object" && value !== null ? value : null;
}

/** Payload's array fields arrive as rows with a `value`; the domain wants strings. */
function values(
  rows: { value: string }[] | null | undefined,
): string[] {
  return (rows ?? []).map((row) => row.value).filter((value) => value.length > 0);
}

const TECHNOLOGIES: readonly TechnologyValue[] = ["fdm", "sla", "sls"];
const AVAILABILITIES: readonly AvailabilityValue[] = ["in-stock", "made-to-order"];
const PRICE_STATUSES: readonly PriceStatus[] = ["approved", "provisional", "quote-only"];
const MATERIALS: readonly MaterialValue[] = ["pla", "petg", "abs", "tpu", "resin"];

/**
 * A material value the manufacturing domain knows, or nothing.
 *
 * `MaterialValue` is a union the cart, the quote engine and the order domain
 * narrow against. A CMS row saying "carbon-fibre" is not a new material — it is
 * a value nothing downstream can price, and it is refused here rather than
 * widening the union to `string` and removing every exhaustiveness check that
 * protects those domains.
 */
export function materialValue(
  material: number | PayloadMaterial | null | undefined,
): MaterialValue | null {
  const doc = related<PayloadMaterial>(material);
  if (!doc) return null;

  const value = doc.value as MaterialValue;
  return MATERIALS.includes(value) ? value : null;
}

function categoryValue(
  category: number | PayloadCategory | null | undefined,
): string | null {
  const doc = related<PayloadCategory>(category);
  return doc?.value ?? null;
}

function image(media: number | PayloadMedia | null | undefined): ProductImage | undefined {
  const doc = related<PayloadMedia>(media);
  if (!doc?.url) return undefined;

  return { src: doc.url, alt: doc.alt, ...(doc.kind ? { kind: doc.kind } : {}) };
}

/**
 * The product's primary image: a Media upload when one is attached, otherwise
 * the repository-hosted visual. Media has no storage adapter yet, which is why
 * the second path exists.
 */
function primaryImage(doc: PayloadProduct): ProductImage | undefined {
  /*
   * Stage 20: the repository visual is the canonical media association — it is
   * the one that carries the media approval. A Media upload (no storage adapter
   * yet) is used only when no visual is set, and never counts as approved.
   */
  const visual = doc.visual;
  if (!visual?.src || !visual.alt) return image(doc.image);

  // Stage 19.8: the media approval travels with the image; a partial record approves nothing.
  const approval = visual.approval;
  const approvedOn = approval?.approvedOn ? String(approval.approvedOn).slice(0, 10) : "";
  const complete = approval?.reference?.trim() && approval.approvedBy?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(approvedOn);

  return {
    src: visual.src,
    alt: visual.alt,
    ...(visual.kind ? { kind: visual.kind } : {}),
    ...(complete ? { approval: { reference: approval!.reference!.trim(), approvedBy: approval!.approvedBy!.trim(), approvedOn } } : {}),
  };
}

function gallery(
  media: (number | PayloadMedia)[] | null | undefined,
): readonly ProductImage[] | undefined {
  const images = (media ?? [])
    .map((entry) => image(entry))
    .filter((entry): entry is ProductImage => entry !== undefined);

  return images.length > 0 ? images : undefined;
}

function qualityOptions(
  rows: PayloadProduct["qualityOptions"],
): readonly QualityOption[] | undefined {
  const options = (rows ?? []).map((row) => ({
    value: row.value,
    label: row.label,
    layerHeight: row.layerHeight,
  }));

  return options.length > 0 ? options : undefined;
}

function specifications(
  rows: PayloadProduct["specifications"],
): readonly { label: string; value: string }[] | undefined {
  const specs = (rows ?? []).map((row) => ({ label: row.label, value: row.value }));
  return specs.length > 0 ? specs : undefined;
}

/** An empty array and an absent one are different; the domain wants absent. */
function optional<T>(items: readonly T[]): readonly T[] | undefined {
  return items.length > 0 ? items : undefined;
}

export type MappingFailure = {
  productId: string;
  reason: string;
};

export type MappingResult =
  | { ok: true; product: Product }
  | { ok: false; failure: MappingFailure };

/**
 * Maps one document, or explains why it cannot be mapped.
 *
 * A result rather than a throw: one broken product must not take down a catalog
 * page, and the caller collects the failures so an operator can be shown what
 * needs fixing.
 */
export function toDomainProduct(doc: PayloadProduct): MappingResult {
  const productId = doc.productId;

  const refuse = (reason: string): MappingResult => ({
    ok: false,
    failure: { productId: productId || `payload:${doc.id}`, reason },
  });

  if (!productId) return refuse("It has no stable product identifier.");
  if (!doc.slug) return refuse("It has no slug, so it has no URL.");

  const category = categoryValue(doc.category);
  if (!category) {
    return refuse(
      "Its category is missing or unpublished, so it cannot be filed or filtered.",
    );
  }

  const browseCategory = categoryValue(doc.browseCategory);
  if (!browseCategory) {
    return refuse(
      "Its browse category is missing or unpublished, so it has no page to live under.",
    );
  }

  const material = materialValue(doc.material);
  if (!material) {
    return refuse(
      "Its material is missing, unpublished, or not one the manufacturing domain knows.",
    );
  }

  const technology = doc.technology as TechnologyValue;
  if (!TECHNOLOGIES.includes(technology)) {
    return refuse(`"${String(doc.technology)}" is not a manufacturing technology.`);
  }

  const availability = doc.availability as AvailabilityValue;
  if (!AVAILABILITIES.includes(availability)) {
    return refuse(`"${String(doc.availability)}" is not an availability.`);
  }

  if (typeof doc.price !== "number" || doc.price < 0) {
    return refuse("It has no usable price.");
  }

  const offeredMaterials = (doc.materials ?? [])
    .map((entry) => materialValue(entry))
    .filter((value): value is MaterialValue => value !== null);

  const product: Product = {
    id: productId,
    slug: doc.slug,
    name: doc.name,
    ...(typeof doc.sku === "string" && doc.sku.trim() ? { sku: doc.sku.trim() } : {}),
    summary: doc.summary,
    category,
    browseCategory,
    // Stage 20: labels come from the CMS records, so an administrator's category is named.
    ...(related<PayloadCategory>(doc.category)?.name ? { categoryLabel: related<PayloadCategory>(doc.category)!.name } : {}),
    ...(related<PayloadCategory>(doc.browseCategory)?.name ? { browseCategoryLabel: related<PayloadCategory>(doc.browseCategory)!.name } : {}),
    material,
    technology,
    color: doc.color,
    price: doc.price,
    currency: "INR",
    ...(PRICE_STATUSES.includes(doc.priceStatus as PriceStatus)
      ? { priceStatus: doc.priceStatus as PriceStatus }
      : {}),
    ...(APPROVAL_STATUSES.includes(doc.approvalStatus as ApprovalStatus)
      ? { approvalStatus: doc.approvalStatus as ApprovalStatus }
      : {}),
    ...(doc.featured ? { featured: true } : {}),
    ...(doc.recommended ? { recommended: true } : {}),
    ...(doc.seo?.title || doc.seo?.description
      ? { seo: { ...(doc.seo.title ? { title: doc.seo.title } : {}), ...(doc.seo.description ? { description: doc.seo.description } : {}) } }
      : {}),
    availability,
    ...(primaryImage(doc) ? { image: primaryImage(doc) } : {}),
    ...(gallery(doc.gallery) ? { gallery: gallery(doc.gallery) } : {}),
    ...(doc.model?.url && doc.model.format
      ? { model: { url: doc.model.url, format: doc.model.format } }
      : {}),
    ...(doc.badge ? { badge: doc.badge } : {}),
    ...(doc.description ? { description: doc.description } : {}),
    ...(optional(values(doc.applications))
      ? { applications: values(doc.applications) }
      : {}),
    // The default material is always offered, even if an operator left the list
    // empty — a part has to be makeable in something.
    ...(offeredMaterials.length > 0
      ? { materials: [...new Set([material, ...offeredMaterials])] }
      : {}),
    ...(optional(values(doc.colors)) ? { colors: values(doc.colors) } : {}),
    ...(qualityOptions(doc.qualityOptions)
      ? { qualityOptions: qualityOptions(doc.qualityOptions) }
      : {}),
    ...(specifications(doc.specifications)
      ? { specifications: specifications(doc.specifications) }
      : {}),
    ...(optional(values(doc.materialNotes))
      ? { materialNotes: values(doc.materialNotes) }
      : {}),
  };

  return { ok: true, product };
}

/**
 * Re-checks every "approved" price against the approval records, on the server.
 *
 * The CMS refuses to save an approved price without a matching approval, but a
 * record's effective date can pass, a later approval can supersede it, and a row
 * can be written around the admin. So the storefront does not take the status
 * on trust: an approved price with no matching approval in effect is served as
 * provisional — labelled, and not chargeable in launch mode — and reported.
 */
export function applyPriceApprovals(
  products: readonly Product[],
  approvals: ReadonlyMap<string, readonly PriceApprovalRecord[]>,
  now: Date = new Date(),
): { products: Product[]; failures: MappingFailure[] } {
  const failures: MappingFailure[] = [];

  const checked = products.map((product) => {
    if (product.priceStatus !== "approved") return product;

    const effective = effectivePriceApproval(approvals.get(product.id) ?? [], now);
    if (effective && effective.amount === product.price) return product;

    failures.push({
      productId: product.id,
      reason: effective
        ? `Approved price ₹${product.price} does not match the approval in effect (₹${effective.amount}); served as provisional.`
        : "Price marked approved with no price approval in effect; served as provisional.",
    });
    return { ...product, priceStatus: "provisional" as const };
  });

  return { products: checked, failures };
}

export interface MappedCatalog {
  products: Product[];
  failures: MappingFailure[];
}

/** Maps a page of documents, keeping what works and reporting what does not. */
export function toDomainCatalog(docs: readonly PayloadProduct[]): MappedCatalog {
  const products: Product[] = [];
  const failures: MappingFailure[] = [];

  for (const doc of docs) {
    const result = toDomainProduct(doc);
    if (result.ok) products.push(result.product);
    else failures.push(result.failure);
  }

  return { products, failures };
}
