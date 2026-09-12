import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { PaymentConfigurationError, resolvePaymentAdapter, type PaymentMode } from "@/lib/payment";
import type { OrderStatus, PaymentState } from "@/lib/orders/types";

import type { OperatorSession } from "./operator";
import { demoCondition } from "./orders";
import { PAGE_SIZE, likePattern, type PaymentListQuery } from "./query";
import { iso, readTotals, toPage } from "./sql";
import type { OpsPage } from "./types";

/**
 * Payments, for operators.
 *
 * A payment here is what the order recorded about it: a state, a provider name
 * and the provider's session reference. There is no separate payments table and
 * no refund model, so the console shows exactly the three states the order
 * domain has — pending, paid, failed — and invents no "refunded".
 *
 * The session reference is shown because reconciling against the provider's
 * dashboard needs it. It is a reference, never a credential, and it never
 * leaves the console.
 */

export interface OpsPaymentRow {
  reference: string;
  placedAt: string;
  updatedAt: string;
  status: PaymentState;
  orderStatus: OrderStatus;
  amount: number;
  currency: string;
  provider?: string;
  transactionReference?: string;
  customer: { id: string | null; name: string; email: string };
  demo: boolean;
}

export type PaymentAdapterStatus =
  | { configured: true; name: string; mode: PaymentMode }
  | { configured: false; problem: string };

/** Which adapter this deployment would take a payment with. Server configuration only. */
export function paymentAdapterStatus(): PaymentAdapterStatus {
  try {
    const adapter = resolvePaymentAdapter();
    return { configured: true, name: adapter.name, mode: adapter.mode };
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      return { configured: false, problem: error.message };
    }
    throw error;
  }
}

function paymentConditions(query: PaymentListQuery): SQL | undefined {
  const pattern = query.q ? likePattern(query.q) : undefined;

  return and(
    pattern
      ? or(
          ilike(orders.reference, pattern),
          ilike(orders.contactName, pattern),
          ilike(orders.contactEmail, pattern),
          ilike(orders.paymentSessionId, pattern),
        )
      : undefined,
    query.status ? eq(orders.paymentStatus, query.status) : undefined,
    demoCondition(query.demo),
  );
}

export async function listOpsPayments(
  _operator: OperatorSession,
  query: PaymentListQuery,
): Promise<OpsPage<OpsPaymentRow>> {
  const db = await getDatabase();
  const where = paymentConditions(query);

  const [rows, counted] = await Promise.all([
    db
      .select({
        reference: orders.reference,
        placedAt: orders.placedAt,
        updatedAt: orders.updatedAt,
        status: orders.paymentStatus,
        orderStatus: orders.status,
        totals: orders.totals,
        provider: orders.paymentProvider,
        sessionId: orders.paymentSessionId,
        customerId: orders.customerId,
        contactName: orders.contactName,
        contactEmail: orders.contactEmail,
        demo: orders.demo,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.updatedAt), desc(orders.reference))
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(orders).where(where),
  ]);

  return toPage(
    rows.map((row) => {
      const totals = readTotals(row.totals);
      return {
        reference: row.reference,
        placedAt: iso(row.placedAt),
        updatedAt: iso(row.updatedAt),
        status: row.status,
        orderStatus: row.orderStatus,
        amount: totals.total,
        currency: totals.currency,
        ...(row.provider ? { provider: row.provider } : {}),
        ...(row.sessionId ? { transactionReference: row.sessionId } : {}),
        customer: { id: row.customerId, name: row.contactName, email: row.contactEmail },
        demo: row.demo,
      };
    }),
    Number(counted[0]?.value ?? 0),
    query.page,
    PAGE_SIZE,
  );
}

export type PaymentTotals = Record<PaymentState, { orders: number; amount: number }>;

/**
 * Order count and value by payment state, excluding demonstration orders — a
 * money figure that included fixtures would be a figure nobody could use.
 */
export async function getPaymentTotals(_operator: OperatorSession): Promise<PaymentTotals> {
  const db = await getDatabase();

  const rows = await db
    .select({
      status: orders.paymentStatus,
      orders: count(),
      amount: sql<number>`coalesce(sum((${orders.totals}->>'total')::numeric), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(and(eq(orders.demo, false), sql`${orders.status} <> 'cancelled'`))
    .groupBy(orders.paymentStatus);

  const totals: PaymentTotals = {
    pending: { orders: 0, amount: 0 },
    paid: { orders: 0, amount: 0 },
    failed: { orders: 0, amount: 0 },
  };

  for (const row of rows) {
    totals[row.status] = { orders: Number(row.orders), amount: Number(row.amount) };
  }

  return totals;
}
