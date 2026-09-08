import { cookies } from "next/headers";

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
    store.set(CART_COUNT_COOKIE, String(unitCount(cart.lines)), {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
  },

  async clear(): Promise<void> {
    const store = await cookies();
    store.delete(CART_COOKIE);
    store.set(CART_COUNT_COOKIE, "0", {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
  },
};

/** The repository the application uses. */
export const cartRepository: CartRepository = cookieCartRepository;
