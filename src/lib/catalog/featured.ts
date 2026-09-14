import { CATALOG_ENTRIES } from "@/content/catalog";

import { isVisible } from "./commerce";
import { assessLaunch, type LaunchAssessment } from "./launch";
import { BROWSE_CATEGORIES } from "./taxonomy";
import type { LaunchSummary, Product } from "./types";

/**
 * Which products the homepage features, and why a flagged one is refused.
 *
 * ── A flag on the product, honoured only for launch-ready products ───────
 *
 * Featuring is the product's `featured` flag (Stage 19.6). Stage 19.7 tightens
 * what it takes to honour it: the product must be launch-ready by the same
 * assessment the release gate uses — approved, approved price, approved image,
 * approved manufacturing capability, approved commercial decisions, technically
 * valid. "Featured" cannot put anything on the homepage that could not launch.
 *
 * Unpublishing or archiving a product removes it with no other edit.
 */

export type FeaturedRejection =
  /** Not approved for sale, or archived. */
  | "not-approved"
  /** Priced from the customer's own geometry: nothing to buy from a card. */
  | "quote-only"
  /** No approved photo or render. */
  | "no-image"
  /** The price is not approved. */
  | "price-not-approved"
  /** Its material on its process is not approved capability. */
  | "manufacturing-not-approved"
  /** Any other launch requirement: commercial decisions, technical validity. */
  | "not-launch-ready"
  /** The product has no slug, so it has no address. */
  | "no-slug"
  /** Its browse category is not one /shop/[category] will serve. */
  | "unknown-category";

export interface FeaturedSelection {
  /** Featured products that may be shown, in catalog order. */
  products: readonly Product[];
  /** Every product flagged as featured that may not be shown, with the reason. */
  rejected: readonly { id: string; reason: FeaturedRejection }[];
}

export const FEATURED_LIMIT = 8;

export type LaunchCheck = (product: Product) => LaunchAssessment | LaunchSummary;

const canonical = new Map(CATALOG_ENTRIES.map((entry) => [entry.product.id, entry]));

/** The release gate's own assessment, against the canonical catalog. */
export const canonicalLaunchCheck: LaunchCheck = (product) => assessLaunch(canonical.get(product.id), product);

/**
 * The default: the launch summary the server computed from the product's full
 * record (Payload or canonical), falling back to the canonical assessment. An
 * administrator-created product is judged by its own record.
 */
export const productLaunchCheck: LaunchCheck = (product) => product.launch ?? canonicalLaunchCheck(product);

function view(result: LaunchAssessment | LaunchSummary): LaunchSummary {
  return "launch" in result
    ? { ready: result.launch.ready, price: result.price, media: result.media, manufacturing: result.manufacturing, commercial: result.commercial }
    : result;
}

/** Pure given its inputs, so the rule is testable against a fabricated catalog. */
export function selectFeatured(
  products: readonly Product[],
  limit: number = FEATURED_LIMIT,
  browseCategories: readonly string[] = BROWSE_CATEGORIES,
  check: LaunchCheck = productLaunchCheck,
): FeaturedSelection {
  const browse = new Set(browseCategories);
  const kept: Product[] = [];
  const rejected: { id: string; reason: FeaturedRejection }[] = [];

  for (const product of products) {
    if (!product.featured) continue;

    const reason = rejectionFor(product, browse, check);
    if (reason) rejected.push({ id: product.id, reason });
    else if (kept.length < limit) kept.push(product);
  }

  return { products: kept, rejected };
}

function rejectionFor(
  product: Product,
  browse: ReadonlySet<string>,
  check: LaunchCheck,
): FeaturedRejection | null {
  if (!isVisible(product, "launch")) return "not-approved";
  if (product.price === 0 || product.priceStatus === "quote-only") return "quote-only";
  if (!product.slug) return "no-slug";
  if (!browse.has(product.browseCategory)) return "unknown-category";

  const launch = view(check(product));
  if (launch.media !== "APPROVED") return "no-image";
  if (launch.price !== "APPROVED") return "price-not-approved";
  if (launch.manufacturing !== "APPROVED") return "manufacturing-not-approved";
  if (!launch.ready) return "not-launch-ready";
  return null;
}
