import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The order domain, in PostgreSQL.
 *
 * Phase 12 defined four independent state machines and Phase 15 stores them.
 * **It does not redefine them.** Every enum below is transcribed from the
 * TypeScript unions in `lib/orders/types.ts` and `lib/manufacturing/types.ts`,
 * and `orders.schema.test.ts` fails if the two ever drift — which is what makes
 * a database enum safe to use for a domain that lives in code.
 *
 * ── Why enums rather than free text ──────────────────────────────────────
 *
 * A status column is a closed set, and the database is where a closed set
 * should be closed. A bug that writes "printng" is then a failed write rather
 * than a row that renders as nothing forever. The cost is a migration whenever
 * a state is added, which is the correct amount of friction for adding a state
 * to a manufacturing lifecycle.
 *
 * ── Holds stay orthogonal ────────────────────────────────────────────────
 *
 * A hold is three columns beside the state, never a state. "Printing, held for
 * material" is two true facts; `paused_printing_material` is one vague one and
 * needs a twin for every state it could happen in. Phase 12 was explicit about
 * this and the schema keeps it.
 *
 * ── Ownership ────────────────────────────────────────────────────────────
 *
 * `orders.customer_id` is nullable text with no foreign key, because there is
 * no customers table: authentication arrives in Phase 17. A guest order has
 * null here and is reachable only through the Phase 12 receipt/lookup grant.
 * Phase 17 adds the reference; nothing about the column has to change.
 */

/* ------------------------------------------------------------------ *
 * Enums — transcribed from the domain unions, drift-tested
 * ------------------------------------------------------------------ */

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "awaiting_payment",
  "confirmed",
  "fulfillment_in_progress",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
  "failed",
]);

export const paymentStateEnum = pgEnum("payment_state", [
  "pending",
  "paid",
  "failed",
]);

export const orderItemStatusEnum = pgEnum("order_item_status", [
  "pending",
  "in_progress",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
  "failed",
]);

export const orderItemTypeEnum = pgEnum("order_item_type", ["catalog", "custom"]);

export const manufacturingStateEnum = pgEnum("manufacturing_state", [
  "queued",
  "design_review",
  "file_preparation",
  "material_preparation",
  "scheduled",
  "printing",
  "post_processing",
  "quality_check",
  "rework",
  "approved",
  "packaging",
  "ready_for_dispatch",
  "completed",
  "cancelled",
  "failed",
]);

export const qualityResultEnum = pgEnum("quality_result", [
  "pending",
  "approved",
  "rejected",
]);

export const holdReasonEnum = pgEnum("manufacturing_hold_reason", [
  "material_unavailable",
  "machine_issue",
  "design_review",
  "customer_action",
  "quality_issue",
  "other",
]);

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "pending",
  "ready",
  "shipped",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
]);

