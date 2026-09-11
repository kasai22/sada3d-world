import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getCustomerContext } from "@/lib/account/identity";
import { getDatabase } from "@/lib/db/client";
import { memoize, persistenceMode } from "@/lib/db/persistence";
import { customerCarts } from "@/lib/db/schema";
import { EVENTS, log } from "@/lib/observability";

import { mergeGuestCart } from "./merge";
import { unitCount } from "./totals";
import { MAX_CART_LINES, type Cart, type CartLine } from "./types";

/**
 * Cart persistence.
 *
 * The application talks to a CartRepository and nothing else, so the store
 * underneath can change without touching a component, a page or the service.
 *
 * ── The current implementation ────────────────────────────────────────────
 *
 * Postgres is not provisioned yet (Phase 14 owns Payload and the schema, Phase
 * 17 owns auth), so the cart lives in an HttpOnly cookie. That is a deliberate
 * choice rather than a placeholder:
 *
 *   · it survives navigation and a browser restart, which sessionStorage does
 *     not, and the brief said the cart must;
 *   · it is written and read only on the server, so no cart mutation can
 *     happen without passing through the service's validation;
 *   · it needs no infrastructure that does not exist.
 *
 * Its limits are real and worth stating: one browser, no cross-device cart, and
 * a few kilobytes of room. Both are acceptable for a guest cart and neither is
 * acceptable for an account cart, which is why the interface exists.
 *
 * ── Trust ─────────────────────────────────────────────────────────────────
 *
 * A cookie is client-held, so everything read back is untrusted input. The
 * stored shape carries identity, configuration and quantity — never a price the
 * system will honour. Prices are always resolved from the catalog and the
 * pricing rules on read (see validation.ts), so the worst a tampered cookie can
 * do is ask for a different product at that product's real price.
 *
 * ── The relational model this maps onto ───────────────────────────────────
 *
 * When Postgres lands, the same interface is backed by:
 *
 *   carts       id · user_id nullable · status (active|checked_out|abandoned)
 *               · currency · created_at · updated_at
 *   cart_items  id · cart_id · item_type (catalog|custom) · product_id nullable
 *               · quantity · price_at_add · configuration (bounded jsonb)
 *               · model_ref nullable · quote_ref nullable · created_at
 *
 * Money is stored as integer whole rupees, matching the rest of the system.
 * The configuration stays a bounded JSON column because its shape is owned by
 * the product taxonomy and changes with it; everything stable is a column.
 *
 * This module is server-only by construction: importing `next/headers` makes it
 * fail to build if it is ever pulled into a client component.
 */

export const CART_COOKIE = "sada3d_cart";
/**
 * The unit count, readable by the browser.
 *
 * The header badge needs a number without making every page dynamic, and a
 * count is not a secret. It is written by the same code that writes the cart,
 * so the two cannot disagree.
 */
export const CART_COUNT_COOKIE = "sada3d_cart_count";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Cookies must fit in roughly 4 KB including the name and attributes. Refusing
 * before that limit gives a clear error instead of a silently dropped cart.
 */
const MAX_SERIALISED_BYTES = 3600;

export class CartStorageError extends Error {}

