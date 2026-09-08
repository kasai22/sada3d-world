import {
  addCatalogLineAction,
  addCustomLineAction,
  type CartActionResult,
} from "./actions";

/**
 * Cart intent — the seam the purchase surfaces call.
 *
 * Phase 6 introduced this so the product page had something correct to call
 * before a cart existed; it recorded the intent in the tab and stopped there.
 * Phase 11 replaced what sits behind it. The concept is unchanged:
 *
 *   Product / Custom Print → Cart intent → Cart domain → Cart
 *
 * There is still exactly one way into the cart, and it is still this.
 *
 * What did change is the payload. The old intent carried the product's name,
 * URL and unit price, which read as though the browser was telling the server
 * what something costs. It never should have been able to, and now it cannot:
 * an intent identifies a part and how it is configured, and every other fact
 * about it is the server's to establish.
 */

export type { CartActionResult };

/** A catalog part the customer wants, as they configured it. */
export interface CartLineIntent {
  productId: string;
  material: string;
  color: string;
  /** Quality option value, where the part offers a choice. */
  quality?: string;
  quantity: number;
}

/** A custom part, after it has been configured and quoted. */
export interface CustomCartLineIntent {
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

/** Fired after a successful change so the header count can catch up. */
export const CART_CHANGED_EVENT = "sada3d:cart-changed";

function announce(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}

/** Adds a catalog part to the cart. */
export async function submitCartIntent(
  intent: CartLineIntent,
): Promise<CartActionResult> {
  const result = await addCatalogLineAction(intent);
  if (result.ok) announce();
  return result;
}

/** Adds a configured, quoted custom part to the cart. */
export async function submitCustomCartIntent(
  intent: CustomCartLineIntent,
): Promise<CartActionResult> {
  const result = await addCustomLineAction(intent);
  if (result.ok) announce();
  return result;
}
