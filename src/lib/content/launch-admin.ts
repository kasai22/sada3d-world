import { capabilityStatus } from "@/content/catalog/capabilities";
import type { Payload, PayloadRequest } from "payload";

import { CATALOG_ENTRIES } from "@/content/catalog";
import type { PriceApprovalRecord } from "@/lib/catalog/commerce";
import { catalogAssets } from "@/lib/catalog/catalog-assets";
import { readCategoryTree } from "@/lib/catalog/payload-categories";
import { entryFromPayloadDoc } from "@/lib/catalog/payload-entry";
import { readinessLine, readinessPanel } from "@/lib/catalog/readiness-panel";
import type { ProductValidationOptions } from "@/lib/catalog/validation";
import { launchStage, type LaunchStage } from "@/payload/workflow";
import type { Product as PayloadProduct } from "@/payload-types";

/**
 * Launch status for the Payload admin, and for the approval guard.
 *
 * Opening a product answers "why can't this launch?" without reading a dozen
 * fields. The answer is computed from the stored document with the same mapping
 * (`payload-entry.ts`) and the same assessment (`launch.ts`) that
 * `content:verify -- --require-launch` uses, so the admin and the release gate
 * cannot disagree about a product.
 *
 * Given a request, reads inside that request's transaction — which is how the
 * approval guard sees the save it is judging before it commits.
 *
 * Loaded lazily from the Payload hooks, so the Payload config — which the CLI
 * loads without path aliases — never imports it statically.
 */

export interface AdminLaunchStatus {
  launch: string;
  technical: string;
  price: string;
  media: string;
  manufacturing: string;
  commercial: string;
  /** One "• reason" per line. The approval guard parses this; keep it plain. */
  reasons: string;
  /** Stage 20: NOT READY / READY FOR REVIEW / APPROVED / LAUNCH READY. */
  stage: LaunchStage;
  /** Stage 20: the grouped readiness panel, for display. */
  panel: string;
  /** Stage 20: the one-line summary for the product list. */
  readiness: string;
}

export async function computeLaunchStatus(
  payload: Payload,
  id: number,
  req?: PayloadRequest,
  /** Tests pass their own; by default the CMS category tree and the files verified on disk. */
  validationOverride?: ProductValidationOptions,
): Promise<AdminLaunchStatus> {
  /*
   * Stage 20 fixes:
   *
   * · The latest version (`draft: true`) — what the administrator is editing and
   *   what a draft save just stored. The main row can be a stale published state.
   *
   * · Payload merges a `context` passed with a request into that request and
   *   leaves it there. The recursion flag used to stay on the caller's request,
   *   so every later approval guard in the same request (a bulk update, say)
   *   saw it and skipped its check. The caller's context is restored here.
   */
  const callerContext = req?.context;
  let doc: PayloadProduct;
  try {
    doc = (await payload.findByID({
      collection: "products",
      id,
      depth: 1,
      overrideAccess: true,
      draft: true,
      context: { launchStatusNested: true },
      ...(req ? { req } : {}),
    })) as PayloadProduct;
  } finally {
    if (req) req.context = callerContext as PayloadRequest["context"];
  }

  const approvals = await payload.find({
    collection: "price-approvals",
    where: { product: { equals: id } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    ...(req ? { req } : {}),
  });
  const records = toPriceApprovalRecords(approvals.docs);

  // Stage 20: judged against the CMS category tree and the model/image files verified on disk.
  const validation =
    validationOverride ??
    (await (async () => {
      const [tree, assets] = await Promise.all([readCategoryTree(payload, req), catalogAssets()]);
      return { categories: tree.tree, models: assets.models, mediaFiles: assets.mediaFiles };
    })());

  return launchStatusFromDoc(doc, records, validation);
}

export function toPriceApprovalRecords(
  docs: readonly { amount: number; effectiveFrom: string; reference: string; approvedBy: string }[],
): PriceApprovalRecord[] {
  return docs.map((record) => ({
    amount: record.amount,
    currency: "INR",
    effectiveFrom: String(record.effectiveFrom).slice(0, 10),
    reference: record.reference,
    approvedBy: record.approvedBy,
  }));
}

/**
 * The launch status of one stored product, from what has already been read.
 *
 * Pure apart from the clock: the command centre's catalog health (Stage 21)
 * reads every product, every price approval, the category tree and the asset
 * list once, and calls this per product — the same judgement as the admin
 * panel, without a query per product.
 */
export function launchStatusFromDoc(
  doc: PayloadProduct,
  records: readonly PriceApprovalRecord[],
  validation: ProductValidationOptions,
  now: Date = new Date(),
): AdminLaunchStatus {
  const result = entryFromPayloadDoc(doc, [...records], now, validation);
  if (!result.ok) {
    const reason = `Technical: ${result.reason}`;
    return {
      launch: "NOT READY — 1 reason",
      technical: "BLOCKING",
      price: "—",
      media: "—",
      manufacturing: "—",
      commercial: "—",
      reasons: `• ${reason}`,
      stage: "NOT READY",
      panel: `TECHNICAL\n✕ ${result.reason}\n  → Category and Material tabs: a product needs a published category and material\n\nFINAL\nNOT READY`,
      readiness: readinessLine([reason]),
    };
  }

  const { launch } = result;
  const reasons = [...launch.launch.reasons];
  if (doc._status !== "published") reasons.push("Not published");
  if (doc.source !== "admin" && !CATALOG_ENTRIES.some((canonical) => canonical.product.id === result.product.id)) {
    reasons.push("Not in the canonical catalog (src/content/catalog) — content:verify will report a parity failure");
  }

  return {
    launch: reasons.length === 0 ? "READY" : `NOT READY — ${reasons.length} reason${reasons.length === 1 ? "" : "s"}`,
    technical: launch.technical.status,
    price: launch.price,
    media: launch.media,
    // Stage 19.9: a product on a Coming Soon capability says so; it is still not approved.
    manufacturing:
      launch.manufacturing !== "APPROVED" &&
      (capabilityStatus("technology", result.product.technology) === "COMING_SOON" ||
        capabilityStatus("material", result.product.material) === "COMING_SOON")
        ? "COMING SOON — NOT APPROVED"
        : launch.manufacturing,
    commercial: launch.commercial,
    reasons: reasons.map((reason) => `• ${reason}`).join("\n"),
    stage: launchStage(reasons, doc),
    panel: readinessPanel({
      assessment: launch,
      reasons,
      approvalStatus: doc.approvalStatus,
      published: doc._status === "published",
      material: result.product.material,
      technology: result.product.technology,
      stage: launchStage(reasons, doc),
    }),
    readiness: readinessLine(reasons),
  };
}
