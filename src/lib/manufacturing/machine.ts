import {
  isTerminalState,
  type ManufacturingEventType,
  type ManufacturingState,
} from "./types";

/**
 * The manufacturing state machine.
 *
 * Pure and total: a state and an event go in, a decision comes out. This is the
 * only place the transition graph is written down. Nothing else — no service,
 * no route, no component — may decide what state a job is in.
 *
 * ── Resolving the specification ───────────────────────────────────────────
 *
 * Two points in the brief needed a decision, and both are recorded here so the
 * choice is visible rather than buried:
 *
 * 1. Rework returns through post-processing (§5), not straight to inspection.
 *    §5 draws the cycle as quality_check → rework → post_processing →
 *    quality_check twice, and it is the one that describes real work: a part
 *    that failed inspection is finished again before being inspected again.
 *
 * 2. Some events name the same transition, because different operator surfaces
 *    report the same milestone — the materials desk reports MATERIAL_PREPARED,
 *    the scheduler reports JOB_SCHEDULED, and both mean the job is scheduled.
 *    The machine accepts either and the history records which actually
 *    happened, so the vocabulary can stay operational without the graph
 *    forking.
 */

/** One edge of the graph. */
interface Rule {
  from: readonly ManufacturingState[];
  to: ManufacturingState;
}

/**
 * The transition table.
 *
 * Read it as: this event, reported while the job is in one of these states,
 * moves it to that state. Anything not listed is not a transition.
 */
const RULES: Record<ManufacturingEventType, Rule> = {
  // The job exists. Idempotent: reporting it again while queued changes nothing.
  JOB_QUEUED: { from: ["queued"], to: "queued" },

  DESIGN_REVIEW_STARTED: { from: ["queued"], to: "design_review" },
  DESIGN_APPROVED: { from: ["design_review"], to: "file_preparation" },
  FILE_PREPARED: { from: ["file_preparation"], to: "material_preparation" },

  MATERIAL_PREPARED: { from: ["material_preparation"], to: "scheduled" },
  JOB_SCHEDULED: { from: ["material_preparation"], to: "scheduled" },

  PRINT_STARTED: { from: ["scheduled"], to: "printing" },
  PRINT_COMPLETED: { from: ["printing"], to: "post_processing" },

  POST_PROCESSING_COMPLETED: { from: ["post_processing"], to: "quality_check" },
  QUALITY_STARTED: { from: ["post_processing"], to: "quality_check" },

  QUALITY_APPROVED: { from: ["quality_check"], to: "approved" },
  // Recoverable rejection. An unrecoverable one is JOB_FAILED.
  QUALITY_REJECTED: { from: ["quality_check"], to: "rework" },
  REWORK_STARTED: { from: ["quality_check"], to: "rework" },
  // Back onto the production path, not straight to inspection.
  REWORK_COMPLETED: { from: ["rework"], to: "post_processing" },

  PACKAGING_STARTED: { from: ["approved"], to: "packaging" },
  PACKAGING_COMPLETED: { from: ["packaging"], to: "ready_for_dispatch" },
  READY_FOR_DISPATCH: { from: ["packaging"], to: "ready_for_dispatch" },

  // The handoff. Manufacturing is finished; fulfilment takes it from here.
  JOB_COMPLETED: { from: ["ready_for_dispatch"], to: "completed" },

  JOB_FAILED: { from: [], to: "failed" },
  JOB_CANCELLED: { from: [], to: "cancelled" },
};

/**
 * Where a job may still be cancelled.
 *
 * PROVISIONAL. SADA 3D has no published cancellation policy, so this encodes
 * the only defensible default — cancel before the part is on a machine — and is
 * exported so the real policy replaces a constant rather than a scattering of
 * conditionals. It is not a statement of commercial terms.
 */
export const CANCELLABLE_STATES: readonly ManufacturingState[] = [
  "queued",
  "design_review",
  "file_preparation",
  "material_preparation",
  "scheduled",
];

/**
 * Where a job may fail.
 *
 * Every active state: material can be wrong at any point, a machine can stop
 * mid-print, and a part can be unrecoverable at inspection. A terminal state
 * cannot fail — a completed job that turns out to be wrong is a correction, and
 * corrections are a separate model this phase does not have.
 */
export const FAILABLE_STATES: readonly ManufacturingState[] = [
  "queued",
  "design_review",
  "file_preparation",
  "material_preparation",
  "scheduled",
  "printing",
  "post_processing",
  "quality_check",
  "rework",
  "approved",
  "packaging",
  "ready_for_dispatch",
];

export type TransitionResult =
  /** The event applied. `changed` is false when it was a repeat. */
  | { ok: true; state: ManufacturingState; changed: boolean }
  | { ok: false; reason: string };

/**
 * Applies an event to a state.
 *
 * A repeat of an event whose effect is already in place is accepted and
 * reported as `changed: false`, so a message delivered twice cannot record two
 * transitions. Anything the graph does not allow is refused with a reason —
 * never silently ignored, and never applied anyway.
 */
export function transitionManufacturingState(
  current: ManufacturingState,
  event: ManufacturingEventType,
): TransitionResult {
  if (event === "JOB_CANCELLED") {
    if (current === "cancelled") return { ok: true, state: current, changed: false };
    if (!CANCELLABLE_STATES.includes(current)) {
      return {
        ok: false,
        reason: `A job cannot be cancelled once it is ${current.replace(/_/g, " ")}.`,
      };
    }
    return { ok: true, state: "cancelled", changed: true };
  }

  if (event === "JOB_FAILED") {
    if (current === "failed") return { ok: true, state: current, changed: false };
    if (!FAILABLE_STATES.includes(current)) {
      return { ok: false, reason: `A ${current} job cannot fail.` };
    }
    return { ok: true, state: "failed", changed: true };
  }

  if (isTerminalState(current)) {
    return { ok: false, reason: `A ${current} job cannot be reopened.` };
  }

  const rule = RULES[event];

  // Already where this event leads: the same milestone reported twice.
  if (current === rule.to && rule.from.length > 0) {
    return { ok: true, state: current, changed: false };
  }

  if (!rule.from.includes(current)) {
    return {
      ok: false,
      reason: `${event} is not valid while the job is ${current.replace(/_/g, " ")}.`,
    };
  }

  return { ok: true, state: rule.to, changed: true };
}

/** Every event that would currently be accepted, for an operator surface. */
export function availableEvents(
  current: ManufacturingState,
): ManufacturingEventType[] {
  return (Object.keys(RULES) as ManufacturingEventType[]).filter((event) => {
    const result = transitionManufacturingState(current, event);
    return result.ok && result.changed;
  });
}

/** The state a job starts in. */
export const INITIAL_STATE: ManufacturingState = "queued";

/**
 * Whether the job's work is finished, however it ended.
 *
 * Used by fulfilment to decide whether an item can move on — a completed job
 * can, a failed or cancelled one cannot.
 */
export function isManufacturingComplete(state: ManufacturingState): boolean {
  return state === "completed";
}
