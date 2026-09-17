import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  notExists,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import type { Money } from "@/lib/cart/types";
import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { manufacturingJobs, orderItems, orders } from "@/lib/db/schema";
import {
  isHoldActive,
  type ManufacturingEventType,
  type ManufacturingHoldReason,
  type ManufacturingJob,
  type ManufacturingState,
  type QualityResult,
} from "@/lib/manufacturing/types";
import { parseOrderReference } from "@/lib/orders/reference";
import { orderRepository } from "@/lib/orders/repository";
import { availableShipmentEvents, type ShipmentEventType } from "@/lib/orders/shipment";
import type {
  Order,
  OrderItemFulfillmentStatus,
  OrderStatus,
  PaymentState,
  ShipmentStatus,
} from "@/lib/orders/types";

import { formatINR } from "./format";
import {
  DESTRUCTIVE_EVENTS,
  EVENT_ACTION_LABEL,
  EVENT_LOG_LABEL,
  HOLD_REASON_LABEL,
  MANUFACTURING_STATE_LABEL,
  SHIPMENT_EVENT_ACTION_LABEL,
  type OpsTone,
} from "./labels";
import type { OperatorSession } from "./operator";
import {
  PRODUCTION_COLUMNS,
  columnForState,
  consoleJobEvents,
  deriveIssues,
  isTerminal,
  jobAnchor,
  type OpsIssue,
  type ProductionColumnId,
} from "./pipeline";
import {
  PAGE_SIZE,
  likePattern,
  type DemoFilter,
  type OrderListQuery,
  type OrderSort,
  type OrderStage,
  type ProductionFilter,
} from "./query";
import {
  activeHold,
  dayAfter,
  jobIsActive,
  jobIsHeld,
  orderTotal,
  readTotals,
  startOfDay,
  toPage,
} from "./sql";
import type { OpsPage } from "./types";

/**
 * Orders, for operators.
 *
 * ── Reading across customers ─────────────────────────────────────────────
 *
 * The account domain reads orders only by owner, and says so. The console reads
 * every order, because operating a manufacturing business is reading every
 * order. That difference is why these functions live here, take an
 * `OperatorSession` — minted only by `requireOperator` — and are reachable from
 * nothing a customer can request.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────
 *
 * A list is one page: `LIMIT 25` over `orders_placed_idx`, a count, and two
 * reads keyed by the references on that page. Never the whole table.
 *
 * ── What a projection leaves out ─────────────────────────────────────────
 *
 * The cart id and the private storage key of every manufacturing file. The
 * snapshot's checksum is kept, shortened, because it is how an operator tells
 * two uploads of "bracket.stl" apart.
 */

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

export interface OrderProductionSummary {
  jobs: number;
  active: number;
  held: number;
  failed: number;
  /** The earliest board column among active jobs: what the order is waiting on. */
  column: ProductionColumnId | null;
  state: ManufacturingState | null;
}

export interface OpsOrderRow {
  reference: string;
  placedAt: string;
  status: OrderStatus;
  paymentStatus: PaymentState;
  total: number;
  currency: string;
  provisional: boolean;
  demo: boolean;
  customer: { id: string | null; name: string; email: string };
  items: { lines: number; units: number; summary: string };
  production: OrderProductionSummary;
}

type OrderFilters = Pick<
  OrderListQuery,
  "q" | "stage" | "status" | "payment" | "production" | "customer" | "from" | "to" | "demo"
>;

function productionCondition(db: AppDatabase, filter: ProductionFilter): SQL {
  const jobsOfOrder = (where?: SQL) =>
    db
      .select({ jobId: manufacturingJobs.id })
      .from(manufacturingJobs)
      .where(and(eq(manufacturingJobs.orderReference, orders.reference), where));

  switch (filter) {
    case "active":
      return exists(jobsOfOrder(jobIsActive()));
    case "held":
      return exists(jobsOfOrder(jobIsHeld()));
    case "failed":
      return exists(jobsOfOrder(eq(manufacturingJobs.state, "failed")));
    case "none":
      return notExists(jobsOfOrder());
  }
}

