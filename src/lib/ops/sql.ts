import { and, isNotNull, isNull, notInArray, sql, type SQL } from "drizzle-orm";

import { manufacturingJobs, orders } from "@/lib/db/schema";
import { TERMINAL_STATES, type ManufacturingHoldReason } from "@/lib/manufacturing/types";

import { pageCount } from "./query";
import type { OpsPage } from "./types";

/**
 * SQL fragments the console's read models share.
 *
 * Server-only (it names the schema). Kept in one place so "an active job" and
 * "a held job" mean the same thing on the dashboard, the board, the order list
 * and the exception centre.
 */

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const TERMINAL = [...TERMINAL_STATES];

/** Not completed, cancelled or failed. */
export function jobIsActive(): SQL {
  return notInArray(manufacturingJobs.state, TERMINAL);
}

/** An unresolved hold on an active job — the same test as `isHoldActive`. */
export function jobIsHeld(): SQL {
  return and(
    isNotNull(manufacturingJobs.holdReason),
    isNotNull(manufacturingJobs.holdStartedAt),
    isNull(manufacturingJobs.holdResolvedAt),
    notInArray(manufacturingJobs.state, TERMINAL),
  ) as SQL;
}

/** The order's recorded total, in whole rupees, for sorting and summing. */
export function orderTotal(): SQL<number> {
  return sql<number>`coalesce((${orders.totals}->>'total')::numeric, 0)`.mapWith(Number);
}

/** Total and currency from the stored totals JSON, defensively. */
export function readTotals(value: unknown): { total: number; currency: string } {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    total: typeof record.total === "number" && Number.isFinite(record.total) ? record.total : 0,
    currency: typeof record.currency === "string" ? record.currency : "INR",
  };
}

export const iso = (value: Date): string => value.toISOString();

export function optionalIso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function activeHold(row: {
  holdReason: ManufacturingHoldReason | null;
  holdStartedAt: Date | null;
  holdResolvedAt: Date | null;
}): { reason: ManufacturingHoldReason; startedAt: string } | undefined {
  return row.holdReason && row.holdStartedAt && !row.holdResolvedAt
    ? { reason: row.holdReason, startedAt: iso(row.holdStartedAt) }
    : undefined;
}

export function toPage<T>(rows: T[], total: number, page: number, pageSize: number): OpsPage<T> {
  return { rows, total, page, pageSize, pageCount: pageCount(total, pageSize) };
}

/** The first day after a `YYYY-MM-DD`, as the exclusive end of a UTC range. */
export function dayAfter(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + DAY_MS);
}

export function startOfDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
