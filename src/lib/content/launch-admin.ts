import { capabilityStatus } from "@/content/catalog/capabilities";
import type { Payload, PayloadRequest } from "payload";

import { CATALOG_ENTRIES } from "@/content/catalog";
import type { PriceApprovalRecord } from "@/lib/catalog/commerce";
import { entryFromPayloadDoc } from "@/lib/catalog/payload-entry";
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
  reasons: string;
}

export async function computeLaunchStatus(
  payload: Payload,
  id: number,
  req?: PayloadRequest,
): Promise<AdminLaunchStatus> {
  const doc = (await payload.findByID({
    collection: "products",
    id,
    depth: 1,
    overrideAccess: true,
    context: { launchStatusNested: true },
    ...(req ? { req } : {}),
  })) as PayloadProduct;

  const approvals = await payload.find({
    collection: "price-approvals",
    where: { product: { equals: id } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    ...(req ? { req } : {}),
  });
  const records: PriceApprovalRecord[] = approvals.docs.map((record) => ({
    amount: record.amount,
    currency: "INR",
    effectiveFrom: String(record.effectiveFrom).slice(0, 10),
    reference: record.reference,
    approvedBy: record.approvedBy,
  }));

  const result = entryFromPayloadDoc(doc, records);
  if (!result.ok) {
    return {
      launch: "NOT READY — 1 reason",
      technical: "BLOCKING",
      price: "—",
      media: "—",
      manufacturing: "—",
      commercial: "—",
      reasons: `• Technical: ${result.reason}`,
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
  };
}