/**
 * Where an order stands, as the command centre's quick filters read it.
 *
 * Built only from the recorded states: the order status the aggregate derives,
 * the manufacturing jobs, and each item's fulfilment status. The same condition
 * filters the list and counts the chips, so a chip's number is the list it opens.
 */
export function stageCondition(db: AppDatabase, stage: OrderStage): SQL {
  const live = notInArray(orders.status, ["cancelled", "failed"]);
  const itemIn = (statuses: OrderItemFulfillmentStatus[]) =>
    exists(
      db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(and(eq(orderItems.orderReference, orders.reference), inArray(orderItems.fulfillmentStatus, statuses))),
    );

  switch (stage) {
    case "new":
      return inArray(orders.status, ["pending", "awaiting_payment"]);
    case "paid":
      return eq(orders.status, "confirmed");
    case "production":
      return and(
        live,
        exists(
          db
            .select({ id: manufacturingJobs.id })
            .from(manufacturingJobs)
            .where(and(eq(manufacturingJobs.orderReference, orders.reference), jobIsActive())),
        ),
      ) as SQL;
    case "ready":
      return and(live, itemIn(["ready"])) as SQL;
    case "shipped":
      return and(live, itemIn(["shipped"])) as SQL;
    case "completed":
      return eq(orders.status, "fulfilled");
    case "cancelled":
      return eq(orders.status, "cancelled");
  }
}

export function demoCondition(filter: DemoFilter | undefined): SQL | undefined {
  if (filter === "exclude") return eq(orders.demo, false);
  if (filter === "only") return eq(orders.demo, true);
  return undefined;
}

function orderConditions(db: AppDatabase, query: OrderFilters): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];

  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(
      or(
        ilike(orders.reference, pattern),
        ilike(orders.contactName, pattern),
        ilike(orders.contactEmail, pattern),
      ),
    );
  }

  if (query.stage) conditions.push(stageCondition(db, query.stage));
  if (query.status) conditions.push(eq(orders.status, query.status));
  if (query.payment) conditions.push(eq(orders.paymentStatus, query.payment));

  if (query.customer === "guest") conditions.push(isNull(orders.customerId));
  else if (query.customer) conditions.push(eq(orders.customerId, query.customer));

  if (query.from) conditions.push(gte(orders.placedAt, startOfDay(query.from)));
  if (query.to) conditions.push(lt(orders.placedAt, dayAfter(query.to)));

  conditions.push(demoCondition(query.demo));
  if (query.production) conditions.push(productionCondition(db, query.production));

  return and(...conditions);
}

function orderBy(sort: OrderSort): SQL[] {
  switch (sort) {
    case "placed_asc":
      return [asc(orders.placedAt), asc(orders.reference)];
    case "total_desc":
      return [desc(orderTotal()), desc(orders.placedAt)];
    case "total_asc":
      return [asc(orderTotal()), desc(orders.placedAt)];
    case "placed_desc":
      return [desc(orders.placedAt), desc(orders.reference)];
  }
}

const COLUMN_ORDER = new Map(PRODUCTION_COLUMNS.map((column, index) => [column.id, index]));

