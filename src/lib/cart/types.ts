import type { QuoteBasis } from "@/lib/pricing/types";

/**
 * Cart domain types.
 *
 * Two things a customer can intend to buy, and they are not the same thing:
 *
 *   catalog — a part SADA 3D already sells, priced by the catalog
 *   custom  — a part the customer supplied, priced by a manufacturing quote
 *
 * They share a cart and nothing else. The discriminant is explicit so no code
 * ever has to guess which it is holding.
 *
 * MONEY: every amount in this domain is an integer number of whole rupees.
 * There are no paise anywhere in the system, and `formatINR` renders with zero
 * decimals. Nothing here stores a formatted string.
 *
 * TRUST: a stored line records identity, configuration and quantity. It does
 * not record what the cart costs. Prices are resolved from the catalog and the
 * pricing rules every time the cart is read, so a tampered store cannot change
 * a total — the worst it can do is ask for a different product.
 */

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

export type CartLineType = "catalog" | "custom";

export interface CatalogLineConfiguration {
  material: string;
  color: string;
  /** Quality option value, where the product offers a choice. */
  quality?: string;
}

export interface CatalogCartLine {
  type: "catalog";
  /** Deterministic: product plus configuration. See identity.ts. */
  id: string;
  productId: string;
  quantity: number;
  configuration: CatalogLineConfiguration;
  /**
   * The catalog price when this line was added, recorded by the server.
   *
   * Used only to notice that the price has since moved. It never prices the
   * cart — that always comes from the catalog as it is now.
   */
  priceAtAdd: number;
  addedAt: string;
}

/**
 * The customer's model, as the cart knows it.
 *
 * Identity and file facts only. This is NOT a storage reference: the file
 * itself is still in the browser, and no field here should be read as a claim
 * that it has been stored anywhere.
 */
export interface CustomLineModel {
  modelId: string;
  name: string;
  /** Lowercase extension including the dot. */
  extension: string;
  sizeBytes: number;
  formatLabel: string;
  triangles?: number;
}

export interface CustomLineConfiguration {
  material: string;
  quality: string;
  finish: string;
}

/**
 * The quote a custom line was added against.
 *
 * A record of what the customer was shown, kept so the server can tell whether
 * the figure still holds. It is never the figure the customer is charged: that
 * is recomputed from the configuration at read time.
 */
export interface CustomQuoteReference {
  rulesVersion: string;
  /** Total the customer was shown, in whole rupees. */
  total: number;
  basis: QuoteBasis;
  provisional: boolean;
  quotedAt: string;
}

export interface CustomCartLine {
  type: "custom";
  id: string;
  quantity: number;
  model: CustomLineModel;
  configuration: CustomLineConfiguration;
  quote: CustomQuoteReference;
  addedAt: string;
}

export type CartLine = CatalogCartLine | CustomCartLine;

export interface Cart {
  /** Identifies this cart. Not a customer identifier. */
  id: string;
  lines: readonly CartLine[];
  updatedAt: string;
}

export const EMPTY_CART: Cart = { id: "", lines: [], updatedAt: "" };

/** Beyond this the cart stops being a cart and starts being a data problem. */
export const MAX_CART_LINES = 40;
export const MAX_LINE_QUANTITY = 500;

/* ------------------------------------------------------------------ *
 * Issues
 * ------------------------------------------------------------------ */

export type CartIssueCode =
  /** The product is no longer in the catalog. */
  | "product_unavailable"
  /** The product exists but cannot be bought this way, e.g. quote-only. */
  | "product_not_purchasable"
  /** The catalog price moved after the line was added. */
  | "price_changed"
  /** The configuration no longer produces the quoted figure. */
  | "quote_stale"
  /** The configuration cannot be quoted at all. */
  | "quote_unavailable"
  /**
   * The manufacturing file is not durably stored, so this part cannot become
   * an order. Durable storage arrives with R2 in Phase 16.
   */
  | "model_file_pending"
  | "quantity_invalid";

/**
 * `blocking` stops checkout. `notice` is worth saying and does not.
 *
 * A price change blocks: the customer agreed to a figure, and the system must
 * not quietly charge a different one.
 */
export type CartIssueSeverity = "blocking" | "notice";

export interface CartIssue {
  code: CartIssueCode;
  severity: CartIssueSeverity;
  /** Shown to the customer. Plain, specific, and about the part. */
  message: string;
  /** The line it belongs to, or absent when it is about the cart. */
  lineId?: string;
}

/* ------------------------------------------------------------------ *
 * Priced view
 * ------------------------------------------------------------------ */

/**
 * A cart line with everything the UI needs, resolved server-side.
 *
 * Components render this. They never look a product up, never call the pricing
 * engine and never add anything up themselves.
 */
export interface PricedCartLine {
  line: CartLine;
  name: string;
  /** Link back to the product, where one exists. */
  href?: string;
  /** Configuration as one technical string, e.g. "PLA / BLACK / 0.16 MM". */
  spec: string;
  /** Whole rupees, or null when the line cannot currently be priced. */
  unitPrice: number | null;
  lineTotal: number | null;
  issues: readonly CartIssue[];
}

/**
 * An amount the system either knows or does not.
 *
 * Shipping and tax are `unknown` until real rules exist. They are not zero, and
 * the difference matters: zero is a claim, unknown is the truth.
 */
export type MoneyKnown = { known: true; amount: number };
export type MoneyUnknown = { known: false; reason: string };
export type Money = MoneyKnown | MoneyUnknown;

export interface CartTotals {
  currency: "INR";
  /** Sum of the lines that could be priced. */
  subtotal: number;
  shipping: Money;
  tax: Money;
  /**
   * What the customer would pay now: the subtotal plus every component the
   * system actually knows. Unknown components are excluded and named.
   */
  total: number;
  /** Components deliberately not in the total, stated to the customer. */
  excluded: readonly string[];
  /** Total units across every line — the header count. */
  unitCount: number;
  /** True while any line is priced by provisional manufacturing rules. */
  provisional: boolean;
}

/** The cart as every consumer sees it: lines, prices, problems, totals. */
export interface PricedCart {
  id: string;
  lines: readonly PricedCartLine[];
  totals: CartTotals;
  /** Cart-level issues plus every line issue, in one list. */
  issues: readonly CartIssue[];
  /** False when any blocking issue exists. */
  checkoutReady: boolean;
}