export const manufacturingEventTypeEnum = pgEnum("manufacturing_event_type", [
  "JOB_QUEUED",
  "DESIGN_REVIEW_STARTED",
  "DESIGN_APPROVED",
  "FILE_PREPARED",
  "MATERIAL_PREPARED",
  "JOB_SCHEDULED",
  "PRINT_STARTED",
  "PRINT_COMPLETED",
  "POST_PROCESSING_COMPLETED",
  "QUALITY_STARTED",
  "QUALITY_APPROVED",
  "QUALITY_REJECTED",
  "REWORK_STARTED",
  "REWORK_COMPLETED",
  "PACKAGING_STARTED",
  "PACKAGING_COMPLETED",
  "READY_FOR_DISPATCH",
  "JOB_COMPLETED",
  "JOB_FAILED",
  "JOB_CANCELLED",
]);

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    /** The customer-facing reference, e.g. "S3D-000184". The primary key. */
    reference: text("reference").primaryKey(),
    cartId: text("cart_id").notNull(),
    /** Null for a guest order. Gains a FK in Phase 17. */
    customerId: text("customer_id"),
    /**
     * Derived by `aggregateOrderStatus` and stored so orders can be listed and
     * filtered without recomputing. Never assigned by hand — the service
     * recomputes it on every write, and this column is a cache of that.
     */
    status: orderStatusEnum("status").notNull(),
    paymentStatus: paymentStateEnum("payment_status").notNull(),
    /** A provider reference. Never a credential and never card data. */
    paymentSessionId: text("payment_session_id"),
    paymentProvider: text("payment_provider"),
    /**
     * Totals, as the order recorded them.
     *
     * JSON because `CartTotals` carries known/unknown money — shipping and tax
     * are `{ known: false, reason }` until a real rule exists, and flattening
     * that into numeric columns would force a zero where the truth is "not
     * known". Money inside is integer whole rupees, as everywhere.
     */
    totals: jsonb("totals").notNull(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    addressCity: text("address_city").notNull(),
    addressState: text("address_state").notNull(),
    addressPostalCode: text("address_postal_code").notNull(),
    addressCountry: text("address_country").notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    provisional: boolean("provisional").notNull().default(true),
    demo: boolean("demo").notNull().default(false),
  },
  (table) => [
    // The account portal's only question: "this customer's orders, newest first".
    index("orders_customer_placed_idx").on(table.customerId, table.placedAt),
    index("orders_status_idx").on(table.status),
    // The Phase 12 lookup proves reference + email together.
    index("orders_contact_email_idx").on(table.contactEmail),
  ],
);

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderReference: text("order_reference")
      .notNull()
      /*
       * RESTRICT, not CASCADE. An order is a commercial record and its items
       * are what it agreed to make; neither is a row to remove casually, and a
       * cascade would make one careless delete take the history with it.
       */
      .references(() => orders.reference, { onDelete: "restrict" }),
    type: orderItemTypeEnum("type").notNull(),
    /** Snapshotted at the moment of ordering. The catalog will move on. */
    name: text("name").notNull(),
    spec: text("spec").notNull(),
    quantity: integer("quantity").notNull(),
    /** Whole rupees. */
    unitPrice: integer("unit_price").notNull(),
    lineTotal: integer("line_total").notNull(),
    quoteRulesVersion: text("quote_rules_version"),
    fulfillmentStatus: orderItemStatusEnum("fulfillment_status").notNull(),
    /** Set once the item joins a parcel. */
    shipmentId: text("shipment_id"),
    /** Ordering within the order, so items read back as they were bought. */
    position: integer("position").notNull().default(0),

    /* ---- Stage 16: the manufacturing file, snapshotted at ordering ---- */

    /**
     * The design the part was ordered from. A reference for the account's
     * "orders this design was made for", not the source of truth for what to
     * make — the columns below are.
     */
    sourceDesignId: text("source_design_id"),
    /**
     * The private object the part is made from, as it was when the order was
     * placed. Never rewritten: a design's record can change or be deleted after
     * ordering, and fulfilment must still make the part that was paid for.
     * Server-side only; no DTO carries it.
     */
    sourceStorageKey: text("source_storage_key"),
    /** Lowercase hex SHA-256 of the file, confirmed at verification. */
    sourceSha256: text("source_sha256"),
    sourceFileName: text("source_file_name"),
    sourceSizeBytes: integer("source_size_bytes"),
    /** Uppercase format label, e.g. "3MF". */
    sourceFormat: text("source_format"),
    sourceContentType: text("source_content_type"),
    /** Which durable geometry analysis the part was verified with, if analysable. */
    sourceAnalysisIdentity: text("source_analysis_identity"),
    /** The machine-readable configuration the quote was produced for. */
    sourceConfiguration: jsonb("source_configuration"),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderReference),
    /*
     * The storage sweep asks "does any order still need this object" before it
     * removes one. That question has to be cheap, and it has to be asked of the
     * order record rather than of the mutable design.
     */
    index("order_items_source_storage_key_idx")
      .on(table.sourceStorageKey)
      .where(sql`${table.sourceStorageKey} is not null`),
    /*
     * A file snapshot is all or nothing, and only custom parts have one. A
     * half-written snapshot is a part nobody can make.
     */
    check(
      "order_items_source_file_check",
      sql`${table.sourceStorageKey} is null or (${table.type} = 'custom' and ${table.sourceDesignId} is not null and ${table.sourceSha256} is not null and ${table.sourceFileName} is not null and ${table.sourceSizeBytes} is not null and ${table.sourceFormat} is not null)`,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Manufacturing
 * ------------------------------------------------------------------ */

export const manufacturingJobs = pgTable(
  "manufacturing_jobs",
  {
    id: text("id").primaryKey(),
    /**
     * The item this job makes. Unique: a job makes exactly one item, and an
     * item has at most one job. Only custom items have one at all — a stocked
     * product is fulfilled, not manufactured.
     */
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    orderReference: text("order_reference")
      .notNull()
      .references(() => orders.reference, { onDelete: "restrict" }),
    state: manufacturingStateEnum("state").notNull(),
    qualityResult: qualityResultEnum("quality_result").notNull().default("pending"),
    reworkCount: integer("rework_count").notNull().default(0),
    /* ---- hold: orthogonal to the state, three columns beside it ---- */
    holdReason: holdReasonEnum("hold_reason"),
    holdStartedAt: timestamp("hold_started_at", { withTimezone: true }),
    holdResolvedAt: timestamp("hold_resolved_at", { withTimezone: true }),
    /** Internal operator detail. Never crosses the customer projection. */
    holdNote: text("hold_note"),
    /** Only ever set from a real estimate. Never derived from the state. */
    estimatedCompletionAt: timestamp("estimated_completion_at", {
      withTimezone: true,
    }),
    /** Internal. Never sent to a customer. */
    machineId: text("machine_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    /**
     * Optimistic-concurrency counter.
     *
     * The repository serialises event application with `SELECT … FOR UPDATE`,
     * which is the real guard. This is here so a future caller that cannot hold
     * a lock for the duration — a queue worker, a second service — has a
     * compare-and-set to use instead.
     */
    version: integer("version").notNull().default(0),
  },
  (table) => [
    uniqueIndex("manufacturing_jobs_item_idx").on(table.orderItemId),
    index("manufacturing_jobs_order_idx").on(table.orderReference),
    index("manufacturing_jobs_state_idx").on(table.state),
  ],
);

/**
 * The event log.
 *
 * Append-only by discipline and by shape: there is no update path in the
 * repository, and every row records the transition it caused (`from_state` →
 * `to_state`) so the log can be audited against the state it produced.
 *
 * This is **not** event sourcing. The state is stored on the job and is
 * authoritative; the log says how it got there.
 *
 * `id` is the idempotency key. The same operator report delivered twice is one
 * row, and the unique primary key is what makes that true under concurrency
 * rather than only under a check-then-insert that two requests can both pass.
 */
export const manufacturingEvents = pgTable(
  "manufacturing_events",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      /* CASCADE here and nowhere else: an event has no meaning without its job,
         and a job is only ever removed with the order it belongs to. */
      .references(() => manufacturingJobs.id, { onDelete: "cascade" }),
    type: manufacturingEventTypeEnum("type").notNull(),
    fromState: manufacturingStateEnum("from_state").notNull(),
    toState: manufacturingStateEnum("to_state").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Who reported it. Internal — never sent to a customer. */
    actor: text("actor"),
    /** Internal operator note. Never sent to a customer. */
    note: text("note"),
    /** Insertion order, the tiebreak when two events share a timestamp. */
    sequence: integer("sequence").notNull(),
  },
  (table) => [
    index("manufacturing_events_job_idx").on(table.jobId, table.sequence),
    index("manufacturing_events_occurred_idx").on(table.occurredAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Shipments
 * ------------------------------------------------------------------ */

export const shipments = pgTable(
  "shipments",
  {
    id: text("id").primaryKey(),
    orderReference: text("order_reference")
      .notNull()
      .references(() => orders.reference, { onDelete: "restrict" }),
    status: shipmentStatusEnum("status").notNull(),
    /** Only ever set from a real carrier record. */
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("shipments_order_idx").on(table.orderReference)],
);

/* ------------------------------------------------------------------ *
 * Checkout idempotency
 * ------------------------------------------------------------------ */

/**
 * One row per checkout attempt, keyed by the server-derived idempotency key.
 *
 * The primary key is the mechanism. Two concurrent submissions of the same cart
 * both try to insert the same key; exactly one insert succeeds and the other is
 * told the request is already in flight. An in-memory flag cannot do this
 * across instances, and a check-then-insert cannot do it at all.
 *
 * Rows expire rather than accumulate: `expires_at` is what a sweep deletes, and
 * a reservation older than its expiry is treated as absent so a crashed request
 * does not block its own retry forever.
 */
export const checkoutReservations = pgTable(
  "checkout_reservations",
  {
    key: text("key").primaryKey(),
    /** Set when the attempt produced an order. Null while in flight. */
    orderReference: text("order_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("checkout_reservations_expires_idx").on(table.expiresAt)],
);

/* ------------------------------------------------------------------ *
 * Reference numbering
 * ------------------------------------------------------------------ */

/**
 * The order reference counter.
 *
 * A table rather than a Postgres sequence, for one reason: a sequence lives
 * outside the schema Drizzle generates, so it would have to be created by a
 * hand-edited migration and would drift from the snapshot. This is one row and
 * one atomic statement:
 *
 *   INSERT … ON CONFLICT (name) DO UPDATE SET value = value + 1 RETURNING value
 *
 * which takes a row lock and hands each caller a distinct number. Concurrent
 * checkouts queue on that row for the length of one statement.
 *
 * Gaps are expected and fine: a reference is an identifier, not a count of
 * orders. A failed checkout consumes a number and that number is never reused,
 * which is the correct behaviour — reusing one would give two attempts the same
 * customer-facing reference.
 */
export const counters = pgTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  shipments: many(shipments),
  jobs: many(manufacturingJobs),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderReference],
    references: [orders.reference],
  }),
}));

