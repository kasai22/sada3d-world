/**
 * Manufacturing domain.
 *
 * ONE canonical internal state, ONE customer-facing projection. There is no
 * `stage` beside `status`, no `phase`, no `productionState` — those would be
 * four names for the same fact, and they would drift.
 *
 *   ManufacturingState          what operations knows
 *   CustomerManufacturingStage  what the customer is shown
 *
 * Everything that is *not* lifecycle lives beside the state rather than inside
 * it: holds, quality results, machine assignment and estimates are separate
 * fields. Folding them in would produce `printing_paused_machine_issue` and a
 * combinatorial explosion of states that mean almost the same thing.
 *
 * Only custom-manufactured items get a job. A stocked catalog product is
 * fulfilled, not manufactured, and inventing production events for it would be
 * inventing facts.
 */

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/**
 * The internal manufacturing lifecycle.
 *
 * `rework` is an operational recovery state, not a parallel lifecycle: it sits
 * between a rejected inspection and the production path it returns to.
 *
 * `completed` means manufacturing is finished and the part has been handed to
 * fulfilment. It does not mean the customer has it — delivery belongs to the
 * shipment.
 */
export type ManufacturingState =
  | "queued"
  | "design_review"
  | "file_preparation"
  | "material_preparation"
  | "scheduled"
  | "printing"
  | "post_processing"
  | "quality_check"
  | "rework"
  | "approved"
  | "packaging"
  | "ready_for_dispatch"
  | "completed"
  | "cancelled"
  | "failed";

/** States from which nothing further can happen. */
export const TERMINAL_STATES: readonly ManufacturingState[] = [
  "completed",
  "cancelled",
  "failed",
];

