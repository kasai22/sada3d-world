import {
  HEAD_BYTES,
  ModelFileError,
  extensionOf,
  inspectModelHead,
  validateModelDescriptor,
} from "@/lib/custom-print/inspect";
import {
  MODEL_CONTENT_TYPES,
  MODEL_FORMAT_LABELS,
  isAcceptedExtension,
} from "@/lib/custom-print/types";
import {
  ConflictError,
  DomainError,
  InfrastructureError,
  ModelTooComplexError,
  NotFoundError,
  RateLimitedError,
  UploadRejectedError,
  ValidationError,
} from "@/lib/errors";
import type { GeometryAnalysisResult } from "@/lib/geometry/types";
import { analysisIdentity as analysisIdentityOf, analyzeModel, isAnalyzable } from "@/lib/models";
import { findStoredAnalysis, saveStoredAnalysis } from "@/lib/models/analysis-store";
import { EVENTS, log } from "@/lib/observability";
import {
  StorageError,
  UPLOAD_URL_TTL_SECONDS,
  resolveStorageAdapter,
  storageStatus,
  type SignedUpload,
  type StorageAdapter,
} from "@/lib/storage";
import {
  designObjectKey,
  isDesignId,
  keyBelongsTo,
  newDesignId,
  newObjectId,
  sanitizeFileName,
} from "@/lib/storage/keys";
import { BoundedReadError, SHA256_PATTERN, readBounded } from "@/lib/storage/stream";

import {
  DESIGN_NOT_FOUND,
  customerDesignRepository,
  designStorageAvailability,
} from "./designs";
import type { CustomerDesign, CustomerIdentity, DesignStorageState } from "./types";

/**
 * Uploading a design.
 *
 * ── The flow ─────────────────────────────────────────────────────────────
 *
 *   1  browser     validates for the customer's sake and hashes the file
 *   2  intent      the server authorises the upload, writes a PENDING row
 *                  with a key it generated, then signs a PUT for that key
 *   3  browser     uploads straight to R2 with the signed URL
 *   4  complete    the server re-reads the stored object: existence, size,
 *                  SHA-256, format signature, and — for a mesh format — a
 *                  full parse and measurement. Only then VERIFIED.
 *
 * ── Ordering, and what each failure leaves behind ────────────────────────
 *
 * There are no distributed transactions between PostgreSQL and R2, and this
 * does not pretend otherwise. The order of writes is what makes every failure
 * recoverable instead:
 *
 *   row written, signing fails        a pending row with no object. Expires,
 *                                     is marked abandoned by the sweep.
 *   row written, upload never made    the same.
 *   object stored, finalise fails     a pending row that knows the key. Retry
 *   (DB or network)                   finalises it; if nobody does, the sweep
 *                                     marks it abandoned and removes the object.
 *   verified, then object vanishes    availability checks the object before an
 *                                     order is placed, and refuses.
 *   rejected, object removal fails    a failed row with no `object_removed_at`;
 *                                     the sweep retries the removal.
 *
 * The row is always written *before* the signed URL exists, so there is no
 * moment at which an object can be in the bucket without a row naming it.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────
 *
 *   intent twice, same file   converges on one design: (customer, sha256) is
 *                             unique while pending or verified. A pending one
 *                             gets a fresh URL for the same key; a verified one
 *                             needs no upload at all.
 *   complete twice            the design id is the identity. The second call
 *                             reads the recorded outcome — the same verified
 *                             design, or the same rejection.
 */

/** Uploads a customer may have open at once. Counted in the database. */
export const MAX_ACTIVE_UPLOADS = 5;

const REJECTION = {
  upload_missing:
    "The file did not arrive before its upload link expired. Upload it again.",
  size_mismatch: "The stored file is not the size that was declared. Upload it again.",
  checksum_mismatch:
    "The stored file does not match the file you selected. Upload it again.",
  object_missing: "The stored copy of this file could not be found. Upload it again.",
  analysis_failed:
    "This model could not be analysed. It may be damaged or in an unexpected format.",
} as const;

/* ------------------------------------------------------------------ *
 * Infrastructure boundary
 * ------------------------------------------------------------------ */

let reportedUnconfigured = false;

/**
 * The storage adapter, when designs can actually be stored.
 *
 * Refuses with a 503-shaped error otherwise, and says in the server log which
 * variables are missing — once per process, by name, never by value.
 */
