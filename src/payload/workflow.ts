/**
 * The product workflow rules Payload enforces on every write.
 *
 *   Draft → Proposed → Provisional → Approved      (approval status)
 *   Draft ↔ Published                              (publication)
 *   any → Archived                                 (withdrawal)
 *
 * Publishing is editorial and does not make a product purchasable: that needs
 * approval status "approved" and an approved price, and is decided by
 * `lib/catalog/commerce.ts` wherever a product is served or charged. What this
 * file refuses is a *contradictory record* — one an editor could otherwise save
 * by clicking Publish on the wrong thing.
 *
 * Pure, and free of the "@/" alias: this module is reachable from
 * payload.config.ts, which the Payload CLI loads without tsconfig paths.
 */

import { capabilityDefinition, capabilityStatus } from "../content/catalog/capabilities";
import { RETIRED_PRODUCT_IDS, RETIRED_SLUGS } from "../content/catalog/retired";
import { SALES_CLAIM } from "../lib/catalog/merchandising";
import { skuProblem } from "../lib/catalog/sku";

type ApprovalFields = { approvedBy?: string | null; approvedOn?: string | null; reference?: string | null };

export interface ProductWrite {
  _status?: string | null;
  approvalStatus?: string | null;
  approval?: ApprovalFields | null;
  commercialApproval?: ApprovalFields | null;
  visual?: ({ src?: string | null; alt?: string | null; kind?: string | null; approval?: ApprovalFields | null } & Record<string, unknown>) | null;
  openQuestions?: ({ question?: string | null; answer?: string | null } & ApprovalFields & Record<string, unknown>)[] | null;
  price?: number | null;
  priceStatus?: string | null;
  sku?: string | null;
  productId?: string | null;
  slug?: string | null;
  badge?: string | null;
  model?: { url?: string | null; format?: string | null } | null;
}

export interface WorkflowContext {
  /** The operator saving, when there is one. Imports run without. */
  userName?: string | null;
  /** Today, as YYYY-MM-DD. */
  today: string;
  /**
   * The amount of the price approval in effect for this product, if any.
   * Undefined for a product that has none (including one not yet created).
   */
  effectiveApprovedAmount?: number;
  /** True when the write creates the product. */
  creating?: boolean;
}

export interface WorkflowResult {
  errors: string[];
  /** The data with approver and date stamped where they were left empty. */
  data: ProductWrite;
}

