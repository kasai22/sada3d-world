import type { ProductValidationOptions } from "./validation";
import type { CatalogEntry, CommercialDefinition, Fact, OpenQuestion } from "@/content/catalog";
import type { Product as PayloadProduct } from "@/payload-types";

import type { PriceApprovalRecord } from "./commerce";
import { assessLaunch, type LaunchAssessment } from "./launch";
import { applyPriceApprovals, toDomainProduct } from "./payload-mapping";
import type { LaunchSummary, Product } from "./types";

/**
 * A Payload product document as a catalog entry — the one mapping every
 * consumer of the administrator-managed catalog uses (Stage 19.8).
 *
 *   storefront (payload-source)   → the product's server-computed launch summary
 *   content:verify                → launch readiness of every CMS product
 *   admin Launch status tab       → the reasons shown to an operator
 *   approval guard (afterChange)  → whether approval may stand
 *
 * ── Commercial facts from structured fields ──────────────────────────────
 *
 * An administrator enters values (SKU, class, pricing model, customers, use
 * case, visual requirement) and, separately, a commercial approval record. A
 * value becomes an APPROVED fact only when that record exists with a reference,
 * an approver and a date. A value without it is PROPOSED; an empty field is
 * MISSING. Entering data never approves it.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Reference = { reference: string; approvedBy: string; approvedOn: string };

/** A complete approval record, or nothing. Partial records approve nothing. */
export function approvalRecord(
  value: { reference?: string | null; approvedBy?: string | null; approvedOn?: string | null } | null | undefined,
): Reference | undefined {
  const reference = value?.reference?.trim();
  const approvedBy = value?.approvedBy?.trim();
  const approvedOn = value?.approvedOn ? String(value.approvedOn).slice(0, 10) : "";
  return reference && approvedBy && ISO_DATE.test(approvedOn) ? { reference, approvedBy, approvedOn } : undefined;
}

const COPY_SIGNOFF = "Description, applications and stated limitations as published";

function fact<T>(value: T | null | undefined, approval: Reference | undefined, empty = false): Fact<T> {
  const isEmpty =
    empty ||
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);
  if (isEmpty) return { state: "MISSING", note: "Not entered in the admin." };
  return approval
    ? { state: "APPROVED", value: value as T, approval }
    : { state: "PROPOSED", value: value as T, source: "Payload admin — entered, not approved" };
}

export function commercialFromDoc(doc: PayloadProduct): CommercialDefinition {
  const approval = approvalRecord(doc.commercialApproval);
  const customers = (doc.customers ?? []).map((row) => row.value).filter(Boolean);

  const openQuestions: OpenQuestion[] = (doc.openQuestions ?? []).map((row, index) => {
    const answerApproval = approvalRecord(row);
    const answer = row.answer === "yes" ? "YES" : row.answer === "no" ? "NO" : undefined;
    return {
      id: row.questionId || `question-${index + 1}`,
      question: row.question,
      answer:
        answer && answerApproval
          ? { state: "APPROVED", value: answer, approval: answerApproval }
          : { state: "MISSING", note: answer ? "Answered without an approval reference." : "Not answered." },
    };
  });

  return {
    productClass: fact(doc.productClass ?? null, approval) as CommercialDefinition["productClass"],
    sku: fact(doc.sku ?? null, approval),
    customer: fact(customers, approval),
    useCase: fact(doc.useCase ?? null, approval),
    pricingModel: fact(doc.pricingModel ?? null, approval) as CommercialDefinition["pricingModel"],
    copy: fact(doc.description ? COPY_SIGNOFF : null, approval),
    weightGrams: fact(typeof doc.weightGrams === "number" ? doc.weightGrams : null, approval),
    visual: {
      required: fact(doc.visualRequirement ?? null, approval) as CommercialDefinition["visual"]["required"],
      renderSpecification: fact(doc.renderSpecification ?? null, approval),
      owner: "Content / design",
    },
    featured: fact(doc.featured ? true : null, approval),
    ...(openQuestions.length > 0 ? { openQuestions } : {}),
  };
}

export type EntryResult =
  | { ok: true; product: Product; entry: CatalogEntry; launch: LaunchAssessment }
  | { ok: false; productId: string; reason: string };

/** A populated (depth ≥ 1) product document and its price approvals, as an assessed entry. */
export function entryFromPayloadDoc(
  doc: PayloadProduct,
  priceApprovals: readonly PriceApprovalRecord[],
  now: Date = new Date(),
  /** Stage 20: the CMS category tree and the verified catalog files. */
  validation?: ProductValidationOptions,
): EntryResult {
  const mapped = toDomainProduct(doc);
  if (!mapped.ok) return { ok: false, productId: mapped.failure.productId, reason: mapped.failure.reason };

  const product = applyPriceApprovals([mapped.product], new Map([[mapped.product.id, priceApprovals]]), now).products[0]!;
  const approval = approvalRecord(doc.approval);

  const entry: CatalogEntry = {
    product,
    // Publication is Payload's own state; the entry is assessed as intended for sale.
    intent: "publish",
    ...(approval ? { approval } : {}),
    priceApprovals: [...priceApprovals],
    priceBasis: product.priceStatus === "approved" ? "Price approval record" : "Entered in the admin",
    contentGaps: [],
    commercial: commercialFromDoc(doc),
  };

  const launch = assessLaunch(entry, product, { now, ...(validation ? { validation } : {}) });
  return { ok: true, product: { ...product, launch: summarize(launch) }, entry, launch };
}

export function summarize(launch: LaunchAssessment): LaunchSummary {
  return {
    ready: launch.launch.ready,
    price: launch.price,
    media: launch.media,
    manufacturing: launch.manufacturing,
    commercial: launch.commercial,
  };
}