export interface CartRepository {
  readonly name: string;
  load(): Promise<Cart>;
  save(cart: Cart): Promise<void>;
  clear(): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads one stored line, or discards it.
 *
 * Deliberately strict and deliberately quiet: a line that does not parse is
 * dropped rather than repaired, because a half-understood manufacturing
 * configuration is worse than an absent one.
 */
function parseLine(value: unknown): CartLine | null {
  if (!isRecord(value)) return null;

  const quantity = value.quantity;
  const id = value.id;
  if (typeof id !== "string" || typeof quantity !== "number") return null;
  if (!Number.isInteger(quantity) || quantity < 1) return null;

  if (value.type === "catalog") {
    const configuration = value.configuration;
    if (typeof value.productId !== "string" || !isRecord(configuration)) return null;
    if (
      typeof configuration.material !== "string" ||
      typeof configuration.color !== "string"
    ) {
      return null;
    }

    return {
      type: "catalog",
      id,
      productId: value.productId,
      quantity,
      configuration: {
        material: configuration.material,
        color: configuration.color,
        quality:
          typeof configuration.quality === "string" ? configuration.quality : undefined,
      },
      priceAtAdd: typeof value.priceAtAdd === "number" ? value.priceAtAdd : 0,
      addedAt: typeof value.addedAt === "string" ? value.addedAt : "",
    };
  }

  if (value.type === "custom") {
    const model = value.model;
    const configuration = value.configuration;
    const quote = value.quote;
    if (!isRecord(model) || !isRecord(configuration) || !isRecord(quote)) return null;
    if (typeof model.modelId !== "string" || typeof model.name !== "string") return null;
    if (
      typeof configuration.material !== "string" ||
      typeof configuration.quality !== "string" ||
      typeof configuration.finish !== "string"
    ) {
      return null;
    }

    return {
      type: "custom",
      id,
      quantity,
      model: {
        modelId: model.modelId,
        name: model.name,
        extension: typeof model.extension === "string" ? model.extension : "",
        sizeBytes: typeof model.sizeBytes === "number" ? model.sizeBytes : 0,
        formatLabel: typeof model.formatLabel === "string" ? model.formatLabel : "",
        triangles: typeof model.triangles === "number" ? model.triangles : undefined,
      },
      configuration: {
        material: configuration.material,
        quality: configuration.quality,
        finish: configuration.finish,
      },
      quote: {
        rulesVersion: typeof quote.rulesVersion === "string" ? quote.rulesVersion : "",
        total: typeof quote.total === "number" ? quote.total : 0,
        basis: quote.basis === "geometry" ? "geometry" : "configuration",
        provisional: quote.provisional !== false,
        quotedAt: typeof quote.quotedAt === "string" ? quote.quotedAt : "",
      },
      addedAt: typeof value.addedAt === "string" ? value.addedAt : "",
    };
  }

  return null;
}

export function parseCart(raw: string | undefined): Cart | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.id !== "string") return null;
    if (!Array.isArray(parsed.lines)) return null;

    const lines = parsed.lines
      .slice(0, MAX_CART_LINES)
      .map(parseLine)
      .filter((line): line is CartLine => line !== null);

    return {
      id: parsed.id,
      lines,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    // A corrupt cookie is an empty cart, not an error page.
    return null;
  }
}

export function serialiseCart(cart: Cart): string {
  const encoded = JSON.stringify(cart);

  if (encoded.length > MAX_SERIALISED_BYTES) {
    throw new CartStorageError(
      "This cart is too large to save. Remove an item and try again.",
    );
  }

  return encoded;
}

/* ------------------------------------------------------------------ *
 * Cookie repository
 * ------------------------------------------------------------------ */

function newCart(): Cart {
  return {
    // Identifies the cart, not the customer. Nothing personal is derived here.
    id: crypto.randomUUID(),
    lines: [],
    updatedAt: new Date().toISOString(),
  };
}