export function requireDesignStorage(): StorageAdapter {
  const availability = designStorageAvailability();

  if (!availability.available) {
    if (!reportedUnconfigured) {
      reportedUnconfigured = true;
      const status = storageStatus();
      log.error(EVENTS.storageNotConfigured, {
        problems: status.configured ? "database not configured" : status.problems.join(" "),
      });
    }
    throw new InfrastructureError("Design storage is not available right now.");
  }

  return resolveStorageAdapter();
}

/**
 * A storage failure, logged for an operator and answered as a 503.
 *
 * The provider's code reaches the log; nothing about it reaches the customer.
 */
export function storageFailure(
  error: unknown,
  operation: string,
  designId?: string,
): DomainError {
  if (error instanceof DomainError) return error;

  log.error(EVENTS.storageUnavailable, {
    operation,
    designId,
    kind: error instanceof StorageError ? error.kind : "unexpected",
    detail: error instanceof StorageError ? error.message : undefined,
  });

  return new InfrastructureError(
    "File storage is temporarily unavailable. Try again shortly.",
  );
}

/** A stored key that is not the shape this design's key must have is refused. */
function assertKey(design: CustomerDesign): string {
  if (!design.fileKey || !keyBelongsTo(design.fileKey, design.customerId, design.id)) {
    log.error(EVENTS.designObjectRejected, {
      designId: design.id,
      customerId: design.customerId,
      reason: "key_namespace_mismatch",
    });
    throw new InfrastructureError("This design's file cannot be reached right now.");
  }
  return design.fileKey;
}

/* ------------------------------------------------------------------ *
 * Upload intent
 * ------------------------------------------------------------------ */

export interface UploadIntentInput {
  fileName: string;
  sizeBytes: number;
  /** Lowercase hex SHA-256 the browser computed over the file. */
  sha256: string;
}

export type UploadIntent =
  | { status: "upload_required"; design: CustomerDesign; upload: SignedUpload }
  /** This customer already has these exact bytes stored and verified. */
  | { status: "already_stored"; design: CustomerDesign };

