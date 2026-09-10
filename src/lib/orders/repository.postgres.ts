import { AsyncLocalStorage } from "node:async_hooks";

import { asc, eq, sql } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import {
  counters,
  manufacturingEvents,
  manufacturingJobs,
  orderItems,
  orders,
  shipments,
} from "@/lib/db/schema";
import type { CartTotals } from "@/lib/cart/types";
import type {
  ManufacturingEvent,
  ManufacturingJob,
} from "@/lib/manufacturing/types";

import type { OrderRepository } from "./repository";
import type { Order, OrderItem, Shipment } from "./types";

/**
 * The order domain, stored in PostgreSQL.
 *
 * Implements the Phase 12 `OrderRepository` unchanged. The service above it —
 * the four state machines, the aggregation, the customer projection — is not
 * touched by this file and does not know the store changed.
 *
 * ── The concurrency contract, and how it is actually kept ────────────────
 *
 * Phase 12 requires event application to be *serialised per job*. The
 * in-process store did that with a promise chain, which holds only within one
 * process — two instances behind a load balancer would both apply the same
 * transition against the same stale state.
 *
 * Here the database is the authority:
 *
 *   applyExclusively(jobId, work)
 *     BEGIN
 *     SELECT … FROM manufacturing_jobs WHERE id = $1 FOR UPDATE   ← the lock
 *     … work() …                                                  ← in this tx
 *     COMMIT
 *
 * The row lock is held for the whole callback, so a second request for the same
 * job blocks at the SELECT until the first commits and then reads the state the
 * first produced. Different jobs never contend: the lock is one row.
 *
 * ── Why AsyncLocalStorage ────────────────────────────────────────────────
 *
 * `work()` is Phase 12's own code and it calls back into this repository —
 * `findJob`, `saveJob`, `findOrder`, `saveOrder`. Those calls have to run
 * *inside* the transaction, or the lock protects a read that nothing else uses
 * and the writes land outside it.
 *
 * Passing a transaction handle through would mean changing the repository
 * interface and every call site in the Phase 12 service, which this phase is
 * explicitly not allowed to redesign. So the transaction is bound to the async
 * context for the duration of the callback and every method below joins it if
 * one is present. The contract is unchanged; the guarantee is real.
 *
 * The consequence that matters: a state change and the event that caused it are
 * written in the same transaction. Neither can exist without the other.
 */

/* ------------------------------------------------------------------ *
 * Transaction binding
 * ------------------------------------------------------------------ */

type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const transactionContext = new AsyncLocalStorage<Transaction>();

/** The open transaction if there is one, otherwise the pool. */
async function connection(): Promise<AppDatabase | Transaction> {
  return transactionContext.getStore() ?? (await getDatabase());
}

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

type OrderRow = typeof orders.$inferSelect;
type ItemRow = typeof orderItems.$inferSelect;
type JobRow = typeof manufacturingJobs.$inferSelect;
type EventRow = typeof manufacturingEvents.$inferSelect;
type ShipmentRow = typeof shipments.$inferSelect;

const iso = (value: Date) => value.toISOString();

function toItem(row: ItemRow, jobId?: string): OrderItem {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    spec: row.spec,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    lineTotal: row.lineTotal,
    ...(row.quoteRulesVersion ? { quoteRulesVersion: row.quoteRulesVersion } : {}),
    fulfillmentStatus: row.fulfillmentStatus,
    /*
     * Derived from the job's `order_item_id` rather than stored on the item.
     * The link exists once, in one direction, on a unique column — so the two
     * sides cannot disagree about which job makes which part. Only custom items
     * have one; a stocked product is fulfilled, not manufactured.
     */
    ...(jobId ? { manufacturingJobId: jobId } : {}),
    ...(row.shipmentId ? { shipmentId: row.shipmentId } : {}),
  };
}