export function isTerminalState(state: ManufacturingState): boolean {
  return TERMINAL_STATES.includes(state);
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

/**
 * What operations reports. State is never set directly — it is derived from
 * the event by the transition function, which is the only place the graph is
 * encoded.
 *
 * These are operational milestones, not UI interactions. Nothing here
 * corresponds to a button being looked at.
 */
export type ManufacturingEventType =
  | "JOB_QUEUED"
  | "DESIGN_REVIEW_STARTED"
  | "DESIGN_APPROVED"
  | "FILE_PREPARED"
  | "MATERIAL_PREPARED"
  | "JOB_SCHEDULED"
  | "PRINT_STARTED"
  | "PRINT_COMPLETED"
  | "POST_PROCESSING_COMPLETED"
  | "QUALITY_STARTED"
  | "QUALITY_APPROVED"
  | "QUALITY_REJECTED"
  | "REWORK_STARTED"
  | "REWORK_COMPLETED"
  | "PACKAGING_STARTED"
  | "PACKAGING_COMPLETED"
  | "READY_FOR_DISPATCH"
  | "JOB_COMPLETED"
  | "JOB_FAILED"
  | "JOB_CANCELLED";

/**
 * A recorded event.
 *
 * `id` is what makes an event idempotent: the same id applied twice is the
 * same event reported twice, and the second application changes nothing.
 */
export interface ManufacturingEvent {
  id: string;
  type: ManufacturingEventType;
  /** UTC ISO 8601. Rendered in the reader's timezone, never stored in one. */
  occurredAt: string;
  /** Who reported it. Internal — never sent to a customer. */
  actor?: string;
  /** Internal operator note. Never sent to a customer. */
  note?: string;
  /** The state the job was in before this event, for audit. */
  from: ManufacturingState;
  to: ManufacturingState;
}

/* ------------------------------------------------------------------ *
 * Holds
 * ------------------------------------------------------------------ */

/**
 * Why production is interrupted.
 *
 * A hold is orthogonal to the lifecycle: a job on hold is still *in* a
 * meaningful state. "printing, held for a machine issue" says two true things;
 * `paused_machine_issue` says one vague one and needs a twin for every state
 * it could happen in.
 */
export type ManufacturingHoldReason =
  | "material_unavailable"
  | "machine_issue"
  | "design_review"
  | "customer_action"
  | "quality_issue"
  | "other";

export interface ManufacturingHold {
  reason: ManufacturingHoldReason;
  startedAt: string;
  resolvedAt?: string;
  /** Internal detail. Never sent to a customer. */
  note?: string;
}

/** A hold is active until it is resolved. */
export function isHoldActive(hold: ManufacturingHold | undefined): boolean {
  return hold !== undefined && hold.resolvedAt === undefined;
}

/* ------------------------------------------------------------------ *
 * Quality
 * ------------------------------------------------------------------ */

/**
 * The inspection outcome, kept separate from the lifecycle state.
 *
 * `quality_check` says where the part is; `qualityResult` says what was found.
 * A state cannot carry both without one of them becoming a lie: a part sitting
 * in inspection has no result yet, and that is a real and distinct condition.
 */
export type QualityResult = "pending" | "approved" | "rejected";

/* ------------------------------------------------------------------ *
 * Job
 * ------------------------------------------------------------------ */

export interface ManufacturingJob {
  id: string;
  /** The order item this job makes. The job never owns a shipment. */
  orderItemId: string;
  orderReference: string;
  state: ManufacturingState;
  /** Newest last. Ordered by occurredAt, then by insertion for exact ties. */
  events: readonly ManufacturingEvent[];
  hold?: ManufacturingHold;
  qualityResult: QualityResult;
  /** How many times this part has been through rework. */
  reworkCount: number;
  /**
   * Only ever set from a real estimate source. Never derived from the state:
   * "it is printing" is not an arrival date.
   */
  estimatedCompletionAt?: string;
  /**
   * Which machine the job is assigned to, when one is. Machine *state* is a
   * separate system and is not represented here.
   */
  machineId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Customer projection
 * ------------------------------------------------------------------ */

/**
 * What the customer is shown.
 *
 * Six stages, deliberately fewer than the internal states. The customer does
 * not need to know the difference between file preparation and material
 * preparation, and exposing it would leak the shop floor into the storefront.
 *
 * Shipment is not here. It is a separate machine with its own states.
 */
export type CustomerManufacturingStage =
  | "design_verified"
  | "preparing"
  | "printing"
  | "quality_check"
  | "packaging"
  | "ready_to_ship";

export const CUSTOMER_STAGES: readonly CustomerManufacturingStage[] = [
  "design_verified",
  "preparing",
  "printing",
  "quality_check",
  "packaging",
  "ready_to_ship",
];

export const CUSTOMER_STAGE_LABEL: Record<CustomerManufacturingStage, string> = {
  design_verified: "Design verified",
  preparing: "Preparing",
  printing: "Printing",
  quality_check: "Quality check",
  packaging: "Packaging",
  ready_to_ship: "Ready to ship",
};

/** Hold reasons a customer may be told about, and how they are worded. */
export type CustomerSafeHoldReason =
  | "material_unavailable"
  | "production_issue"
  | "design_review"
  | "customer_action"
  | "quality_issue";

export interface CustomerVisibleEvent {
  id: string;
  stage: CustomerManufacturingStage;
  occurredAt: string;
  message: string;
}

/**
 * Everything the browser is allowed to know about a job.
 *
 * No operator notes, no machine identifiers, no internal failure codes, no
 * event types. The internal state is included because the customer stage is
 * derived from it and support needs the two to agree — it is a label, not a
 * capability, and nothing the browser sends can change it.
 */
export interface CustomerManufacturingTracking {
  state: ManufacturingState;
  /** Null once the job has failed or been cancelled: there is no stage then. */
  stage: CustomerManufacturingStage | null;
  lastUpdatedAt: string;
  estimatedCompletionAt?: string;
  hold?: { reason: CustomerSafeHoldReason; since: string };
  history: readonly CustomerVisibleEvent[];
}
