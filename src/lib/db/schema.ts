import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
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
 * Customers
 * ------------------------------------------------------------------ */

/**
 * The application's customers, one per authenticated subject.
 *
 * An identity mapping and nothing else: the Supabase Auth user id (the
 * provider's subject) onto the customer id every ownership column holds. No
 * email, no name, no password, no verification state — the provider owns
 * those, and a copy here would be a second answer that drifts.
 *
 * The unique index on (provider, subject) is the provisioning guarantee: two
 * concurrent first sign-ins for one user produce one row. See
 * `lib/account/customers.ts`.
 *
 * Existing `customer_id` columns do not reference this table yet. They predate
 * it, and development data is attributed to the fixed development identity,
 * which has no subject; adding the foreign keys is a separate, deliberate
 * migration once that data is gone.
 */
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    /** e.g. "supabase". Namespaces subjects so two providers cannot collide. */
    authProvider: text("auth_provider").notNull(),
    /** The provider's user id. For Supabase, `auth.users.id`. */
    authSubject: text("auth_subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("customers_auth_subject_idx").on(table.authProvider, table.authSubject),
  ],
);

/**
 * A signed-in customer's cart.
 *
 * The guest cart stays in its HttpOnly cookie. Once someone signs in, their
 * cart is this row — so it follows them between devices — and the guest cart
 * they had is merged into it once (see `lib/cart/merge.ts`).
 *
 * `lines` holds exactly what the cookie holds: identity, configuration and
 * quantity, never a price the system will honour. It is parsed through the
 * same strict reader as the cookie on every load, because a JSON column is as
 * much stored input as a cookie is.
 *
 * `merged_guest_cart_ids` is what makes the merge idempotent: a guest cart id
 * already folded in is never folded in again, however many times sign-in runs.
 */