const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function checkProductWrite(data: ProductWrite, context: WorkflowContext): WorkflowResult {
  const errors: string[] = [];
  const next: ProductWrite = { ...data };
  const approval = next.approvalStatus ?? "draft";

  if (next._status === "published" && (approval === "draft" || approval === "archived")) {
    errors.push(
      `A product with approval status "${approval}" cannot be published. Move it to proposed or provisional for pre-launch review, or approve it.`,
    );
  }

  if (approval === "approved") {
    const record = { ...(next.approval ?? {}) };
    if (!record.reference?.trim()) {
      errors.push("Approving a product requires an approval reference: where the decision is recorded.");
    }
    if (!record.approvedBy?.trim() && context.userName) record.approvedBy = context.userName;
    if (!record.approvedBy?.trim()) errors.push("Approving a product requires the name of the approver.");
    if (!record.approvedOn) record.approvedOn = context.today;
    next.approval = record;
  }

  /*
   * Stage 19.8 approval records. Any approval the operator starts — a reference
   * typed, an approver named — must be complete, and is stamped with the operator
   * and today where left empty. A record with no reference approves nothing and
   * is left alone, so saving a draft never fails for an approval nobody began.
   */
  const stamp = (record: ApprovalFields | null | undefined, label: string): ApprovalFields | null | undefined => {
    if (!record) return record;
    const started = Boolean(record.reference?.trim() || record.approvedBy?.trim() || record.approvedOn);
    if (!started) return record;
    const out = { ...record };
    if (!out.reference?.trim()) errors.push(`${label} needs a reference: where the decision is recorded.`);
    if (!out.approvedBy?.trim() && context.userName) out.approvedBy = context.userName;
    if (!out.approvedBy?.trim()) errors.push(`${label} needs the name of the approver.`);
    if (!out.approvedOn) out.approvedOn = context.today;
    return out;
  };

  if (next.commercialApproval) next.commercialApproval = stamp(next.commercialApproval, "The commercial approval");

  if (next.visual?.approval) {
    const approval = stamp(next.visual.approval, "The media approval");
    if (approval?.reference?.trim() && (!next.visual.src?.trim() || (next.visual.kind !== "photo" && next.visual.kind !== "render"))) {
      errors.push("Media can only be approved once the image source is set and it is marked a product photo or an approved render.");
    }
    next.visual = { ...next.visual, approval };
  }

  if (next.openQuestions) {
    next.openQuestions = next.openQuestions.map((row, index) => {
      if (row.answer !== "yes" && row.answer !== "no") return row;
      const stamped = stamp(
        { reference: row.reference, approvedBy: row.approvedBy, approvedOn: row.approvedOn },
        `The answer to question ${index + 1}`,
      );
      if (!row.reference?.trim()) errors.push(`The answer to "${row.question ?? `question ${index + 1}`}" needs a reference.`);
      return { ...row, ...stamped };
    });
  }

  /*
   * Stage 20: Payload skips field validators on draft saves, so rules that must
   * hold for every stored record are checked here, where drafts are included.
   */
  /*
   * Stage 22.6: identity. A retired product id or slug may still sit in a stale
   * cart or a bookmark, so it can never name a new product — and a slug is half
   * of a URL, so it is lower-case words joined by hyphens. content:verify already
   * reported both; the CMS now refuses them when a product is created or
   * published. Withdrawing an existing record (unpublishing, archiving) stays
   * possible, so a bad record can always be taken down.
   */
  const identityMatters = context.creating === true || next._status === "published";
  if (identityMatters && next.productId && RETIRED_PRODUCT_IDS.has(next.productId)) {
    errors.push(`Product id "${next.productId}" belonged to the retired catalog and can never name another product.`);
  }
  if (identityMatters && next.slug && RETIRED_SLUGS.has(next.slug)) {
    errors.push(`The URL segment "${next.slug}" belonged to the retired catalog and cannot be reused.`);
  } else if (identityMatters && next.slug && !SLUG_SHAPE.test(next.slug)) {
    errors.push(`The URL segment "${next.slug}" must be lower-case letters and digits joined by single hyphens, e.g. spur-gear-24t.`);
  }

  const malformedSku = skuProblem(next.sku);
  if (malformedSku) errors.push(`SKU "${next.sku}": ${malformedSku}`);
  if (next.badge && SALES_CLAIM.test(next.badge)) {
    errors.push("A badge cannot claim a sales ranking: no sales data supports one. Use Featured or Recommended.");
  }
  if (next.model?.url && !/^\/models\/[a-z0-9]+(?:-[a-z0-9]+)*\.(stl|obj|glb|gltf)$/.test(next.model.url)) {
    errors.push('A model path looks like "/models/part-name.stl": lowercase, hyphenated, under /models/.');
  }

  const price = next.price ?? 0;
  if ((next.priceStatus === "quote-only") !== (price === 0)) {
    errors.push(
      price === 0
        ? 'A price of 0 means quote-only; set the price status to "Quote only".'
        : 'A quote-only product must have a price of 0.',
    );
  }

  if (next.priceStatus === "approved") {
    if (context.effectiveApprovedAmount === undefined) {
      errors.push(
        "A price can only be marked approved when a price approval is in effect for this product. Record one under Price approvals first.",
      );
    } else if (context.effectiveApprovedAmount !== price) {
      errors.push(
        `The price approval in effect is ₹${context.effectiveApprovedAmount}; the product price must match it.`,
      );
    }
  }

  return { errors, data: next };
}

