import {
  isHoldActive,
  type CustomerManufacturingStage,
  type CustomerManufacturingTracking,
  type CustomerSafeHoldReason,
  type CustomerVisibleEvent,
  type ManufacturingEvent,
  type ManufacturingEventType,
  type ManufacturingHoldReason,
  type ManufacturingJob,
  type ManufacturingState,
} from "./types";

/**
 * The customer projection.
 *
 * One direction only: internal facts are translated outward, and nothing the
 * customer sees can be turned back into a capability. This module decides what
 * leaves the shop floor.
 *
 * Three rules govern it:
 *
 *   · every internal state maps to exactly one customer stage, so the timeline
 *     can never show two stages active at once;
 *   · operator notes, machine identifiers, actor names and internal event types
 *     never appear in the output;
 *   · nothing is invented. No percentage, no estimated date, no event that did
 *     not happen.
 */

/**
 * Internal state to customer stage.
 *
 * Fifteen states collapse to six. `post_processing` reads as preparing — the
 * part is being worked on between the machine and the inspection bench — and
 * `rework` stays under quality check, which is the loop it belongs to. Both are
 * better than inventing stages that only exist to describe an intermediate.
 *
 * Note the consequence: a part that has printed and is being finished maps back
 * to `preparing`, so the *current* stage moves backwards along the six even
 * though the work has not. `furthestStageReached` exists for that reason — the
 * timeline marks what a part has actually been through, so a customer never
 * sees printing un-happen.
 *
 * The two failure terminals map to nothing: a cancelled or failed job is not at
 * a stage, and showing it as one would misrepresent it.
 */
const STAGE: Record<ManufacturingState, CustomerManufacturingStage | null> = {
  queued: "design_verified",
  design_review: "design_verified",
  file_preparation: "preparing",
  material_preparation: "preparing",
  scheduled: "preparing",
  printing: "printing",
  post_processing: "preparing",
  quality_check: "quality_check",
  rework: "quality_check",
  approved: "packaging",
  packaging: "packaging",
  ready_for_dispatch: "ready_to_ship",
  completed: "ready_to_ship",
  cancelled: null,
  failed: null,
};

export function customerStage(
  state: ManufacturingState,
): CustomerManufacturingStage | null {
  return STAGE[state];
}

/* ------------------------------------------------------------------ *
 * Holds
 * ------------------------------------------------------------------ */

/**
 * What a customer may be told about an interruption.
 *
 * `machine_issue` becomes `production_issue`: the customer is owed the fact
 * that production has stopped, not the identity of the machine that stopped it.
 * `other` is not exposed at all — an unclassified hold is an internal matter
 * until someone classifies it.
 */
const HOLD_REASON: Record<ManufacturingHoldReason, CustomerSafeHoldReason | null> = {
  material_unavailable: "material_unavailable",
  machine_issue: "production_issue",
  design_review: "design_review",
  customer_action: "customer_action",
  quality_issue: "quality_issue",
  other: null,
};

export const HOLD_MESSAGE: Record<CustomerSafeHoldReason, string> = {
  material_unavailable:
    "Material for this part is being sourced before production can continue.",
  production_issue: "Production is paused. Work resumes once it is cleared.",
  design_review: "Your design is being reviewed before production continues.",
  customer_action: "This part is waiting on information from you.",
  quality_issue: "Additional inspection is required before this part continues.",
};

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

/**
 * What each milestone means to the customer.
 *
 * A null entry is deliberate: the event is real and recorded internally, but it
 * tells the customer nothing they can act on or understand. Scheduling and
 * queueing move a job between desks; they do not move the part.
 */
const EVENT_MESSAGE: Record<ManufacturingEventType, string | null> = {
  JOB_QUEUED: "Your part has entered production.",
  DESIGN_REVIEW_STARTED: "Your design is being checked for manufacturability.",
  DESIGN_APPROVED: "Your design has been verified.",
  FILE_PREPARED: "The build file is prepared.",
  MATERIAL_PREPARED: "Material has been prepared.",
  JOB_SCHEDULED: null,
  PRINT_STARTED: "Printing has started.",
  PRINT_COMPLETED: "Printing is complete.",
  POST_PROCESSING_COMPLETED: "Finishing is complete.",
  QUALITY_STARTED: "Your part is being inspected.",
  QUALITY_APPROVED: "Your part passed inspection.",
  // Said plainly, without the word "rejected": the outcome for the customer is
  // that the part is being worked on again, which is what this tells them.
  QUALITY_REJECTED: "Your part needs further work before final inspection.",
  REWORK_STARTED: "Your part is being prepared for another production pass.",
  REWORK_COMPLETED: "Rework is complete.",
  PACKAGING_STARTED: "Your part is being packed.",
  PACKAGING_COMPLETED: "Your part is packed.",
  READY_FOR_DISPATCH: "Your part is ready to ship.",
  JOB_COMPLETED: "Manufacturing is complete.",
  JOB_FAILED: "Production could not be completed for this part.",
  JOB_CANCELLED: "Production was cancelled for this part.",
};

