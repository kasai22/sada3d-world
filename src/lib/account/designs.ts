import { DatabaseUnavailableError } from "@/lib/db/client";
import { InfrastructureError } from "@/lib/errors";

import {
  DESIGN_STORAGE_UNAVAILABLE_REASON,
  postgresDesignRepository,
} from "./designs.postgres";
import { memoize, persistenceMode } from "./persistence";
import type {
  CollectionResult,
  CustomerDesign,
  CustomerDesignView,
  CustomerIdentity,
  DesignStorageState,
} from "./types";

/**
 * Customer designs.
 *
 * A design is a manufacturing file plus what is known about it. Since Stage 16
 * both halves exist: the file is an object in private Cloudflare R2 storage,
 * and this record is its owner, its checksum, its lifecycle state and the key
 * that finds it.
 *
 *   /account/designs, /custom-print, checkout
 *          ↓
 *   design services  (design-uploads.ts, design-files.ts)
 *          ↓
 *   CustomerDesignRepository ── PostgreSQL row ──► private object key
 *          ↓
 *   StorageAdapter  (lib/storage) ── short-lived signed URL per request
 *          ↓
 *   Cloudflare R2
 *
 * No design view or API field carries the object key. `toDesignView` and the
 * API's `designDto` build the client's copy from safe fields rather than copying the
 * design and deleting the key, so a new private field cannot leak by being
 * forgotten.
 */

/* ------------------------------------------------------------------ *
 * Availability
 * ------------------------------------------------------------------ */

export type DesignStorageAvailability =
  | { available: true }
  /** Shown to the customer, so the reason is written for them. */
  | { available: false; reason: string };

export { DESIGN_STORAGE_UNAVAILABLE_REASON };

/** One sentence for "not found" and "not yours". They must be indistinguishable. */
export const DESIGN_NOT_FOUND = "That design could not be found.";

/* ------------------------------------------------------------------ *
 * Repository
 * ------------------------------------------------------------------ */

export interface NewPendingDesign {
  id: string;
  customerId: string;
  name: string;
  format: string;
  sizeBytes: number;
  storageKey: string;
  contentType: string;
  sha256: string;
  uploadExpiresAt: Date;
}

export type CreatePendingResult =
  | { created: true; design: CustomerDesign }
  /** The (customer, sha256) was already pending or verified. */
  | { created: false };

/**
 * Design persistence.
 *
 * Every method that reads or changes one design takes the customer id *and*
 * the design id, and scopes its WHERE clause by both. There is no method that
 * looks a design up by id alone, so there is no call that can be made with
 * someone else's.
 *
 * The state transitions are guarded in SQL (`… WHERE storage_state = 'pending'`)
 * and report whether they happened. Two requests finalising the same upload
 * cannot both move it; the loser learns it lost and reads the winner's outcome.
 *
 * The two sweep queries are the exception to per-customer scoping, because the
 * sweep is maintenance rather than a customer request. Nothing a request can
 * reach calls them with request input.
 */
export interface CustomerDesignRepository {
  readonly name: string;
  /** Whether designs can be stored and retrieved at all. */
  availability(): DesignStorageAvailability;
  list(customerId: string): Promise<CustomerDesign[]>;
  get(customerId: string, designId: string): Promise<CustomerDesign | null>;

  /** A pending or verified design of this customer's with these bytes. */
  findActiveBySha256(customerId: string, sha256: string): Promise<CustomerDesign | null>;
  createPending(input: NewPendingDesign): Promise<CreatePendingResult>;
  /** Extends a pending design's upload window. Null when it is no longer pending. */
  renewUpload(
    customerId: string,
    designId: string,
    expiresAt: Date,
  ): Promise<CustomerDesign | null>;
  markVerified(
    customerId: string,
    designId: string,
    input: { at: Date; analysisIdentity?: string },
  ): Promise<boolean>;
  markFailed(
    customerId: string,
    designId: string,
    input: { at: Date; code: string; message: string; from: readonly DesignStorageState[] },
  ): Promise<boolean>;
  markDeleted(customerId: string, designId: string, at: Date): Promise<boolean>;
  markObjectRemoved(customerId: string, designId: string, at: Date): Promise<void>;
  /** Pending uploads whose window is still open. */
  countActiveUploads(customerId: string, now: Date): Promise<number>;

  /** Maintenance: pending uploads whose window closed before `before`. */
  listExpiredUploads(before: Date, limit: number): Promise<CustomerDesign[]>;
  /** Maintenance: failed or deleted designs whose object is due for removal. */
  listCleanupCandidates(input: {
    now: Date;
    deletedBefore: Date;
    limit: number;
  }): Promise<CustomerDesign[]>;
  /** Whether any order still needs this design's object. */
  isReferencedByOrder(design: CustomerDesign): Promise<boolean>;
  linkOrder(customerId: string, designId: string, orderReference: string): Promise<void>;
}

function notAvailable(): never {
  throw new InfrastructureError("Design storage is not available right now.");
}

