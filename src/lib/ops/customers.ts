import { and, count, desc, eq, exists, ilike, ne, or, sql } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import {
  customerAddresses,
  customerDesigns,
  customers,
  manufacturingJobs,
  orderItems,
  orders,
} from "@/lib/db/schema";
import type { DesignStorageState } from "@/lib/account/types";
import type { OrderStatus, PaymentState } from "@/lib/orders/types";

import { readActivity } from "./dashboard";
import type { OperatorSession } from "./operator";
import { PAGE_SIZE, isIdentifier, likePattern, type CustomerListQuery } from "./query";
import { TERMINAL, iso, optionalIso, readTotals, toPage } from "./sql";
import type { ActivityEntry, OpsPage } from "./types";

/**
 * Customers, for operators.
 *
 * ── What the system actually knows about a customer ──────────────────────
 *
 * The `customers` table is an identity mapping and nothing else: an id, a
 * provider and when the account was first seen. Name and email belong to the
 * identity provider and are deliberately not copied into the database, and this
 * console has no provider credentials to read them with.
 *
 * So a customer's name and email here are **the contact details on their most
 * recent order** — labelled that way in the interface — and a customer who has
 * never ordered is shown by id alone. That is the honest answer, and it needs no
 * service-role key.
 *
 * The provider's subject (their auth user id) is never shown.
 */

const UTC_ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

export interface OpsCustomerRow {
  id: string;
  /** When the account was first seen. Null for an id known only from orders. */
  since: string | null;
  /** From the most recent order's contact details. */
  name: string | null;
  email: string | null;
  orders: number;
  /** Paid, non-demonstration orders. Whole rupees. */
  paidValue: number;
  lastOrderAt: string | null;
  activeJobs: number;
  designs: number;
}

/* Correlated per-row aggregates, evaluated only for the rows on one page, each
   answered through an index on customer_id. */

const latestOrder = <T>(column: unknown) =>
  sql<T>`(select ${column} from ${orders} where ${orders.customerId} = ${customers.id} order by ${orders.placedAt} desc limit 1)`;

export async function listOpsCustomers(
  _operator: OperatorSession,
  query: CustomerListQuery,
): Promise<OpsPage<OpsCustomerRow>> {
  const db = await getDatabase();
  const pattern = query.q ? likePattern(query.q) : undefined;

  const where = pattern
    ? or(
        ilike(customers.id, pattern),
        exists(
          db
            .select({ reference: orders.reference })
            .from(orders)
            .where(
              and(
                eq(orders.customerId, customers.id),
                or(ilike(orders.contactName, pattern), ilike(orders.contactEmail, pattern)),
              ),
            ),
        ),
      )
    : undefined;

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: customers.id,
        createdAt: customers.createdAt,
        name: latestOrder<string | null>(orders.contactName),
        email: latestOrder<string | null>(orders.contactEmail),
        orders: sql<number>`(select count(*) from ${orders} where ${orders.customerId} = ${customers.id})`.mapWith(Number),
        paidValue: sql<number>`(select coalesce(sum((${orders.totals}->>'total')::numeric), 0) from ${orders} where ${orders.customerId} = ${customers.id} and ${orders.paymentStatus} = 'paid' and ${orders.demo} = false)`.mapWith(Number),
        lastOrderAt: sql<string | null>`(select to_char(max(${orders.placedAt}) at time zone 'UTC', ${sql.raw(UTC_ISO)}) from ${orders} where ${orders.customerId} = ${customers.id})`,
        activeJobs: sql<number>`(select count(*) from ${manufacturingJobs} inner join ${orders} on ${orders.reference} = ${manufacturingJobs.orderReference} where ${orders.customerId} = ${customers.id} and ${manufacturingJobs.state} not in ('completed', 'cancelled', 'failed'))`.mapWith(Number),
        designs: sql<number>`(select count(*) from ${customerDesigns} where ${customerDesigns.customerId} = ${customers.id} and ${customerDesigns.storageState} <> 'deleted')`.mapWith(Number),
      })
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt), desc(customers.id))
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(customers).where(where),
  ]);

  return toPage(
    rows.map((row) => ({
      id: row.id,
      since: iso(row.createdAt),
      name: row.name ?? null,
      email: row.email ?? null,
      orders: Number(row.orders),
      paidValue: Number(row.paidValue),
      lastOrderAt: row.lastOrderAt ?? null,
      activeJobs: Number(row.activeJobs),
      designs: Number(row.designs),
    })),
    Number(counted[0]?.value ?? 0),
    query.page,
    PAGE_SIZE,
  );
}

/* ------------------------------------------------------------------ *
 * One customer
 * ------------------------------------------------------------------ */

export const CUSTOMER_DETAIL_LIMIT = 50;