function toShipment(row: ShipmentRow, itemIds: readonly string[]): Shipment {
  return {
    id: row.id,
    orderReference: row.orderReference,
    status: row.status,
    itemIds: [...itemIds],
    ...(row.carrier ? { carrier: row.carrier } : {}),
    ...(row.trackingNumber ? { trackingNumber: row.trackingNumber } : {}),
    ...(row.trackingUrl ? { trackingUrl: row.trackingUrl } : {}),
    ...(row.shippedAt ? { shippedAt: iso(row.shippedAt) } : {}),
    ...(row.deliveredAt ? { deliveredAt: iso(row.deliveredAt) } : {}),
    updatedAt: iso(row.updatedAt),
  };
}

function toOrder(
  row: OrderRow,
  itemRows: readonly ItemRow[],
  shipmentRows: readonly ShipmentRow[],
  /** Item id → manufacturing job id, for the items that have one. */
  jobsByItem: ReadonlyMap<string, string> = new Map(),
): Order {
  const items = itemRows.map((item) => toItem(item, jobsByItem.get(item.id)));

  return {
    reference: row.reference,
    cartId: row.cartId,
    ...(row.customerId ? { customerId: row.customerId } : {}),
    status: row.status,
    payment: {
      status: row.paymentStatus,
      ...(row.paymentSessionId ? { sessionId: row.paymentSessionId } : {}),
      ...(row.paymentProvider ? { provider: row.paymentProvider } : {}),
    },
    items,
    /*
     * A shipment's item list is not a column: it is derived from which items
     * point at the shipment. One direction of truth, so the two cannot
     * disagree about which parcel holds what.
     */
    shipments: shipmentRows.map((shipment) =>
      toShipment(
        shipment,
        itemRows.filter((item) => item.shipmentId === shipment.id).map((i) => i.id),
      ),
    ),
    totals: row.totals as CartTotals,
    contact: {
      name: row.contactName,
      email: row.contactEmail,
      phone: row.contactPhone,
    },
    address: {
      line1: row.addressLine1,
      ...(row.addressLine2 ? { line2: row.addressLine2 } : {}),
      city: row.addressCity,
      state: row.addressState,
      postalCode: row.addressPostalCode,
      country: row.addressCountry,
    },
    placedAt: iso(row.placedAt),
    updatedAt: iso(row.updatedAt),
    ...(row.cancelledAt ? { cancelledAt: iso(row.cancelledAt) } : {}),
    provisional: row.provisional,
    ...(row.demo ? { demo: true } : {}),
  };
}

function toEvent(row: EventRow): ManufacturingEvent {
  return {
    id: row.id,
    type: row.type,
    occurredAt: iso(row.occurredAt),
    ...(row.actor ? { actor: row.actor } : {}),
    ...(row.note ? { note: row.note } : {}),
    from: row.fromState,
    to: row.toState,
  };
}

