import { and, asc, count, eq, gte, isNotNull, isNull, lt, ne, notInArray, or } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/db/client";
import {
  customerDesigns,
  manufacturingJobs,
  orderItems,
  orders,
  shipments,
} from "@/lib/db/schema";

import type { OperatorSession } from "./operator";
import {
  PAYMENT_PENDING_AFTER_HOURS,
  RECENT_FAILURE_DAYS,
  STALLED_AFTER_HOURS,
  deriveIssues,
  type IssueSignals,
  type OpsIssue,
} from "./pipeline";
import { DAY_MS, HOUR_MS, TERMINAL, activeHold, iso, optionalIso } from "./sql";

/**
 * The exception centre's inputs.
 *
 * Six narrow queries, each asking for records already in a condition worth an
 * operator's attention — never "every job, then filter". The rules that turn
 * them into issues are in `pipeline.ts`, pure, where they are tested.
 *
 * Each query is capped. A backlog larger than the cap is a backlog the console
 * cannot help with by listing more of it, and the count shown says when the
 * cap was reached.
 */

export const SIGNAL_LIMIT = 200;

/** Design verification refusals that are noise rather than problems. */
const IGNORED_DESIGN_FAILURES = ["upload_abandoned"];
const REJECTED_DESIGN_DAYS = 7;

