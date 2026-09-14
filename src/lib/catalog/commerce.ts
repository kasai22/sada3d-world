import type { Product } from "./types";

/**
 * Commercial policy: what is visible, what is purchasable, what is launchable.
 *
 * ── Three questions that used to be one ──────────────────────────────────
 *
 * Before Stage 19.6, "published" answered all of them. A product an editor
 * published was on the shop, in the cart and in checkout at whatever price it
 * carried. This module separates them:
 *
 *   VISIBLE      may a visitor see it?       approval + catalog mode
 *   PURCHASABLE  may checkout charge for it? approval + price status + mode
 *   LAUNCHABLE   is it commercially real?    everything, in launch terms
 *
 * Technical validity is a fourth, separate question, answered by
 * `validateProduct`. A product can be valid and not launchable — which is the
 * state of every product in the catalog today.
 *
 * Pure. Imported by server code and by client components alike.
 */

/* ------------------------------------------------------------------ *
 * Catalog mode
 * ------------------------------------------------------------------ */

/**
 *   launch   the storefront a customer uses: approved products only, approved
 *            prices only at checkout
 *   review   pre-launch review: provisional and proposed products are shown,
 *            clearly labelled, so the catalog can be reviewed in place
 */
export type CatalogMode = "launch" | "review";

export interface CatalogModeEnvironment {
  NODE_ENV?: string;
  NEXT_PUBLIC_SADA_CATALOG_MODE?: string;
  VERCEL_ENV?: string;
}

/**
 * The mode this process runs in.
 *
 * Development defaults to review and a production build defaults to launch.
 * A production build may opt into review with
 * `NEXT_PUBLIC_SADA_CATALOG_MODE=review` for a preview deployment; a Vercel
 * production deployment is launch regardless.
 *
 * `NEXT_PUBLIC_` on purpose, and read as literal `process.env.X` expressions so
 * Next inlines them: the category rail is a client component, and a server and
 * a client disagreeing about which categories exist is a hydration error.
 */
export function catalogMode(
  env: CatalogModeEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SADA_CATALOG_MODE: process.env.NEXT_PUBLIC_SADA_CATALOG_MODE,
    // Client-safe: NEXT_PUBLIC_ only. The server also reads VERCEL_ENV; see
    // `serverCatalogMode` in commerce-server.ts.
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  },
): CatalogMode {
  if (env.VERCEL_ENV === "production") return "launch";
  if (env.NEXT_PUBLIC_SADA_CATALOG_MODE === "launch") return "launch";
  if (env.NEXT_PUBLIC_SADA_CATALOG_MODE === "review") return "review";
  return env.NODE_ENV === "production" ? "launch" : "review";
}

/* ------------------------------------------------------------------ *
 * Visibility
 * ------------------------------------------------------------------ */

/**
 * Whether a published product may be shown.
 *
 * Draft and archived products are never shown. A product with no approval
 * status is treated as a draft — an unknown state is not a visible one.
 */
export function isVisible(product: Product, mode: CatalogMode = catalogMode()): boolean {
  const status = product.approvalStatus ?? "draft";
  if (status === "draft" || status === "archived") return false;
  return mode === "review" || status === "approved";
}

export function visibleProducts(
  products: readonly Product[],
  mode: CatalogMode = catalogMode(),
): Product[] {
  return products.filter((product) => isVisible(product, mode));
}

/* ------------------------------------------------------------------ *
 * Purchasability
 * ------------------------------------------------------------------ */

export type PurchaseBlockerCode = "product_not_approved" | "price_not_approved";

export interface PurchaseBlocker {
  code: PurchaseBlockerCode;
  message: string;
}

/**
 * Why checkout may not charge for this product in this mode. Empty means it may.
 *
 * In launch mode only an approved product at an approved price is purchasable.
 * In review mode a provisional price can still go through the (mock) checkout,
 * and the cart says plainly that it is provisional — see `priceQualifier`.
 */