/**
 * Turns an internal event into a customer-visible one, or discards it.
 *
 * Only the stage, the time and a written message survive. The event type, the
 * actor and any note do not cross this line.
 *
 * Neither does the internal id. It reads as a harmless key, and it is not: ids
 * are built as `${jobId}_${index}_${type}`, so passing one through would put
 * `QUALITY_REJECTED` into the page as a React key — the exact internal
 * vocabulary the message above is carefully worded to avoid. The customer's
 * event gets its own identity, assigned by position in the visible history.
 */
function toCustomerEvent(
  event: ManufacturingEvent,
  position: number,
): CustomerVisibleEvent | null {
  const message = EVENT_MESSAGE[event.type];
  if (!message) return null;

  // A failed or cancelled job has no stage; its event is still worth showing,
  // filed under the stage the part had reached.
  const stage = customerStage(event.to) ?? customerStage(event.from);
  if (!stage) return null;

  return { id: `ev_${position}`, stage, occurredAt: event.occurredAt, message };
}

/**
 * Orders events for display.
 *
 * By time, then by the order they were recorded. Two events can share a
 * timestamp — a fast operator surface, a coarse clock — and insertion order is
 * the tiebreak that keeps the sequence stable instead of leaving it to sort
 * implementation.
 */
export function orderEvents(
  events: readonly ManufacturingEvent[],
): ManufacturingEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const byTime =
        Date.parse(a.event.occurredAt) - Date.parse(b.event.occurredAt);
      return byTime !== 0 ? byTime : a.index - b.index;
    })
    .map(({ event }) => event);
}

/* ------------------------------------------------------------------ *
 * Tracking
 * ------------------------------------------------------------------ */

/**
 * The whole of what the browser is given about a job.
 *
 * Built by projection rather than by omission: the result is assembled from
 * fields that are safe, not copied from the job and then trimmed. A new
 * internal field cannot leak by being forgotten here.
 */
export function toCustomerTracking(
  job: ManufacturingJob,
): CustomerManufacturingTracking {
  const holdReason = job.hold ? HOLD_REASON[job.hold.reason] : null;
  const showHold = isHoldActive(job.hold) && holdReason !== null;

  return {
    state: job.state,
    stage: customerStage(job.state),
    lastUpdatedAt: job.updatedAt,
    // Absent unless a real estimate exists. Never computed from the state.
    estimatedCompletionAt: job.estimatedCompletionAt,
    hold:
      showHold && job.hold && holdReason
        ? { reason: holdReason, since: job.hold.startedAt }
        : undefined,
    history: visibleHistory(job.events),
  };
}

/**
 * The customer-visible history, in order and numbered.
 *
 * Numbered by position among the events that survive, not among all of them, so
 * the identity carries no information about how many internal events there were
 * or which of them were discarded.
 */
function visibleHistory(
  events: readonly ManufacturingEvent[],
): CustomerVisibleEvent[] {
  const visible: CustomerVisibleEvent[] = [];

  for (const event of orderEvents(events)) {
    const projected = toCustomerEvent(event, visible.length + 1);
    if (projected) visible.push(projected);
  }

  return visible;
}

/**
 * Position of a stage in the customer journey.
 *
 * Stage-based and derived, never a percentage of work done — nothing measures
 * that. -1 means the job has failed or been cancelled and has no stage.
 */
export function stageIndex(stage: CustomerManufacturingStage | null): number {
  if (!stage) return -1;
  return CUSTOMER_ORDER.indexOf(stage);
}

const CUSTOMER_ORDER: readonly CustomerManufacturingStage[] = [
  "design_verified",
  "preparing",
  "printing",
  "quality_check",
  "packaging",
  "ready_to_ship",
];

/**
 * The furthest stage a job has actually been through.
 *
 * Read from the recorded history, not from the current state, because two
 * states map backwards: a part in post-processing or rework has genuinely
 * printed, and a timeline that un-ticked printing would be telling the customer
 * that work they were told about has been undone.
 *
 * The current stage is still `customerStage(job.state)`. This is what has been
 * completed; that is where the part is now.
 */
export function furthestStageReached(
  events: readonly ManufacturingEvent[],
): CustomerManufacturingStage | null {
  let best = -1;

  for (const event of events) {
    best = Math.max(best, stageIndex(customerStage(event.to)));
  }

  return best === -1 ? null : (CUSTOMER_ORDER[best] ?? null);
}

/**
 * The same question, asked of the customer-visible history.
 *
 * `furthestStageReached` reads internal events and is for code that holds a
 * job. Anything downstream of `toCustomerTracking` holds only the projection,
 * and must reach the same answer from it — one function so the account portal
 * and the guest tracking page can never mark a different stage as reached.
 */
export function furthestStageInHistory(
  history: readonly CustomerVisibleEvent[],
): CustomerManufacturingStage | null {
  let best = -1;

  for (const event of history) {
    best = Math.max(best, stageIndex(event.stage));
  }

  return best === -1 ? null : (CUSTOMER_ORDER[best] ?? null);
}
