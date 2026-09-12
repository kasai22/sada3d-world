import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { customerDesigns, customers, manufacturingJobs, orderItems, orders } from "@/lib/db/schema";
import { ORDER_STATUS_LABEL } from "@/lib/orders/types";

import { DESIGN_STORAGE_LABEL, MANUFACTURING_STATE_LABEL, PAYMENT_STATE_LABEL } from "./labels";
import type { OperatorSession } from "./operator";
import { jobAnchor, orderHref } from "./pipeline";
import { likePattern } from "./query";

/**
 * Global search, for the command menu.
 *
 * Five small reads, five results each, run together. Every result is a label, a
 * line of context and a console link — enough to recognise the record and open
 * it, and nothing that would be a problem on a shared screen beyond what the
 * record's own page shows.
 *
 * There is no quote store to search: quotes are calculated and not kept.
 */

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 64;
const PER_GROUP = 5;

export type SearchGroup = "Orders" | "Customers" | "Designs" | "Production" | "Payments";

export interface SearchResult {
  id: string;
  group: SearchGroup;
  label: string;
  detail: string;
  href: string;
}

export function normaliseSearch(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text.length >= SEARCH_MIN_LENGTH && text.length <= SEARCH_MAX_LENGTH ? text : null;
}

export async function searchOps(_operator: OperatorSession, raw: unknown): Promise<SearchResult[]> {
  const text = normaliseSearch(raw);
  if (!text) return [];

  const db = await getDatabase();
  const pattern = likePattern(text);

  const [orderRows, customerRows, accountRows, designRows, jobRows, paymentRows] = await Promise.all([
    db
      .select({
        reference: orders.reference,
        contactName: orders.contactName,
        status: orders.status,
      })
      .from(orders)
      .where(
        or(
          ilike(orders.reference, pattern),
          ilike(orders.contactName, pattern),
          ilike(orders.contactEmail, pattern),
        ),
      )
      .orderBy(desc(orders.placedAt))
      .limit(PER_GROUP),

    db
      .selectDistinctOn([orders.customerId], {
        customerId: orders.customerId,
        contactName: orders.contactName,
        contactEmail: orders.contactEmail,
      })
      .from(orders)
      .where(
        and(
          isNotNull(orders.customerId),
          or(
            ilike(orders.contactName, pattern),
            ilike(orders.contactEmail, pattern),
            ilike(orders.customerId, pattern),
          ),
        ),
      )
      .orderBy(orders.customerId, desc(orders.placedAt))
      .limit(PER_GROUP),

    db
      .select({ id: customers.id })
      .from(customers)
      .where(ilike(customers.id, pattern))
      .limit(PER_GROUP),

    db
      .select({
        id: customerDesigns.id,
        name: customerDesigns.name,
        format: customerDesigns.format,
        state: customerDesigns.storageState,
      })
      .from(customerDesigns)
      .where(or(ilike(customerDesigns.name, pattern), eq(customerDesigns.id, text)))
      .orderBy(desc(customerDesigns.createdAt))
      .limit(PER_GROUP),

    db
      .select({
        id: manufacturingJobs.id,
        orderReference: manufacturingJobs.orderReference,
        state: manufacturingJobs.state,
        itemName: orderItems.name,
      })
      .from(manufacturingJobs)
      .innerJoin(orderItems, eq(orderItems.id, manufacturingJobs.orderItemId))
      .where(
        or(
          ilike(manufacturingJobs.id, pattern),
          ilike(manufacturingJobs.orderReference, pattern),
          ilike(orderItems.name, pattern),
        ),
      )
      .orderBy(desc(manufacturingJobs.updatedAt))
      .limit(PER_GROUP),

    db
      .select({
        reference: orders.reference,
        status: orders.paymentStatus,
        sessionId: orders.paymentSessionId,
      })
      .from(orders)
      .where(ilike(orders.paymentSessionId, pattern))
      .orderBy(desc(orders.updatedAt))
      .limit(PER_GROUP),
  ]);

  const results: SearchResult[] = [];

  for (const order of orderRows) {
    results.push({
      id: `order:${order.reference}`,
      group: "Orders",
      label: order.reference,
      detail: `${order.contactName} · ${ORDER_STATUS_LABEL[order.status]}`,
      href: orderHref(order.reference),
    });
  }

  const seen = new Set<string>();
  for (const customer of customerRows) {
    if (!customer.customerId || seen.has(customer.customerId)) continue;
    seen.add(customer.customerId);
    results.push({
      id: `customer:${customer.customerId}`,
      group: "Customers",
      label: customer.contactName,
      detail: `${customer.contactEmail} · ${customer.customerId}`,
      href: `/ops/customers/${encodeURIComponent(customer.customerId)}`,
    });
  }
  for (const account of accountRows) {
    if (seen.has(account.id) || seen.size >= PER_GROUP) continue;
    seen.add(account.id);
    results.push({
      id: `customer:${account.id}`,
      group: "Customers",
      label: account.id,
      detail: "Account",
      href: `/ops/customers/${encodeURIComponent(account.id)}`,
    });
  }

  for (const design of designRows) {
    results.push({
      id: `design:${design.id}`,
      group: "Designs",
      label: design.name,
      detail: `${design.format} · ${DESIGN_STORAGE_LABEL[design.state]}`,
      href: `/ops/designs/${encodeURIComponent(design.id)}`,
    });
  }

  for (const job of jobRows) {
    results.push({
      id: `job:${job.id}`,
      group: "Production",
      label: job.itemName,
      detail: `${job.orderReference} · ${MANUFACTURING_STATE_LABEL[job.state]}`,
      href: `${orderHref(job.orderReference)}#${jobAnchor(job.id)}`,
    });
  }

  for (const payment of paymentRows) {
    results.push({
      id: `payment:${payment.reference}`,
      group: "Payments",
      label: payment.sessionId ?? payment.reference,
      detail: `${payment.reference} · ${PAYMENT_STATE_LABEL[payment.status]}`,
      href: `${orderHref(payment.reference)}#payment`,
    });
  }

  return results;
}
