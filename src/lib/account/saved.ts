import { formatPrice, getProductById, isQuoteOnly, productHref } from "@/lib/catalog/query";

import { memoize, persistenceMode, warnMemoryPersistence } from "./persistence";
import { postgresSavedItemRepository } from "./saved.postgres";
import type { CustomerIdentity, SavedItem, SavedProductView } from "./types";

/**
 * Saved marketplace items.
 *
 * A saved item is a **reference to a product**, never a copy of one. The
 * catalog owns the name, the price, the colour and whether the part still
 * exists; a saved item that duplicated any of them would show a price that was
 * true the day it was saved and wrong ever after.
 *
 * The consequence is deliberate: a product that leaves the catalog leaves a
 * saved entry that resolves to nothing, and the page says so and offers to
 * remove it. That is more honest than deleting the customer's entry on their
 * behalf, and more honest than showing a card for something that cannot be
 * bought.
 *
 * ── Storage ──────────────────────────────────────────────────────────────
 *
 * PostgreSQL, since Phase 14. `saved.postgres.ts` is the implementation and
 * `lib/db/schema.ts` declares the table; the unique `(customer_id, product_id)`
 * index is the same rule `save` describes below, held by the database so two
 * simultaneous clicks cannot make two rows.
 *
 * The in-process store beneath is kept for development without a database.
 * Production has no such fallback — see `persistence.ts` for why. Nothing is
 * seeded in either: a customer with no saved items has none, and the page says
 * that rather than showing something invented to fill it.
 */

/* ------------------------------------------------------------------ *
 * Repository
 * ------------------------------------------------------------------ */

export interface SavedItemRepository {
  readonly name: string;
  list(customerId: string): Promise<SavedItem[]>;
  isSaved(customerId: string, productId: string): Promise<boolean>;
  /** Idempotent: saving something already saved returns the existing entry. */
  save(customerId: string, productId: string): Promise<SavedItem>;
  remove(customerId: string, productId: string): Promise<void>;
}

const GLOBAL_KEY = "__sada3d_saved_items__";

/** Keyed by customer, so a lookup cannot accidentally span customers. */
function store(): Map<string, SavedItem[]> {
  const globals = globalThis as unknown as Record<
    string,
    Map<string, SavedItem[]> | undefined
  >;
  const existing = globals[GLOBAL_KEY];
  if (existing) return existing;

  const created = new Map<string, SavedItem[]>();
  globals[GLOBAL_KEY] = created;
  return created;
}

/** Beyond this a saved list stops being a shortlist. */
export const MAX_SAVED_ITEMS = 100;

export const memorySavedItemRepository: SavedItemRepository = {
  name: "memory",

  async list(customerId: string): Promise<SavedItem[]> {
    return (store().get(customerId) ?? []).map((item) => ({ ...item }));
  },

  async isSaved(customerId: string, productId: string): Promise<boolean> {
    return (store().get(customerId) ?? []).some(
      (item) => item.productId === productId,
    );
  },

  async save(customerId: string, productId: string): Promise<SavedItem> {
    const existing = store().get(customerId) ?? [];
    const found = existing.find((item) => item.productId === productId);
    if (found) return { ...found };

    const item: SavedItem = {
      id: `sav_${customerId}_${productId}`,
      customerId,
      productId,
      savedAt: new Date().toISOString(),
    };

    store().set(customerId, [item, ...existing].slice(0, MAX_SAVED_ITEMS));
    return { ...item };
  },

  async remove(customerId: string, productId: string): Promise<void> {
    const existing = store().get(customerId) ?? [];
    store().set(
      customerId,
      existing.filter((item) => item.productId !== productId),
    );
  },
};

const postgres = memoize(() => postgresSavedItemRepository());

/** See the note on the address repository facade; the same rule applies here. */
function repository(): SavedItemRepository {
  if (persistenceMode() === "postgres") return postgres();

  warnMemoryPersistence();
  return memorySavedItemRepository;
}

export const savedItemRepository: SavedItemRepository = {
  get name() {
    return repository().name;
  },
  list: (customerId) => repository().list(customerId),
  isSaved: (customerId, productId) => repository().isSaved(customerId, productId),
  save: (customerId, productId) => repository().save(customerId, productId),
  remove: (customerId, productId) => repository().remove(customerId, productId),
};

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

/**
 * This customer's saved products, resolved against the catalog.
 *
 * An entry whose product has gone keeps its place with no product attached, so
 * the page can say what happened instead of quietly dropping it.
 */
export async function listSavedProducts(
  identity: CustomerIdentity,
): Promise<SavedProductView[]> {
  const items = await savedItemRepository.list(identity.id);

  /*
   * Resolved together rather than one after another. The catalog read is
   * cached, so this is one lookup per saved item against an in-memory list —
   * but it is a promise now, and awaiting them in a loop would serialise a
   * dozen resolutions for no reason.
   */
  return Promise.all(
    items.map(async (item) => {
      const product = await getProductById(item.productId);

      if (!product) {
        return { id: item.id, productId: item.productId, savedAt: item.savedAt };
      }

      return {
        id: item.id,
        productId: item.productId,
        savedAt: item.savedAt,
        product: {
          name: product.name,
          href: productHref(product),
          material: product.material.toUpperCase(),
          color: product.color,
          // A quote-only part has no catalog price, and inventing one would be
          // inventing a figure the customer could be charged.
          price: isQuoteOnly(product) ? undefined : formatPrice(product.price),
          image: product.image,
        },
      };
    }),
  );
}

export async function isProductSaved(
  identity: CustomerIdentity,
  productId: string,
): Promise<boolean> {
  return savedItemRepository.isSaved(identity.id, productId);
}

export type SavedItemMutation = { ok: true } | { ok: false; message: string };

/**
 * Saves a product.
 *
 * The product is looked up before anything is written: a saved entry that names
 * nothing in the catalog would be a row that can never resolve.
 */
export async function saveProduct(
  identity: CustomerIdentity,
  productId: string,
): Promise<SavedItemMutation> {
  if (!(await getProductById(productId))) {
    return { ok: false, message: "That part is no longer available." };
  }

  const existing = await savedItemRepository.list(identity.id);
  if (
    existing.length >= MAX_SAVED_ITEMS &&
    !existing.some((item) => item.productId === productId)
  ) {
    return {
      ok: false,
      message: "Your saved list is full. Remove something and try again.",
    };
  }

  await savedItemRepository.save(identity.id, productId);
  return { ok: true };
}

/** Removing something that is not saved is a success, not an error. */
export async function removeSavedProduct(
  identity: CustomerIdentity,
  productId: string,
): Promise<SavedItemMutation> {
  await savedItemRepository.remove(identity.id, productId);
  return { ok: true };
}