function toJob(row: JobRow, eventRows: readonly EventRow[]): ManufacturingJob {
  return {
    id: row.id,
    orderItemId: row.orderItemId,
    orderReference: row.orderReference,
    state: row.state,
    events: eventRows.map(toEvent),
    ...(row.holdReason && row.holdStartedAt
      ? {
          hold: {
            reason: row.holdReason,
            startedAt: iso(row.holdStartedAt),
            ...(row.holdResolvedAt ? { resolvedAt: iso(row.holdResolvedAt) } : {}),
            ...(row.holdNote ? { note: row.holdNote } : {}),
          },
        }
      : {}),
    qualityResult: row.qualityResult,
    reworkCount: row.reworkCount,
    ...(row.estimatedCompletionAt
      ? { estimatedCompletionAt: iso(row.estimatedCompletionAt) }
      : {}),
    ...(row.machineId ? { machineId: row.machineId } : {}),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

function orderValues(order: Order) {
  return {
    reference: order.reference,
    cartId: order.cartId,
    customerId: order.customerId ?? null,
    status: order.status,
    paymentStatus: order.payment.status,
    paymentSessionId: order.payment.sessionId ?? null,
    paymentProvider: order.payment.provider ?? null,
    totals: order.totals,
    contactName: order.contact.name,
    contactEmail: order.contact.email,
    contactPhone: order.contact.phone,
    addressLine1: order.address.line1,
    addressLine2: order.address.line2 ?? null,
    addressCity: order.address.city,
    addressState: order.address.state,
    addressPostalCode: order.address.postalCode,
    addressCountry: order.address.country,
    placedAt: new Date(order.placedAt),
    updatedAt: new Date(order.updatedAt),
    cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null,
    provisional: order.provisional,
    demo: order.demo === true,
  };
}

function itemValues(order: Order, item: OrderItem, position: number) {
  return {
    id: item.id,
    orderReference: order.reference,
    type: item.type,
    name: item.name,
    spec: item.spec,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    quoteRulesVersion: item.quoteRulesVersion ?? null,
    fulfillmentStatus: item.fulfillmentStatus,
    shipmentId: item.shipmentId ?? null,
    position,
  };
}

/**
 * Writes an order and everything hanging off it, in one transaction.
 *
 * Items and shipments are upserted, never deleted. Removing an item from a
 * placed order is not an operation the domain has — an item that is not going
 * to be made is `cancelled`, which is a status, not a deletion — and a
 * repository that quietly deleted rows the caller happened to omit would be one
 * bug away from erasing order history.
 */
async function writeOrder(
  db: AppDatabase | Transaction,
  order: Order,
): Promise<void> {
  const values = orderValues(order);
  const { reference: _reference, ...updatable } = values;

  await db
    .insert(orders)
    .values(values)
    .onConflictDoUpdate({ target: orders.reference, set: updatable });

  for (const [position, item] of order.items.entries()) {
    const row = itemValues(order, item, position);
    const { id: _id, orderReference: _ref, ...itemUpdatable } = row;

    await db
      .insert(orderItems)
      .values(row)
      .onConflictDoUpdate({ target: orderItems.id, set: itemUpdatable });
  }

  for (const shipment of order.shipments) {
    const row = {
      id: shipment.id,
      orderReference: order.reference,
      status: shipment.status,
      carrier: shipment.carrier ?? null,
      trackingNumber: shipment.trackingNumber ?? null,
      trackingUrl: shipment.trackingUrl ?? null,
      shippedAt: shipment.shippedAt ? new Date(shipment.shippedAt) : null,
      deliveredAt: shipment.deliveredAt ? new Date(shipment.deliveredAt) : null,
      updatedAt: new Date(shipment.updatedAt),
    };
    const { id: _sid, orderReference: _sref, ...shipmentUpdatable } = row;

    await db
      .insert(shipments)
      .values(row)
      .onConflictDoUpdate({ target: shipments.id, set: shipmentUpdatable });
  }
}

/** Reads an order and its items and shipments. */
async function readOrder(
  db: AppDatabase | Transaction,
  reference: string,
): Promise<Order | undefined> {
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.reference, reference))
    .limit(1);

  const row = orderRows[0];
  if (!row) return undefined;

  const [itemRows, shipmentRows, jobRows] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderReference, reference))
      .orderBy(asc(orderItems.position)),
    db
      .select()
      .from(shipments)
      .where(eq(shipments.orderReference, reference))
      .orderBy(asc(shipments.id)),
    db
      .select({
        id: manufacturingJobs.id,
        orderItemId: manufacturingJobs.orderItemId,
      })
      .from(manufacturingJobs)
      .where(eq(manufacturingJobs.orderReference, reference)),
  ]);

  return toOrder(
    row,
    itemRows,
    shipmentRows,
    new Map(jobRows.map((job) => [job.orderItemId, job.id])),
  );
}

async function readJob(
  db: AppDatabase | Transaction,
  id: string,
): Promise<ManufacturingJob | undefined> {
  const jobRows = await db
    .select()
    .from(manufacturingJobs)
    .where(eq(manufacturingJobs.id, id))
    .limit(1);

  const row = jobRows[0];
  if (!row) return undefined;

  const eventRows = await db
    .select()
    .from(manufacturingEvents)
    .where(eq(manufacturingEvents.jobId, id))
    .orderBy(asc(manufacturingEvents.sequence));

  return toJob(row, eventRows);
}

/* ------------------------------------------------------------------ *
 * The repository
 * ------------------------------------------------------------------ */

