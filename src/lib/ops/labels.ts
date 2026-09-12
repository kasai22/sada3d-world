import type { DesignStorageState } from "@/lib/account/types";
import type {
  ManufacturingEventType,
  ManufacturingHoldReason,
  ManufacturingState,
  QualityResult,
} from "@/lib/manufacturing/types";
import type { ShipmentEventType } from "@/lib/orders/shipment";
import type {
  OrderItemFulfillmentStatus,
  OrderStatus,
  PaymentState,
  ShipmentStatus,
} from "@/lib/orders/types";

/**
 * How the operations console names things.
 *
 * Client-safe: types and string tables only, so a client component can label a
 * state without reaching anything on the server.
 *
 * ── Operator vocabulary, not customer vocabulary ─────────────────────────
 *
 * The customer is shown six stages through `toCustomerTracking`. An operator is
 * shown the fifteen internal states, the event that moved them and the hold
 * reason as it was recorded — that is what the console is for. None of these
 * tables is imported by a storefront module.
 *
 * ── Tone ─────────────────────────────────────────────────────────────────
 *
 * Tone carries state and is always paired with the label; colour is never the
 * only signal. Orange (`accent`) is rationed to work that is actively moving.
 */

export type OpsTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export const ORDER_STATUS_TONE: Record<OrderStatus, OpsTone> = {
  pending: "neutral",
  awaiting_payment: "warning",
  confirmed: "info",
  fulfillment_in_progress: "accent",
  partially_fulfilled: "accent",
  fulfilled: "success",
  cancelled: "neutral",
  failed: "danger",
};

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
};

export const PAYMENT_STATE_TONE: Record<PaymentState, OpsTone> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
};

export const ITEM_STATUS_TONE: Record<OrderItemFulfillmentStatus, OpsTone> = {
  pending: "neutral",
  in_progress: "accent",
  ready: "info",
  shipped: "success",
  delivered: "success",
  cancelled: "neutral",
  failed: "danger",
};

/* ------------------------------------------------------------------ *
 * Manufacturing
 * ------------------------------------------------------------------ */

