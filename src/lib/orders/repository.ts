import { memoize, persistenceMode, warnMemoryPersistence } from "@/lib/db/persistence";
import type { ManufacturingJob } from "@/lib/manufacturing/types";

import { postgresOrderRepository } from "./repository.postgres";
import type { Order } from "./types";

/**
 * Order and manufacturing storage.
 *
 * ── The current implementation ────────────────────────────────────────────
 *
 * PostgreSQL, since Phase 15 — see `repository.postgres.ts`. The in-process
 * store below is kept for development without a database and for the pure
 * state-machine tests; production has no such fallback.
 *
 * Everything above this file is written as though the store were a database:
 * reads are async, writes are async, and no caller holds a reference to a
 * stored object it can mutate.
 *
 * ── The relational model this maps onto ───────────────────────────────────
 *
 *   orders                 reference (unique) · cart_id · user_id nullable
 *                          · status · payment_status · payment_session_id
 *                          · payment_provider · totals_* · contact_*
 *                          · address_* · placed_at · updated_at · cancelled_at
 *   order_items            id · order_id · item_type · name · spec · quantity
 *                          · unit_price · line_total · quote_rules_version
 *                          · fulfillment_status · manufacturing_job_id
 *                          · shipment_id
 *   shipments              id · order_id · status · carrier · tracking_number
 *                          · shipped_at · delivered_at · updated_at
 *   manufacturing_jobs     id · order_item_id · state · quality_result
 *                          · rework_count · hold_reason · hold_started_at
 *                          · hold_resolved_at · machine_id
 *                          · estimated_completion_at · version
 *   manufacturing_events   id · job_id · type · from_state · to_state
 *                          · occurred_at · actor · note
 *
 * Money is integer whole rupees, as everywhere else.
 *
 * ── Concurrency ──────────────────────────────────────────────────────────
 *
 * Two operators can report the same milestone at the same moment. Applying an
 * event is therefore serialised per job by the lock below, so a transition is
 * always decided against the state that was actually current. In Postgres this
 * is `SELECT … FOR UPDATE` on the job row, or an optimistic `version` check —
 * which is why the schema above carries one.
 */

interface Store {
  orders: Map<string, Order>;
  jobs: Map<string, ManufacturingJob>;
  sequence: number;
  /** Per-job promise chains. See applyExclusively. */
  locks: Map<string, Promise<unknown>>;
  seeded: boolean;
}

const GLOBAL_KEY = "__sada3d_orders_v2__";

function store(): Store {
  const globals = globalThis as unknown as Record<string, Store | undefined>;
  const existing = globals[GLOBAL_KEY];
  if (existing) return existing;

  const created: Store = {
    orders: new Map(),
    jobs: new Map(),
    sequence: 0,
    locks: new Map(),
    seeded: false,
  };
  globals[GLOBAL_KEY] = created;
  return created;
}

export interface OrderRepository {
  readonly name: string;
  nextReference(): Promise<string>;
  createOrder(order: Order): Promise<Order>;
  saveOrder(order: Order): Promise<Order>;
  findOrder(reference: string): Promise<Order | undefined>;

  /**
   * Every order. Reads the whole table: operator tooling and fixtures only,
   * never a customer-facing request.
   */
  listOrders(): Promise<Order[]>;

  /**
   * One customer's orders, newest first. Reads only that customer's rows, by
   * index — the account portal's path.
   */
  listOrdersForCustomer(customerId: string): Promise<Order[]>;

  createJob(job: ManufacturingJob): Promise<ManufacturingJob>;
  saveJob(job: ManufacturingJob): Promise<ManufacturingJob>;
  findJob(id: string): Promise<ManufacturingJob | undefined>;
  findJobsForOrder(reference: string): Promise<ManufacturingJob[]>;

  /** The jobs of several orders at once, so a list of orders is not N+1. */
  findJobsForOrders(references: readonly string[]): Promise<ManufacturingJob[]>;

  /**
   * Runs a job update with nothing else touching that job.
   *
   * The lock is per job, not global: two different parts can progress at the
   * same time, and only reports about the same part are made to queue.
   */
  applyExclusively<T>(jobId: string, work: () => Promise<T>): Promise<T>;

  /** Development fixtures. Never used in production; see fixtures.ts. */
  hasSeeded(): boolean;
  markSeeded(): void;
}

/** Defensive copy, so a caller cannot mutate what the store holds. */
function cloneOrder(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      ...(item.sourceFile
        ? {
            sourceFile: {
              ...item.sourceFile,
              configuration: { ...item.sourceFile.configuration },
            },
          }
        : {}),
    })),
    shipments: order.shipments.map((shipment) => ({
      ...shipment,
      itemIds: [...shipment.itemIds],
    })),
  };
}