export const customerCarts = pgTable("customer_carts", {
  customerId: text("customer_id").primaryKey(),
  /** Rotated when the cart is cleared, so a new order never reuses a checkout key. */
  cartId: text("cart_id").notNull(),
  lines: jsonb("lines").notNull(),
  mergedGuestCartIds: jsonb("merged_guest_cart_ids")
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
 * Where a design's file is in its storage lifecycle.
 *
 * Deliberately separate from manufacturing state. "Verified" says the stored
 * bytes are the bytes that were declared and are a readable model; it says
 * nothing about whether the part can be made, and nothing about an order.
 *
 *   pending   an upload target was issued. The object may or may not exist
 *             yet, which is exactly why the row exists *before* the upload:
 *             an object is never in the bucket without a row that knows its key.
 *   verified  the server has re-read the stored object and it matched.
 *   failed    verification refused it, or the upload was abandoned. The object
 *             is removed; `object_removed_at` records when that succeeded.
 *   deleted   the customer retired it. No longer listed, downloadable or
 *             orderable. The object is removed after a grace period, and never
 *             while an order still references it.
 *
 * There is no `uploaded` state between pending and verified. The server learns
 * an upload happened only when it is asked to finalise it, and finalising is
 * verifying — a state nobody could observe would be a state nobody could trust.
 */
export const designStorageStateEnum = pgEnum("design_storage_state", [
  "pending",
  "verified",
  "failed",
  "deleted",
]);

/**
 * Customer designs: a manufacturing file in private storage, and what is known
 * about it.
 *
 * Metadata only. The file's bytes are in R2 under `storage_key` and never in
 * this database. The key is generated by the server (`lib/storage/keys.ts`),
 * never accepted from a request and never a field of any response —
 * `toDesignView` and the API DTOs build the client's copy from safe fields, and
 * the key is not one of them. (The signed upload URL necessarily contains the
 * object's path; `keys.ts` explains why that grants nothing.)
 *
 * ── Constraints, and the failure each prevents ───────────────────────────
 *
 *   unique storage_key            two designs pointing at one object, so that
 *                                 deleting one would delete the other's file
 *   unique (customer, sha256)     the same file uploaded twice becoming two
 *     while pending or verified   designs; a retried upload intent converges on
 *                                 the first instead
 *   check: verified has identity  a row claiming verification with no key, no
 *                                 checksum or no verification time
 */
export const customerDesigns = pgTable(
  "customer_designs",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    /** The customer's filename, sanitised. Display metadata, never a path. */
    name: text("name").notNull(),
    /** Uppercase format label, e.g. "STL". */
    format: text("format").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Private object reference. Server-generated; never leaves the server. */
    storageKey: text("storage_key"),
    previewKey: text("preview_key"),
    storageState: designStorageStateEnum("storage_state").notNull().default("pending"),
    /** Chosen by the server from the extension; signed into the upload. */
    contentType: text("content_type"),
    /**
     * Lowercase hex SHA-256 of the file. Declared by the browser when the
     * upload is requested and *confirmed by the server* over the stored bytes
     * before the design becomes verified.
     */
    sha256: text("sha256"),
    /** When the signed upload target stops being valid. */
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** The durable geometry analysis this design was verified with, when analysable. */
    analysisIdentity: text("analysis_identity"),
    /** Stable code for why verification refused the file, e.g. `checksum_mismatch`. */
    failureCode: text("failure_code"),
    /** The same, written for the customer. */
    failureMessage: text("failure_message"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Set once the object is confirmed gone from storage. */
    objectRemovedAt: timestamp("object_removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_designs_customer_idx").on(table.customerId),
    // The operations console lists designs across customers, newest first.
    index("customer_designs_created_idx").on(table.createdAt),
    uniqueIndex("customer_designs_storage_key_idx").on(table.storageKey),
    uniqueIndex("customer_designs_customer_sha256_active_idx")
      .on(table.customerId, table.sha256)
      .where(sql`${table.storageState} in ('pending', 'verified')`),
    /*
     * The cleanup sweep's question: objects that should no longer exist and are
     * not yet confirmed removed. Partial, so it stays the size of the backlog
     * rather than the size of the table.
     */
    index("customer_designs_cleanup_idx")
      .on(table.storageState, table.updatedAt)
      .where(
        sql`${table.objectRemovedAt} is null and ${table.storageState} in ('failed', 'deleted')`,
      ),
    index("customer_designs_pending_idx")
      .on(table.uploadExpiresAt)
      .where(sql`${table.storageState} = 'pending'`),
    check(
      "customer_designs_verified_identity_check",
      sql`${table.storageState} <> 'verified' or (${table.storageKey} is not null and ${table.sha256} is not null and ${table.verifiedAt} is not null)`,
    ),
  ],
);

/**
 * Durable geometry analyses, keyed by what was analysed and how.
 *
 * ── Why the key is the content hash ──────────────────────────────────────
 *
 * The same bytes produce the same measurements, whoever uploaded them and
 * whatever they called the file. Keying by design id would re-analyse a part
 * every time it was uploaded again; keying by filename would serve one part's
 * volume for another's. `analysis_version` is in the key so a fix to the
 * analyser is never hidden behind a cached result from before it.
 *
 * ── Why this is not a leak between customers ─────────────────────────────
 *
 * A row is reachable only through a design the caller owns whose verified
 * SHA-256 matches. There is no read by hash from any request, so knowing that
 * two customers uploaded the same file requires already owning the file.
 *
 * Measurements only. Manufacturability is computed from these on every read,
 * because it depends on machine constraints that can change, and price is
 * computed elsewhere entirely.
 */
export const geometryAnalyses = pgTable(
  "geometry_analyses",
  {
    sha256: text("sha256").notNull(),
    analysisVersion: text("analysis_version").notNull(),
    /** The analysis identity the result carries, e.g. `mdl_… .v1`. */
    identity: text("identity").notNull(),
    format: text("format").notNull(),
    /** `GeometryAnalysisResult`, as JSON. Every number in it is finite. */
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.sha256, table.analysisVersion] })],
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
  INVENTORY_ITEM_TYPES,
  INVENTORY_MOVEMENT_TYPES,
  inventoryItems,
  inventoryMovements,
  inventoryPurchases,
  productConsumption,
  suppliers,
} from "./inventory.schema";
import { inventoryItems, inventoryMovements, inventoryPurchases, productConsumption, suppliers } from "./inventory.schema";
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
  customers,
  customerCarts,
  customerAddresses,
  savedItems,
  customerDesigns,
  customerDesignOrders,
  geometryAnalyses,
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
  suppliers,
  inventoryItems,
  inventoryMovements,
  inventoryPurchases,
  productConsumption,
};
