import { availableEvents } from "@/lib/manufacturing/machine";
import {
  TERMINAL_STATES,
  type ManufacturingEventType,
  type ManufacturingHoldReason,
  type ManufacturingState,
} from "@/lib/manufacturing/types";

import { HOLD_REASON_LABEL } from "./labels";

/**
 * Production columns and the exception rules.
 *
 * Pure: states and timestamps in, columns and issues out. Nothing here reads a
 * database, and nothing here decides a transition — the manufacturing machine
 * does that. This module decides only how the console *groups* what the machine
 * already says, and which facts deserve an operator's attention.
 *
 * ── Columns are a view, not a lifecycle ──────────────────────────────────
 *
 * The board groups fifteen states into ten columns so it fits a screen. It is
 * the operator's equivalent of the customer's six stages, with the difference
 * that nothing is hidden: every card still carries its exact internal state.
 *
 * ── Issues are derived, never stored ─────────────────────────────────────
 *
 * There is no issues table. An issue is a condition that is true of the live
 * records right now — a payment that failed, a hold nobody has lifted — and it
 * disappears the moment the record stops being in that condition. That keeps
 * the exception centre from ever disagreeing with the orders it describes.
 */

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

export type ProductionColumnId =
  | "queued"
  | "review"
  | "preparation"
  | "printing"
  | "finishing"
  | "inspection"
  | "rework"
  | "packing"
  | "completed"
  | "stopped";

export interface ProductionColumn {
  id: ProductionColumnId;
  label: string;
  hint: string;
  states: readonly ManufacturingState[];
  /** Terminal columns show only recent jobs; see `RECENT_TERMINAL_DAYS`. */
  terminal: boolean;
}

/** How long a finished, failed or cancelled job stays on the board. */
export const RECENT_TERMINAL_DAYS = 7;

export const PRODUCTION_COLUMNS: readonly ProductionColumn[] = [
  { id: "queued", label: "Queued", hint: "Waiting for design review", states: ["queued"], terminal: false },
  { id: "review", label: "Design review", hint: "Checked before production", states: ["design_review"], terminal: false },
  {
    id: "preparation",
    label: "Preparation",
    hint: "File, material and schedule",
    states: ["file_preparation", "material_preparation", "scheduled"],
    terminal: false,
  },
  { id: "printing", label: "Printing", hint: "On a machine", states: ["printing"], terminal: false },
  { id: "finishing", label: "Post-processing", hint: "Finishing after print", states: ["post_processing"], terminal: false },
  { id: "inspection", label: "QC", hint: "Quality inspection", states: ["quality_check"], terminal: false },
  { id: "rework", label: "Rework", hint: "Rejected at inspection", states: ["rework"], terminal: false },
  {
    id: "packing",
    label: "Packing",
    hint: "Approved, packaging, ready to dispatch",
    states: ["approved", "packaging", "ready_for_dispatch"],
    terminal: false,
  },
  { id: "completed", label: "Completed", hint: `Handed off, last ${RECENT_TERMINAL_DAYS} days`, states: ["completed"], terminal: true },
  { id: "stopped", label: "Failed · cancelled", hint: `Stopped, last ${RECENT_TERMINAL_DAYS} days`, states: ["failed", "cancelled"], terminal: true },
];

const COLUMN_BY_STATE = new Map<ManufacturingState, ProductionColumnId>(
  PRODUCTION_COLUMNS.flatMap((column) => column.states.map((state) => [state, column.id] as const)),
);

export function columnForState(state: ManufacturingState): ProductionColumnId {
  const column = COLUMN_BY_STATE.get(state);
  // Every state is listed above and the test enforces it; this is unreachable.
  if (!column) throw new Error(`No production column for state ${state}.`);
  return column;
}

export function isTerminal(state: ManufacturingState): boolean {
  return TERMINAL_STATES.includes(state);
}

export { TERMINAL_STATES };

/* ------------------------------------------------------------------ *
 * Operator events
 * ------------------------------------------------------------------ */

/**
 * Events that name a transition another event already names.
 *
 * The machine accepts both because different desks report the same milestone.
 * The console is one desk, so it offers one button per transition — the event
 * listed here is still accepted from any other reporter and still renders in
 * the history when it happens.
 *
 *   JOB_SCHEDULED       ≡ MATERIAL_PREPARED          → scheduled
 *   QUALITY_STARTED     ≡ POST_PROCESSING_COMPLETED  → quality_check
 *   REWORK_STARTED      ≡ QUALITY_REJECTED           → rework (the latter records the result)
 *   READY_FOR_DISPATCH  ≡ PACKAGING_COMPLETED        → ready_for_dispatch
 */