/** Items and jobs for one page of orders: two reads, keyed by that page's references. */
async function summariseOrders(
  db: AppDatabase,
  references: readonly string[],
): Promise<Map<string, { items: OpsOrderRow["items"]; production: OrderProductionSummary }>> {
  const summaries = new Map<string, { items: OpsOrderRow["items"]; production: OrderProductionSummary }>();
  if (references.length === 0) return summaries;

  const [items, jobs] = await Promise.all([
    db
      .select({
        orderReference: orderItems.orderReference,
        name: orderItems.name,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderReference, [...references]))
      .orderBy(asc(orderItems.orderReference), asc(orderItems.position)),
    db
      .select({
        orderReference: manufacturingJobs.orderReference,
        state: manufacturingJobs.state,
        holdReason: manufacturingJobs.holdReason,
        holdStartedAt: manufacturingJobs.holdStartedAt,
        holdResolvedAt: manufacturingJobs.holdResolvedAt,
      })
      .from(manufacturingJobs)
      .where(inArray(manufacturingJobs.orderReference, [...references])),
  ]);

  for (const reference of references) {
    const lines = items.filter((item) => item.orderReference === reference);
    const first = lines[0];
    const production: OrderProductionSummary = {
      jobs: 0,
      active: 0,
      held: 0,
      failed: 0,
      column: null,
      state: null,
    };

    for (const job of jobs) {
      if (job.orderReference !== reference) continue;
      production.jobs += 1;
      if (job.state === "failed") production.failed += 1;
      if (isTerminal(job.state)) continue;

      production.active += 1;
      if (activeHold(job)) production.held += 1;

      const column = columnForState(job.state);
      if (
        production.column === null ||
        (COLUMN_ORDER.get(column) ?? 0) < (COLUMN_ORDER.get(production.column) ?? 0)
      ) {
        production.column = column;
        production.state = job.state;
      }
    }

    summaries.set(reference, {
      items: {
        lines: lines.length,
        units: lines.reduce((sum, line) => sum + line.quantity, 0),
        summary: first
          ? lines.length > 1
            ? `${first.name} + ${lines.length - 1} more`
            : first.name
          : "No items",
      },
      production,
    });
  }

  return summaries;
}

export async function listOpsOrders(
  _operator: OperatorSession,
  query: OrderListQuery,
  pageSize: number = PAGE_SIZE,
): Promise<OpsPage<OpsOrderRow>> {
  const db = await getDatabase();
  const where = orderConditions(db, query);

  const [rows, counted] = await Promise.all([
    db
      .select({
        reference: orders.reference,
        placedAt: orders.placedAt,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        totals: orders.totals,
        provisional: orders.provisional,
        demo: orders.demo,
        customerId: orders.customerId,
        contactName: orders.contactName,
        contactEmail: orders.contactEmail,
      })
      .from(orders)
      .where(where)
      .orderBy(...orderBy(query.sort))
      .limit(pageSize)
      .offset((query.page - 1) * pageSize),
    db.select({ value: count() }).from(orders).where(where),
  ]);

  const summaries = await summariseOrders(
    db,
    rows.map((row) => row.reference),
  );

  const result: OpsOrderRow[] = rows.map((row) => {
    const totals = readTotals(row.totals);
    const summary = summaries.get(row.reference);

    return {
      reference: row.reference,
      placedAt: row.placedAt.toISOString(),
      status: row.status,
      paymentStatus: row.paymentStatus,
      total: totals.total,
      currency: totals.currency,
      provisional: row.provisional,
      demo: row.demo,
      customer: { id: row.customerId, name: row.contactName, email: row.contactEmail },
      items: summary?.items ?? { lines: 0, units: 0, summary: "No items" },
      production: summary?.production ?? {
        jobs: 0,
        active: 0,
        held: 0,
        failed: 0,
        column: null,
        state: null,
      },
    };
  });

  return toPage(result, Number(counted[0]?.value ?? 0), query.page, pageSize);
}

/* ------------------------------------------------------------------ *
 * One order
 * ------------------------------------------------------------------ */

export interface OpsEventOption<T extends string> {
  type: T;
  label: string;
  destructive: boolean;
}

export interface OpsOrderItem {
  id: string;
  type: "catalog" | "custom";
  name: string;
  spec: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfillmentStatus: OrderItemFulfillmentStatus;
  jobId?: string;
  shipmentId?: string;
  /** The catalog product this line recorded at checkout, when it recorded one. */
  productId?: string;
  /** The manufacturing file snapshot. No storage key. */
  design?: {
    id: string;
    fileName: string;
    format: string;
    sizeBytes: number;
    checksum: string;
    configuration: { material: string; quality: string; finish: string };
  };
}

