import type { CustomCartLine } from "@/lib/cart/types";
import { NotFoundError } from "@/lib/errors";
import type { GeometryAnalysisResult } from "@/lib/geometry/types";
import { isAnalyzable } from "@/lib/models";
import { EVENTS, log } from "@/lib/observability";
import type { Order, OrderItemSourceFile } from "@/lib/orders/types";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  resolveStorageAdapter,
  type SignedDownload,
} from "@/lib/storage";
import { isDesignId, keyBelongsTo } from "@/lib/storage/keys";

import {
  ensureAnalysis,
  removeObject,
  requireDesignStorage,
  storageFailure,
} from "./design-uploads";
import {
  DESIGN_NOT_FOUND,
  customerDesignRepository,
  designStorageAvailability,
} from "./designs";
import type { CustomerDesign, CustomerIdentity } from "./types";

/**
 * Using a stored design: reading it, downloading it, deleting it, ordering it.
 *
 * ── The one path to a file ───────────────────────────────────────────────
 *
 *   design id (from the URL)
 *     → the signed-in identity (from the auth adapter, never the request)
 *     → the row for that pair (scoped in SQL)
 *     → verified? key in this customer's namespace? object still there?
 *     → a signed URL for that key, valid for two minutes
 *
 * A request never names a key. There is no parameter anywhere in the API that
 * accepts one, so `?key=someone-else/file` is not a request that can be refused
 * — it is a request that means nothing.
 *
 * An unknown id, another customer's id, a pending upload, a failed one, a
 * deleted one and one whose object has gone missing all produce the same 404
 * with the same sentence. The log records which it was; the response does not.
 */

/**
 * How long a deleted design's object is kept before removal.
 *
 * Long enough that a checkout already running when the customer pressed Delete
 * still finds the file it validated a moment earlier. The design is unlisted,
 * undownloadable and unorderable immediately; only the bytes wait.
 */
export const DELETED_OBJECT_GRACE_MS = 60 * 60 * 1000;

/** How long after its upload window closes a pending design is treated as abandoned. */
export const ABANDONED_UPLOAD_GRACE_MS = 60 * 60 * 1000;

const NOT_STORED_REASON =
  "This part's file is not stored for manufacturing. Upload it again from Custom print.";

const GUEST_REASON =
  "This part's file is only in your browser. It has to be uploaded to your account before it can be manufactured.";

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export interface DesignWithAnalysis {
  design: CustomerDesign;
  /** Measured from the stored bytes. Null for STEP, or until verified. */
  analysis: GeometryAnalysisResult | null;
}

