import { formatINR } from "@/lib/money";
import { productHref } from "@/lib/routes";

import { priceQualifier, PROVISIONAL_PRICE_EXPLANATION } from "./commerce";
import { AVAILABILITY } from "./taxonomy";
import type { Product } from "./types";

/**
 * Presentation helpers for a product that is already loaded.
 *
 * ── Why these are not in `query.ts` ──────────────────────────────────────
 *
 * `query.ts` is data access. Since Phase 14 it reaches a `CatalogSource`, and
 * one of those sources is Payload — which pulls in a database driver, the
 * filesystem and Drizzle's migration tooling. None of that can exist in a
 * browser bundle.
 *
 * These four functions are pure, take a product they were handed, and are
 * called from client components during render. Keeping them in their own module
 * means a client component imports arithmetic and string formatting, and cannot
 * accidentally drag a Postgres driver in behind it.
 *
 * The rule this encodes: **components import from here, server code imports
 * from `query.ts`.** A component that finds itself needing `query.ts` is a
 * component that is doing data access, which is a different bug.
 */

/**
 * Whether the part is quoted from the customer's own geometry.
 *
 * A price of 0 has always meant this, and `validateProduct` now requires the two
 * to agree with `priceStatus: "quote-only"`. Either signal is honoured, so a
 * record carrying only one of them still cannot be added to a cart at ₹0.
 */
export function isQuoteOnly(product: Product): boolean {
  return product.price === 0 || product.priceStatus === "quote-only";
}

/** Catalog display price. Zero means the part is quoted from geometry. */
export function formatPrice(value: number): string {
  return value === 0 ? "On quote" : formatINR(value);
}

/**
 * The canonical page for a product.
 *
 * Re-exported, not implemented: `lib/routes` owns every public URL since
 * Stage 19, and this stays available from the module components already import
 * so no call site had to move.
 */
export { productHref };

/**
 * How a price is qualified, for components: "Provisional price" and its
 * explanation until the price is approved, nothing once it is. Re-exported from
 * `commerce.ts` so components keep one import for price presentation.
 */
export { priceQualifier, PROVISIONAL_PRICE_EXPLANATION };

/**
 * What a product card's badge says.
 *
 * ── Why this is always availability ──────────────────────────────────────
 *
 * A card carried `product.badge ?? availability`, so an editorial badge —
 * "New", "SLA" — displaced the one piece of information a buyer needs before
 * they click. A made-to-order fixture badged "SLA" said nothing untrue and
 * still let someone believe it would ship tomorrow.
 *
 * Availability is not decoration and does not share a slot with decoration, so
 * the badge states it and only it. Nothing on a card can now imply a part is on
 * a shelf when it is made when ordered.
 */
export function availabilityLabel(product: Product): string {
  return (
    AVAILABILITY.find((entry) => entry.value === product.availability)?.label ??
    product.availability
  );
}

/**
 * The card label (Stage 20). A product that is not launch-ready — only visible in
 * review mode — says so first; otherwise availability, preceded by the editorial
 * "Recommended" label when an administrator chose it. Never a sales ranking.
 */
export function cardBadge(product: Product): string {
  if (product.launch && !product.launch.ready) return "Provisional · Not ready";
  return product.recommended ? `Recommended · ${availabilityLabel(product)}` : availabilityLabel(product);
}

/** Stable technical identifier derived from the product id, e.g. PART_00001. */
export function partId(product: Product): string {
  const digits = product.id.replace(/\D/g, "");
  return `PART_${digits.padStart(5, "0")}`;
}
