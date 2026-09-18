import { APIError, type CollectionAfterChangeHook, type CollectionBeforeValidateHook } from "payload";

import { capabilities, processOf } from "../content/catalog/capabilities";
import { approvedColours, approvedLayerHeights, approvedMaterials } from "../content/catalog/decisions";
import { RETIRED_PRODUCT_IDS } from "../content/catalog/retired";

import { blockingApprovalReasons, nextProductId } from "./workflow";

/**
 * Product hooks for the administrator-managed catalog (Stage 19.8).
 *
 * Alias-free by necessity: reachable from payload.config.ts, which the Payload
 * CLI loads without tsconfig paths. The launch computation, which needs aliased
 * modules, is imported lazily.
 */

/** Processes that are AVAILABLE (an APPROVED decision). */
export const APPROVED_PROCESS_VALUES: readonly string[] = capabilities("technology")
  .filter((row) => row.status === "AVAILABLE")
  .map((row) => row.value);

/** Processes an administrator may choose: available now, or coming soon (draft products only). */
export const SELECTABLE_PROCESS_VALUES: readonly string[] = capabilities("technology")
  .filter((row) => row.status !== "UNAVAILABLE")
  .map((row) => row.value);

/** Materials on the roadmap, selectable for a draft future product. */
export const COMING_SOON_MATERIAL_VALUES: readonly string[] = capabilities("material")
  .filter((row) => row.status === "COMING_SOON")
  .map((row) => row.value);

/** Technology options labelled with their capability status. */
export const TECHNOLOGY_SELECT_OPTIONS = capabilities("technology").map((row) => ({
  label: `${row.label} — ${row.status === "AVAILABLE" ? "Available now" : row.status === "COMING_SOON" ? "Coming soon" : "Not available"}`,
  value: row.value,
}));

/** FDM layer heights with an APPROVED decision. */
export const APPROVED_FDM_LAYER_HEIGHTS: readonly string[] = approvedLayerHeights("fdm");

/** Colours approved for at least one approved material. */
export const APPROVED_COLOUR_VALUES: readonly string[] = [
  ...new Set(approvedMaterials(undefined, (material) => processOf(material) ?? "").flatMap((m) => approvedColours(m))),
];

/** A new product without a productId gets the next stable id; an existing id is never changed. */
export const assignProductId: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== "create" || !data || (typeof data.productId === "string" && data.productId.trim())) return data;

  const existing = await req.payload.find({
    collection: "products",
    depth: 0,
    pagination: false,
    overrideAccess: true,
    draft: true,
    req,
  });
  return {
    ...data,
    productId: nextProductId(
      existing.docs.map((doc) => String(doc.productId)),
      RETIRED_PRODUCT_IDS,
    ),
  };
};

/**
 * Who owns the product. A save by a signed-in operator makes it
 * administrator-managed, so `content:import` never overwrites a decision made in
 * the admin. Only the import itself (context.contentImport) may write "seed".
 */
export const markSource: CollectionBeforeValidateHook = ({ data, req, context }) => {
  if (!data) return data;
  if ((context as Record<string, unknown> | undefined)?.contentImport) return data;
  if (req.user) return { ...data, source: "admin" };
  return data;
};


/**
 * Approval cannot bypass its prerequisites (Stage 19.8).
 *
 * After any save that leaves a product approved, its launch status is recomputed
 * inside the same transaction. If a prerequisite fails — technical validity,
 * manufacturing capability, commercial approval, price, media, open questions —
 * the save is refused and rolled back with every reason. There is no override:
 * move the product back to provisional to edit it freely.
 */
export const enforceApprovalPrerequisites: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (doc?.approvalStatus !== "approved") return doc;
  // Stage 20: no early return on a context flag. The launch computation performs
  // no writes, so it cannot re-enter this hook — and a request-wide flag would let
  // a second approval in the same request (a bulk update) skip this check.

  const { computeLaunchStatus } = await import("../lib/content/launch-admin");
  const status = await computeLaunchStatus(req.payload, doc.id as number, req);
  const blocking = blockingApprovalReasons(status.reasons);

  if (blocking.length > 0) {
    throw new APIError(
      `This product cannot be approved yet. Resolve first: ${blocking.join("; ")}`,
      400,
      { blocking },
      true,
    );
  }
  return doc;
};
