import { postgresDesignRepository } from "./designs.postgres";
import { memoize, persistenceMode } from "./persistence";
import type {
  CollectionResult,
  CustomerDesign,
  CustomerDesignView,
  CustomerIdentity,
} from "./types";

/**
 * Customer designs.
 *
 * A design is a manufacturing file plus what is known about it. Both halves
 * matter, and the file half does not exist yet: `lib/custom-print/storage.ts`
 * keeps an uploaded model in the browser and sends it nowhere, exactly as Phase
 * 7 left it and as Phase 16 will change it.
 *
 * So this phase builds the boundary and refuses to build behind it. A record
 * naming a file that cannot be retrieved is not a saved design — it is a
 * filename, and offering it as a design would promise a download that cannot
 * happen. The page says designs cannot be stored yet, which is true, rather
 * than showing an empty list, which would imply that they could be.
 *
 * The future path, unchanged by anything here:
 *
 *   /account/designs
 *          ↓
 *   CustomerDesignRepository
 *          ↓
 *   API / DB record  ──►  private object key
 *          ↓
 *   authorised, short-lived URL issued per request
 *          ↓
 *   Cloudflare R2
 *
 * The object key never reaches a browser. `toDesignView` is what enforces that:
 * it builds the view from safe fields rather than copying the design and
 * deleting the key, so a new private field cannot leak by being forgotten.
 */

/* ------------------------------------------------------------------ *
 * Availability
 * ------------------------------------------------------------------ */

export type DesignStorageAvailability =
  | { available: true }
  /** Shown to the customer, so the reason is written for them. */
  | { available: false; reason: string };

/* ------------------------------------------------------------------ *
 * Repository
 * ------------------------------------------------------------------ */

/**
 * Design persistence.
 *
 * Only the operations the product needs today are declared. Saving and deleting
 * arrive with Phase 16, alongside the storage that would make them mean
 * something; declaring them now would be declaring an interface nobody can
 * implement or call.
 */
export interface CustomerDesignRepository {
  readonly name: string;
  /** Whether designs can be stored and retrieved at all. */
  availability(): DesignStorageAvailability;
  list(customerId: string): Promise<CustomerDesign[]>;
  get(customerId: string, designId: string): Promise<CustomerDesign | null>;
}

/**
 * The repository until Phase 16.
 *
 * It reports why it cannot store anything and returns nothing. It does not
 * pretend to be an empty database.
 */
export const unavailableDesignRepository: CustomerDesignRepository = {
  name: "unavailable",

  availability(): DesignStorageAvailability {
    return {
      available: false,
      reason:
        "Design storage is not configured yet, so uploaded models stay in your browser and cannot be kept here.",
    };
  },

  async list(): Promise<CustomerDesign[]> {
    return [];
  },

  async get(): Promise<CustomerDesign | null> {
    return null;
  },
};

const postgres = memoize(() => postgresDesignRepository());

/**
 * The repository the application uses.
 *
 * With a database it is the PostgreSQL one, which reads real rows with real
 * ownership scoping — and still reports designs as unavailable, because
 * availability is about file storage and Phase 16 owns that. Without a
 * database there is nothing to read and the unavailable stub answers.
 *
 * Note what did *not* change: `availability()` returns the same answer either
 * way. Persisting metadata did not make designs available, and the interface
 * says so rather than implying otherwise.
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
};

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

export async function listCustomerDesigns(
  identity: CustomerIdentity,
): Promise<CollectionResult<CustomerDesignView>> {
  const availability = customerDesignRepository.availability();
  if (!availability.available) {
    return { status: "unavailable", reason: availability.reason };
  }

  const designs = await customerDesignRepository.list(identity.id);
  return { status: "ok", items: designs.map(toDesignView) };
}

/**
 * One design, if it is this customer's.
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

  return toDesignView(design);
}