/** The header badge's copy of the unit count. Written beside every cart write. */
async function writeCountCookie(count: number): Promise<void> {
  const store = await cookies();
  store.set(CART_COUNT_COOKIE, String(count), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

/** The guest cart: one browser, an HttpOnly cookie. */
export const cookieCartRepository: CartRepository = {
  name: "cookie",

  async load(): Promise<Cart> {
    const store = await cookies();
    return parseCart(store.get(CART_COOKIE)?.value) ?? newCart();
  },

  async save(cart: Cart): Promise<void> {
    const encoded = serialiseCart(cart);
    const store = await cookies();

    store.set(CART_COOKIE, encoded, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THIRTY_DAYS,
    });

    // Written here so the badge can never drift from the cart.
    await writeCountCookie(unitCount(cart.lines));
  },

  async clear(): Promise<void> {
    const store = await cookies();
    store.delete(CART_COOKIE);
    await writeCountCookie(0);
  },
};

/* ------------------------------------------------------------------ *
 * Account carts
 * ------------------------------------------------------------------ */

export interface AccountCartRecord {
  cart: Cart;
  /** Guest carts already folded into this one. See `merge.ts`. */
  mergedGuestCartIds: readonly string[];
}

export interface AccountCartStore {
  readonly name: string;
  load(customerId: string): Promise<AccountCartRecord>;
  save(customerId: string, record: AccountCartRecord): Promise<void>;
}

/** Enough to recognise a repeated merge; bounded so the row cannot grow forever. */
const MAX_REMEMBERED_MERGES = 20;

function readMergedIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").slice(-MAX_REMEMBERED_MERGES)
    : [];
}

/**
 * The stored lines, through the same strict reader as the cookie.
 *
 * A JSON column is stored input exactly as a cookie is. A line that does not
 * parse is dropped rather than repaired — the rule the cookie has always had.
 */
function readStoredCart(cartId: string, lines: unknown, updatedAt: Date): Cart {
  return (
    parseCart(JSON.stringify({ id: cartId, lines, updatedAt: updatedAt.toISOString() })) ?? {
      ...newCart(),
      id: cartId,
    }
  );
}

export const postgresAccountCartStore: AccountCartStore = {
  name: "postgres",

  async load(customerId: string): Promise<AccountCartRecord> {
    const db = await getDatabase();

    const rows = await db
      .select()
      .from(customerCarts)
      .where(eq(customerCarts.customerId, customerId))
      .limit(1);

    const row = rows[0];
    if (!row) return { cart: newCart(), mergedGuestCartIds: [] };

    return {
      cart: readStoredCart(row.cartId, row.lines, row.updatedAt),
      mergedGuestCartIds: readMergedIds(row.mergedGuestCartIds),
    };
  },

  async save(customerId: string, record: AccountCartRecord): Promise<void> {
    const db = await getDatabase();
    const values = {
      customerId,
      cartId: record.cart.id,
      lines: record.cart.lines.slice(0, MAX_CART_LINES),
      mergedGuestCartIds: record.mergedGuestCartIds.slice(-MAX_REMEMBERED_MERGES),
      updatedAt: new Date(),
    };

    await db
      .insert(customerCarts)
      .values(values)
      .onConflictDoUpdate({
        target: customerCarts.customerId,
        set: {
          cartId: values.cartId,
          lines: values.lines,
          mergedGuestCartIds: values.mergedGuestCartIds,
          updatedAt: values.updatedAt,
        },
      });
  },
};

const MEMORY_KEY = "__sada3d_account_carts__";

/** Development without a database. Same shape, this process only. */
export const memoryAccountCartStore: AccountCartStore = {
  name: "memory",

  async load(customerId: string): Promise<AccountCartRecord> {
    const globals = globalThis as unknown as Record<string, Map<string, AccountCartRecord> | undefined>;
    const found = globals[MEMORY_KEY]?.get(customerId);
    return found
      ? { cart: { ...found.cart, lines: [...found.cart.lines] }, mergedGuestCartIds: [...found.mergedGuestCartIds] }
      : { cart: newCart(), mergedGuestCartIds: [] };
  },

  async save(customerId: string, record: AccountCartRecord): Promise<void> {
    const globals = globalThis as unknown as Record<string, Map<string, AccountCartRecord> | undefined>;
    const map = globals[MEMORY_KEY] ?? new Map<string, AccountCartRecord>();
    globals[MEMORY_KEY] = map;
    map.set(customerId, {
      cart: { ...record.cart, lines: [...record.cart.lines] },
      mergedGuestCartIds: [...record.mergedGuestCartIds],
    });
  },
};

const postgresStore = memoize(() => postgresAccountCartStore);