async function signUploadFor(
  storage: StorageAdapter,
  design: CustomerDesign,
): Promise<SignedUpload> {
  const key = assertKey(design);

  try {
    return await storage.signUpload({
      key,
      contentType: design.contentType ?? "application/octet-stream",
      size: design.sizeBytes,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
  } catch (error) {
    throw storageFailure(error, "sign_upload", design.id);
  }
}

/**
 * An existing pending or verified design for the same bytes.
 *
 * Returns the intent to hand back, or null when the existing design turned out
 * to be stale (its verified object is gone) and a fresh upload is needed.
 */
async function resume(
  storage: StorageAdapter,
  design: CustomerDesign,
  now: Date,
): Promise<UploadIntent | null> {
  if (design.storageState === "verified") {
    const key = assertKey(design);

    let head;
    try {
      head = await storage.head(key);
    } catch (error) {
      throw storageFailure(error, "head", design.id);
    }

    if (head && head.size === design.sizeBytes) {
      return { status: "already_stored", design };
    }

    // Verified once, gone now. Retire the record so the file can be uploaded again.
    log.error(EVENTS.designObjectMissing, {
      designId: design.id,
      customerId: design.customerId,
      stage: "upload_intent",
    });
    await customerDesignRepository.markFailed(design.customerId, design.id, {
      at: now,
      code: "object_missing",
      message: REJECTION.object_missing,
      from: ["verified"],
    });
    return null;
  }

  const renewed = await customerDesignRepository.renewUpload(
    design.customerId,
    design.id,
    new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000),
  );
  if (!renewed) return null;

  return {
    status: "upload_required",
    design: renewed,
    upload: await signUploadFor(storage, renewed),
  };
}

/**
 * Authorises one upload for the signed-in customer.
 *
 * The identity is a parameter, produced by the auth adapter; the input carries
 * a filename, a size and a checksum and nothing else. The key, the owner, the
 * content type and the expiry are all decided here.
 */
export async function createUploadIntent(
  identity: CustomerIdentity,
  input: UploadIntentInput,
  now: Date = new Date(),
): Promise<UploadIntent> {
  const storage = requireDesignStorage();

  const name = sanitizeFileName(input.fileName);
  if (!name) {
    throw new ValidationError("This file name cannot be used. Rename the file and try again.", [
      { field: "fileName", message: "Use a file name with a supported extension." },
    ]);
  }

  try {
    validateModelDescriptor(name, input.sizeBytes);
  } catch (error) {
    if (error instanceof ModelFileError) {
      throw new ValidationError(error.message, [{ field: "file", message: error.message }]);
    }
    throw error;
  }

  const extension = extensionOf(name);
  if (!isAcceptedExtension(extension)) {
    throw new ValidationError("This file type isn't supported.");
  }

  const sha256 = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";
  if (!SHA256_PATTERN.test(sha256)) {
    throw new ValidationError("This upload is missing its file checksum.", [
      { field: "sha256", message: "A lowercase hex SHA-256 is required." },
    ]);
  }

  /*
   * Bounded: each pass either returns, or found a stale design and retired it,
   * or lost an insert race to a concurrent identical intent. Three passes cover
   * every interleaving of two requests.
   */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await customerDesignRepository.findActiveBySha256(identity.id, sha256);

    if (existing) {
      const resumed = await resume(storage, existing, now);
      if (resumed) {
        log.info(EVENTS.designUploadIntentCreated, {
          designId: resumed.design.id,
          customerId: identity.id,
          outcome: resumed.status === "already_stored" ? "already_stored" : "resumed",
        });
        return resumed;
      }
      continue;
    }

    const active = await customerDesignRepository.countActiveUploads(identity.id, now);
    if (active >= MAX_ACTIVE_UPLOADS) {
      throw new RateLimitedError(
        "Too many uploads are in progress. Let one finish, then try again.",
        60,
      );
    }

    const designId = newDesignId();

    const created = await customerDesignRepository.createPending({
      id: designId,
      customerId: identity.id,
      name,
      format: MODEL_FORMAT_LABELS[extension],
      sizeBytes: input.sizeBytes,
      storageKey: designObjectKey({
        customerId: identity.id,
        designId,
        objectId: newObjectId(),
      }),
      contentType: MODEL_CONTENT_TYPES[extension],
      sha256,
      uploadExpiresAt: new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000),
    });

    if (!created.created) continue;

    const upload = await signUploadFor(storage, created.design);

    log.info(EVENTS.designUploadIntentCreated, {
      designId,
      customerId: identity.id,
      format: created.design.format,
      sizeBytes: input.sizeBytes,
      outcome: "created",
    });

    return { status: "upload_required", design: created.design, upload };
  }

  throw new ConflictError("This file is already being uploaded. Try again in a moment.");
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

type Verdict =
  | { ok: true; analysis: GeometryAnalysisResult | null }
  | { ok: false; code: string; message: string };

const reject = (code: string, message: string): Verdict => ({ ok: false, code, message });

/**
 * Checks the stored object against everything the pending design declared.
 *
 * Returns a verdict for anything that is a fact about the file, and throws for
 * anything that is a fact about the infrastructure. The distinction is the
 * point: a checksum mismatch is recorded and never retried, while a network
 * failure leaves the design pending so a retry can still succeed.
 *
 * Nothing the browser said is trusted here. Size and checksum were declared by
 * the browser and are *compared*; the format is read from the bytes; the
 * content type is the server's own.
 */
