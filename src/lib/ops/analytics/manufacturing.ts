import { and, count, countDistinct, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/db/client";
import { manufacturingEvents, manufacturingJobs, orderItems, orders, shipments } from "@/lib/db/schema";
import type { ManufacturingEventType } from "@/lib/manufacturing/types";

import type { OperatorSession } from "../operator";
import { jobIsActive, jobIsHeld } from "../sql";
import type { DateRange } from "./range";
import { DATA_SOURCES, within } from "./sql";
import { ACTIVE_STAGES, activeStageOf, type ActiveStage } from "./stages";
import type { Traced } from "./types";

/**
 * ManufacturingAnalyticsService — what is on the floor, and what moved.
 *
 * ── Right now ────────────────────────────────────────────────────────────
 *
 * Active jobs by summary stage, with holds. Demonstration jobs are included,
 * because the board shows them and an operator can move them, and counted
 * separately so the figure can say how many there are.
 *
 * ── Over the range ───────────────────────────────────────────────────────
 *
 * Milestones read from the event log (completed, failed, rejected at
 * inspection) and parts dispatched, read from the shipment the part's order
 * line was packed into. Real orders only.
 *
 * ── Machines ─────────────────────────────────────────────────────────────
 *
 * A job records the machine id it was assigned to, and nothing records when a
 * machine was busy or idle. So this reports how many active jobs name each
 * machine, and never a utilisation — there is no source for one.
 */

export interface ManufacturingSummary extends Traced {
  stages: { stage: ActiveStage; count: number; held: number }[];
  active: number;
  held: number;
  demoActive: number;
  /** Active jobs held because material is unavailable — the one inventory signal production records. */
  heldForMaterial: number;
  inRange: { started: number; completed: number; failed: number; rejected: number; dispatched: number };
  machines: { machineId: string; activeJobs: number }[];
  utilisation: { available: false; reason: string };
}

export const UTILISATION_GAP =
  "Jobs record which machine they were assigned to, but no machine registry, run time or idle time is recorded, so utilisation is not calculated.";

/** Active jobs held because material is unavailable. Once per request. */
const loadHeldForMaterial = cache(async (): Promise<number> => {
  const db = await getDatabase();
  const [row] = await db
    .select({ value: count() })
    .from(manufacturingJobs)
    .where(and(jobIsHeld(), eq(manufacturingJobs.holdReason, "material_unavailable")));
  return Number(row?.value ?? 0);
});

export async function getHeldForMaterial(_operator: OperatorSession): Promise<number> {
  return loadHeldForMaterial();
}

const MILESTONES: readonly ManufacturingEventType[] = ["JOB_COMPLETED", "JOB_FAILED", "QUALITY_REJECTED"];

export async function getManufacturingSummary(
  operator: OperatorSession,
  range: DateRange,
  now: Date = new Date(),
): Promise<ManufacturingSummary> {
  const db = await getDatabase();

  const [byState, heldForMaterial, milestones, started, dispatched, machines] = await Promise.all([
    db
      .select({
        state: manufacturingJobs.state,
        total: count(),
        held: sql<number>`count(*) filter (where ${jobIsHeld()})`.mapWith(Number),
        demo: sql<number>`count(*) filter (where ${orders.demo})`.mapWith(Number),
      })
      .from(manufacturingJobs)
      .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
      .where(jobIsActive())
      .groupBy(manufacturingJobs.state),
    getHeldForMaterial(operator),
    db
      .select({ type: manufacturingEvents.type, value: count() })
      .from(manufacturingEvents)
      .innerJoin(manufacturingJobs, eq(manufacturingJobs.id, manufacturingEvents.jobId))
      .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
      .where(
        and(
          inArray(manufacturingEvents.type, [...MILESTONES]),
          within(manufacturingEvents.occurredAt, range),
          eq(orders.demo, false),
        ),
      )
      .groupBy(manufacturingEvents.type),
    db
      .select({ value: count() })
      .from(manufacturingJobs)
      .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
      .where(and(within(manufacturingJobs.createdAt, range), eq(orders.demo, false))),
    db
      .select({ value: countDistinct(manufacturingJobs.id) })
      .from(manufacturingJobs)
      .innerJoin(orderItems, eq(orderItems.id, manufacturingJobs.orderItemId))
      .innerJoin(shipments, eq(shipments.id, orderItems.shipmentId))
      .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
      .where(
        and(
          isNotNull(shipments.shippedAt),
          within(shipments.shippedAt, range),
          inArray(orderItems.fulfillmentStatus, ["shipped", "delivered"]),
          eq(orders.demo, false),
        ),
      ),
    db
      .select({ machineId: manufacturingJobs.machineId, value: count() })
      .from(manufacturingJobs)
      .where(and(jobIsActive(), isNotNull(manufacturingJobs.machineId)))
      .groupBy(manufacturingJobs.machineId)
      .orderBy(desc(count()), manufacturingJobs.machineId),
  ]);

  const stages = ACTIVE_STAGES.map((stage) => ({ stage, count: 0, held: 0 }));
  let active = 0;
  let held = 0;
  let demoActive = 0;
  for (const row of byState) {
    const id = activeStageOf(row.state);
    const entry = stages.find((candidate) => candidate.stage.id === id);
    if (!entry) continue;
    entry.count += Number(row.total);
    entry.held += Number(row.held);
    active += Number(row.total);
    held += Number(row.held);
    demoActive += Number(row.demo);
  }

  const milestone = (type: ManufacturingEventType) =>
    Number(milestones.find((row) => row.type === type)?.value ?? 0);

  return {
    range,
    stages,
    active,
    held,
    demoActive,
    heldForMaterial,
    inRange: {
      started: Number(started[0]?.value ?? 0),
      completed: milestone("JOB_COMPLETED"),
      failed: milestone("JOB_FAILED"),
      rejected: milestone("QUALITY_REJECTED"),
      dispatched: Number(dispatched[0]?.value ?? 0),
    },
    machines: machines.map((row) => ({ machineId: row.machineId ?? "", activeJobs: Number(row.value) })),
    utilisation: { available: false, reason: UTILISATION_GAP },
    source: DATA_SOURCES.jobs,
    definition:
      "Active jobs are every job not completed, cancelled or failed, as they stand now (demonstration jobs included and counted). Range figures are milestones from the event log and parts whose shipment left in the range, for real orders only.",
    generatedAt: now.toISOString(),
  };
}
