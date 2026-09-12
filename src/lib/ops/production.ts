import { and, asc, eq, gte, ilike, notInArray, or } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { manufacturingJobs, orderItems, orders } from "@/lib/db/schema";
import type {
  ManufacturingHoldReason,
  ManufacturingState,
  QualityResult,
} from "@/lib/manufacturing/types";

import { DESTRUCTIVE_EVENTS, EVENT_ACTION_LABEL } from "./labels";
import type { OperatorSession } from "./operator";
import {
  PRODUCTION_COLUMNS,
  RECENT_TERMINAL_DAYS,
  columnForState,
  consoleJobEvents,
  deriveIssues,
  isTerminal,
  jobAnchor,
  orderHref,
  type IssueKind,
  type IssueSeverity,
  type ProductionColumn,
  type ProductionColumnId,
} from "./pipeline";
import { likePattern, type ProductionQuery } from "./query";
import { DAY_MS, TERMINAL, activeHold, iso, optionalIso } from "./sql";

/**
 * The production board.
 *
 * One read: every job that is still in production, plus the ones that finished
 * or stopped in the last week, joined to the item it makes and the order it
 * belongs to. The active set is bounded by the shop's capacity rather than by
 * history, so this does not grow with the age of the business.
 *
 * Cards carry what the floor needs — the part, its material and quality, the
 * machine when one is assigned, the estimate when one was recorded — and say
 * plainly when a value was never set. Nothing is inferred: no job has a machine
 * or an estimate until something real assigns one.
 */

export const BOARD_LIMIT = 500;
export const TERMINAL_CARDS_PER_COLUMN = 20;

export interface ProductionCard {
  jobId: string;
  href: string;
  orderReference: string;
  state: ManufacturingState;
  column: ProductionColumnId;
  itemName: string;
  spec: string;
  quantity: number;
  configuration?: { material: string; quality: string; finish: string };
  file?: { designId: string; format: string };
  customerName: string;
  machineId?: string;
  estimatedCompletionAt?: string;
  hold?: { reason: ManufacturingHoldReason; startedAt: string };
  reworkCount: number;
  qualityResult: QualityResult;
  updatedAt: string;
  placedAt: string;
  demo: boolean;
  /** The most severe exception on this job, if any. */
  exception: { kind: IssueKind; severity: IssueSeverity; title: string } | null;
  /** The next non-destructive step the console offers. */
  nextAction?: string;
}

export interface ProductionBoard {
  columns: { column: ProductionColumn; cards: ProductionCard[]; total: number }[];
  counts: { active: number; held: number; exceptions: number };
  /** More jobs matched than the board reads. */
  truncated: boolean;
}

function readConfiguration(value: unknown): ProductionCard["configuration"] {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
  const configuration = { material: text("material"), quality: text("quality"), finish: text("finish") };
  return configuration.material || configuration.quality || configuration.finish ? configuration : undefined;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };

