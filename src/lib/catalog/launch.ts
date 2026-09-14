import {
  capabilityVerdict,
  missingLaunchLimitations,
  type CapabilityVerdict,
  type CatalogEntry,
  type CommercialDefinition,
  type Fact,
} from "@/content/catalog";

import { assessCommercial } from "./commerce";
import type { Product } from "./types";
import {
  validateCommercialDefinition,
  validateEntryApprovals,
  validateProduct,
} from "./validation";

/**
 * Launch status of one product — the single answer to
 * "why can't this product launch?".
 *
 * ── One assessment, every consumer ───────────────────────────────────────
 *
 * `content:verify`, launch readiness, homepage featuring and the Payload admin
 * all read this function, so the reason an operator sees on a product is the
 * reason the release gate fails on. Nothing here decides visibility; that stays
 * with the catalog mode in `commerce.ts`.
 *
 * ── The seven dimensions ─────────────────────────────────────────────────
 *
 *   technical      validateProduct + approval evidence + a well-formed definition
 *   approval       product approval status is APPROVED
 *   price          approved price in effect, or quote-only
 *   media          an approved photo or render of the actual product
 *   manufacturing  the product's material on its process is approved capability
 *   commercial     the business decisions in its commercial definition are APPROVED
 *   featured       only when all of the above hold
 *
 * ENGINEERING COMPLETE ≠ BUSINESS APPROVED ≠ LAUNCH READY — each is reported on
 * its own line so none can be mistaken for another.
 */

export type DimensionStatus = "PASS" | "BLOCKING";

export interface LaunchAssessment {
  productId: string;
  technical: { status: DimensionStatus; reasons: string[] };
  approval: "APPROVED" | "NOT_APPROVED";
  price: "APPROVED" | "PROVISIONAL" | "QUOTE_ONLY" | "MISSING";
  media: "APPROVED" | "MISSING";
  manufacturing: "APPROVED" | "NOT_APPROVED";
  commercial: "COMPLETE" | "INCOMPLETE";
  featured: "ELIGIBLE" | "NOT_ELIGIBLE" | "NOT_REQUESTED";
  launch: { ready: boolean; reasons: string[] };
}

/** The business decisions a launch requires, and the reason shown when one is not approved. */
const REQUIRED_DECISIONS: readonly {
  pick: (commercial: CommercialDefinition) => Fact<unknown>;
  missing: string;
  unapproved: string;
}[] = [
  { pick: (c) => c.sku, missing: "Missing SKU", unapproved: "SKU not approved" },
  { pick: (c) => c.productClass, missing: "Missing product class", unapproved: "Product class not approved" },
  { pick: (c) => c.pricingModel, missing: "Missing pricing model", unapproved: "Pricing model not approved" },
  { pick: (c) => c.customer, missing: "Missing target customer", unapproved: "Target customer not approved" },
  { pick: (c) => c.useCase, missing: "Missing use case", unapproved: "Use case not approved" },
  { pick: (c) => c.copy, missing: "Missing commercial copy sign-off", unapproved: "Product copy not approved" },
  { pick: (c) => c.visual.required, missing: "Missing visual requirement (photo or render)", unapproved: "Visual requirement not approved" },
];

/**
 * The default manufacturing verdict for one product (Stage 19.8): its material
 * on its process must be approved capability, AND the launch-required
 * manufacturing limitations must be approved. A part cannot be sold as
 * manufacturable while minimum wall thickness, minimum feature size or
 * dimensional accuracy are unvalidated — fail closed, per product, not only at
 * the catalog gate.
 */
export function productCapabilityVerdict(material: string, technology: string): CapabilityVerdict {
  const verdict = capabilityVerdict(material, technology);
  const missing = missingLaunchLimitations();
  if (missing.length === 0) return verdict;
  return {
    approved: false,
    reasons: [...verdict.reasons, `Manufacturing limitations not approved: ${missing.join(", ")} — requires Reality 3D manufacturing validation`],
  };
}

