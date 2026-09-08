import type { CartTotals, Money, PricedCartLine } from "./types";

/**
 * Cart totals.
 *
 * The single arithmetic layer for the cart. The cart page, the checkout page,
 * the order summary and the header count all read what this produces; none of
 * them adds anything up. That is the only way three surfaces can be guaranteed
 * to agree.
 *
 * Pure: lines and amounts in, totals out. No catalog, no storage, no React.
 * Whole rupees throughout.
 */

/** Shipping and tax as the system currently knows them: it does not. */
export const SHIPPING_UNAVAILABLE: Money = {
  known: false,
  reason: "Calculated at checkout",
};

export const TAX_UNAVAILABLE: Money = {
  known: false,
  reason: "Calculated at checkout",
};

export interface TotalsInput {
  shipping?: Money;
  tax?: Money;
}

/**
 * Adds up a priced cart.
 *
 * A line that could not be priced contributes nothing and is not guessed at.
 * An unknown shipping or tax component is excluded from the total and named, so
 * the figure shown is one the system can actually stand behind — never a total
 * that silently assumes shipping is free.
 */
export function calculateCartTotals(
  lines: readonly PricedCartLine[],
  input: TotalsInput = {},
): CartTotals {
  const shipping = input.shipping ?? SHIPPING_UNAVAILABLE;
  const tax = input.tax ?? TAX_UNAVAILABLE;

  let subtotal = 0;
  let unitCount = 0;
  let provisional = false;

  for (const priced of lines) {
    unitCount += priced.line.quantity;
    if (priced.lineTotal !== null) subtotal += priced.lineTotal;
    if (priced.line.type === "custom" && priced.line.quote.provisional) {
      provisional = true;
    }
  }

  const excluded: string[] = [];
  let total = subtotal;

  if (shipping.known) total += shipping.amount;
  else excluded.push("Shipping");

  if (tax.known) total += tax.amount;
  else excluded.push("GST");

  return {
    currency: "INR",
    subtotal,
    shipping,
    tax,
    total,
    excluded,
    unitCount,
    provisional,
  };
}

/** Total units in the cart — what the header badge counts. */
export function unitCount(lines: readonly { quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
