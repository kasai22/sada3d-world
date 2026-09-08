import { getProductById, isQuoteOnly } from "@/lib/catalog/query";
import { calculateQuote } from "@/lib/pricing/calculateQuote";
import {
  finishOption,
  materialOption,
  qualityOption,
} from "@/lib/custom-print/options";

import {
  addLine,
  catalogLineKey,
  clampQuantity,
  customLineKey,
  removeLine as removeLineFrom,
  setLineQuantity,
} from "./identity";
import { cartRepository, CartStorageError } from "./repository";
import { priceCart } from "./validation";
import {
  MAX_LINE_QUANTITY,
  type Cart,
  type CatalogCartLine,
  type CustomCartLine,
  type PricedCart,
} from "./types";

/**
 * Cart service — the only way the cart changes.
 *
 * Every mutation goes through here, and here is where the server decides what
 * is true. Nothing a caller supplies about money, names or availability is
 * kept: a catalog line is priced from the catalog, a custom line is quoted by
 * running the pricing engine server-side, and the configuration is checked
 * against what the product actually offers.
 *
 * The result of every mutation is the whole priced cart, so a caller never has
 * to ask a second question to render the new state.
 */

export type CartMutation =
  | { ok: true; cart: PricedCart }
  | { ok: false; message: string };

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export async function readCart(): Promise<PricedCart> {
  const cart = await cartRepository.load();
  return priceCart(cart);
}

async function commit(cart: Cart): Promise<CartMutation> {
  const next: Cart = { ...cart, updatedAt: new Date().toISOString() };

  try {
    await cartRepository.save(next);
  } catch (cause) {
    if (cause instanceof CartStorageError) {
      return { ok: false, message: cause.message };
    }
    return { ok: false, message: "The cart could not be saved. Try again." };
  }

  return { ok: true, cart: priceCart(next) };
}

/* ------------------------------------------------------------------ *
 * Catalog lines
 * ------------------------------------------------------------------ */

export interface AddCatalogLineInput {
  productId: string;
  material: string;
  color: string;
  quality?: string;
  quantity: number;
}

/**
 * Adds a catalog part.
 *
 * The caller supplies what it wants, not what it costs. Product, price and the
 * options the product supports are all resolved here; a configuration the
 * product does not offer is rejected rather than stored, because a line that
 * cannot be made is not a line.
 */
export async function addCatalogLine(
  input: AddCatalogLineInput,
): Promise<CartMutation> {
  const product = getProductById(input.productId);

  if (!product) {
    return { ok: false, message: "That part is no longer available." };
  }

  if (isQuoteOnly(product)) {
    return {
      ok: false,
      message: "This part is priced from your own geometry. Order it through custom print.",
    };
  }

  const materials = product.materials ?? [product.material];
  if (!materials.includes(input.material as (typeof materials)[number])) {
    return { ok: false, message: "That material is not offered for this part." };
  }

  const colors = product.colors ?? (product.color ? [product.color] : []);
  if (colors.length > 0 && !colors.includes(input.color)) {
    return { ok: false, message: "That colour is not offered for this part." };
  }

  const qualities = product.qualityOptions ?? [];
  if (input.quality && !qualities.some((option) => option.value === input.quality)) {
    return { ok: false, message: "That quality is not offered for this part." };
  }

  const quantity = clampQuantity(input.quantity);
  if (quantity !== input.quantity) {
    return {
      ok: false,
      message: `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.`,
    };
  }

  const configuration = {
    material: input.material,
    color: input.color,
    quality: input.quality,
  };

  const line: CatalogCartLine = {
    type: "catalog",
    id: catalogLineKey({ productId: product.id, configuration }),
    productId: product.id,
    quantity,
    configuration,
    // Recorded by the server from the catalog, so it is a fact about what the
    // customer was offered rather than a number the browser chose.
    priceAtAdd: product.price,
    addedAt: new Date().toISOString(),
  };

  const cart = await cartRepository.load();
  const lines = addLine(cart.lines, line);

  if (lines.length === cart.lines.length && !lines.some((l) => l.id === line.id)) {
    return { ok: false, message: "This cart is full. Remove an item and try again." };
  }

  return commit({ ...cart, lines });
}

/* ------------------------------------------------------------------ *
 * Custom lines
 * ------------------------------------------------------------------ */

export interface AddCustomLineInput {
  model: {
    modelId: string;
    name: string;
    extension: string;
    sizeBytes: number;
    formatLabel: string;
    triangles?: number;
  };
  material: string;
  quality: string;
  finish: string;
  quantity: number;
}