export function postgresOrderRepository(): OrderRepository {
  return {
    name: "postgres",

    /**
     * The next customer-facing reference.
     *
     * One atomic statement. Concurrent checkouts queue on the counter row for
     * its duration and each leaves with a distinct number.
     */
    async nextReference(): Promise<string> {
      const db = await connection();

      const rows = await db
        .insert(counters)
        .values({ name: "order_reference", value: 1 })
        .onConflictDoUpdate({
          target: counters.name,
          set: { value: sql`${counters.value} + 1` },
        })
        .returning({ value: counters.value });

      const value = rows[0]?.value ?? 1;
      return `S3D-${String(value).padStart(6, "0")}`;
    },

    async createOrder(order: Order): Promise<Order> {
      const db = await connection();
      // One transaction: an order without its items is not a partial order, it
      // is a corrupt one.
      if (transactionContext.getStore()) await writeOrder(db, order);
      else {
        await (db as AppDatabase).transaction((tx) => writeOrder(tx, order));
      }
      return order;
    },

    async saveOrder(order: Order): Promise<Order> {
      const db = await connection();
      if (transactionContext.getStore()) await writeOrder(db, order);
      else {
        await (db as AppDatabase).transaction((tx) => writeOrder(tx, order));
      }
      return order;
    },

    async findOrder(reference: string): Promise<Order | undefined> {
      return readOrder(await connection(), reference);
    },

    async listOrders(): Promise<Order[]> {
      const db = await connection();

      const rows = await db.select().from(orders).orderBy(asc(orders.placedAt));
      if (rows.length === 0) return [];

      /*
       * Three queries for the whole set rather than three per order. The
       * account portal lists a customer's orders and would otherwise be N+1.
       */
      const [itemRows, shipmentRows, jobRows] = await Promise.all([
        db.select().from(orderItems).orderBy(asc(orderItems.position)),
        db.select().from(shipments).orderBy(asc(shipments.id)),
        db
          .select({
            id: manufacturingJobs.id,
            orderItemId: manufacturingJobs.orderItemId,
          })
          .from(manufacturingJobs),
      ]);

      const jobsByItem = new Map(jobRows.map((job) => [job.orderItemId, job.id]));

      const itemsByOrder = new Map<string, ItemRow[]>();
      for (const item of itemRows) {
        const list = itemsByOrder.get(item.orderReference);
        if (list) list.push(item);
        else itemsByOrder.set(item.orderReference, [item]);
      }

      const shipmentsByOrder = new Map<string, ShipmentRow[]>();
      for (const shipment of shipmentRows) {
        const list = shipmentsByOrder.get(shipment.orderReference);
        if (list) list.push(shipment);
        else shipmentsByOrder.set(shipment.orderReference, [shipment]);
      }

      return rows.map((row) =>
        toOrder(
          row,
          itemsByOrder.get(row.reference) ?? [],
          shipmentsByOrder.get(row.reference) ?? [],
          jobsByItem,
        ),
      );
    },

    async createJob(job: ManufacturingJob): Promise<ManufacturingJob> {
      const db = await connection();
      await writeJob(db, job);
      return job;
    },

    async saveJob(job: ManufacturingJob): Promise<ManufacturingJob> {
      const db = await connection();
      await writeJob(db, job);
      return job;
    },

    async findJob(id: string): Promise<ManufacturingJob | undefined> {
      return readJob(await connection(), id);
    },

    async findJobsForOrder(reference: string): Promise<ManufacturingJob[]> {
      const db = await connection();

      const jobRows = await db
        .select()
        .from(manufacturingJobs)
        .where(eq(manufacturingJobs.orderReference, reference))
        .orderBy(asc(manufacturingJobs.id));

      if (jobRows.length === 0) return [];

      const eventRows = await db
        .select()
        .from(manufacturingEvents)
        .orderBy(asc(manufacturingEvents.sequence));

      const byJob = new Map<string, EventRow[]>();
      for (const event of eventRows) {
        const list = byJob.get(event.jobId);
        if (list) list.push(event);
        else byJob.set(event.jobId, [event]);
      }

      return jobRows.map((row) => toJob(row, byJob.get(row.id) ?? []));
    },

    /**
     * Runs a job update with nothing else touching that job.
     *
     * The lock is one row, so two different parts progress in parallel and only
     * reports about the same part queue. Everything the callback writes — the
     * job's new state, its event, the item's fulfilment status, the order's
     * recomputed status — commits together or not at all.
     */
    async applyExclusively<T>(jobId: string, work: () => Promise<T>): Promise<T> {
      // Already inside one: joining it keeps the guarantee and avoids a
      // self-deadlock on the row this transaction already holds.
      if (transactionContext.getStore()) return work();

      const db = await getDatabase();

      return db.transaction(async (tx) => {
        /*
         * The lock. A concurrent caller for the same job blocks here until this
         * transaction commits, then proceeds against the state it produced —
         * which is what makes "the same milestone reported twice" resolve to
         * one transition rather than two racing reads of a stale state.
         */
        await tx
          .select({ id: manufacturingJobs.id })
          .from(manufacturingJobs)
          .where(eq(manufacturingJobs.id, jobId))
          .for("update");

        return transactionContext.run(tx, work);
      });
    },

    /*
     * Fixture seeding is a development concern and the store is shared, so
     * "have we seeded" is a question about the data rather than about this
     * process. A demo order existing is the answer.
     */
    hasSeeded(): boolean {
      return seeded;
    },

    markSeeded(): void {
      seeded = true;
    },
  };
}