/**
 * Capability and publication (Stage 19.9).
 *
 * An administrator may draft a future product on a COMING SOON process or
 * material, so a roadmap product can be prepared. Publishing it is refused
 * until every capability it uses is AVAILABLE, so a Coming Soon capability can
 * never reach the storefront through a product. An UNAVAILABLE capability is
 * refused even in a draft.
 */
export function capabilityProblems(
  product: { technology?: string | null; material?: string | null },
  publishing: boolean,
): string[] {
  const problems: string[] = [];
  const checks = [
    ["technology", product.technology],
    ["material", product.material],
  ] as const;
  for (const [kind, value] of checks) {
    if (!value) continue;
    const status = capabilityStatus(kind, value);
    const label = capabilityDefinition(kind, value)?.label ?? value;
    const noun = kind === "technology" ? "manufacturing process" : "material";
    if (status === "UNAVAILABLE") {
      problems.push(`${label} is not an available or planned ${noun}.`);
    } else if (status === "COMING_SOON" && publishing) {
      problems.push(
        `${label} is coming soon — a product that uses it can be kept as a draft, but it cannot be published until ${label} is approved.`,
      );
    }
  }
  return problems;
}

/** Launch reasons that do not stop an approval from standing. */
const NOT_PREREQUISITES = [
  /^Product not approved/,
  /^Not published$/,
  /^Not in the canonical catalog/,
  /^Technical: not in the canonical catalog$/,
];

/**
 * The launch reasons that block an approval (Stage 19.8): every reason except
 * the approval itself, publication, and absence from the repository seed — an
 * administrator-managed product is never in the seed. `reasons` is the admin
 * launch status, one "• reason" per line.
 */
export function blockingApprovalReasons(reasons: string): string[] {
  return reasons
    .split("\n")
    .map((line) => line.replace(/^• /, "").trim())
    .filter((line) => line && !NOT_PREREQUISITES.some((pattern) => pattern.test(line)));
}

/**
 * The launch stage (Stage 20) — derived on the server, never selected.
 *
 *   NOT READY          a prerequisite is unmet (technical, manufacturing,
 *                      commercial, price, media, open questions)
 *   READY FOR REVIEW   every prerequisite passes; the product approval itself
 *                      has not been recorded
 *   APPROVED           approved, not yet published
 *   LAUNCH READY       approved and published: sellable in launch mode
 *
 * Reuses the approval status and Payload publication; it is a reading of them
 * plus the launch assessment, not a second state machine. A Featured, Published
 * or Approved flag cannot move a product past a stage its prerequisites do not
 * support: approval is refused until they pass, and this reads the assessment.
 */
export type LaunchStage = "NOT READY" | "READY FOR REVIEW" | "APPROVED" | "LAUNCH READY";

export function launchStage(
  reasons: readonly string[],
  product: { approvalStatus?: string | null; _status?: string | null },
): LaunchStage {
  const blocking = blockingApprovalReasons(reasons.map((reason) => `• ${reason}`).join("\n"));
  if (blocking.length > 0) return "NOT READY";
  if (product.approvalStatus !== "approved") return "READY FOR REVIEW";
  if (product._status !== "published") return "APPROVED";
  return "LAUNCH READY";
}

/**
 * The next stable product id for a product created in the admin: one above the
 * highest existing numeric id, never below p-101, never a retired id. Ids are
 * identity, not business data, so assigning one invents nothing.
 */
export function nextProductId(existing: readonly string[], retired: ReadonlySet<string>): string {
  const numbers = existing
    .map((id) => /^p-(\d+)$/.exec(id)?.[1])
    .filter((digits): digits is string => Boolean(digits))
    .map(Number);
  let next = Math.max(100, ...numbers) + 1;
  while (retired.has(`p-${String(next).padStart(3, "0")}`) || existing.includes(`p-${next}`)) next += 1;
  return `p-${next}`;
}
