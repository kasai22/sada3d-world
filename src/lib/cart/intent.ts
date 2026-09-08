/**
 * Cart seam.
 *
 * Phase 11 owns the real cart — server state, persistence, pricing, checkout.
 * This module exists so the product page has something correct to call in the
 * meantime, and so that when Phase 11 lands it replaces one function rather
 * than rewriting the purchase UI.
 *
 * It deliberately does NOT implement a cart: no totals, no line merging, no
 * cross-tab sync, no server round trip. It records the intent for the current
 * tab so the confirmation the customer sees is truthful, and stops there.
 */

import type { MaterialValue } from "@/lib/catalog/types";

/** What the customer asked to buy, resolved at the moment they asked. */
export interface CartLineIntent {
  productId: string;
  slug: string;
  name: string;
  /** Canonical product URL, so the cart can link back without a lookup. */
  href: string;
  material: MaterialValue;
  color: string;
  /** Quality option value, when the part offers a choice. */
  quality?: string;
  quantity: number;
  /** Unit price in whole rupees at the time of adding. 0 means quote-only. */
  unitPrice: number;
  currency: "INR";
}

export class CartIntentError extends Error {}

const STORAGE_KEY = "sada3d.cart-intent.v1";

function validate(intent: CartLineIntent): void {
  if (!Number.isInteger(intent.quantity) || intent.quantity < 1) {
    throw new CartIntentError("Quantity must be a whole number of at least 1.");
  }
  if (intent.unitPrice < 0) {
    throw new CartIntentError("Unit price cannot be negative.");
  }
}

/**
 * Records an add-to-cart intent.
 *
 * Resolves with the number of lines recorded in this tab. Async by design: the
 * real implementation will be a server action, and the call sites already await
 * it so that swap changes nothing here.
 */
export async function submitCartIntent(intent: CartLineIntent): Promise<number> {
  validate(intent);

  if (typeof window === "undefined") {
    throw new CartIntentError("Cart intents can only be submitted in the browser.");
  }

  let lines: CartLineIntent[] = [];

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) lines = parsed as CartLineIntent[];
    }
  } catch {
    // Unreadable or disabled storage is not a reason to block the purchase
    // path; start a fresh list.
    lines = [];
  }

  lines.push(intent);

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Private-mode quota errors must not surface as a failed add.
  }

  return lines.length;
}
