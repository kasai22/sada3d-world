import type { CartTotals } from "@/lib/cart/types";
import type { Contact, ShippingAddress } from "@/lib/checkout/types";

/**
 * Order domain.
 *
 * Four independent state machines meet here and are kept apart:
 *
 *   ORDER          commercial lifecycle of the whole order — derived, never set
 *   ORDER ITEM     fulfilment of one thing that was bought
 *   MANUFACTURING  how a custom part is being made (lib/manufacturing)
 *   SHIPMENT       where a parcel is
 *
 * Collapsing any two would make the system lie. An order is not "printing";
 * a part is not "delivered"; a payment failing is not a manufacturing failure.
 */

/* ------------------------------------------------------------------ *
 * Payment
 * ------------------------------------------------------------------ */

/**
 * The commercial precondition, kept out of the order status.
 *
 * A payment failing says nothing about manufacturing, and a part failing
 * inspection says nothing about payment. They are different facts about
 * different things and they are stored separately.
 */
export type PaymentState = "pending" | "paid" | "failed";

export interface OrderPayment {
  status: PaymentState;
  /** Provider reference. Never credentials, never card data. */
  sessionId?: string;
  provider?: string;
}

/* ------------------------------------------------------------------ *
 * Order status
 * ------------------------------------------------------------------ */

/**
 * The commercial lifecycle of the whole order.
 *
 * Derived from its items and its payment by `aggregateOrderStatus`, never
 * assigned by a page or a component. Nothing about production appears here:
 * `printing` is a fact about one part, not about an order that may contain
 * several.
 */
export type OrderStatus =
  /** The record exists; payment has not been attempted. */
  | "pending"
  /** Payment is required, in progress, or has failed and can be retried. */
  | "awaiting_payment"
  /** Paid and accepted. Nothing has started yet. */
  | "confirmed"
  /** At least one item is being worked on. */
  | "fulfillment_in_progress"
  /** Some items are on their way while others are still active. */
  | "partially_fulfilled"
  /** Every item that was not cancelled has been dispatched. */
  | "fulfilled"
  | "cancelled"
  /** Unrecoverable. Nothing in this order can still be delivered. */
  | "failed";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  fulfillment_in_progress: "In fulfilment",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  failed: "Failed",
};

/* ------------------------------------------------------------------ *
 * Item fulfilment
 * ------------------------------------------------------------------ */

/**
 * Where one purchased thing has got to.
 *
 * Independent per item, because an order can hold a stocked gear that ships
 * tomorrow and a custom part that takes a week. Forcing both onto one status
 * would make one of them wrong.
 *
 * This is NOT derived from the manufacturing state. Manufacturing finishing is
 * an input to fulfilment, not the same fact: a completed job means the part is
 * ready to hand over, and handing it over is what fulfilment does.
 */
export type OrderItemFulfillmentStatus =
  | "pending"
  | "in_progress"
  | "ready"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "failed";

export const ITEM_STATUS_LABEL: Record<OrderItemFulfillmentStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  ready: "Ready",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** Dispatched: on its way or arrived. */
export function isItemFulfilled(status: OrderItemFulfillmentStatus): boolean {
  return status === "shipped" || status === "delivered";
}

/** Being worked on right now. */
export function isItemActive(status: OrderItemFulfillmentStatus): boolean {
  return status === "in_progress" || status === "ready";
}

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

/**
 * The manufacturing file a custom item is made from, as it was when the order
 * was placed.
 *
 * A snapshot, for the same reason the price is one. A design is a mutable
 * record — it can be deleted, and a later upload of the same name is a
 * different file — and fulfilment must make the part that was paid for, not
 * whatever the customer's account holds today. So the order records the exact
 * object and its checksum, and the storage sweep will not remove an object any
 * order still names.
 *
 * `storageKey` is private. No DTO carries it and the checkout action does not
 * return it; it exists for fulfilment, server-side.
 */
export interface OrderItemSourceFile {
  designId: string;
  storageKey: string;
  /** Lowercase hex SHA-256, confirmed over the stored bytes. */
  sha256: string;
  fileName: string;
  sizeBytes: number;
  /** Uppercase format label, e.g. "3MF". */
  format: string;
  contentType?: string;
  /** The durable geometry analysis the file was verified with, when analysable. */
  analysisIdentity?: string;
  /** What was quoted, in machine-readable form. `spec` is the display copy. */
  configuration: { material: string; quality: string; finish: string };
}

/**
 * One thing that was bought, snapshotted at the moment it was ordered.
 *
 * A snapshot rather than a reference: the catalog will be re-priced tomorrow
 * and this must still say what was bought and what was charged.
 *
 * `manufacturingJobId` is present only on custom items. A stocked product is
 * fulfilled, not manufactured, and giving it a job would mean inventing
 * production events for something that came off a shelf.
 */
export interface OrderItem {
  id: string;
  type: "catalog" | "custom";
  name: string;
  spec: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Which pricing rules produced a custom item's figure. */
  quoteRulesVersion?: string;
  fulfillmentStatus: OrderItemFulfillmentStatus;
  /** Custom items only. */
  manufacturingJobId?: string;
  /** Set when the item has been assigned to a parcel. */
  shipmentId?: string;
  /**
   * Custom items placed since Stage 16: the stored file this part is made
   * from. Written once, when the order is created, and never rewritten.
   */
  sourceFile?: OrderItemSourceFile;
}

/* ------------------------------------------------------------------ *
 * Shipment
 * ------------------------------------------------------------------ */

/**
 * Where a parcel is. Entirely separate from how its contents were made.
 *
 * There is no path from `printing` to `delivered`: a part reaches a shipment
 * only after its manufacturing job completes and its item becomes ready.
 */
export type ShipmentStatus =
  | "pending"
  | "ready"
  | "shipped"
  | "in_transit"
  | "delivered"
  | "failed"
  | "cancelled";

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  pending: "Pending",
  ready: "Ready to dispatch",
  shipped: "Shipped",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface Shipment {
  id: string;
  orderReference: string;
  status: ShipmentStatus;
  /** The items in this parcel. An order may have more than one. */
  itemIds: readonly string[];
  /** Only ever set from a real carrier record. */
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: string;
  deliveredAt?: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Order
 * ------------------------------------------------------------------ */

export interface Order {
  /** Customer-facing reference, e.g. "S3D-000184". */
  reference: string;
  /** The cart this order was created from. */
  cartId: string;
  /**
   * The account that owns this order, when it was placed by one.
   *
   * Absent on a guest order, and absent on every order placed today: there is
   * no authentication until Phase 17, so nothing sets it. It is the ownership
   * key the account portal reads — `lib/account/orders.ts` matches on it and on
   * nothing else, so an order without one belongs to no account and is
   * reachable only through the Phase 12 guest grant.
   */
  customerId?: string;
  /**
   * Derived by aggregateOrderStatus and stored so orders can be listed and
   * filtered without recomputing. Recomputed on every write — never assigned.
   */
  status: OrderStatus;
  payment: OrderPayment;
  items: readonly OrderItem[];
  shipments: readonly Shipment[];
  totals: CartTotals;
  contact: Contact;
  address: ShippingAddress;
  placedAt: string;
  updatedAt: string;
  cancelledAt?: string;
  /** True while the order was placed against provisional pricing or payment. */
  provisional: boolean;
  /**
   * True for the deterministic development fixtures. Nothing marked this way is
   * a real Reality 3D order, and the interface says so wherever one is shown.
   */
  demo?: boolean;
}