export const manufacturingJobsRelations = relations(
  manufacturingJobs,
  ({ one, many }) => ({
    item: one(orderItems, {
      fields: [manufacturingJobs.orderItemId],
      references: [orderItems.id],
    }),
    events: many(manufacturingEvents),
  }),
);

export const manufacturingEventsRelations = relations(
  manufacturingEvents,
  ({ one }) => ({
    job: one(manufacturingJobs, {
      fields: [manufacturingEvents.jobId],
      references: [manufacturingJobs.id],
    }),
  }),
);

export const orderSchema = {
  counters,
  orders,
  orderItems,
  manufacturingJobs,
  manufacturingEvents,
  shipments,
  checkoutReservations,
  ordersRelations,
  orderItemsRelations,
  manufacturingJobsRelations,
  manufacturingEventsRelations,
};

/**
 * The enum members, exported for the drift test.
 *
 * `pgEnum` keeps its values but not in a shape a test can compare directly, so
 * they are named here and asserted against the domain unions.
 */
export const ENUM_VALUES = {
  orderStatus: orderStatusEnum.enumValues,
  paymentState: paymentStateEnum.enumValues,
  orderItemStatus: orderItemStatusEnum.enumValues,
  manufacturingState: manufacturingStateEnum.enumValues,
  qualityResult: qualityResultEnum.enumValues,
  holdReason: holdReasonEnum.enumValues,
  shipmentStatus: shipmentStatusEnum.enumValues,
  manufacturingEventType: manufacturingEventTypeEnum.enumValues,
} as const;
