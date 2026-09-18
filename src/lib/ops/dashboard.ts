import { and, count, desc, eq, gte, inArray, isNotNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import {
  customerDesigns,
  manufacturingEvents,
  manufacturingJobs,
  orderItems,
  orders,
  shipments,
} from "@/lib/db/schema";
import type { OrderStatus } from "@/lib/orders/types";

import { formatINR } from "./format";
import { EVENT_LOG_LABEL } from "./labels";
import type { OperatorSession } from "./operator";
import {
  PRODUCTION_COLUMNS,
  RECENT_TERMINAL_DAYS,
  columnForState,
  jobAnchor,
  orderHref,
  type ProductionColumn,
} from "./pipeline";
import { DAY_MS, TERMINAL, iso, orderTotal, readTotals } from "./sql";
import type { ActivityEntry } from "./types";

/**
 * The dashboard's figures.
 *
 * Every number is a count or a sum over stored records, over a stated window.
 * Nothing is projected, nothing is compared against a target the business has
 * not set, and nothing is a vanity total.
 *
 * ── Demonstration orders ─────────────────────────────────────────────────
 *
 * Money excludes them. Work — orders to process, jobs on the floor — includes
 * them, because a demo job in the queue is still something the board shows and
 * an operator can move; every list tags them.
 */

export const DASHBOARD_WINDOW_DAYS = 30;
export const TREND_DAYS = 14;
export const ACTIVITY_LIMIT = 12;

/** Statuses an operator still has something to do about. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "awaiting_payment",
  "confirmed",
  "fulfillment_in_progress",
  "partially_fulfilled",
];

export interface DashboardData {
  kpis: {
    ordersInWindow: number;
    openOrders: number;
    activeJobs: number;
    heldJobs: number;
    paidValueInWindow: number;
    paidOrdersInWindow: number;
  };
  pipeline: { column: ProductionColumn; count: number; held: number }[];
  trend: { day: string; orders: number }[];
  activity: ActivityEntry[];
}

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

const UTC_ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/**
 * Recent things that happened, newest first, from each record's own timestamp.
 * Scoped to one customer when a customer id is given.
 */
export async function readActivity(
  _operator: OperatorSession,
  db: AppDatabase,
  options: { customerId?: string; limit?: number } = {},
): Promise<ActivityEntry[]> {
  const limit = options.limit ?? ACTIVITY_LIMIT;
  const ownedOrder: SQL | undefined = options.customerId
    ? eq(orders.customerId, options.customerId)
    : undefined;

  const [events, placed, designs, parcels] = await Promise.all([
    db
      .select({
        id: manufacturingEvents.id,
        type: manufacturingEvents.type,
        occurredAt: manufacturingEvents.occurredAt,
        jobId: manufacturingEvents.jobId,
        orderReference: manufacturingJobs.orderReference,
        itemName: orderItems.name,
        demo: orders.demo,
      })
      .from(manufacturingEvents)
      .innerJoin(manufacturingJobs, eq(manufacturingJobs.id, manufacturingEvents.jobId))
      .innerJoin(orderItems, eq(orderItems.id, manufacturingJobs.orderItemId))
      .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
      .where(ownedOrder)
      .orderBy(desc(manufacturingEvents.occurredAt), desc(manufacturingEvents.sequence))
      .limit(limit),

    db
      .select({
        reference: orders.reference,
        placedAt: orders.placedAt,
        contactName: orders.contactName,
        totals: orders.totals,
        demo: orders.demo,
      })
      .from(orders)
      .where(ownedOrder)
      .orderBy(desc(orders.placedAt))
      .limit(limit),

    db
      .select({
        id: customerDesigns.id,
        name: customerDesigns.name,
        format: customerDesigns.format,
        state: customerDesigns.storageState,
        createdAt: customerDesigns.createdAt,
        verifiedAt: customerDesigns.verifiedAt,
        updatedAt: customerDesigns.updatedAt,
      })
      .from(customerDesigns)
      .where(
        and(
          ne(customerDesigns.storageState, "deleted"),
          options.customerId ? eq(customerDesigns.customerId, options.customerId) : undefined,
        ),
      )
      .orderBy(desc(customerDesigns.updatedAt))
      .limit(limit),

    db
      .select({
        id: shipments.id,
        orderReference: shipments.orderReference,
        status: shipments.status,
        at: sql<string>`to_char(coalesce(${shipments.deliveredAt}, ${shipments.shippedAt}) at time zone 'UTC', ${sql.raw(UTC_ISO)})`,
        carrier: shipments.carrier,
        demo: orders.demo,
      })
      .from(shipments)
      .innerJoin(orders, eq(orders.reference, shipments.orderReference))
      .where(and(isNotNull(shipments.shippedAt), ownedOrder))
      .orderBy(desc(sql`coalesce(${shipments.deliveredAt}, ${shipments.shippedAt})`))
      .limit(limit),
  ]);

  const entries: ActivityEntry[] = [
    ...events.map((event) => ({
      id: `event:${event.id}`,
      kind: "production" as const,
      at: iso(event.occurredAt),
      title: EVENT_LOG_LABEL[event.type],
      detail: `${event.orderReference} · ${event.itemName}`,
      href: `${orderHref(event.orderReference)}#${jobAnchor(event.jobId)}`,
      demo: event.demo,
    })),
    ...placed.map((order) => ({
      id: `order:${order.reference}`,
      kind: "order" as const,
      at: iso(order.placedAt),
      title: "Order placed",
      detail: `${order.reference} · ${order.contactName} · ${formatINR(readTotals(order.totals).total)}`,
      href: orderHref(order.reference),
      demo: order.demo,
    })),
    ...designs.map((design) => {
      const at =
        design.state === "verified" && design.verifiedAt
          ? design.verifiedAt
          : design.state === "failed"
            ? design.updatedAt
            : design.createdAt;
      const title =
        design.state === "verified"
          ? "Design verified"
          : design.state === "failed"
            ? "Design rejected"
            : "Design upload started";
      return {
        id: `design:${design.id}`,
        kind: "design" as const,
        at: iso(at),
        title,
        detail: `${design.name} · ${design.format}`,
        href: `/admin/designs/${encodeURIComponent(design.id)}`,
        demo: false,
      };
    }),
    ...parcels.map((parcel) => ({
      id: `shipment:${parcel.id}:${parcel.status}`,
      kind: "shipment" as const,
      at: parcel.at,
      title: parcel.status === "delivered" ? "Shipment delivered" : "Shipment dispatched",
      detail: `${parcel.orderReference}${parcel.carrier ? ` · ${parcel.carrier}` : ""}`,
      href: `${orderHref(parcel.orderReference)}#shipping`,
      demo: parcel.demo,
    })),
  ];

  return entries
    .filter((entry) => Number.isFinite(Date.parse(entry.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export async function getDashboard(
  operator: OperatorSession,
  now: Date = new Date(),
): Promise<DashboardData> {
  const db = await getDatabase();
  const at = now.getTime();
  const windowStart = new Date(at - DASHBOARD_WINDOW_DAYS * DAY_MS);
  const recentTerminal = new Date(at - RECENT_TERMINAL_DAYS * DAY_MS);
  const today = Date.parse(`${utcDay(at)}T00:00:00.000Z`);
  const trendStart = new Date(today - (TREND_DAYS - 1) * DAY_MS);

  const day = sql<string>`to_char(${orders.placedAt} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [inWindow, open, paid, jobsByState, trendRows, activity] = await Promise.all([
    db.select({ value: count() }).from(orders).where(gte(orders.placedAt, windowStart)),
    db
      .select({ value: count() })
      .from(orders)
      .where(inArray(orders.status, [...OPEN_ORDER_STATUSES])),
    db
      .select({
        orders: count(),
        amount: sql<number>`coalesce(sum(${orderTotal()}), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(
        and(
          eq(orders.paymentStatus, "paid"),
          eq(orders.demo, false),
          gte(orders.placedAt, windowStart),
        ),
      ),
    db
      .select({
        state: manufacturingJobs.state,
        total: count(),
        held: sql<number>`count(*) filter (where ${manufacturingJobs.holdReason} is not null and ${manufacturingJobs.holdResolvedAt} is null)`.mapWith(Number),
      })
      .from(manufacturingJobs)
      .where(
        or(
          notInArray(manufacturingJobs.state, TERMINAL),
          gte(manufacturingJobs.updatedAt, recentTerminal),
        ),
      )
      .groupBy(manufacturingJobs.state),
    db
      .select({ day, value: count() })
      .from(orders)
      .where(gte(orders.placedAt, trendStart))
      .groupBy(day),
    readActivity(operator, db),
  ]);

  const pipeline = PRODUCTION_COLUMNS.map((column) => ({ column, count: 0, held: 0 }));
  let activeJobs = 0;
  let heldJobs = 0;

  for (const row of jobsByState) {
    const entry = pipeline.find((candidate) => candidate.column.id === columnForState(row.state));
    const total = Number(row.total);
    const held = TERMINAL.includes(row.state) ? 0 : Number(row.held);

    if (entry) {
      entry.count += total;
      entry.held += held;
    }
    if (!TERMINAL.includes(row.state)) {
      activeJobs += total;
      heldJobs += held;
    }
  }

  const byDay = new Map(trendRows.map((row) => [row.day, Number(row.value)]));
  const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
    const key = utcDay(trendStart.getTime() + index * DAY_MS);
    return { day: key, orders: byDay.get(key) ?? 0 };
  });

  return {
    kpis: {
      ordersInWindow: Number(inWindow[0]?.value ?? 0),
      openOrders: Number(open[0]?.value ?? 0),
      activeJobs,
      heldJobs,
      paidValueInWindow: Number(paid[0]?.amount ?? 0),
      paidOrdersInWindow: Number(paid[0]?.orders ?? 0),
    },
    pipeline,
    trend,
    activity,
  };
}