export interface OpsCustomerDetail {
  id: string;
  /** Whether an account row exists, as opposed to an id seen only on orders. */
  account: boolean;
  since: string | null;
  provider: string | null;
  contact: { name: string; email: string; phone: string; from: string } | null;
  stats: {
    orders: number;
    paidValue: number;
    activeJobs: number;
    designs: number;
    lastOrderAt: string | null;
  };
  orders: {
    reference: string;
    placedAt: string;
    status: OrderStatus;
    paymentStatus: PaymentState;
    total: number;
    lines: number;
    demo: boolean;
  }[];
  designs: {
    id: string;
    name: string;
    format: string;
    sizeBytes: number;
    state: DesignStorageState;
    createdAt: string;
  }[];
  addresses: {
    id: string;
    label: string | null;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }[];
  activity: ActivityEntry[];
}

export async function getOpsCustomer(
  operator: OperatorSession,
  id: string,
): Promise<OpsCustomerDetail | undefined> {
  if (!isIdentifier(id)) return undefined;
  const db = await getDatabase();

  const [account, orderRows, orderCount, paid, activeJobs, designRows, designCount, addresses] =
    await Promise.all([
      db
        .select({ createdAt: customers.createdAt, provider: customers.authProvider })
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1),
      db
        .select({
          reference: orders.reference,
          placedAt: orders.placedAt,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          totals: orders.totals,
          demo: orders.demo,
          contactName: orders.contactName,
          contactEmail: orders.contactEmail,
          contactPhone: orders.contactPhone,
          lines: sql<number>`(select count(*) from ${orderItems} where ${orderItems.orderReference} = ${orders.reference})`.mapWith(Number),
        })
        .from(orders)
        .where(eq(orders.customerId, id))
        .orderBy(desc(orders.placedAt))
        .limit(CUSTOMER_DETAIL_LIMIT),
      db.select({ value: count() }).from(orders).where(eq(orders.customerId, id)),
      db
        .select({
          amount: sql<number>`coalesce(sum((${orders.totals}->>'total')::numeric), 0)`.mapWith(Number),
        })
        .from(orders)
        .where(and(eq(orders.customerId, id), eq(orders.paymentStatus, "paid"), eq(orders.demo, false))),
      db
        .select({ value: count() })
        .from(manufacturingJobs)
        .innerJoin(orders, eq(orders.reference, manufacturingJobs.orderReference))
        .where(
          and(
            eq(orders.customerId, id),
            sql`${manufacturingJobs.state} not in (${sql.join(
              TERMINAL.map((state) => sql`${state}`),
              sql`, `,
            )})`,
          ),
        ),
      db
        .select({
          id: customerDesigns.id,
          name: customerDesigns.name,
          format: customerDesigns.format,
          sizeBytes: customerDesigns.sizeBytes,
          state: customerDesigns.storageState,
          createdAt: customerDesigns.createdAt,
        })
        .from(customerDesigns)
        .where(eq(customerDesigns.customerId, id))
        .orderBy(desc(customerDesigns.createdAt))
        .limit(CUSTOMER_DETAIL_LIMIT),
      db
        .select({ value: count() })
        .from(customerDesigns)
        .where(and(eq(customerDesigns.customerId, id), ne(customerDesigns.storageState, "deleted"))),
      db
        .select({
          id: customerAddresses.id,
          label: customerAddresses.label,
          fullName: customerAddresses.fullName,
          phone: customerAddresses.phone,
          line1: customerAddresses.line1,
          line2: customerAddresses.line2,
          city: customerAddresses.city,
          state: customerAddresses.state,
          postalCode: customerAddresses.postalCode,
          country: customerAddresses.country,
          isDefault: customerAddresses.isDefault,
        })
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, id))
        .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.updatedAt))
        .limit(20),
    ]);

  const row = account[0];
  if (!row && orderRows.length === 0 && designRows.length === 0) return undefined;

  const latest = orderRows[0];

  return {
    id,
    account: Boolean(row),
    since: row ? iso(row.createdAt) : null,
    provider: row?.provider ?? null,
    contact: latest
      ? {
          name: latest.contactName,
          email: latest.contactEmail,
          phone: latest.contactPhone,
          from: latest.reference,
        }
      : null,
    stats: {
      orders: Number(orderCount[0]?.value ?? 0),
      paidValue: Number(paid[0]?.amount ?? 0),
      activeJobs: Number(activeJobs[0]?.value ?? 0),
      designs: Number(designCount[0]?.value ?? 0),
      lastOrderAt: optionalIso(latest?.placedAt) ?? null,
    },
    orders: orderRows.map((order) => ({
      reference: order.reference,
      placedAt: iso(order.placedAt),
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: readTotals(order.totals).total,
      lines: Number(order.lines),
      demo: order.demo,
    })),
    designs: designRows.map((design) => ({
      id: design.id,
      name: design.name,
      format: design.format,
      sizeBytes: design.sizeBytes,
      state: design.state,
      createdAt: iso(design.createdAt),
    })),
    addresses,
    activity: await readActivity(operator, db, { customerId: id, limit: 20 }),
  };
}
