import { and, count, sql, type SQL } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";

import type { OperatorSession } from "../operator";
import { orderTotal } from "../sql";
import { PERIOD_LABEL, bucketKeys, standingPeriods, type DateRange, type PeriodId } from "./range";
import { DATA_SOURCES, businessBucket, countsAsRevenue, money, paidThenStopped, placedIn } from "./sql";
import type { Traced } from "./types";

/**
 * RevenueService — how much Reality 3D sold.
 *
 * Revenue is the recorded order total of paid orders (see `countsAsRevenue`),
 * in whole rupees, dated by when the order was placed. Nothing else: no cost,
 * no margin, no profit — the system records no costs — and no estimate or
 * projection of any kind.
 *
 * Two qualifiers travel with every figure, because both change what the number
 * means and both are facts on the order:
 *
 *   mockPayments   orders paid through the mock provider — no money moved
 *   provisional    orders placed against provisional pricing
 */

export interface RevenueFigure {
  amount: number;
  orders: number;
  /** Whole rupees, or null when there are no orders to average. */
  averageOrderValue: number | null;
  mockPayments: number;
  provisional: number;
}

export interface RevenueSummary extends Traced {
  figure: RevenueFigure;
  /** Paid, then cancelled or failed. Reported beside revenue, not in it. */
  stopped: { orders: number; amount: number };
  bucket: DateRange["bucket"];
  series: { key: string; amount: number; orders: number }[];
}

export interface RevenuePeriod {
  id: PeriodId;
  label: string;
  range: DateRange;
  figure: RevenueFigure;
}

export const REVENUE_DEFINITION =
  "Recorded totals of paid orders, excluding demonstration, cancelled and failed orders. Dated by when each order was placed. Shipping and GST not known when the order was placed are not in its recorded total.";

export function averageOf(amount: number, orders: number): number | null {
  return orders > 0 ? Math.round(amount / orders) : null;
}

/** The four aggregates of a figure, each optionally restricted to `where` with a FILTER clause. */
function figureColumns(where: SQL = sql`true`) {
  return {
    amount: money(sql`sum(${orderTotal()}) filter (where ${where})`),
    orders: sql<number>`count(*) filter (where ${where})`.mapWith(Number),
    mock: sql<number>`count(*) filter (where ${where} and ${orders.paymentProvider} = 'mock')`.mapWith(Number),
    provisional: sql<number>`count(*) filter (where ${where} and ${orders.provisional})`.mapWith(Number),
  };
}

function toFigure(row: { amount: number; orders: number; mock: number; provisional: number } | undefined): RevenueFigure {
  const amount = Number(row?.amount ?? 0);
  const orderCount = Number(row?.orders ?? 0);
  return {
    amount,
    orders: orderCount,
    averageOrderValue: averageOf(amount, orderCount),
    mockPayments: Number(row?.mock ?? 0),
    provisional: Number(row?.provisional ?? 0),
  };
}

/** A figure over an arbitrary range. One aggregate query. */
async function figureFor(db: AppDatabase, range: DateRange): Promise<RevenueFigure> {
  const [row] = await db
    .select(figureColumns())
    .from(orders)
    .where(and(countsAsRevenue(), placedIn(range)));
  return toFigure(row);
}

export async function getRevenueFigure(_operator: OperatorSession, range: DateRange): Promise<RevenueFigure> {
  return figureFor(await getDatabase(), range);
}

/** Revenue over a range, with its series and what was paid then stopped. Three aggregate queries. */
export async function getRevenueSummary(
  _operator: OperatorSession,
  range: DateRange,
  now: Date = new Date(),
): Promise<RevenueSummary> {
  const db = await getDatabase();
  const bucket = businessBucket(orders.placedAt, range.bucket);

  const [figure, stoppedRows, seriesRows] = await Promise.all([
    figureFor(db, range),
    db
      .select({ orders: count(), amount: money(sql`sum(${orderTotal()})`) })
      .from(orders)
      .where(and(paidThenStopped(), placedIn(range))),
    db
      .select({ key: bucket, orders: count(), amount: money(sql`sum(${orderTotal()})`) })
      .from(orders)
      .where(and(countsAsRevenue(), placedIn(range)))
      .groupBy(bucket),
  ]);

  const byKey = new Map(seriesRows.map((row) => [row.key, row]));

  return {
    range,
    figure,
    stopped: { orders: Number(stoppedRows[0]?.orders ?? 0), amount: Number(stoppedRows[0]?.amount ?? 0) },
    bucket: range.bucket,
    series: bucketKeys(range).map((key) => ({
      key,
      amount: Number(byKey.get(key)?.amount ?? 0),
      orders: Number(byKey.get(key)?.orders ?? 0),
    })),
    source: DATA_SOURCES.orders,
    definition: REVENUE_DEFINITION,
    generatedAt: now.toISOString(),
  };
}

/**
 * Today, this week, this month and this year — one query, four filtered
 * aggregates over the year's paid orders.
 */
export async function getRevenuePeriods(_operator: OperatorSession, now: Date = new Date()): Promise<RevenuePeriod[]> {
  const db = await getDatabase();
  const periods = standingPeriods(now);
  const ids = Object.keys(periods) as PeriodId[];

  const columns = Object.fromEntries(
    ids.flatMap((id) =>
      Object.entries(figureColumns(placedIn(periods[id]))).map(([name, expression]) => [`${id}_${name}`, expression]),
    ),
  ) as Record<string, SQL<number>>;

  // A week can begin in the previous year; the scan starts at whichever period starts first.
  const earliest = ids.map((id) => periods[id]).reduce((first, range) => (range.start < first.start ? range : first));
  const scan = { ...periods.year, start: earliest.start };

  const [row] = await db.select(columns).from(orders).where(and(countsAsRevenue(), placedIn(scan)));

  return ids.map((id) => ({
    id,
    label: PERIOD_LABEL[id],
    range: periods[id],
    figure: toFigure({
      amount: Number(row?.[`${id}_amount`] ?? 0),
      orders: Number(row?.[`${id}_orders`] ?? 0),
      mock: Number(row?.[`${id}_mock`] ?? 0),
      provisional: Number(row?.[`${id}_provisional`] ?? 0),
    }),
  }));
}