const CONSOLE_ALIASES: ReadonlySet<ManufacturingEventType> = new Set([
  "JOB_SCHEDULED",
  "QUALITY_STARTED",
  "REWORK_STARTED",
  "READY_FOR_DISPATCH",
]);

/** What the console offers for a job in this state: the machine's answer, one per transition. */
export function consoleJobEvents(state: ManufacturingState): ManufacturingEventType[] {
  return availableEvents(state).filter((event) => !CONSOLE_ALIASES.has(event));
}

/* ------------------------------------------------------------------ *
 * Issues
 * ------------------------------------------------------------------ */

export type IssueSeverity = "high" | "medium" | "low";

export type IssueKind =
  | "payment_failed"
  | "payment_pending"
  | "job_failed"
  | "job_on_hold"
  | "job_rework"
  | "job_overdue"
  | "job_stalled"
  | "shipment_failed"
  | "ready_unshipped"
  | "design_rejected";

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  payment_failed: "Payment failed",
  payment_pending: "Payment outstanding",
  job_failed: "Job failed",
  job_on_hold: "On hold",
  job_rework: "In rework",
  job_overdue: "Past estimate",
  job_stalled: "No recent update",
  shipment_failed: "Shipment failed",
  ready_unshipped: "Ready, not shipped",
  design_rejected: "Design rejected",
};

export const ISSUE_KINDS = Object.keys(ISSUE_KIND_LABEL) as IssueKind[];

/** A job with no update for this long, and no hold explaining why, is worth a look. */
export const STALLED_AFTER_HOURS = 72;
/** An unpaid order older than this is chased rather than waited on. */
export const PAYMENT_PENDING_AFTER_HOURS = 24;
/** Terminal failures stay in the exception centre this long. */
export const RECENT_FAILURE_DAYS = 30;

export interface OpsIssue {
  /** Stable across renders: the kind and the record it is about. */
  id: string;
  kind: IssueKind;
  severity: IssueSeverity;
  title: string;
  detail: string;
  /** The record the operator should open. */
  href: string;
  /** Human identifier of that record, e.g. an order reference. */
  subject: string;
  /** When the condition began, as far as the records say. UTC ISO 8601. */
  since: string;
  demo: boolean;
}

export interface JobSignal {
  jobId: string;
  orderReference: string;
  itemName: string;
  state: ManufacturingState;
  hold?: { reason: ManufacturingHoldReason; startedAt: string };
  estimatedCompletionAt?: string;
  updatedAt: string;
  reworkCount: number;
  demo: boolean;
}

export interface IssueSignals {
  failedPayments: readonly { reference: string; customerName: string; since: string; demo: boolean }[];
  pendingPayments: readonly { reference: string; customerName: string; since: string; demo: boolean }[];
  jobs: readonly JobSignal[];
  failedShipments: readonly { shipmentId: string; orderReference: string; since: string; demo: boolean }[];
  unshippedReady: readonly { orderReference: string; itemCount: number; since: string; demo: boolean }[];
  rejectedDesigns: readonly { designId: string; name: string; reason: string; since: string }[];
}

const HOUR = 60 * 60 * 1000;
const SEVERITY_RANK: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };

export const orderHref = (reference: string) => `/admin/orders/${encodeURIComponent(reference)}`;
export const jobAnchor = (jobId: string) => `job-${jobId.replace(/[^A-Za-z0-9_-]/g, "-")}`;

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