function cloneJob(job: ManufacturingJob): ManufacturingJob {
  return {
    ...job,
    events: job.events.map((event) => ({ ...event })),
    hold: job.hold ? { ...job.hold } : undefined,
  };
}

export const memoryOrderRepository: OrderRepository = {
  name: "memory",

  async nextReference(): Promise<string> {
    const state = store();
    state.sequence += 1;
    return `S3D-${String(state.sequence).padStart(6, "0")}`;
  },

  async createOrder(order: Order): Promise<Order> {
    store().orders.set(order.reference, cloneOrder(order));
    return order;
  },

  async saveOrder(order: Order): Promise<Order> {
    store().orders.set(order.reference, cloneOrder(order));
    return order;
  },

  async findOrder(reference: string): Promise<Order | undefined> {
    const found = store().orders.get(reference);
    return found ? cloneOrder(found) : undefined;
  },

  async listOrders(): Promise<Order[]> {
    return [...store().orders.values()].map(cloneOrder);
  },

  async listOrdersForCustomer(customerId: string): Promise<Order[]> {
    return [...store().orders.values()]
      .filter((order) => order.customerId !== undefined && order.customerId === customerId)
      .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))
      .map(cloneOrder);
  },

  async createJob(job: ManufacturingJob): Promise<ManufacturingJob> {
    store().jobs.set(job.id, cloneJob(job));
    return job;
  },

  async saveJob(job: ManufacturingJob): Promise<ManufacturingJob> {
    store().jobs.set(job.id, cloneJob(job));
    return job;
  },

  async findJob(id: string): Promise<ManufacturingJob | undefined> {
    const found = store().jobs.get(id);
    return found ? cloneJob(found) : undefined;
  },

  async findJobsForOrder(reference: string): Promise<ManufacturingJob[]> {
    return [...store().jobs.values()]
      .filter((job) => job.orderReference === reference)
      .map(cloneJob);
  },

  async findJobsForOrders(references: readonly string[]): Promise<ManufacturingJob[]> {
    const wanted = new Set(references);
    return [...store().jobs.values()]
      .filter((job) => wanted.has(job.orderReference))
      .map(cloneJob);
  },

  async applyExclusively<T>(jobId: string, work: () => Promise<T>): Promise<T> {
    const state = store();
    const previous = state.locks.get(jobId) ?? Promise.resolve();

    // Chain onto whatever is already running for this job. `catch` keeps one
    // failed update from poisoning every later one.
    const next = previous.catch(() => undefined).then(work);
    state.locks.set(
      jobId,
      next.catch(() => undefined),
    );

    try {
      return await next;
    } finally {
      if (state.locks.get(jobId) === next) state.locks.delete(jobId);
    }
  },

  hasSeeded(): boolean {
    return store().seeded;
  },

  markSeeded(): void {
    store().seeded = true;
  },
};

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

const postgres = memoize(() => postgresOrderRepository());

/**
 * The repository the application uses.
 *
 * A facade, re-deciding per call from `persistenceMode()` — the same shape the
 * Phase 13 account repositories use. With a database configured, orders,
 * items, jobs, events and shipments are in PostgreSQL and event application is
 * serialised by a row lock. Without one, development falls back to the
 * in-process store; production does not fall back at all.
 *
 * Everything above this line — the four state machines, the aggregation, the
 * customer projection, the account portal, the tracking page — is unchanged by
 * which one answers.
 */
function repository(): OrderRepository {
  if (persistenceMode() === "postgres") return postgres();

  warnMemoryPersistence();
  return memoryOrderRepository;
}

export const orderRepository: OrderRepository = {
  get name() {
    return repository().name;
  },
  nextReference: () => repository().nextReference(),
  createOrder: (order) => repository().createOrder(order),
  saveOrder: (order) => repository().saveOrder(order),
  findOrder: (reference) => repository().findOrder(reference),
  listOrders: () => repository().listOrders(),
  listOrdersForCustomer: (customerId) => repository().listOrdersForCustomer(customerId),
  createJob: (job) => repository().createJob(job),
  saveJob: (job) => repository().saveJob(job),
  findJob: (id) => repository().findJob(id),
  findJobsForOrder: (reference) => repository().findJobsForOrder(reference),
  findJobsForOrders: (references) => repository().findJobsForOrders(references),
  applyExclusively: (jobId, work) => repository().applyExclusively(jobId, work),
  hasSeeded: () => repository().hasSeeded(),
  markSeeded: () => repository().markSeeded(),
};