export interface LaunchOptions {
  now?: Date;
  /**
   * The manufacturing verdict for a material on a process. Defaults to the
   * canonical specification; tests supply an approved one, because nothing in
   * the real specification is approved and a READY fixture needs it to be.
   */
  capability?: (material: string, technology: string) => CapabilityVerdict;
}

export function assessLaunch(
  entry: CatalogEntry | undefined,
  product: Product,
  options: LaunchOptions = {},
): LaunchAssessment {
  const now = options.now ?? new Date();
  /* ---- technical ---- */

  const technicalReasons = validateProduct(product).map((issue) => `Technical: ${issue.message}`);
  if (!entry) {
    technicalReasons.push("Technical: not in the canonical catalog");
  } else {
    if (entry.intent !== "publish") technicalReasons.push("Technical: the canonical catalog holds this product as a draft");
    technicalReasons.push(
      ...validateEntryApprovals({ ...entry, product }, now).map((issue) => `Technical: ${issue.message}`),
    );
  }
  technicalReasons.push(
    ...validateCommercialDefinition(product, entry?.commercial).map((problem) => `Technical: ${problem}`),
  );

  /* ---- commercial dimensions ---- */

  const commercialState = assessCommercial(product);
  const reasons: string[] = [];

  const approval = product.approvalStatus === "approved" ? "APPROVED" : "NOT_APPROVED";
  if (approval !== "APPROVED") reasons.push(`Product not approved (status: ${product.approvalStatus ?? "missing"})`);

  const price =
    product.priceStatus === "approved"
      ? "APPROVED"
      : product.priceStatus === "quote-only"
        ? "QUOTE_ONLY"
        : product.priceStatus === "provisional"
          ? "PROVISIONAL"
          : "MISSING";
  if (price === "PROVISIONAL") reasons.push("Missing approved price (current price is provisional)");
  if (price === "MISSING") reasons.push("Missing price status");

  const media = commercialState.media === "complete" ? "APPROVED" : "MISSING";
  if (media !== "APPROVED") {
    const required = entry?.commercial.visual.required;
    const requirement = required && "value" in required ? ` (required: ${required.value}, ${required.state})` : "";
    reasons.push(`Missing approved image${requirement}`);
  }

  if (!product.description?.trim()) reasons.push("Missing required commercial description");

  const capability = (options.capability ?? productCapabilityVerdict)(product.material, product.technology);
  const manufacturing = capability.approved ? "APPROVED" : "NOT_APPROVED";
  reasons.push(...capability.reasons);

  const decisionReasons: string[] = [];
  if (entry) {
    for (const decision of REQUIRED_DECISIONS) {
      const fact = decision.pick(entry.commercial);
      if (fact.state === "APPROVED") continue;
      decisionReasons.push(
        fact.state === "MISSING" || fact.state === "BLOCKED"
          ? decision.missing
          : `${decision.unapproved} (${fact.state})`,
      );
    }
  } else {
    decisionReasons.push("Missing commercial catalog definition");
  }
  for (const question of entry?.commercial.openQuestions ?? []) {
    const answer = question.answer;
    if (answer.state === "APPROVED" && answer.value === "YES") continue;
    decisionReasons.push(
      answer.state === "APPROVED"
        ? `Blocked by business decision: "${question.question}" was answered NO`
        : `Open business decision unanswered: "${question.question}"`,
    );
  }
  const commercial = decisionReasons.length === 0 ? "COMPLETE" : "INCOMPLETE";
  reasons.push(...decisionReasons);

  const allReasons = [...technicalReasons, ...reasons];
  const ready = allReasons.length === 0;

  const featuredRequested = entry?.commercial.featured.state === "APPROVED" && entry.commercial.featured.value === true;
  const featured = product.featured || featuredRequested ? (ready ? "ELIGIBLE" : "NOT_ELIGIBLE") : "NOT_REQUESTED";

  return {
    productId: product.id,
    technical: { status: technicalReasons.length === 0 ? "PASS" : "BLOCKING", reasons: technicalReasons },
    approval,
    price,
    media,
    manufacturing,
    commercial,
    featured,
    launch: { ready, reasons: allReasons },
  };
}