/**
 * Adds a custom manufacturing part.
 *
 * The quote is recomputed here. Whatever figure the browser was showing is
 * irrelevant — the line records the total this server produced from this
 * configuration, which is the only figure the customer can later be asked to
 * agree to.
 *
 * Note what this does NOT do: it does not claim the model file has been
 * stored. It has not. The line carries the model's identity so that checkout
 * can ask whether the file is reachable, and checkout will find that it is not
 * until Phase 16.
 */
export async function addCustomLine(
  input: AddCustomLineInput,
): Promise<CartMutation> {
  if (!materialOption(input.material)) {
    return { ok: false, message: "That material is not offered." };
  }
  if (!qualityOption(input.quality)) {
    return { ok: false, message: "That print quality is not offered." };
  }
  if (!finishOption(input.finish)) {
    return { ok: false, message: "That finish is not offered." };
  }

  const quantity = clampQuantity(input.quantity);
  if (quantity !== input.quantity) {
    return {
      ok: false,
      message: `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.`,
    };
  }

  const response = calculateQuote({
    model: {
      name: input.model.name,
      extension: input.model.extension,
      sizeBytes: input.model.sizeBytes,
      triangles: input.model.triangles,
    },
    material: input.material,
    quality: input.quality,
    finish: input.finish,
    quantity,
  });

  if (response.status !== "available") {
    return {
      ok: false,
      message:
        response.status === "unavailable"
          ? response.reason
          : "This configuration could not be quoted.",
    };
  }

  const configuration = {
    material: input.material,
    quality: input.quality,
    finish: input.finish,
  };

  const line: CustomCartLine = {
    type: "custom",
    id: customLineKey({ model: { modelId: input.model.modelId }, configuration }),
    quantity,
    model: input.model,
    configuration,
    quote: {
      rulesVersion: response.quote.rulesVersion,
      total: response.quote.total,
      basis: response.quote.basis,
      provisional: response.quote.provisional,
      quotedAt: new Date().toISOString(),
    },
    addedAt: new Date().toISOString(),
  };

  const cart = await cartRepository.load();
  const lines = addLine(cart.lines, line);

  if (lines.length === cart.lines.length && !lines.some((l) => l.id === line.id)) {
    return { ok: false, message: "This cart is full. Remove an item and try again." };
  }

  return commit({ ...cart, lines });
}

/* ------------------------------------------------------------------ *
 * Editing
 * ------------------------------------------------------------------ */

export async function setQuantity(id: string, quantity: number): Promise<CartMutation> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) {
    return {
      ok: false,
      message: `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.`,
    };
  }

  const cart = await cartRepository.load();
  if (!cart.lines.some((line) => line.id === id)) {
    return { ok: false, message: "That item is no longer in your cart." };
  }

  /*
   * A custom line's quote was produced for a specific quantity, so changing the
   * quantity changes the price. The line is re-quoted here rather than
   * multiplied, because manufacturing has a setup cost that does not scale with
   * units — the customer sees the new figure and agrees to it.
   */
  let lines = setLineQuantity(cart.lines, id, quantity);

  lines = lines.map((line) => {
    if (line.type !== "custom" || line.id !== id) return line;

    const response = calculateQuote({
      model: {
        name: line.model.name,
        extension: line.model.extension,
        sizeBytes: line.model.sizeBytes,
        triangles: line.model.triangles,
      },
      material: line.configuration.material,
      quality: line.configuration.quality,
      finish: line.configuration.finish,
      quantity: line.quantity,
    });

    if (response.status !== "available") return line;

    return {
      ...line,
      quote: {
        rulesVersion: response.quote.rulesVersion,
        total: response.quote.total,
        basis: response.quote.basis,
        provisional: response.quote.provisional,
        quotedAt: new Date().toISOString(),
      },
    };
  });

  return commit({ ...cart, lines });
}

export async function removeLine(id: string): Promise<CartMutation> {
  const cart = await cartRepository.load();
  return commit({ ...cart, lines: removeLineFrom(cart.lines, id) });
}

/**
 * Accepts a catalog price that has changed.
 *
 * The customer has been shown the old figure and the new one; this records that
 * they have seen it. It re-reads the price from the catalog rather than taking
 * one from the request, so agreeing to a change cannot be turned into setting
 * a price.
 */
export async function acceptPriceChange(id: string): Promise<CartMutation> {
  const cart = await cartRepository.load();

  const lines = cart.lines.map((line) => {
    if (line.type !== "catalog" || line.id !== id) return line;

    const product = getProductById(line.productId);
    if (!product || isQuoteOnly(product)) return line;

    return { ...line, priceAtAdd: product.price };
  });

  return commit({ ...cart, lines });
}

export async function clearCart(): Promise<void> {
  await cartRepository.clear();
}