function jobIssues(job: JobSignal, now: number): OpsIssue[] {
  const base = {
    href: `${orderHref(job.orderReference)}#${jobAnchor(job.jobId)}`,
    subject: job.orderReference,
    demo: job.demo,
  };

  if (job.state === "failed") {
    return [
      {
        ...base,
        id: `job_failed:${job.jobId}`,
        kind: "job_failed",
        severity: "high",
        title: "Manufacturing job failed",
        detail: `${job.itemName} cannot be delivered as ordered. Decide whether to remake it or contact the customer.`,
        since: job.updatedAt,
      },
    ];
  }

  if (isTerminal(job.state)) return [];

  const issues: OpsIssue[] = [];
  const held = job.hold !== undefined;

  if (job.hold) {
    issues.push({
      ...base,
      id: `job_on_hold:${job.jobId}`,
      kind: "job_on_hold",
      severity: "medium",
      title: `On hold · ${HOLD_REASON_LABEL[job.hold.reason]}`,
      detail: `${job.itemName} is paused while ${job.state.replace(/_/g, " ")}.`,
      since: job.hold.startedAt,
    });
  }

  if (job.state === "rework") {
    issues.push({
      ...base,
      id: `job_rework:${job.jobId}`,
      kind: "job_rework",
      severity: "medium",
      title: `In rework · ${ordinal(Math.max(job.reworkCount, 1))} pass`,
      detail: `${job.itemName} was rejected at inspection and is being corrected.`,
      since: job.updatedAt,
    });
  }

  const overdue =
    job.estimatedCompletionAt !== undefined && Date.parse(job.estimatedCompletionAt) < now;

  if (overdue && job.estimatedCompletionAt) {
    issues.push({
      ...base,
      id: `job_overdue:${job.jobId}`,
      kind: "job_overdue",
      severity: "high",
      title: "Past estimated completion",
      detail: `${job.itemName} is still ${job.state.replace(/_/g, " ")} after its recorded estimate.`,
      since: job.estimatedCompletionAt,
    });
  }

  // A held or overdue job already explains itself; "no update" would repeat it.
  if (!held && !overdue && now - Date.parse(job.updatedAt) >= STALLED_AFTER_HOURS * HOUR) {
    issues.push({
      ...base,
      id: `job_stalled:${job.jobId}`,
      kind: "job_stalled",
      severity: "low",
      title: "No production update",
      detail: `${job.itemName} has been ${job.state.replace(/_/g, " ")} without a reported milestone for ${STALLED_AFTER_HOURS} hours or more.`,
      since: job.updatedAt,
    });
  }

  return issues;
}

/**
 * Every issue the signals describe, most severe first and oldest first within a
 * severity — the order someone working the queue should take them in.
 *
 * `now` is a parameter so the thresholds are testable and one render uses one
 * clock.
 */
export function deriveIssues(signals: IssueSignals, now: Date): OpsIssue[] {
  const at = now.getTime();
  const issues: OpsIssue[] = [];

  for (const payment of signals.failedPayments) {
    issues.push({
      id: `payment_failed:${payment.reference}`,
      kind: "payment_failed",
      severity: "high",
      title: "Payment failed",
      detail: `${payment.customerName}'s payment did not complete. Nothing is manufactured until it does.`,
      href: `${orderHref(payment.reference)}#payment`,
      subject: payment.reference,
      since: payment.since,
      demo: payment.demo,
    });
  }

  for (const payment of signals.pendingPayments) {
    if (at - Date.parse(payment.since) < PAYMENT_PENDING_AFTER_HOURS * HOUR) continue;

    issues.push({
      id: `payment_pending:${payment.reference}`,
      kind: "payment_pending",
      severity: "medium",
      title: "Payment outstanding",
      detail: `Placed by ${payment.customerName} and not paid after ${PAYMENT_PENDING_AFTER_HOURS} hours.`,
      href: `${orderHref(payment.reference)}#payment`,
      subject: payment.reference,
      since: payment.since,
      demo: payment.demo,
    });
  }

  for (const job of signals.jobs) issues.push(...jobIssues(job, at));

  for (const shipment of signals.failedShipments) {
    issues.push({
      id: `shipment_failed:${shipment.shipmentId}`,
      kind: "shipment_failed",
      severity: "high",
      title: "Shipment failed",
      detail: "The carrier reported the parcel as undeliverable.",
      href: `${orderHref(shipment.orderReference)}#shipping`,
      subject: shipment.orderReference,
      since: shipment.since,
      demo: shipment.demo,
    });
  }

  for (const order of signals.unshippedReady) {
    issues.push({
      id: `ready_unshipped:${order.orderReference}`,
      kind: "ready_unshipped",
      severity: "low",
      title: "Ready to ship, not in a parcel",
      detail:
        order.itemCount === 1
          ? "One item is ready and has not been added to a shipment."
          : `${order.itemCount} items are ready and have not been added to a shipment.`,
      href: `${orderHref(order.orderReference)}#shipping`,
      subject: order.orderReference,
      since: order.since,
      demo: order.demo,
    });
  }

  for (const design of signals.rejectedDesigns) {
    issues.push({
      id: `design_rejected:${design.designId}`,
      kind: "design_rejected",
      severity: "low",
      title: "Design upload rejected",
      detail: `${design.name}: ${design.reason}`,
      href: `/admin/designs/${encodeURIComponent(design.designId)}`,
      subject: design.name,
      since: design.since,
      demo: false,
    });
  }

  return issues.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      Date.parse(a.since) - Date.parse(b.since) ||
      a.id.localeCompare(b.id),
  );
}

export function countBySeverity(issues: readonly OpsIssue[]): Record<IssueSeverity, number> {
  const counts: Record<IssueSeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}