export interface OpsJobEvent {
  id: string;
  type: ManufacturingEventType;
  label: string;
  from: ManufacturingState;
  to: ManufacturingState;
  occurredAt: string;
  actor?: string;
  note?: string;
}

export interface OpsJob {
  id: string;
  anchor: string;
  itemId: string;
  itemName: string;
  state: ManufacturingState;
  column: ProductionColumnId;
  qualityResult: QualityResult;
  reworkCount: number;
  hold?: { reason: ManufacturingHoldReason; startedAt: string; note?: string };
  /** The most recent hold, when it has been lifted. */
  lastHold?: { reason: ManufacturingHoldReason; startedAt: string; resolvedAt: string; note?: string };
  estimatedCompletionAt?: string;
  machineId?: string;
  createdAt: string;
  updatedAt: string;
  /** Oldest first. */
  events: OpsJobEvent[];
  actions: OpsEventOption<ManufacturingEventType>[];
}

export interface OpsShipment {
  id: string;
  status: ShipmentStatus;
  items: { id: string; name: string }[];
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: string;
  deliveredAt?: string;
  updatedAt: string;
  actions: OpsEventOption<ShipmentEventType>[];
}

export interface OpsTimelineEntry {
  id: string;
  at: string;
  title: string;
  detail?: string;
  actor?: string;
  note?: string;
  tone: OpsTone;
}

export interface OpsOrderDetail {
  reference: string;
  status: OrderStatus;
  placedAt: string;
  updatedAt: string;
  cancelledAt?: string;
  provisional: boolean;
  demo: boolean;
  payment: { status: PaymentState; provider?: string; reference?: string };
  totals: {
    currency: string;
    subtotal: number;
    total: number;
    shipping: string;
    tax: string;
    excluded: string[];
    units: number;
  };
  customer: { id: string | null; name: string; email: string; phone: string; otherOrders: number };
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: OpsOrderItem[];
  jobs: OpsJob[];
  shipments: OpsShipment[];
  /** Ready and not yet in any parcel: what a new shipment can hold. */
  shippableItems: { id: string; name: string; quantity: number }[];
  timeline: OpsTimelineEntry[];
  issues: OpsIssue[];
  nextStep: { title: string; detail: string };
}

function moneyText(money: Money | undefined): string {
  if (!money || typeof money !== "object") return "Not recorded";
  return money.known ? formatINR(money.amount) : money.reason;
}

function toItem(item: Order["items"][number]): OpsOrderItem {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    spec: item.spec,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    fulfillmentStatus: item.fulfillmentStatus,
    ...(item.manufacturingJobId ? { jobId: item.manufacturingJobId } : {}),
    ...(item.shipmentId ? { shipmentId: item.shipmentId } : {}),
    ...(item.type === "catalog" && item.catalog?.productId ? { productId: item.catalog.productId } : {}),
    ...(item.sourceFile
      ? {
          design: {
            id: item.sourceFile.designId,
            fileName: item.sourceFile.fileName,
            format: item.sourceFile.format,
            sizeBytes: item.sourceFile.sizeBytes,
            checksum: item.sourceFile.sha256.slice(0, 12),
            configuration: {
              material: item.sourceFile.configuration.material,
              quality: item.sourceFile.configuration.quality,
              finish: item.sourceFile.configuration.finish,
            },
          },
        }
      : {}),
  };
}