async function verifyPendingObject(
  storage: StorageAdapter,
  design: CustomerDesign,
  now: Date,
): Promise<Verdict> {
  const key = assertKey(design);

  let head;
  try {
    head = await storage.head(key);
  } catch (error) {
    throw storageFailure(error, "head", design.id);
  }

  if (!head) {
    const expires = design.uploadExpiresAt ? Date.parse(design.uploadExpiresAt) : 0;
    if (now.getTime() <= expires) {
      throw new ConflictError(
        "The upload has not finished yet. Wait for it to complete, then try again.",
      );
    }
    return reject("upload_missing", REJECTION.upload_missing);
  }

  if (head.size !== design.sizeBytes) {
    return reject("size_mismatch", REJECTION.size_mismatch);
  }

  let readable;
  try {
    readable = await storage.get(key);
  } catch (error) {
    throw storageFailure(error, "get", design.id);
  }

  if (!readable) return reject("object_missing", REJECTION.object_missing);

  let read;
  try {
    read = await readBounded(readable.body, design.sizeBytes);
  } catch (error) {
    if (error instanceof BoundedReadError) {
      return reject("size_mismatch", REJECTION.size_mismatch);
    }
    throw storageFailure(error, "read", design.id);
  }

  if (read.sha256 !== design.sha256) {
    return reject("checksum_mismatch", REJECTION.checksum_mismatch);
  }

  try {
    inspectModelHead({
      fileName: design.name,
      size: read.bytes.byteLength,
      head: read.bytes.subarray(0, HEAD_BYTES),
    });
  } catch (error) {
    if (error instanceof ModelFileError) return reject("format_invalid", error.message);
    throw error;
  }

  // STEP is stored and verified; it is not a mesh, and is not measured.
  if (!isAnalyzable(design.name)) return { ok: true, analysis: null };

  // Outside the try below: a database outage is not a verdict on the file.
  const cached = await findStoredAnalysis(read.sha256);
  if (cached) return { ok: true, analysis: cached };

  log.info(EVENTS.designAnalysisStarted, { designId: design.id, format: design.format });

  try {
    const analysis = await analyzeModel({
      fileName: design.name,
      bytes: read.bytes,
      ...(design.contentType ? { contentType: design.contentType } : {}),
    });

    log.info(EVENTS.designAnalysisCompleted, {
      designId: design.id,
      identity: analysis.identity,
      objects: analysis.objectCount,
      topology: analysis.topology.topology,
    });

    return { ok: true, analysis };
  } catch (error) {
    if (error instanceof ModelTooComplexError) {
      // A readable file past the analysis limits: a different fix for the
      // customer (reduce the detail) than a damaged one, so a different code.
      return reject("model_too_complex", error.message);
    }
    if (
      error instanceof DomainError &&
      (error.kind === "model_parse" || error.kind === "model_analysis")
    ) {
      // The parser's message is written for a customer: "unsafe file path",
      // "no printable geometry". It is the most useful thing to tell them.
      return reject("model_unreadable", error.message);
    }

    log.error(EVENTS.modelAnalysisFailed, {
      designId: design.id,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return reject("analysis_failed", REJECTION.analysis_failed);
  }
}

/**
 * Removes a refused object, as far as it is safe to say so yet.
 *
 * The delete is attempted immediately so rejected bytes do not sit in the
 * bucket. It is only *recorded* as removed once the upload URL has expired:
 * before then the browser could still PUT the object back, and a record saying
 * "removed" would be wrong. The sweep revisits anything not yet recorded.
 */
export async function removeObject(
  storage: StorageAdapter,
  design: CustomerDesign,
  now: Date,
): Promise<boolean> {
  if (!design.fileKey) {
    // Nothing was ever stored under this record; there is nothing to remove.
    await customerDesignRepository.markObjectRemoved(design.customerId, design.id, now);
    return true;
  }

  try {
    await storage.delete(design.fileKey);
  } catch (error) {
    log.error(EVENTS.designObjectDeleteFailed, {
      designId: design.id,
      customerId: design.customerId,
      kind: error instanceof StorageError ? error.kind : "unexpected",
    });
    log.warn(EVENTS.storageCleanupRequired, { designId: design.id, reason: "delete_failed" });
    return false;
  }

  const uploadClosed =
    !design.uploadExpiresAt || Date.parse(design.uploadExpiresAt) <= now.getTime();

  if (uploadClosed) {
    await customerDesignRepository.markObjectRemoved(design.customerId, design.id, now);
  }

  return true;
}

async function rejectDesign(
  storage: StorageAdapter,
  design: CustomerDesign,
  verdict: { code: string; message: string },
  now: Date,
  from: readonly DesignStorageState[],
): Promise<boolean> {
  const moved = await customerDesignRepository.markFailed(design.customerId, design.id, {
    at: now,
    code: verdict.code,
    message: verdict.message,
    from,
  });

  if (moved) {
    log.warn(EVENTS.designObjectRejected, {
      designId: design.id,
      customerId: design.customerId,
      reason: verdict.code,
    });
    await removeObject(storage, design, now);
  }

  return moved;
}

function rejectionOf(design: CustomerDesign): UploadRejectedError {
  return new UploadRejectedError(
    design.failure?.code ?? "rejected",
    design.failure?.message || "This upload could not be verified. Upload the file again.",
  );
}

/* ------------------------------------------------------------------ *
 * Completion
 * ------------------------------------------------------------------ */

export interface CompletedUpload {
  design: CustomerDesign;
  /** The authoritative measurement, from the stored bytes. Null for STEP. */
  analysis: GeometryAnalysisResult | null;
}

/**
 * The durable analysis for a verified design.
 *
 * Normally a read. When the analyser version has moved on since the design was
 * verified, the stored bytes are measured again — from storage, never from
 * anything a browser sends.
 */
export async function ensureAnalysis(
  storage: StorageAdapter,
  design: CustomerDesign,
): Promise<GeometryAnalysisResult | null> {
  if (!design.sha256 || !isAnalyzable(design.name)) return null;

  const stored = await findStoredAnalysis(design.sha256);
  if (stored) return stored;

  const key = assertKey(design);

  let readable;
  try {
    readable = await storage.get(key);
  } catch (error) {
    throw storageFailure(error, "get", design.id);
  }

  if (!readable) {
    log.error(EVENTS.designObjectMissing, {
      designId: design.id,
      customerId: design.customerId,
      stage: "analysis",
    });
    return null;
  }

  let read;
  try {
    read = await readBounded(readable.body, design.sizeBytes);
  } catch (error) {
    if (error instanceof BoundedReadError) return null;
    throw storageFailure(error, "read", design.id);
  }

  if (read.sha256 !== design.sha256) {
    log.error(EVENTS.designObjectRejected, {
      designId: design.id,
      customerId: design.customerId,
      reason: "stored_checksum_changed",
    });
    return null;
  }

  log.info(EVENTS.designAnalysisStarted, { designId: design.id, format: design.format });

  try {
    const analysis = await analyzeModel({ fileName: design.name, bytes: read.bytes });
    await saveStoredAnalysis(design.sha256, analysis);
    log.info(EVENTS.designAnalysisCompleted, {
      designId: design.id,
      identity: analysis.identity,
      objects: analysis.objectCount,
    });
    return analysis;
  } catch (error) {
    if (error instanceof DomainError && error.kind !== "infrastructure") return null;
    throw error;
  }
}

/**
 * Finalises an upload: verifies the stored object and records the outcome.
 *
 * Safe to call any number of times. Retrying after a network failure or a 503
 * picks up where the last attempt stopped; retrying after a verdict returns
 * that verdict.
 */
export async function completeUpload(
  identity: CustomerIdentity,
  designId: string,
  now: Date = new Date(),
): Promise<CompletedUpload> {
  const storage = requireDesignStorage();

  if (!isDesignId(designId)) throw new NotFoundError(DESIGN_NOT_FOUND);

  const design = await customerDesignRepository.get(identity.id, designId);
  if (!design || design.storageState === "deleted") {
    throw new NotFoundError(DESIGN_NOT_FOUND);
  }

  if (design.storageState === "failed") throw rejectionOf(design);

  if (design.storageState === "verified") {
    return { design, analysis: await ensureAnalysis(storage, design) };
  }

  log.info(EVENTS.designUploadFinalized, { designId: design.id, customerId: identity.id });

  const verdict = await verifyPendingObject(storage, design, now);

  if (!verdict.ok) {
    await rejectDesign(storage, design, verdict, now, ["pending"]);

    // Whoever moved it, the recorded verdict is the answer.
    const current = await customerDesignRepository.get(identity.id, design.id);
    if (current?.storageState === "verified") {
      return { design: current, analysis: await ensureAnalysis(storage, current) };
    }
    throw current?.storageState === "failed"
      ? rejectionOf(current)
      : new UploadRejectedError(verdict.code, verdict.message);
  }

  /*
   * The analysis first, then the state. If the analysis write fails the design
   * stays pending and a retry repeats the work; the reverse order could leave a
   * verified design whose analysis was never recorded.
   */
  if (verdict.analysis && design.sha256) {
    await saveStoredAnalysis(design.sha256, verdict.analysis);
  }

  const moved = await customerDesignRepository.markVerified(identity.id, design.id, {
    at: now,
    ...(verdict.analysis
      ? { analysisIdentity: analysisIdentityOf(verdict.analysis.identity) }
      : {}),
  });

  const current = await customerDesignRepository.get(identity.id, design.id);
  if (!current || current.storageState === "deleted") {
    throw new NotFoundError(DESIGN_NOT_FOUND);
  }

  if (current.storageState === "failed") throw rejectionOf(current);

  if (moved) {
    log.info(EVENTS.designObjectVerified, {
      designId: current.id,
      customerId: identity.id,
      format: current.format,
      sizeBytes: current.sizeBytes,
      analysed: verdict.analysis !== null,
    });
  }

  return { design: current, analysis: verdict.analysis };
}