export const MANUFACTURING_STATE_LABEL: Record<ManufacturingState, string> = {
  queued: "Queued",
  design_review: "Design review",
  file_preparation: "File preparation",
  material_preparation: "Material preparation",
  scheduled: "Scheduled",
  printing: "Printing",
  post_processing: "Post-processing",
  quality_check: "Quality check",
  rework: "Rework",
  approved: "Approved",
  packaging: "Packaging",
  ready_for_dispatch: "Ready for dispatch",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

export const MANUFACTURING_STATE_TONE: Record<ManufacturingState, OpsTone> = {
  queued: "neutral",
  design_review: "info",
  file_preparation: "info",
  material_preparation: "info",
  scheduled: "info",
  printing: "accent",
  post_processing: "accent",
  quality_check: "info",
  rework: "warning",
  approved: "success",
  packaging: "info",
  ready_for_dispatch: "success",
  completed: "success",
  cancelled: "neutral",
  failed: "danger",
};

/** What a button that reports the event says. Imperative. */
export const EVENT_ACTION_LABEL: Record<ManufacturingEventType, string> = {
  JOB_QUEUED: "Confirm queued",
  DESIGN_REVIEW_STARTED: "Start design review",
  DESIGN_APPROVED: "Approve design",
  FILE_PREPARED: "Mark file prepared",
  MATERIAL_PREPARED: "Mark material prepared",
  JOB_SCHEDULED: "Schedule job",
  PRINT_STARTED: "Start print",
  PRINT_COMPLETED: "Complete print",
  POST_PROCESSING_COMPLETED: "Complete post-processing",
  QUALITY_STARTED: "Start inspection",
  QUALITY_APPROVED: "Pass inspection",
  QUALITY_REJECTED: "Reject to rework",
  REWORK_STARTED: "Send to rework",
  REWORK_COMPLETED: "Complete rework",
  PACKAGING_STARTED: "Start packaging",
  PACKAGING_COMPLETED: "Complete packaging",
  READY_FOR_DISPATCH: "Mark ready for dispatch",
  JOB_COMPLETED: "Hand off to fulfilment",
  JOB_FAILED: "Mark job failed",
  JOB_CANCELLED: "Cancel job",
};

/** What the event log says happened. Past tense. */
export const EVENT_LOG_LABEL: Record<ManufacturingEventType, string> = {
  JOB_QUEUED: "Job queued",
  DESIGN_REVIEW_STARTED: "Design review started",
  DESIGN_APPROVED: "Design approved",
  FILE_PREPARED: "File prepared",
  MATERIAL_PREPARED: "Material prepared",
  JOB_SCHEDULED: "Job scheduled",
  PRINT_STARTED: "Print started",
  PRINT_COMPLETED: "Print completed",
  POST_PROCESSING_COMPLETED: "Post-processing completed",
  QUALITY_STARTED: "Inspection started",
  QUALITY_APPROVED: "Inspection passed",
  QUALITY_REJECTED: "Inspection rejected",
  REWORK_STARTED: "Rework started",
  REWORK_COMPLETED: "Rework completed",
  PACKAGING_STARTED: "Packaging started",
  PACKAGING_COMPLETED: "Packaging completed",
  READY_FOR_DISPATCH: "Ready for dispatch",
  JOB_COMPLETED: "Handed off to fulfilment",
  JOB_FAILED: "Job failed",
  JOB_CANCELLED: "Job cancelled",
};

export const HOLD_REASON_LABEL: Record<ManufacturingHoldReason, string> = {
  material_unavailable: "Material unavailable",
  machine_issue: "Machine issue",
  design_review: "Design review",
  customer_action: "Waiting on customer",
  quality_issue: "Quality issue",
  other: "Other",
};

export const HOLD_REASONS = Object.keys(HOLD_REASON_LABEL) as ManufacturingHoldReason[];

export const QUALITY_RESULT_LABEL: Record<QualityResult, string> = {
  pending: "Not yet judged",
  approved: "Passed",
  rejected: "Rejected",
};

/* ------------------------------------------------------------------ *
 * Shipments
 * ------------------------------------------------------------------ */

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatus, OpsTone> = {
  pending: "neutral",
  ready: "info",
  shipped: "info",
  in_transit: "info",
  delivered: "success",
  failed: "danger",
  cancelled: "neutral",
};

export const SHIPMENT_EVENT_ACTION_LABEL: Record<ShipmentEventType, string> = {
  SHIPMENT_READY: "Mark parcel ready",
  SHIPMENT_DISPATCHED: "Mark dispatched",
  SHIPMENT_IN_TRANSIT: "Mark in transit",
  SHIPMENT_DELIVERED: "Mark delivered",
  SHIPMENT_FAILED: "Mark delivery failed",
  SHIPMENT_CANCELLED: "Cancel shipment",
};

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

export const DESIGN_STORAGE_LABEL: Record<DesignStorageState, string> = {
  pending: "Uploading",
  verified: "Verified",
  failed: "Rejected",
  deleted: "Deleted",
};

export const DESIGN_STORAGE_TONE: Record<DesignStorageState, OpsTone> = {
  pending: "neutral",
  verified: "success",
  failed: "danger",
  deleted: "neutral",
};

/* ------------------------------------------------------------------ *
 * Destructive operations
 * ------------------------------------------------------------------ */

/**
 * Events that end something and cannot be undone by another event. The console
 * asks for confirmation before reporting any of them.
 */
export const DESTRUCTIVE_EVENTS: ReadonlySet<ManufacturingEventType | ShipmentEventType> =
  new Set(["JOB_FAILED", "JOB_CANCELLED", "SHIPMENT_FAILED", "SHIPMENT_CANCELLED"]);
