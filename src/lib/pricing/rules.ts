/**
 * ============================================================
 *  PROVISIONAL — NOT PRODUCTION PRICING
 * ============================================================
 *
 * Every number in this file is a demonstration constant. The repository
 * contains no approved SADA 3D commercial pricing — no material rates, machine
 * rates, setup fees, finishing fees, quantity breaks, shipping tariffs or GST
 * policy — so none is asserted here.
 *
 * These values exist so the quote pipeline can be built, shown and tested end
 * to end. They must be replaced with approved commercial rules before any
 * figure is shown to a real customer. Because they are the single source of
 * pricing truth, that replacement is a change to this file alone.
 *
 * Anything derived from these rules is marked `provisional: true` on the quote
 * and labelled as an estimate in the interface.
 *
 * Note also what is deliberately NOT modelled: the size and complexity of the
 * part. Nothing in the system measures volume, weight or print time yet, so no
 * rule here pretends to price them.
 */

export interface PricingRules {
  version: string;
  provisional: boolean;
  currency: "INR";
  /** Charged once per job, regardless of quantity. */
  setupFee: number;
  /** Per-unit starting point before any adjustment. */
  baseUnitCost: number;
  /** Multiplier on the base unit cost. 1.0 is the reference material. */
  materialFactor: Readonly<Record<string, number>>;
  /** Multiplier on the material-adjusted unit cost. */
  qualityFactor: Readonly<Record<string, number>>;
  /** Flat per-unit fee. Zero means no separate charge. */
  finishFee: Readonly<Record<string, number>>;
  /** Job total floor. */
  minimumOrder: number;
  /** Rejected above this, as a browser-side sanity bound. */
  maxQuantity: number;
}

export const PRICING_RULES: PricingRules = {
  version: "demo-2026-01",
  provisional: true,
  currency: "INR",

  setupFee: 250,
  baseUnitCost: 400,

  // Reference material is PLA at 1.0. Ratios follow the relative material
  // ordering already used across the design system's demo content.
  materialFactor: {
    pla: 1.0,
    petg: 1.2,
    abs: 1.3,
    tpu: 1.6,
    resin: 2.1,
  },

  // Finer layers mean more passes and longer machine time.
  qualityFactor: {
    standard: 1.0,
    precision: 1.15,
    "high-detail": 1.35,
  },

  // Standard is the part as it leaves the machine, so it carries no fee and no
  // line appears for it.
  finishFee: {
    standard: 0,
    smooth: 120,
    matte: 80,
  },

  minimumOrder: 500,
  maxQuantity: 500,
};

/**
 * Costs the estimate does not include, stated to the customer.
 *
 * Shipping and taxes are absent because no approved rule exists for either;
 * both are settled at checkout. Geometry-dependent cost is absent because
 * nothing measures the part yet.
 */
export const EXCLUDED_FROM_ESTIMATE: readonly string[] = [
  "Geometry-dependent cost, pending model analysis",
  "Shipping, calculated at checkout",
  "Taxes, calculated at checkout",
];