export async function getProductionBoard(
  _operator: OperatorSession,
  query: ProductionQuery,
  now: Date = new Date(),
): Promise<ProductionBoard> {
  const db = await getDatabase();
  const recent = new Date(now.getTime() - RECENT_TERMINAL_DAYS * DAY_MS);
  const pattern = query.q ? likePattern(query.q) : undefined;

  const rows = await db
    .select({
      jobId: manufacturingJobs.id,
      orderReference: manufacturingJobs.orderReference,
      state: manufacturingJobs.state,
      qualityResult: manufacturingJobs.qualityResult,
      reworkCount: manufacturingJobs.reworkCount,
      holdReason: manufacturingJobs.holdReason,
      holdStartedAt: manufacturingJobs.holdStartedAt,
      holdResolvedAt: manufacturingJobs.holdResolvedAt,
      estimatedCompletionAt: manufacturingJobs.estimatedCompletionAt,
      machineId: manufacturingJobs.machineId,
      updatedAt: manufacturingJobs.updatedAt,
      itemName: orderItems.name,
      spec: orderItems.spec,
      quantity: orderItems.quantity,
      sourceDesignId: orderItems.sourceDesignId,
      sourceFormat: orderItems.sourceFormat,
      sourceConfiguration: orderItems.sourceConfiguration,
      customerName: orders.contactName,
      placedAt: orders.placedAt,
      demo: orders.demo,
    })
    .from(manufacturingJobs)
    .innerJoin(orderItems, eq(orderItems.id, manufacturingJobs.orderItemId))
    .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
    .where(
      and(
        or(notInArray(manufacturingJobs.state, TERMINAL), gte(manufacturingJobs.updatedAt, recent)),
        pattern
          ? or(
              ilike(manufacturingJobs.orderReference, pattern),
              ilike(orderItems.name, pattern),
              ilike(orders.contactName, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(asc(manufacturingJobs.updatedAt))
    .limit(BOARD_LIMIT + 1);

  const truncated = rows.length > BOARD_LIMIT;

  const cards: ProductionCard[] = rows.slice(0, BOARD_LIMIT).map((row) => {
    const hold = activeHold(row);
    const estimate = optionalIso(row.estimatedCompletionAt);
    const updatedAt = iso(row.updatedAt);

    const [issue] = deriveIssues(
      {
        failedPayments: [],
        pendingPayments: [],
        failedShipments: [],
        unshippedReady: [],
        rejectedDesigns: [],
        jobs: [
          {
            jobId: row.jobId,
            orderReference: row.orderReference,
            itemName: row.itemName,
            state: row.state,
            ...(hold ? { hold } : {}),
            ...(estimate ? { estimatedCompletionAt: estimate } : {}),
            updatedAt,
            reworkCount: row.reworkCount,
            demo: row.demo,
          },
        ],
      },
      now,
    );

    const next = consoleJobEvents(row.state).find((event) => !DESTRUCTIVE_EVENTS.has(event));
    const configuration = readConfiguration(row.sourceConfiguration);

    return {
      jobId: row.jobId,
      href: `${orderHref(row.orderReference)}#${jobAnchor(row.jobId)}`,
      orderReference: row.orderReference,
      state: row.state,
      column: columnForState(row.state),
      itemName: row.itemName,
      spec: row.spec,
      quantity: row.quantity,
      ...(configuration ? { configuration } : {}),
      ...(row.sourceDesignId && row.sourceFormat
        ? { file: { designId: row.sourceDesignId, format: row.sourceFormat } }
        : {}),
      customerName: row.customerName,
      ...(row.machineId ? { machineId: row.machineId } : {}),
      ...(estimate ? { estimatedCompletionAt: estimate } : {}),
      ...(hold ? { hold } : {}),
      reworkCount: row.reworkCount,
      qualityResult: row.qualityResult,
      updatedAt,
      placedAt: iso(row.placedAt),
      demo: row.demo,
      exception: issue ? { kind: issue.kind, severity: issue.severity, title: issue.title } : null,
      ...(next ? { nextAction: EVENT_ACTION_LABEL[next] } : {}),
    };
  });

  const visible = query.exceptions ? cards.filter((card) => card.exception) : cards;

  const columns = PRODUCTION_COLUMNS.map((column) => {
    const inColumn = visible.filter((card) => card.column === column.id);

    const sorted = column.terminal
      ? inColumn.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : inColumn.sort(
          (a, b) =>
            (a.exception ? SEVERITY_RANK[a.exception.severity] : 3) -
              (b.exception ? SEVERITY_RANK[b.exception.severity] : 3) ||
            a.updatedAt.localeCompare(b.updatedAt),
        );

    return {
      column,
      cards: column.terminal ? sorted.slice(0, TERMINAL_CARDS_PER_COLUMN) : sorted,
      total: sorted.length,
    };
  });

  const active = cards.filter((card) => !isTerminal(card.state));

  return {
    columns,
    counts: {
      active: active.length,
      held: active.filter((card) => card.hold).length,
      exceptions: cards.filter((card) => card.exception).length,
    },
    truncated,
  };
}