export function purchaseBlockers(
  product: Product,
  mode: CatalogMode = catalogMode(),
): PurchaseBlocker[] {
  const blockers: PurchaseBlocker[] = [];
  const status = product.approvalStatus ?? "draft";

  if (status === "draft" || status === "archived" || (mode === "launch" && status !== "approved")) {
    blockers.push({
      code: "product_not_approved",
      message: `${product.name} is not approved for sale yet.`,
    });
  }

  if (mode === "launch" && product.priceStatus !== "approved" && product.priceStatus !== "quote-only") {
    blockers.push({
      code: "price_not_approved",
      message: `The price for ${product.name} is provisional and cannot be charged yet.`,
    });
  }

  return blockers;
}

/* ------------------------------------------------------------------ *
 * Provisional pricing, as a customer sees it
 * ------------------------------------------------------------------ */

/** The label shown beside a price that is not approved. Absent once it is. */
export function priceQualifier(product: Product): string | undefined {
  return product.priceStatus === "provisional" ? "Provisional price" : undefined;
}

export const PROVISIONAL_PRICE_EXPLANATION =
  "Provisional price. This figure comes from Reality 3D's provisional pricing rules and is not final commercial pricing; it may change before the part can be ordered for production.";

/* ------------------------------------------------------------------ *
 * Price approval records
 * ------------------------------------------------------------------ */

export interface PriceApprovalRecord {
  /** Whole rupees. */
  amount: number;
  currency: "INR";
  /** ISO date, YYYY-MM-DD. The price applies from the start of this day (UTC). */
  effectiveFrom: string;
  /** Where the decision is recorded. */
  reference: string;
  /** Who approved it. */
  approvedBy: string;
}

/**
 * The approval in effect at `now`: the latest effective date not in the future,
 * and for equal dates the one listed last (a correction supersedes).
 */
export function effectivePriceApproval(
  records: readonly PriceApprovalRecord[],
  now: Date = new Date(),
): PriceApprovalRecord | undefined {
  let current: PriceApprovalRecord | undefined;
  for (const record of records) {
    const from = Date.parse(`${record.effectiveFrom}T00:00:00.000Z`);
    if (Number.isNaN(from) || from > now.getTime()) continue;
    if (!current || record.effectiveFrom >= current.effectiveFrom) current = record;
  }
  return current;
}

/* ------------------------------------------------------------------ *
 * Commercial readiness
 * ------------------------------------------------------------------ */

export interface CommercialAssessment {
  approval: "approved" | "not-approved";
  price: "approved" | "quote-only" | "provisional" | "missing";
  media: "complete" | "missing";
  description: "present" | "missing";
  /** Commercially complete. Says nothing about technical validity. */
  ready: boolean;
  reasons: string[];
}

/**
 * Whether a product is commercially complete, on its own terms.
 *
 * Deliberately does not re-run technical validation; launch readiness combines
 * the two, and keeping them apart is what lets a report say "technically valid,
 * commercially not ready" rather than merging both into one fail.
 */
export function assessCommercial(product: Product): CommercialAssessment {
  const reasons: string[] = [];

  const approval = product.approvalStatus === "approved" ? "approved" : "not-approved";
  if (approval !== "approved") {
    reasons.push(`product approval is ${product.approvalStatus ?? "missing"}, not approved`);
  }

  const price =
    product.priceStatus === "approved" || product.priceStatus === "quote-only"
      ? product.priceStatus
      : product.priceStatus === "provisional"
        ? "provisional"
        : "missing";
  if (price === "provisional") reasons.push("price is provisional");
  if (price === "missing") reasons.push("price status is missing");

  const mediaApproval = product.image?.approval;
  const media =
    product.image?.src &&
    product.image.alt &&
    (product.image.kind === "photo" || product.image.kind === "render") &&
    mediaApproval?.reference?.trim() &&
    mediaApproval.approvedBy?.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(mediaApproval.approvedOn ?? "")
      ? "complete"
      : "missing";
  if (media === "missing") reasons.push("no approved product photo or render");

  const description = product.description?.trim() ? "present" : "missing";
  if (description === "missing") reasons.push("no description");

  return {
    approval,
    price,
    media,
    description,
    ready: reasons.length === 0,
    reasons,
  };
}
