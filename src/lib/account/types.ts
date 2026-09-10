import type { ShippingAddress } from "@/lib/checkout/types";
import type { CustomerManufacturingStage } from "@/lib/manufacturing/types";
import type { OrderStatus } from "@/lib/orders/types";

/**
 * Customer account domain.
 *
 * The account is a *view onto* what already exists, not a second copy of it.
 * Orders, manufacturing jobs and shipments are owned by `lib/orders` and
 * `lib/manufacturing`; nothing here re-derives a status, re-runs a state
 * machine or re-defines a stage. What this module adds is ownership: which of
 * those records belong to one customer, and which fields of them that customer
 * may see.
 *
 * Two boundaries are load-bearing:
 *
 *   IDENTITY    an identity is produced by the auth adapter and by nothing
 *               else. No function here accepts a customer id from a request, a
 *               query string, a form field or a header.
 *
 *   PROJECTION  every collection is returned as a view type with the storage
 *               detail removed. A design's object key and an address's owner
 *               id exist server-side and do not cross into a component.
 *
 * Phase 17 replaces the adapter with Supabase Auth. Nothing below changes when
 * it does — which is the point of writing it now.
 */

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * A customer, as the server has established them.
 *
 * Deliberately one field. Everything else about a person is a profile, and a
 * profile is not what authorises a read.
 */
export interface CustomerIdentity {
  id: string;
}

/**
 * What is known about the person behind the identity.
 *
 * Every field but the id is optional, because the identity provider supplies
 * them and SADA 3D has no identity provider yet. A missing name is shown as
 * missing; it is never substituted.
 */
export interface CustomerProfile {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

/**
 * The account context for one request.
 *
 * `identity: null` is the normal, production-correct state today: there is no
 * authentication, so there is no signed-in customer. The portal renders its
 * sign-in requirement rather than inventing someone.
 */
export interface CustomerContext {
  identity: CustomerIdentity | null;
  profile: CustomerProfile | null;
  /**
   * True when the identity came from the development adapter. Surfaced in the
   * interface so a local reviewer is never left believing they are signed in
   * to something real.
   */
  development: boolean;
}

/** A context that has an identity. The only thing account data is read for. */
export interface AuthenticatedCustomerContext {
  identity: CustomerIdentity;
  profile: CustomerProfile;
  development: boolean;
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

/**
 * One order as the account list shows it.
 *
 * Contact details and the delivery address are absent: a list of orders does
 * not need them, and a projection that carries them everywhere is a projection
 * that leaks them somewhere.
 *
 * `status` and `manufacturing` are separate fields on purpose. An order's
 * commercial status and a part's production stage are different facts about
 * different things, and collapsing them into one badge would make one of them
 * a lie.
 */
export interface CustomerOrderSummary {
  reference: string;
  placedAt: string;
  status: OrderStatus;
  /** Distinct lines, not units. */
  lineCount: number;
  unitCount: number;
  /** Whole rupees, as the order recorded it. */
  total: number;
  currency: "INR";
  /** One line naming what was ordered, e.g. "Precision Gear + 1 more". */
  summary: string;
  /** Placed against provisional pricing or a provisional payment. */
  provisional: boolean;
  /** A Phase 12 demonstration fixture, not a real production record. */
  demo: boolean;
  /** Absent unless something in this order is being manufactured. */
  manufacturing?: CustomerOrderManufacturing;
}

/**
 * The production roll-up for one order.
 *
 * The stage shown is the *least advanced* of the parts still being made — the
 * one the order is actually waiting on. Showing the furthest would tell a
 * customer their order is nearly packed while a second part is still printing.
 */
export interface CustomerOrderManufacturing {
  stage: CustomerManufacturingStage | null;
  itemsInProduction: number;
  /** At least one part is held. Which part, and why, belongs to the item. */
  held: boolean;
  /** At least one part could not be completed. */
  issue: boolean;
}

/**
 * One part currently being made, for the overview's production list.
 *
 * Built only from the Phase 12 customer projection. No internal state, no
 * machine, no operator, no event type.
 */
export interface CustomerManufacturingItem {
  orderReference: string;
  itemId: string;
  itemName: string;
  /** Where the part is now. */
  stage: CustomerManufacturingStage;
  /**
   * What it has actually been through. Finishing and rework map back to an
   * earlier stage, so this is what the timeline marks — nothing a customer was
   * told un-happens.
   */
  furthestStage: CustomerManufacturingStage;
  held: boolean;
  lastUpdatedAt: string;
  demo: boolean;
}

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

/**
 * A manufacturing design a customer has stored.
 *
 * `fileKey` is the private storage reference. It stays on this side of the
 * boundary: a component renders `CustomerDesignView`, and an object key never
 * reaches a browser. Phase 16 turns the key into a short-lived authorised URL
 * requested per download; it never becomes a public address.
 */
export interface CustomerDesign {
  id: string;
  customerId: string;
  name: string;
  /** Uppercase format label, e.g. "STL". */
  format: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  /** Private object reference. Never sent to a browser. */
  fileKey: string;
  /** Private object reference for a rendered preview, when one exists. */
  previewKey?: string;
  /** Orders this design has been manufactured for. */
  orderReferences: readonly string[];
}

/** A design as a component receives it. No storage references. */
export interface CustomerDesignView {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  createdAt: string;
  hasPreview: boolean;
  orderReferences: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Saved items
 * ------------------------------------------------------------------ */

/**
 * A marketplace product a customer kept for later.
 *
 * A reference, never a copy. The catalog owns the name, the price and the
 * availability; a saved item that duplicated them would show yesterday's price
 * forever.
 */
export interface SavedItem {
  id: string;
  customerId: string;
  productId: string;
  savedAt: string;
}

/** A saved item resolved against the catalog, ready for a ProductCard. */
export interface SavedProductView {
  id: string;
  productId: string;
  savedAt: string;
  /** Absent when the product has left the catalog. The entry still lists. */
  product?: {
    name: string;
    href: string;
    material: string;
    color: string;
    /** Formatted, or absent for a quote-only part. */
    price?: string;
    image?: { src: string; alt: string };
  };
}

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

/**
 * A delivery address a customer has saved.
 *
 * The address itself is `ShippingAddress` — the same type checkout validates
 * and an order stores. A second address shape would drift from it, and the two
 * would eventually disagree about what a valid address is.
 */
export interface CustomerAddress {
  id: string;
  customerId: string;
  /** Optional short name, e.g. "Workshop". */
  label?: string;
  fullName: string;
  phone: string;
  address: ShippingAddress;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An address as a component receives it. The owner id stays server-side. */
export type CustomerAddressView = Omit<CustomerAddress, "customerId">;

export interface CustomerAddressInput {
  label?: string;
  fullName: string;
  phone: string;
  address: ShippingAddress;
  isDefault?: boolean;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export interface CustomerSettings {
  profile: CustomerProfile;
  /**
   * Whether the profile can be changed here.
   *
   * False until Phase 17 owns the identity record. A name written into a store
   * the identity provider does not read would be a change that appears to work
   * and does not, which is worse than a field that says it cannot be edited.
   */
  editable: boolean;
}

/* ------------------------------------------------------------------ *
 * Collections
 * ------------------------------------------------------------------ */

/**
 * A collection that may not be readable yet.
 *
 * `unavailable` is not the same as empty, and the difference is the whole
 * reason this type exists: "you have no saved designs" and "designs cannot be
 * stored yet" are different sentences, and only one of them is true today.
 */
export type CollectionResult<T> =
  | { status: "ok"; items: readonly T[] }
  | { status: "unavailable"; reason: string };