/**
 * The repository when there is no database.
 *
 * It reports why it cannot store anything and returns nothing. It does not
 * pretend to be an empty database, and every write refuses.
 */
export const unavailableDesignRepository: CustomerDesignRepository = {
  name: "unavailable",

  availability(): DesignStorageAvailability {
    return { available: false, reason: DESIGN_STORAGE_UNAVAILABLE_REASON };
  },

  async list(): Promise<CustomerDesign[]> {
    return [];
  },

  async get(): Promise<CustomerDesign | null> {
    return null;
  },

  findActiveBySha256: notAvailable,
  createPending: notAvailable,
  renewUpload: notAvailable,
  markVerified: notAvailable,
  markFailed: notAvailable,
  markDeleted: notAvailable,
  markObjectRemoved: notAvailable,
  countActiveUploads: notAvailable,
  listExpiredUploads: async () => [],
  listCleanupCandidates: async () => [],
  isReferencedByOrder: async () => true,
  linkOrder: notAvailable,
};

const postgres = memoize(() => postgresDesignRepository());

/**
 * The repository the application uses.
 *
 * PostgreSQL when there is a database, the unavailable stub when there is not.
 * Availability is then a question about *storage*: a database with no R2
 * configured still reports designs as unavailable, because a record naming a
 * file that cannot be stored is not a design.
 */
function repository(): CustomerDesignRepository {
  return persistenceMode() === "postgres" ? postgres() : unavailableDesignRepository;
}

export const customerDesignRepository: CustomerDesignRepository = {
  get name() {
    return repository().name;
  },
  availability: () => repository().availability(),
  list: (customerId) => repository().list(customerId),
  get: (customerId, designId) => repository().get(customerId, designId),
  findActiveBySha256: (customerId, sha256) =>
    repository().findActiveBySha256(customerId, sha256),
  createPending: (input) => repository().createPending(input),
  renewUpload: (customerId, designId, expiresAt) =>
    repository().renewUpload(customerId, designId, expiresAt),
  markVerified: (customerId, designId, input) =>
    repository().markVerified(customerId, designId, input),
  markFailed: (customerId, designId, input) =>
    repository().markFailed(customerId, designId, input),
  markDeleted: (customerId, designId, at) =>
    repository().markDeleted(customerId, designId, at),
  markObjectRemoved: (customerId, designId, at) =>
    repository().markObjectRemoved(customerId, designId, at),
  countActiveUploads: (customerId, now) => repository().countActiveUploads(customerId, now),
  listExpiredUploads: (before, limit) => repository().listExpiredUploads(before, limit),
  listCleanupCandidates: (input) => repository().listCleanupCandidates(input),
  isReferencedByOrder: (design) => repository().isReferencedByOrder(design),
  linkOrder: (customerId, designId, orderReference) =>
    repository().linkOrder(customerId, designId, orderReference),
};

/**
 * Whether designs can be stored in this deployment, without throwing.
 *
 * Both halves are required: a database for the record and storage for the
 * file. In a production build with no database `persistenceMode` refuses, and
 * that refusal is reported as unavailable rather than as a crash of whatever
 * page asked.
 */
export function designStorageAvailability(): DesignStorageAvailability {
  try {
    return customerDesignRepository.availability();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return { available: false, reason: DESIGN_STORAGE_UNAVAILABLE_REASON };
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Projection
 * ------------------------------------------------------------------ */

/** Assembled from safe fields. The storage keys stay on the server. */
export function toDesignView(design: CustomerDesign): CustomerDesignView {
  return {
    id: design.id,
    name: design.name,
    format: design.format,
    sizeBytes: design.sizeBytes,
    createdAt: design.createdAt,
    hasPreview: design.previewKey !== undefined,
    orderReferences: [...design.orderReferences],
  };
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

/**
 * This customer's saved designs.
 *
 * Verified designs only. A pending upload is not yet a file anyone has checked,
 * a failed one never became one, and a deleted one was retired by the customer
 * — listing any of them would offer a download that the file route would then
 * refuse.
 */
export async function listCustomerDesigns(
  identity: CustomerIdentity,
): Promise<CollectionResult<CustomerDesignView>> {
  const availability = designStorageAvailability();
  if (!availability.available) {
    return { status: "unavailable", reason: availability.reason };
  }

  const designs = await customerDesignRepository.list(identity.id);
  return {
    status: "ok",
    items: designs
      .filter((design) => design.storageState === "verified")
      .map(toDesignView),
  };
}

/**
 * One design, if it is this customer's and has not been deleted.
 *
 * The repository is asked for the pair, never for the design alone: an
 * implementation that looked a design up by id and checked the owner afterwards
 * would be one refactor away from forgetting to.
 */
export async function getCustomerDesign(
  identity: CustomerIdentity,
  designId: string,
): Promise<CustomerDesignView | null> {
  const design = await customerDesignRepository.get(identity.id, designId);
  if (!design || design.customerId !== identity.id) return null;
  if (design.storageState === "deleted") return null;

  return toDesignView(design);
}