/** One of this customer's designs, with its durable analysis once verified. */
export async function readCustomerDesign(
  identity: CustomerIdentity,
  designId: string,
): Promise<DesignWithAnalysis> {
  const storage = requireDesignStorage();

  if (!isDesignId(designId)) throw new NotFoundError(DESIGN_NOT_FOUND);

  const design = await customerDesignRepository.get(identity.id, designId);
  if (!design || design.storageState === "deleted") {
    throw new NotFoundError(DESIGN_NOT_FOUND);
  }

  return {
    design,
    analysis:
      design.storageState === "verified" ? await ensureAnalysis(storage, design) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

/**
 * A short-lived URL for one of this customer's verified files.
 *
 * The object is checked before a URL is signed, so a missing file is a 404 here
 * rather than an XML error page from the storage provider in the customer's
 * browser.
 */
export async function authorizeDesignDownload(
  identity: CustomerIdentity,
  designId: string,
): Promise<SignedDownload> {
  const storage = requireDesignStorage();

  if (!isDesignId(designId)) throw new NotFoundError(DESIGN_NOT_FOUND);

  const design = await customerDesignRepository.get(identity.id, designId);

  const refusal = !design
    ? "not_found_or_not_owner"
    : design.storageState !== "verified"
      ? `state_${design.storageState}`
      : !design.fileKey || !keyBelongsTo(design.fileKey, design.customerId, design.id)
        ? "key_namespace_mismatch"
        : null;

  if (!design || refusal) {
    log.warn(EVENTS.designDownloadDenied, {
      designId,
      customerId: identity.id,
      reason: refusal ?? "unknown",
    });
    throw new NotFoundError(DESIGN_NOT_FOUND);
  }

  let head;
  try {
    head = await storage.head(design.fileKey);
  } catch (error) {
    throw storageFailure(error, "head", design.id);
  }

  if (!head) {
    log.error(EVENTS.designObjectMissing, {
      designId: design.id,
      customerId: identity.id,
      stage: "download",
    });
    throw new NotFoundError(DESIGN_NOT_FOUND);
  }

  let signed: SignedDownload;
  try {
    signed = await storage.signDownload({
      key: design.fileKey,
      fileName: design.name,
      ...(design.contentType ? { contentType: design.contentType } : {}),
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
  } catch (error) {
    throw storageFailure(error, "sign_download", design.id);
  }

  log.info(EVENTS.designDownloadGranted, { designId: design.id, customerId: identity.id });
  return signed;
}

/* ------------------------------------------------------------------ *
 * Delete
 * ------------------------------------------------------------------ */

/**
 * Retires a design.
 *
 * The record changes first, and that is the part that must not fail silently:
 * from this moment the design is not listed, not downloadable and not
 * orderable. The object is removed by the sweep once the grace period has
 * passed and no order names it.
 *
 * Deleting a design that has been ordered never touches the order. The order
 * holds its own snapshot of the key and checksum, and the sweep will not remove
 * an object any order still references.
 *
 * Idempotent: deleting a deleted design succeeds.
 */
export async function deleteCustomerDesign(
  identity: CustomerIdentity,
  designId: string,
  now: Date = new Date(),
): Promise<void> {
  requireDesignStorage();

  if (!isDesignId(designId)) throw new NotFoundError(DESIGN_NOT_FOUND);

  const design = await customerDesignRepository.get(identity.id, designId);
  if (!design) throw new NotFoundError(DESIGN_NOT_FOUND);
  if (design.storageState === "deleted") return;

  const moved = await customerDesignRepository.markDeleted(identity.id, designId, now);

  if (moved) {
    log.info(EVENTS.designDeleted, {
      designId,
      customerId: identity.id,
      ordered: design.orderReferences.length > 0,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Sweep
 * ------------------------------------------------------------------ */

export interface SweepReport {
  /** Pending uploads nobody finished, now marked failed. */
  abandoned: number;
  /** Objects removed and recorded as removed. */
  removed: number;
  /** Candidates kept because an order references them. */
  retained: number;
  /** Removals that failed and will be retried next time. */
  failed: number;
}

/**
 * Reconciles storage with the records.
 *
 * What makes every failure ordering in `design-uploads.ts` converge: abandoned
 * uploads are closed, refused and retired objects are removed, and a removal
 * that failed is simply found again next time, because nothing records it as
 * removed until the provider confirms it.
 *
 * Bounded by `limit` so it can run after a request (see the upload-intents
 * route) without holding a function open. `npm run storage:sweep` runs it on
 * demand, and a scheduled job can call the same function.
 */
export async function sweepDesignStorage(
  options: { now?: Date; limit?: number } = {},
): Promise<SweepReport> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;
  const report: SweepReport = { abandoned: 0, removed: 0, retained: 0, failed: 0 };

  if (!designStorageAvailability().available) return report;

  const storage = resolveStorageAdapter();

  const expired = await customerDesignRepository.listExpiredUploads(
    new Date(now.getTime() - ABANDONED_UPLOAD_GRACE_MS),
    limit,
  );

  for (const design of expired) {
    const moved = await customerDesignRepository.markFailed(design.customerId, design.id, {
      at: now,
      code: "upload_abandoned",
      message: "This upload was not completed. Upload the file again.",
      from: ["pending"],
    });

    if (moved) {
      report.abandoned += 1;
      log.info(EVENTS.designObjectRejected, {
        designId: design.id,
        customerId: design.customerId,
        reason: "upload_abandoned",
      });
    }
  }

  const candidates = await customerDesignRepository.listCleanupCandidates({
    now,
    deletedBefore: new Date(now.getTime() - DELETED_OBJECT_GRACE_MS),
    limit,
  });

  for (const design of candidates) {
    // Asked again here: an order may have been placed since the list was read.
    if (await customerDesignRepository.isReferencedByOrder(design)) {
      report.retained += 1;
      continue;
    }

    if (await removeObject(storage, design, now)) report.removed += 1;
    else report.failed += 1;
  }

  if (report.abandoned + report.removed + report.failed > 0) {
    log.info(EVENTS.storageCleanupCompleted, { ...report });
  }

  return report;
}

/* ------------------------------------------------------------------ *
 * Manufacturing availability
 * ------------------------------------------------------------------ */

export type DesignFileAvailability =
  | { durable: true; design: CustomerDesign }
  /** `reason` is shown to the customer. */
  | { durable: false; reason: string };

/**
 * Whether a model can be sent for manufacturing.
 *
 * Every condition an order depends on, in the order they are cheapest to
 * check:
 *
 *   a signed-in customer        a design has an owner, and a guest has no
 *                               designs to own
 *   storage and a database      both halves of a design
 *   a design of theirs          scoped in SQL; someone else's is "not stored"
 *   verified                    not pending, not failed, not deleted
 *   analysed, where analysable  a mesh format with no durable analysis has
 *                               not been read by the server
 *   the object is there         with `verifyObject`, a HEAD request confirms
 *                               the bytes still exist and are the right size
 *
 * `verifyObject` costs a round trip to storage, so the cart page — which prices
 * on every render — uses the database answer, and checkout, which is about to
 * take money, asks storage as well.
 */
export async function designFileAvailability(
  identity: CustomerIdentity | null,
  designId: string,
  options: { verifyObject: boolean },
): Promise<DesignFileAvailability> {
  if (!identity) return { durable: false, reason: GUEST_REASON };

  const availability = designStorageAvailability();
  if (!availability.available) return { durable: false, reason: availability.reason };

  if (!isDesignId(designId)) return { durable: false, reason: NOT_STORED_REASON };

  let design: CustomerDesign | null;
  try {
    design = await customerDesignRepository.get(identity.id, designId);
  } catch {
    return {
      durable: false,
      reason: "This part's file could not be checked right now. Try again shortly.",
    };
  }

  if (!design || design.storageState === "deleted" || design.storageState === "failed") {
    return { durable: false, reason: NOT_STORED_REASON };
  }

  if (design.storageState === "pending") {
    return {
      durable: false,
      reason:
        "This part's file has not finished uploading and being checked. Finish the upload in Custom print, then continue.",
    };
  }

  if (
    !design.sha256 ||
    !design.fileKey ||
    !keyBelongsTo(design.fileKey, design.customerId, design.id)
  ) {
    return { durable: false, reason: NOT_STORED_REASON };
  }

  if (isAnalyzable(design.name) && !design.analysisIdentity) {
    return {
      durable: false,
      reason: "This part's file has not been analysed yet. Open it in Custom print to finish.",
    };
  }

  if (options.verifyObject) {
    let head;
    try {
      head = await resolveStorageAdapter().head(design.fileKey);
    } catch (error) {
      storageFailure(error, "head", design.id);
      return {
        durable: false,
        reason: "This part's stored file could not be checked right now. Try again shortly.",
      };
    }

    if (!head || head.size !== design.sizeBytes) {
      log.error(EVENTS.designObjectMissing, {
        designId: design.id,
        customerId: identity.id,
        stage: "checkout",
      });
      return {
        durable: false,
        reason: "This part's stored file could not be found. Upload it again from Custom print.",
      };
    }
  }

  return { durable: true, design };
}

export type ManufacturingFiles =
  | { ok: true; files: ReadonlyMap<string, OrderItemSourceFile> }
  | { ok: false; messages: readonly string[] };

/**
 * The file snapshot for every custom line, or why one cannot be made.
 *
 * Keyed by cart line id. Each snapshot is built from the verified design record
 * — never from what the cart line says about the file — plus the configuration
 * the line was quoted for.
 */
export async function resolveManufacturingFiles(
  identity: CustomerIdentity | null,
  lines: readonly CustomCartLine[],
): Promise<ManufacturingFiles> {
  const files = new Map<string, OrderItemSourceFile>();
  const messages: string[] = [];

  for (const line of lines) {
    const availability = await designFileAvailability(identity, line.model.modelId, {
      verifyObject: true,
    });

    if (!availability.durable) {
      messages.push(`${line.model.name}: ${availability.reason}`);
      continue;
    }

    const { design } = availability;

    files.set(line.id, {
      designId: design.id,
      storageKey: design.fileKey,
      sha256: design.sha256 ?? "",
      fileName: design.name,
      sizeBytes: design.sizeBytes,
      format: design.format,
      ...(design.contentType ? { contentType: design.contentType } : {}),
      ...(design.analysisIdentity ? { analysisIdentity: design.analysisIdentity } : {}),
      configuration: {
        material: line.configuration.material,
        quality: line.configuration.quality,
        finish: line.configuration.finish,
      },
    });
  }

  return messages.length > 0 ? { ok: false, messages } : { ok: true, files };
}

/**
 * Records which designs an order was made from, for the account.
 *
 * After the order exists, and allowed to fail: the order and its snapshot are
 * the record that matters, and a missing account link is a cosmetic gap that is
 * logged rather than a reason to report a paid order as failed.
 */
export async function linkOrderToDesigns(order: Order): Promise<void> {
  if (!order.customerId) return;

  for (const item of order.items) {
    if (!item.sourceFile) continue;

    try {
      await customerDesignRepository.linkOrder(
        order.customerId,
        item.sourceFile.designId,
        order.reference,
      );
    } catch (error) {
      log.warn(EVENTS.storageCleanupRequired, {
        designId: item.sourceFile.designId,
        orderReference: order.reference,
        reason: `design_order_link_failed:${error instanceof Error ? error.name : "unknown"}`,
      });
    }
  }
}