export function accountCartStore(): AccountCartStore {
  return persistenceMode() === "postgres" ? postgresStore() : memoryAccountCartStore;
}

/* ------------------------------------------------------------------ *
 * The repository the application uses
 * ------------------------------------------------------------------ */

async function signedInCustomerId(): Promise<string | null> {
  const { identity } = await getCustomerContext();
  return identity?.id ?? null;
}

/**
 * The cart for whoever this request is.
 *
 * Signed in: the customer's cart, from the database, the same on every device.
 * Signed out: this browser's guest cart, from its cookie. The identity comes
 * from the auth adapter — nothing in a request chooses whose cart this is.
 *
 * The cart service, validation and checkout above this are unchanged by which
 * one answers.
 */
export const cartRepository: CartRepository = {
  name: "session",

  async load(): Promise<Cart> {
    const customerId = await signedInCustomerId();
    if (!customerId) return cookieCartRepository.load();
    return (await accountCartStore().load(customerId)).cart;
  },

  async save(cart: Cart): Promise<void> {
    const customerId = await signedInCustomerId();
    if (!customerId) return cookieCartRepository.save(cart);

    if (cart.lines.length > MAX_CART_LINES) {
      throw new CartStorageError("This cart is full. Remove an item and try again.");
    }

    const store = accountCartStore();
    const current = await store.load(customerId);
    await store.save(customerId, { cart, mergedGuestCartIds: current.mergedGuestCartIds });
    await writeCountCookie(unitCount(cart.lines));
  },

  async clear(): Promise<void> {
    const customerId = await signedInCustomerId();
    if (!customerId) return cookieCartRepository.clear();

    const store = accountCartStore();
    const current = await store.load(customerId);

    // A new cart id, so the next checkout is a new idempotency key rather than
    // a repeat of the order just placed.
    await store.save(customerId, {
      cart: newCart(),
      mergedGuestCartIds: current.mergedGuestCartIds,
    });
    await writeCountCookie(0);
  },
};

export interface GuestCartMergeReport {
  merged: number;
  leftover: number;
  alreadyMerged: boolean;
}

/**
 * Folds this browser's guest cart into the customer's cart.
 *
 * Called where a session has just been established — sign-in, sign-up with an
 * immediate session, and a confirmation or recovery link — all of which run as
 * server actions or route handlers, where cookies can be written.
 *
 * Order of writes: the account cart is saved first, recording the guest cart id
 * as merged; the guest cookie is cleared second. If the second write fails, the
 * next attempt finds the id already merged and changes nothing, so a failure
 * between the two can repeat the clear but never the merge.
 */
export async function mergeGuestCartIntoAccount(
  customerId: string,
): Promise<GuestCartMergeReport> {
  const guest = await cookieCartRepository.load();
  if (guest.lines.length === 0) return { merged: 0, leftover: 0, alreadyMerged: false };

  const store = accountCartStore();
  const record = await store.load(customerId);
  const result = mergeGuestCart(record.cart, guest, record.mergedGuestCartIds);

  if (!result.alreadyMerged) {
    await store.save(customerId, {
      cart: { ...result.cart, updatedAt: new Date().toISOString() },
      mergedGuestCartIds: [...record.mergedGuestCartIds, guest.id],
    });
  }

  if (result.leftover.length > 0) {
    // A fresh id: these lines have not been merged, and must be able to be.
    await cookieCartRepository.save({
      id: crypto.randomUUID(),
      lines: result.leftover,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await cookieCartRepository.clear();
  }

  await writeCountCookie(unitCount(result.cart.lines));

  log.info(EVENTS.cartMerged, {
    customerId,
    merged: result.merged,
    leftover: result.leftover.length,
    alreadyMerged: result.alreadyMerged,
  });

  return {
    merged: result.merged,
    leftover: result.leftover.length,
    alreadyMerged: result.alreadyMerged,
  };
}
