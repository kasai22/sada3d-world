import type { CartTotals } from "@/lib/cart/types";

/**
 * Checkout domain types.
 *
 * The boundary this file draws matters more than any field on it:
 *
 *   a cart line is what the customer intends to buy
 *   an order  is what SADA 3D has accepted to fulfil
 *
 * They are separate types with separate lifetimes. An order snapshots what was
 * agreed — names, configuration and figures as they stood when it was placed —
 * because the catalog will change and the order must not.
 */

/* ------------------------------------------------------------------ *
 * Customer
 * ------------------------------------------------------------------ */

/** Only what fulfilment actually needs. Nothing is collected "just in case". */
export interface Contact {
  name: string;
  email: string;
  phone: string;
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  /** State or union territory code, see INDIA_STATES. */
  state: string;
  /** Indian PIN code: six digits, first digit 1–9. */
  postalCode: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export const EMPTY_CONTACT: Contact = { name: "", email: "", phone: "" };

export const EMPTY_ADDRESS: ShippingAddress = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "IN",
};

/**
 * Where SADA 3D can currently ship.
 *
 * India only, because that is the market the business operates in. This list is
 * the whole rule — no other destination is offered, and one that is asked for
 * is refused rather than silently accepted and quoted at zero.
 */
export const SUPPORTED_COUNTRIES: readonly { code: string; label: string }[] = [
  { code: "IN", label: "India" },
];

/**
 * Indian states and union territories, with the codes used by GST registration
 * and postal addressing. Reference data, not business policy.
 */
export const INDIA_STATES: readonly { code: string; label: string }[] = [
  { code: "AN", label: "Andaman and Nicobar Islands" },
  { code: "AP", label: "Andhra Pradesh" },
  { code: "AR", label: "Arunachal Pradesh" },
  { code: "AS", label: "Assam" },
  { code: "BR", label: "Bihar" },
  { code: "CH", label: "Chandigarh" },
  { code: "CT", label: "Chhattisgarh" },
  { code: "DH", label: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", label: "Delhi" },
  { code: "GA", label: "Goa" },
  { code: "GJ", label: "Gujarat" },
  { code: "HR", label: "Haryana" },
  { code: "HP", label: "Himachal Pradesh" },
  { code: "JK", label: "Jammu and Kashmir" },
  { code: "JH", label: "Jharkhand" },
  { code: "KA", label: "Karnataka" },
  { code: "KL", label: "Kerala" },
  { code: "LA", label: "Ladakh" },
  { code: "LD", label: "Lakshadweep" },
  { code: "MP", label: "Madhya Pradesh" },
  { code: "MH", label: "Maharashtra" },
  { code: "MN", label: "Manipur" },
  { code: "ML", label: "Meghalaya" },
  { code: "MZ", label: "Mizoram" },
  { code: "NL", label: "Nagaland" },
  { code: "OR", label: "Odisha" },
  { code: "PY", label: "Puducherry" },
  { code: "PB", label: "Punjab" },
  { code: "RJ", label: "Rajasthan" },
  { code: "SK", label: "Sikkim" },
  { code: "TN", label: "Tamil Nadu" },
  { code: "TG", label: "Telangana" },
  { code: "TR", label: "Tripura" },
  { code: "UP", label: "Uttar Pradesh" },
  { code: "UT", label: "Uttarakhand" },
  { code: "WB", label: "West Bengal" },
];

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export interface FieldError {
  /** Dotted path, e.g. "contact.email" or "address.postalCode". */
  field: string;
  message: string;
}

/* ------------------------------------------------------------------ *
 * Order
 * ------------------------------------------------------------------ */

/**
 * Order status.
 *
 * Commercial states only. Nothing here describes a machine, a queue or a
 * production step — manufacturing status is Phase 12's, and mixing the two
 * would make "paid" and "printing" look like points on one scale.
 */
export type OrderStatus =
  | "pending"
  | "awaiting_payment"
  | "paid"
  | "payment_failed"
  | "cancelled";

/**
 * A line as the order records it.
 *
 * A snapshot, not a reference. The catalog can be re-priced tomorrow and this
 * must still say what was bought and what was charged.
 */
export interface OrderLine {
  type: "catalog" | "custom";
  name: string;
  spec: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Present on custom lines: what produced the price. */
  quoteRulesVersion?: string;
}

export interface Order {
  /** Customer-facing reference, e.g. "S3D-000184". */
  reference: string;
  status: OrderStatus;
  /** The cart this order was created from. */
  cartId: string;
  lines: readonly OrderLine[];
  totals: CartTotals;
  contact: Contact;
  address: ShippingAddress;
  placedAt: string;
  /** Provider reference, never provider credentials or card data. */
  paymentSessionId?: string;
  paymentProvider?: string;
  /** True while the order was placed against provisional pricing rules. */
  provisional: boolean;
}

/* ------------------------------------------------------------------ *
 * Checkout
 * ------------------------------------------------------------------ */

export interface CheckoutInput {
  contact: Contact;
  address: ShippingAddress;
}

export type CheckoutResult =
  | { status: "placed"; order: Order }
  /** The cart cannot be ordered as it stands. */
  | { status: "cart_invalid"; messages: readonly string[] }
  | { status: "invalid"; errors: readonly FieldError[] }
  /** The provider declined or failed. The cart is untouched. */
  | { status: "payment_failed"; message: string }
  | { status: "error"; message: string };
