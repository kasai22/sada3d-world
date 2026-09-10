import { formatINR } from "@/lib/money";

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

/** A price of 0 means the part is quoted from the customer's own geometry. */
export function isQuoteOnly(product: Product): boolean {
  return product.price === 0;
}

/** Catalog display price. Zero means the part is quoted from geometry. */
export function formatPrice(value: number): string {
  return value === 0 ? "On quote" : formatINR(value);
}

/** The canonical page for a product. */
export function productHref(product: Product): string {
  return `/shop/${product.browseCategory}/${product.slug}`;
}

/** Stable technical identifier derived from the product id, e.g. PART_00001. */
export function partId(product: Product): string {
  const digits = product.id.replace(/\D/g, "");
  return `PART_${digits.padStart(5, "0")}`;
}