function toJob(job: ManufacturingJob, itemName: string): OpsJob {
  const hold = job.hold;
  const active = isHoldActive(hold);

  return {
    id: job.id,
    anchor: jobAnchor(job.id),
    itemId: job.orderItemId,
    itemName,
    state: job.state,
    column: columnForState(job.state),
    qualityResult: job.qualityResult,
    reworkCount: job.reworkCount,
    ...(hold && active
      ? { hold: { reason: hold.reason, startedAt: hold.startedAt, ...(hold.note ? { note: hold.note } : {}) } }
      : {}),
    ...(hold && !active && hold.resolvedAt
      ? {
          lastHold: {
            reason: hold.reason,
            startedAt: hold.startedAt,
            resolvedAt: hold.resolvedAt,
            ...(hold.note ? { note: hold.note } : {}),
          },
        }
      : {}),
    ...(job.estimatedCompletionAt ? { estimatedCompletionAt: job.estimatedCompletionAt } : {}),
    ...(job.machineId ? { machineId: job.machineId } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    events: job.events.map((event) => ({
      id: event.id,
      type: event.type,
      label: EVENT_LOG_LABEL[event.type],
      from: event.from,
      to: event.to,
      occurredAt: event.occurredAt,
      ...(event.actor ? { actor: event.actor } : {}),
      ...(event.note ? { note: event.note } : {}),
    })),
    actions: consoleJobEvents(job.state).map((type) => ({
      type,
      label: EVENT_ACTION_LABEL[type],
      destructive: DESTRUCTIVE_EVENTS.has(type),
    })),
  };
}

const EVENT_TONE: Partial<Record<ManufacturingEventType, OpsTone>> = {
  JOB_FAILED: "danger",
  JOB_CANCELLED: "neutral",
  QUALITY_REJECTED: "warning",
  REWORK_STARTED: "warning",
  QUALITY_APPROVED: "success",
  JOB_COMPLETED: "success",
  PRINT_STARTED: "accent",
};

function buildTimeline(order: Order, jobs: readonly OpsJob[]): OpsTimelineEntry[] {
  const entries: OpsTimelineEntry[] = [
    {
      id: "placed",
      at: order.placedAt,
      title: "Order placed",
      detail: `${order.items.length} ${order.items.length === 1 ? "line" : "lines"} · ${formatINR(order.totals.total)}`,
      tone: "neutral",
    },
  ];

  for (const job of jobs) {
    for (const event of job.events) {
      entries.push({
        id: `event:${event.id}`,
        at: event.occurredAt,
        title: event.label,
        detail:
          event.from === event.to
            ? job.itemName
            : `${job.itemName} · ${MANUFACTURING_STATE_LABEL[event.from]} → ${MANUFACTURING_STATE_LABEL[event.to]}`,
        ...(event.actor ? { actor: event.actor } : {}),
        ...(event.note ? { note: event.note } : {}),
        tone: EVENT_TONE[event.type] ?? "info",
      });
    }

    const hold = job.hold ?? job.lastHold;
    if (hold) {
      entries.push({
        id: `hold:${job.id}`,
        at: hold.startedAt,
        title: `Hold placed · ${HOLD_REASON_LABEL[hold.reason]}`,
        detail: job.itemName,
        ...(hold.note ? { note: hold.note } : {}),
        tone: "warning",
      });
    }
    if (job.lastHold) {
      entries.push({
        id: `hold-lifted:${job.id}`,
        at: job.lastHold.resolvedAt,
        title: "Hold lifted",
        detail: job.itemName,
        tone: "neutral",
      });
    }
  }

  for (const shipment of order.shipments) {
    if (shipment.shippedAt) {
      entries.push({
        id: `shipped:${shipment.id}`,
        at: shipment.shippedAt,
        title: "Shipment dispatched",
        detail: [shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" · ") || shipment.id,
        tone: "info",
      });
    }
    if (shipment.deliveredAt) {
      entries.push({
        id: `delivered:${shipment.id}`,
        at: shipment.deliveredAt,
        title: "Shipment delivered",
        detail: shipment.id,
        tone: "success",
      });
    }
  }

  if (order.cancelledAt) {
    entries.push({ id: "cancelled", at: order.cancelledAt, title: "Order cancelled", tone: "neutral" });
  }

  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}

function nextStep(
  order: Order,
  jobs: readonly OpsJob[],
  shippable: readonly { id: string }[],
  shipments: readonly OpsShipment[],
): OpsOrderDetail["nextStep"] {
  if (order.status === "cancelled") {
    return { title: "Cancelled", detail: "Nothing further happens on this order." };
  }
  if (order.payment.status === "failed") {
    return {
      title: "Waiting for payment",
      detail: "The payment failed. Production does not start until the customer pays.",
    };
  }
  if (order.payment.status === "pending") {
    return { title: "Waiting for payment", detail: "Production starts once the order is paid." };
  }

  const failed = jobs.filter((job) => job.state === "failed");
  if (failed.length > 0) {
    return {
      title: "A part failed",
      detail: `${failed.map((job) => job.itemName).join(", ")} cannot be delivered as ordered. Decide whether to remake it or contact the customer.`,
    };
  }

  const held = jobs.find((job) => job.hold);
  if (held?.hold) {
    return {
      title: "Production on hold",
      detail: `${held.itemName} is held for ${HOLD_REASON_LABEL[held.hold.reason].toLowerCase()}. Lift the hold once it is resolved.`,
    };
  }

  if (shippable.length > 0) {
    return {
      title: "Ready to ship",
      detail: `${shippable.length === 1 ? "One item is" : `${shippable.length} items are`} ready. Add ${shippable.length === 1 ? "it" : "them"} to a shipment.`,
    };
  }

  const parcel = shipments.find((shipment) => shipment.actions.some((action) => !action.destructive));
  if (parcel) {
    const action = parcel.actions.find((candidate) => !candidate.destructive);
    return {
      title: "Shipment in progress",
      detail: `${parcel.id}: ${action?.label ?? "update the shipment"} when the carrier confirms it.`,
    };
  }

  const active = jobs.find((job) => !isTerminal(job.state));
  if (active) {
    const action = active.actions.find((candidate) => !candidate.destructive);
    return {
      title: MANUFACTURING_STATE_LABEL[active.state],
      detail: action
        ? `${active.itemName}: next step is “${action.label}”.`
        : `${active.itemName} is ${MANUFACTURING_STATE_LABEL[active.state].toLowerCase()}.`,
    };
  }

  if (order.status === "fulfilled") {
    return { title: "Fulfilled", detail: "Every item has been dispatched." };
  }

  if (order.items.some((item) => item.type === "catalog" && item.fulfillmentStatus === "pending")) {
    return {
      title: "Catalog items awaiting fulfilment",
      detail:
        "Stocked items have no fulfilment step in the order service yet, so they cannot be marked ready or shipped from the console.",
    };
  }

  return { title: "No action needed", detail: "Nothing on this order is waiting on an operator." };
}

/** The operator view of one order. Pure: exported for the tests. */
export function toOrderDetail(
  order: Order,
  jobs: readonly ManufacturingJob[],
  otherOrders: number,
  now: Date,
): OpsOrderDetail {
  const itemName = new Map(order.items.map((item) => [item.id, item.name]));
  const opsJobs = jobs
    .map((job) => toJob(job, itemName.get(job.orderItemId) ?? job.orderItemId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const shipments: OpsShipment[] = order.shipments.map((shipment) => ({
    id: shipment.id,
    status: shipment.status,
    items: shipment.itemIds.map((id) => ({ id, name: itemName.get(id) ?? id })),
    ...(shipment.carrier ? { carrier: shipment.carrier } : {}),
    ...(shipment.trackingNumber ? { trackingNumber: shipment.trackingNumber } : {}),
    ...(shipment.trackingUrl ? { trackingUrl: shipment.trackingUrl } : {}),
    ...(shipment.shippedAt ? { shippedAt: shipment.shippedAt } : {}),
    ...(shipment.deliveredAt ? { deliveredAt: shipment.deliveredAt } : {}),
    updatedAt: shipment.updatedAt,
    actions: availableShipmentEvents(shipment.status).map((type) => ({
      type,
      label: SHIPMENT_EVENT_ACTION_LABEL[type],
      destructive: DESTRUCTIVE_EVENTS.has(type),
    })),
  }));

  const shippableItems = order.items
    .filter((item) => item.fulfillmentStatus === "ready" && !item.shipmentId)
    .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity }));

  const cancelled = order.status === "cancelled";
  const demo = order.demo === true;

  const issues = deriveIssues(
    {
      failedPayments:
        order.payment.status === "failed" && !cancelled
          ? [{ reference: order.reference, customerName: order.contact.name, since: order.updatedAt, demo }]
          : [],
      pendingPayments:
        order.payment.status === "pending" && !cancelled
          ? [{ reference: order.reference, customerName: order.contact.name, since: order.placedAt, demo }]
          : [],
      jobs: jobs.map((job) => ({
        jobId: job.id,
        orderReference: job.orderReference,
        itemName: itemName.get(job.orderItemId) ?? job.orderItemId,
        state: job.state,
        ...(job.hold && isHoldActive(job.hold)
          ? { hold: { reason: job.hold.reason, startedAt: job.hold.startedAt } }
          : {}),
        ...(job.estimatedCompletionAt ? { estimatedCompletionAt: job.estimatedCompletionAt } : {}),
        updatedAt: job.updatedAt,
        reworkCount: job.reworkCount,
        demo,
      })),
      failedShipments: order.shipments
        .filter((shipment) => shipment.status === "failed")
        .map((shipment) => ({
          shipmentId: shipment.id,
          orderReference: order.reference,
          since: shipment.updatedAt,
          demo,
        })),
      unshippedReady:
        shippableItems.length > 0
          ? [{ orderReference: order.reference, itemCount: shippableItems.length, since: order.updatedAt, demo }]
          : [],
      rejectedDesigns: [],
    },
    now,
  );

  return {
    reference: order.reference,
    status: order.status,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
    ...(order.cancelledAt ? { cancelledAt: order.cancelledAt } : {}),
    provisional: order.provisional,
    demo,
    payment: {
      status: order.payment.status,
      ...(order.payment.provider ? { provider: order.payment.provider } : {}),
      ...(order.payment.sessionId ? { reference: order.payment.sessionId } : {}),
    },
    totals: {
      currency: order.totals.currency,
      subtotal: order.totals.subtotal,
      total: order.totals.total,
      shipping: moneyText(order.totals.shipping),
      tax: moneyText(order.totals.tax),
      excluded: [...order.totals.excluded],
      units: order.items.reduce((sum, item) => sum + item.quantity, 0),
    },
    customer: {
      id: order.customerId ?? null,
      name: order.contact.name,
      email: order.contact.email,
      phone: order.contact.phone,
      otherOrders,
    },
    address: {
      line1: order.address.line1,
      ...(order.address.line2 ? { line2: order.address.line2 } : {}),
      city: order.address.city,
      state: order.address.state,
      postalCode: order.address.postalCode,
      country: order.address.country,
    },
    items: order.items.map(toItem),
    jobs: opsJobs,
    shipments,
    shippableItems,
    timeline: buildTimeline(order, opsJobs),
    issues,
    nextStep: nextStep(order, opsJobs, shippableItems, shipments),
  };
}

export async function getOpsOrder(
  _operator: OperatorSession,
  reference: string,
  now: Date = new Date(),
): Promise<OpsOrderDetail | undefined> {
  const normalised = parseOrderReference(reference);
  if (!normalised) return undefined;

  const order = await orderRepository.findOrder(normalised);
  if (!order) return undefined;

  const jobs = await orderRepository.findJobsForOrder(normalised);

  let otherOrders = 0;
  if (order.customerId) {
    const db = await getDatabase();
    const counted = await db
      .select({ value: count() })
      .from(orders)
      .where(eq(orders.customerId, order.customerId));
    otherOrders = Math.max(0, Number(counted[0]?.value ?? 0) - 1);
  }

  return toOrderDetail(order, jobs, otherOrders, now);
}
