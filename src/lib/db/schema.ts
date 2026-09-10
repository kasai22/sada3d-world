import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The application's own tables.
 *
 * ── One database, two owners ─────────────────────────────────────────────
 *
 * Payload owns the CMS tables and generates its own schema from its
 * collections. This file owns the transactional tables the domain writes to,
 * and they are deliberately *not* Payload collections: a saved address is not
 * editorial content, and putting it behind CMS CRUD would mean a content editor
 * could change where a customer's order is delivered.
 *
 * Both live in the same PostgreSQL database, reached by the same DATABASE_URL.
 * There is no second database and no second dialect.
 *
 * ── What is here, and what is not ────────────────────────────────────────
 *
 * Here: the Phase 13 customer records — addresses, saved items, design
 * metadata — and, since Phase 15, the Phase 12 order domain: orders, items,
 * manufacturing jobs, their event log, shipments and checkout reservations.
 * The order tables are declared in `orders.schema.ts` and re-exported below.
 *
 * Phase 15 is also where per-job exclusion stopped being a promise: the
 * repository serialises event application with `SELECT … FOR UPDATE` inside a
 * transaction, so the database is the concurrency authority rather than a
 * process-local promise chain.
 *
 * ── Money and time ───────────────────────────────────────────────────────
 *
 * Money is integer whole rupees, as everywhere in the system. Timestamps are
 * `timestamptz`, stored UTC, rendered in the reader's timezone by `LocalTime`.
 */

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

/**
 * Saved delivery addresses.
 *
 * The column set mirrors `CustomerAddress` in `lib/account/types.ts`, which in
 * turn embeds the `ShippingAddress` checkout already validates. One address
 * shape, one set of rules.
 *
 * `customer_id` is plain text rather than a foreign key: there is no customers
 * table, because there is no authentication until Phase 17. When Supabase Auth
 * lands, this column is what gains the reference.
 */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    label: text("label"),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every read is "this customer's addresses". This is the index for it.
    index("customer_addresses_customer_idx").on(table.customerId),
    /**
     * The default-address invariant, held by the database.
     *
     * A partial unique index rather than application code: two requests that
     * both promote an address can interleave between a read and a write, and
     * one of them has to lose. Postgres is what makes one of them lose. The
     * service still orders its writes so the losing case is rare; this is what
     * makes it impossible rather than unlikely.
     */
    uniqueIndex("customer_addresses_one_default_idx")
      .on(table.customerId)
      .where(sql`${table.isDefault}`),
  ],
);

/* ------------------------------------------------------------------ *
 * Saved items
 * ------------------------------------------------------------------ */

/**
 * Marketplace parts a customer kept for later.
 *
 * A reference and nothing else. The catalog owns the name, the price and
 * whether the part still exists; copying any of that here would show the
 * price as it was on the day it was saved, forever.
 *
 * `product_id` has no foreign key on purpose. Catalog products live in the CMS
 * tables and can be unpublished or removed, and a saved item that pointed at a
 * removed row would either block the delete or vanish silently. Phase 13's
 * behaviour is the honest one: the entry survives, resolves to nothing, and the
 * account page says so.
 */
export const savedItems = pgTable(
  "saved_items",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    productId: text("product_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("saved_items_customer_idx").on(table.customerId),
    // Saving the same part twice is one saved item. The service is idempotent
    // and this is what makes it true under concurrency as well.
    uniqueIndex("saved_items_customer_product_idx").on(
      table.customerId,
      table.productId,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

/**
 * Customer design metadata.
 *
 * Metadata only, and that is the whole point. `storage_key` is nullable because
 * **no object exists yet**: `lib/custom-print/storage.ts` still keeps an
 * uploaded model in the browser, and Phase 16 is what puts it in R2. A row here
 * with a key that resolves to nothing would be a record claiming a file exists.
 *
 * So the table is created, the ownership scoping is real and tested, and the
 * repository still reports designs as unavailable until there is storage behind
 * them. The column is here so Phase 16 adds a writer, not a migration.
 *
 * The key is never sent to a browser. `toDesignView` builds the client's copy
 * from safe fields, and this column is not one of them.
 */
export const customerDesigns = pgTable(
  "customer_designs",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    name: text("name").notNull(),
    /** Uppercase format label, e.g. "STL". */
    format: text("format").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Private object reference. Null until Phase 16 stores something. */
    storageKey: text("storage_key"),
    previewKey: text("preview_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("customer_designs_customer_idx").on(table.customerId)],
);

/**
 * Which orders a design has been manufactured for.
 *
 * A join table rather than an array column, because this is a relationship and
 * it will gain a foreign key the moment orders move into Postgres. It carries
 * `customer_id` as well so the join can be scoped without reaching through the
 * design row — a query that forgets the scope returns nothing rather than
 * someone else's order reference.
 */
export const customerDesignOrders = pgTable(
  "customer_design_orders",
  {
    designId: text("design_id")
      .notNull()
      .references(() => customerDesigns.id, { onDelete: "cascade" }),
    customerId: text("customer_id").notNull(),
    /**
     * The Phase 12 order reference, e.g. "S3D-000184".
     *
     * No foreign key: orders are still in the in-process store. When they land
     * in Postgres this gains a reference with ON DELETE RESTRICT — an order a
     * design was made for is not a row to remove casually.
     */
    orderReference: text("order_reference").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.designId, table.orderReference] }),
    index("customer_design_orders_customer_idx").on(table.customerId),
  ],
);

export { ENUM_VALUES } from "./orders.schema";
export {
  checkoutReservations,
  counters,
  manufacturingEvents,
  manufacturingJobs,
  orderItems,
  orders,
  shipments,
} from "./orders.schema";

import {
  checkoutReservations,
  counters,
  manufacturingEvents,
  manufacturingEventsRelations,
  manufacturingJobs,
  manufacturingJobsRelations,
  orderItems,
  orderItemsRelations,
  orders,
  ordersRelations,
  shipments,
} from "./orders.schema";

export const appSchema = {
  customerAddresses,
  savedItems,
  customerDesigns,
  customerDesignOrders,
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
