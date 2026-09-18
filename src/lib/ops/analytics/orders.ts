import { and, count, countDistinct, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { customers, orderItems, orders } from "@/lib/db/schema";
import type { OrderStatus, PaymentState } from "@/lib/orders/types";

import { OPEN_ORDER_STATUSES } from "../dashboard";
import type { OperatorSession } from "../operator";
import { stageCondition } from "../orders";
import { ORDER_STAGES, ORDER_STATUSES, PAYMENT_STATES, type OrderStage } from "../query";
import { bucketKeys, type DateRange } from "./range";
import { DATA_SOURCES, businessBucket, countsAsRevenue, placedIn, within } from "./sql";
import type { Traced } from "./types";

/**
 * OrderAnalyticsService — how many orders there are, and where they stand.
 *
 * Two kinds of number, kept apart:
 *
 *   over a range   orders placed in the range. Demonstration orders are
 *                  excluded and counted separately, because they are not
 *                  Reality 3D business.
 *   right now      the quick-filter counts. These match the order list they
 *                  open, which includes demonstration orders (tagged there),
 *                  because a demo order in the queue is still work on screen.
 */

export const ORDERS_DEFINITION =
  "Orders placed in the range, excluding demonstration orders. Status and payment are the order's current recorded state.";

export interface OrderSummary extends Traced {
  placed: number;
  open: number;
  demoPlaced: number;
  byStatus: Record<OrderStatus, number>;
  byPayment: Record<PaymentState, number>;
  lines: { catalog: { lines: number; units: number }; custom: { lines: number; units: number } };
  bucket: DateRange["bucket"];
  series: { key: string; orders: number }[];
}

export interface CustomerSummary extends Traced {
  /** Accounts that placed at least one real order in the range. */
  orderingAccounts: number;
  /** Real orders placed in the range without an account. */
  guestOrders: number;
  /** Accounts first provisioned in the range. */
  newAccounts: number;
  /** Accounts with a paid order in the range and at least two paid orders to the end of it. */
  repeatAccounts: number;
}

const zeroes = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

/** One query: a filtered count per stage. */
export async function getOrderStageCounts(_operator: OperatorSession): Promise<Record<OrderStage, number>> {
  const db = await getDatabase();
  const columns = Object.fromEntries(
    ORDER_STAGES.map((stage) => [stage, sql<number>`count(*) filter (where ${stageCondition(db, stage)})`.mapWith(Number)]),
  ) as Record<OrderStage, SQL<number>>;

  const [row] = await db.select(columns).from(orders);
  const counts = zeroes(ORDER_STAGES);
  for (const stage of ORDER_STAGES) counts[stage] = Number(row?.[stage] ?? 0);
  return counts;
}

export async function getOrderSummary(
  _operator: OperatorSession,
  range: DateRange,
  now: Date = new Date(),
): Promise<OrderSummary> {
  const db = await getDatabase();
  const real = and(eq(orders.demo, false), placedIn(range));
  const bucket = businessBucket(orders.placedAt, range.bucket);

  const [statusRows, paymentRows, demoRows, openRows, lineRows, seriesRows] = await Promise.all([
    db.select({ key: orders.status, value: count() }).from(orders).where(real).groupBy(orders.status),
    db.select({ key: orders.paymentStatus, value: count() }).from(orders).where(real).groupBy(orders.paymentStatus),
    db.select({ value: count() }).from(orders).where(and(eq(orders.demo, true), placedIn(range))),
    db
      .select({ value: count() })
      .from(orders)
      .where(and(eq(orders.demo, false), inArray(orders.status, [...OPEN_ORDER_STATUSES]))),
    db
      .select({
        type: orderItems.type,
        lines: count(),
        units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(real)
      .groupBy(orderItems.type),
    db.select({ key: bucket, value: count() }).from(orders).where(real).groupBy(bucket),
  ]);

  const byStatus = zeroes(ORDER_STATUSES);
  for (const row of statusRows) byStatus[row.key] = Number(row.value);
  const byPayment = zeroes(PAYMENT_STATES);
  for (const row of paymentRows) byPayment[row.key] = Number(row.value);

  const lines = { catalog: { lines: 0, units: 0 }, custom: { lines: 0, units: 0 } };
  for (const row of lineRows) lines[row.type] = { lines: Number(row.lines), units: Number(row.units) };

  const byKey = new Map(seriesRows.map((row) => [row.key, Number(row.value)]));

  return {
    range,
    placed: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
    open: Number(openRows[0]?.value ?? 0),
    demoPlaced: Number(demoRows[0]?.value ?? 0),
    byStatus,
    byPayment,
    lines,
    bucket: range.bucket,
    series: bucketKeys(range).map((key) => ({ key, orders: byKey.get(key) ?? 0 })),
    source: DATA_SOURCES.orders,
    definition: ORDERS_DEFINITION,
    generatedAt: now.toISOString(),
  };
}

/**
 * Customer figures, counted — never listed. Accounts are identified only by
 * their id; nothing here reads a name, an email or an address.
 */
export async function getCustomerSummary(
  _operator: OperatorSession,
  range: DateRange,
  now: Date = new Date(),
): Promise<CustomerSummary> {
  const db = await getDatabase();
  const real = and(eq(orders.demo, false), placedIn(range));

  const payingInRange = db
    .selectDistinct({ customerId: orders.customerId })
    .from(orders)
    .where(and(countsAsRevenue(), placedIn(range), isNotNull(orders.customerId)));

  const repeaters = db
    .select({ customerId: orders.customerId })
    .from(orders)
    .where(
      and(countsAsRevenue(), lt(orders.placedAt, range.end), inArray(orders.customerId, payingInRange)),
    )
    .groupBy(orders.customerId)
    .having(sql`count(*) >= 2`)
    .as("repeaters");

  const [accounts, guests, created, repeat] = await Promise.all([
    db.select({ value: countDistinct(orders.customerId) }).from(orders).where(and(real, isNotNull(orders.customerId))),
    db.select({ value: count() }).from(orders).where(and(real, isNull(orders.customerId))),
    db.select({ value: count() }).from(customers).where(within(customers.createdAt, range)),
    db.select({ value: count() }).from(repeaters),
  ]);

  return {
    range,
    orderingAccounts: Number(accounts[0]?.value ?? 0),
    guestOrders: Number(guests[0]?.value ?? 0),
    newAccounts: Number(created[0]?.value ?? 0),
    repeatAccounts: Number(repeat[0]?.value ?? 0),
    source: DATA_SOURCES.customers,
    definition:
      "Counts only. An account is a signed-in customer; demonstration orders are excluded. Repeat accounts had a paid order in the range and two or more paid orders by its end.",
    generatedAt: now.toISOString(),
  };
}