export async function readIssueSignals(
  _operator: OperatorSession,
  now: Date,
): Promise<IssueSignals> {
  const db = await getDatabase();
  const at = now.getTime();

  const pendingCutoff = new Date(at - PAYMENT_PENDING_AFTER_HOURS * HOUR_MS);
  const stalledCutoff = new Date(at - STALLED_AFTER_HOURS * HOUR_MS);
  const failureCutoff = new Date(at - RECENT_FAILURE_DAYS * DAY_MS);
  const designCutoff = new Date(at - REJECTED_DESIGN_DAYS * DAY_MS);

  const [failedPayments, pendingPayments, jobs, failedShipments, unshippedReady, rejectedDesigns] =
    await Promise.all([
      db
        .select({
          reference: orders.reference,
          customerName: orders.contactName,
          since: orders.updatedAt,
          demo: orders.demo,
        })
        .from(orders)
        .where(and(eq(orders.paymentStatus, "failed"), ne(orders.status, "cancelled")))
        .orderBy(asc(orders.updatedAt))
        .limit(SIGNAL_LIMIT),

      db
        .select({
          reference: orders.reference,
          customerName: orders.contactName,
          since: orders.placedAt,
          demo: orders.demo,
        })
        .from(orders)
        .where(
          and(
            eq(orders.paymentStatus, "pending"),
            ne(orders.status, "cancelled"),
            lt(orders.placedAt, pendingCutoff),
          ),
        )
        .orderBy(asc(orders.placedAt))
        .limit(SIGNAL_LIMIT),

      db
        .select({
          jobId: manufacturingJobs.id,
          orderReference: manufacturingJobs.orderReference,
          itemName: orderItems.name,
          state: manufacturingJobs.state,
          holdReason: manufacturingJobs.holdReason,
          holdStartedAt: manufacturingJobs.holdStartedAt,
          holdResolvedAt: manufacturingJobs.holdResolvedAt,
          estimatedCompletionAt: manufacturingJobs.estimatedCompletionAt,
          updatedAt: manufacturingJobs.updatedAt,
          reworkCount: manufacturingJobs.reworkCount,
          demo: orders.demo,
        })
        .from(manufacturingJobs)
        .innerJoin(orderItems, eq(orderItems.id, manufacturingJobs.orderItemId))
        .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
        .where(
          or(
            and(
              notInArray(manufacturingJobs.state, TERMINAL),
              or(
                and(isNotNull(manufacturingJobs.holdReason), isNull(manufacturingJobs.holdResolvedAt)),
                eq(manufacturingJobs.state, "rework"),
                lt(manufacturingJobs.estimatedCompletionAt, now),
                lt(manufacturingJobs.updatedAt, stalledCutoff),
              ),
            ),
            and(eq(manufacturingJobs.state, "failed"), gte(manufacturingJobs.updatedAt, failureCutoff)),
          ),
        )
        .orderBy(asc(manufacturingJobs.updatedAt))
        .limit(SIGNAL_LIMIT),

      db
        .select({
          shipmentId: shipments.id,
          orderReference: shipments.orderReference,
          since: shipments.updatedAt,
          demo: orders.demo,
        })
        .from(shipments)
        .innerJoin(orders, eq(orders.reference, shipments.orderReference))
        .where(and(eq(shipments.status, "failed"), gte(shipments.updatedAt, failureCutoff)))
        .limit(SIGNAL_LIMIT),

      db
        .select({
          orderReference: orderItems.orderReference,
          itemCount: count(),
          since: orders.updatedAt,
          demo: orders.demo,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
        .where(
          and(
            eq(orderItems.fulfillmentStatus, "ready"),
            isNull(orderItems.shipmentId),
            ne(orders.status, "cancelled"),
          ),
        )
        .groupBy(orderItems.orderReference, orders.updatedAt, orders.demo)
        .limit(SIGNAL_LIMIT),

      db
        .select({
          designId: customerDesigns.id,
          name: customerDesigns.name,
          failureCode: customerDesigns.failureCode,
          failureMessage: customerDesigns.failureMessage,
          since: customerDesigns.updatedAt,
        })
        .from(customerDesigns)
        .where(
          and(
            eq(customerDesigns.storageState, "failed"),
            or(
              isNull(customerDesigns.failureCode),
              notInArray(customerDesigns.failureCode, IGNORED_DESIGN_FAILURES),
            ),
            gte(customerDesigns.updatedAt, designCutoff),
          ),
        )
        .limit(SIGNAL_LIMIT),
    ]);

  return {
    failedPayments: failedPayments.map((row) => ({ ...row, since: iso(row.since) })),
    pendingPayments: pendingPayments.map((row) => ({ ...row, since: iso(row.since) })),
    jobs: jobs.map((row) => {
      const hold = activeHold(row);
      const estimate = optionalIso(row.estimatedCompletionAt);
      return {
        jobId: row.jobId,
        orderReference: row.orderReference,
        itemName: row.itemName,
        state: row.state,
        ...(hold ? { hold } : {}),
        ...(estimate ? { estimatedCompletionAt: estimate } : {}),
        updatedAt: iso(row.updatedAt),
        reworkCount: row.reworkCount,
        demo: row.demo,
      };
    }),
    failedShipments: failedShipments.map((row) => ({ ...row, since: iso(row.since) })),
    unshippedReady: unshippedReady.map((row) => ({
      orderReference: row.orderReference,
      itemCount: Number(row.itemCount),
      since: iso(row.since),
      demo: row.demo,
    })),
    rejectedDesigns: rejectedDesigns.map((row) => ({
      designId: row.designId,
      name: row.name,
      reason: row.failureMessage || row.failureCode || "Verification refused the file.",
      since: iso(row.since),
    })),
  };
}

/**
 * Every open issue, once per request.
 *
 * The shell's notification count, the dashboard and the exception centre all
 * ask in the same render; React's `cache` answers them from one set of reads.
 */
const loadIssues = cache(async (operator: OperatorSession): Promise<OpsIssue[]> => {
  const now = new Date();
  return deriveIssues(await readIssueSignals(operator, now), now);
});

export async function listOpsIssues(operator: OperatorSession): Promise<OpsIssue[]> {
  return loadIssues(operator);
}

/** Issues about one order's references, for lists that flag rows. */
export function issuesByReference(issues: readonly OpsIssue[]): Map<string, OpsIssue[]> {
  const grouped = new Map<string, OpsIssue[]>();
  for (const issue of issues) {
    const list = grouped.get(issue.subject);
    if (list) list.push(issue);
    else grouped.set(issue.subject, [issue]);
  }
  return grouped;
}
