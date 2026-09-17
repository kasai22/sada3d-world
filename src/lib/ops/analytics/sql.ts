import { and, eq, gte, lt, notInArray, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { orders } from "@/lib/db/schema";

import { BUSINESS_TIME_ZONE, type DateRange } from "./range";

/**
 * The analytics definitions, in SQL, in one place.
 *
 * Server-only. "Revenue" means one thing on the overview, on Sales and in the
 * product table because every service builds its query from these fragments.
 */

/**
 * An order whose money counts as revenue:
 *
 *   · payment recorded as paid — the payment domain's own fact
 *   · not a demonstration order — fixtures are not Reality 3D business
 *   · not cancelled or failed — the payment domain records no refunds, so a
 *     paid order that was later cancelled is reported beside revenue, never in it
 */
export function countsAsRevenue(): SQL {
  return and(
    eq(orders.paymentStatus, "paid"),
    eq(orders.demo, false),
    notInArray(orders.status, ["cancelled", "failed"]),
  ) as SQL;
}

/** Paid, real, and later cancelled or failed. Money received with no refund recorded. */
export function paidThenStopped(): SQL {
  return and(
    eq(orders.paymentStatus, "paid"),
    eq(orders.demo, false),
    sql`${orders.status} in ('cancelled', 'failed')`,
  ) as SQL;
}

/**
 * Placed within the range. Orders carry no payment timestamp, so revenue is
 * dated by when the order was placed — and every view says so.
 */
export function placedIn(range: DateRange): SQL {
  return and(gte(orders.placedAt, range.start), lt(orders.placedAt, range.end)) as SQL;
}

export function within(column: AnyColumn, range: DateRange): SQL {
  return and(gte(column, range.start), lt(column, range.end)) as SQL;
}

/** The business-day or business-month bucket of a timestamp, matching `range.ts`. */
export function businessBucket(column: AnyColumn, bucket: DateRange["bucket"]): SQL<string> {
  const format = bucket === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  return sql<string>`to_char((${column} at time zone 'UTC') + interval '${sql.raw(String(BUSINESS_TIME_ZONE.offsetMinutes))} minutes', ${sql.raw(`'${format}'`)})`;
}

/** Whole rupees, as a number, from a SQL aggregate that may come back as text. */
export const money = (expression: SQL): SQL<number> => sql<number>`coalesce(${expression}, 0)`.mapWith(Number);

export const DATA_SOURCES = {
  orders: "Application database · orders",
  orderItems: "Application database · order_items joined to orders",
  jobs: "Application database · manufacturing_jobs and manufacturing_events",
  shipments: "Application database · shipments",
  customers: "Application database · customers and orders",
  catalog: "Payload CMS · products, price-approvals, categories, media · launch assessment",
  capability: "Business decision ledger and roadmap (src/content/catalog)",
} as const;
