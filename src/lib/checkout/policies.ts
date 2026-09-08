import type { Money, PricedCartLine } from "@/lib/cart/types";

import { SUPPORTED_COUNTRIES, type ShippingAddress } from "./types";

/**
 * Shipping and tax policy.
 *
 * Both are seams with nothing behind them yet, and that is the honest state of
 * the system rather than an omission. SADA 3D has no published shipping tariff
 * and no configured GST treatment, so neither can be quoted.
 *
 * The important consequence: shipping and tax are *unknown*, not zero. A zero
 * would be a claim — that delivery is free, that no tax applies — and neither
 * claim is true. Unknown components are named to the customer and left out of
 * the total, so the figure shown is one the system can stand behind.
 *
 * When real rules exist they are implemented here, and nothing else changes:
 * the totals layer already knows how to add a known amount.
 */

/* ------------------------------------------------------------------ *
 * Destination
 * ------------------------------------------------------------------ */

export function isSupportedCountry(code: string): boolean {
  return SUPPORTED_COUNTRIES.some((country) => country.code === code);
}

export type DestinationCheck =
  | { supported: true }
  | { supported: false; message: string };

/**
 * Whether SADA 3D ships to an address.
 *
 * India only. An unsupported destination is refused with a reason rather than
 * accepted and quietly quoted at nothing.
 */
export function checkDestination(address: ShippingAddress): DestinationCheck {
  if (!isSupportedCountry(address.country)) {
    return {
      supported: false,
      message: "SADA 3D currently ships within India only.",
    };
  }

  return { supported: true };
}

/* ------------------------------------------------------------------ *
 * Shipping
 * ------------------------------------------------------------------ */

export interface ShippingPolicy {
  readonly name: string;
  /** Configured means a real tariff exists and a figure can be produced. */
  readonly configured: boolean;
  quote(address: ShippingAddress, lines: readonly PricedCartLine[]): Money;
}

export const shippingPolicy: ShippingPolicy = {
  name: "unconfigured",
  configured: false,

  quote(): Money {
    return {
      known: false,
      reason: "Confirmed before dispatch",
    };
  },
};

/* ------------------------------------------------------------------ *
 * Tax
 * ------------------------------------------------------------------ */

export interface TaxPolicy {
  readonly name: string;
  readonly configured: boolean;
  calculate(address: ShippingAddress, subtotal: number): Money;
}

export const taxPolicy: TaxPolicy = {
  name: "unconfigured",
  configured: false,

  calculate(): Money {
    // No rate appears anywhere in this codebase. GST treatment for 3D printing
    // services depends on registration and place of supply, and inventing a
    // percentage here would put a fabricated number on an invoice.
    return {
      known: false,
      reason: "Added on the tax invoice",
    };
  },
};