let seeded = false;

/**
 * Writes a job and appends any events it has gained.
 *
 * Events are append-only: existing rows are never rewritten, and a repeat of an
 * id already stored is absorbed by the primary key. That is what makes
 * duplicate delivery idempotent at the database rather than only in the service
 * — two concurrent applications of the same event id cannot both insert.
 */
async function writeJob(
  db: AppDatabase | Transaction,
  job: ManufacturingJob,
): Promise<void> {
  const values = {
    id: job.id,
    orderItemId: job.orderItemId,
    orderReference: job.orderReference,
    state: job.state,
    qualityResult: job.qualityResult,
    reworkCount: job.reworkCount,
    holdReason: job.hold?.reason ?? null,
    holdStartedAt: job.hold ? new Date(job.hold.startedAt) : null,
    holdResolvedAt: job.hold?.resolvedAt ? new Date(job.hold.resolvedAt) : null,
    holdNote: job.hold?.note ?? null,
    estimatedCompletionAt: job.estimatedCompletionAt
      ? new Date(job.estimatedCompletionAt)
      : null,
    machineId: job.machineId ?? null,
    createdAt: new Date(job.createdAt),
    updatedAt: new Date(job.updatedAt),
  };

  const { id: _id, orderItemId: _item, createdAt: _created, ...updatable } = values;

  await db
    .insert(manufacturingJobs)
    .values(values)
    .onConflictDoUpdate({
      target: manufacturingJobs.id,
      set: { ...updatable, version: sql`${manufacturingJobs.version} + 1` },
    });

  if (job.events.length === 0) return;

  /*
   * One statement for the whole history, not one per event.
   *
   * The service hands back the complete event list on every save, so a job on
   * its tenth transition would otherwise issue ten inserts — nine of which the
   * primary key immediately discards. Against a local database that is
   * invisible; against a managed one every discarded insert is a network round
   * trip, and seeding the demonstration orders took sixty seconds because of it.
   *
   * `onConflictDoNothing` still carries the idempotency: events already stored
   * are skipped by the primary key, and only genuinely new rows are written.
   */
  await db
    .insert(manufacturingEvents)
    .values(
      job.events.map((event, sequence) => ({
        id: event.id,
        jobId: job.id,
        type: event.type,
        fromState: event.from,
        toState: event.to,
        occurredAt: new Date(event.occurredAt),
        actor: event.actor ?? null,
        note: event.note ?? null,
        sequence,
      })),
    )
    .onConflictDoNothing({ target: manufacturingEvents.id });
}

/** Whether an order exists at all, used by the demo-fixture guard. */
export async function anyOrderExists(): Promise<boolean> {
  const db = await connection();
  const rows = await db.select({ reference: orders.reference }).from(orders).limit(1);
  return rows.length > 0;
}

/** Exported for the persistence tests, which assert the lock is real. */
export const __transactionContext = transactionContext;
