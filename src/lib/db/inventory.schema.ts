import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { INVENTORY_ITEM_TYPES, INVENTORY_MOVEMENT_TYPES, INVENTORY_PURCHASE_STATUSES } from "./inventory.constants";

/**
 * The inventory domain (Stage 22).
 *
 * ── One balance, one ledger ──────────────────────────────────────────────
 *
 * `inventory_items.current_quantity` is the balance; `inventory_movements` is
 * why it is what it is. They change together, in one transaction, with the
 * item row locked (`lib/inventory/service.ts`). The ledger is append-only —
 * the migration installs a trigger that refuses UPDATE and DELETE — so the
 * answer to "why is there 1.8 kg left?" cannot be edited after the fact.
 *
 * ── Unknown is not zero ──────────────────────────────────────────────────
 *
 * `current_quantity` is NULL until an opening balance is recorded: the stock is
 * NOT TRACKED. Zero is a count somebody made. The same holds for
 * `unit_cost` (NULL = MISSING) and the reorder thresholds.
 *
 * ── Units and money ──────────────────────────────────────────────────────
 *
 * Quantities are `numeric(14,3)` in the item's own unit (kg to the gram, pieces
 * as whole numbers). Costs are rupees per unit to the paisa, `numeric(12,2)`
 * (Stage 22.6; whole rupees before), because consumables are often bought below
 * a rupee a unit. Costs are what Reality 3D pays — never a selling price.
 *
 * ── Not Payload ──────────────────────────────────────────────────────────
 *
 * Stock is transactional. A CMS collection would put a free-text quantity field
 * in an edit form, which is exactly the uncontrolled write this domain forbids.
 */

export { INVENTORY_ITEM_TYPES, INVENTORY_MOVEMENT_TYPES, INVENTORY_PURCHASE_STATUSES };

export const inventoryItemTypeEnum = pgEnum("inventory_item_type", INVENTORY_ITEM_TYPES);
export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", INVENTORY_MOVEMENT_TYPES);
export const inventoryPurchaseStatusEnum = pgEnum("inventory_purchase_status", INVENTORY_PURCHASE_STATUSES);

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

export const suppliers = pgTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** e.g. "Filament", "Packaging". Free text: the business names its own kinds. */
    supplierType: text("supplier_type"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    /** Whole days, as the supplier states it. NULL when not stated. */
    leadTimeDays: integer("lead_time_days"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("suppliers_name_idx").on(sql`lower(${table.name})`),
    check("suppliers_lead_time_check", sql`${table.leadTimeDays} is null or ${table.leadTimeDays} >= 0`),
  ],
);

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    /**
     * What this definition stands for, stable across syncs: `material:pla:black`,
     * `product:p-101`. NULL for an item an operator created by hand. The unique
     * index is what makes creating definitions idempotent.
     */
    definitionKey: text("definition_key"),
    /** Assigned by the business. Never generated. */
    sku: text("sku"),
    /** Display name. For a finished product, the catalog name when defined; the catalog stays authoritative. */
    name: text("name").notNull(),
    itemType: inventoryItemTypeEnum("item_type").notNull(),
    /** Grouping for the inventory page, e.g. "Filament". */
    category: text("category"),
    material: text("material"),
    colour: text("colour"),
    /** Unit of measure every quantity and cost of this item is in, e.g. "kg", "pcs". */
    unit: text("unit").notNull(),
    /** The catalog product id (`p-101`) for a finished product. The catalog owns its name and SKU. */
    productId: text("product_id"),
    active: boolean("active").notNull().default(true),
    /** Stage 22.6: the supplier this item is normally bought from. Purchases still name their own. */
    supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    /** Stage 22.6: the operator's notes, e.g. what a consumable is used for. */
    notes: text("notes"),

    /* ---- stock state: server-maintained ---- */
    /** NULL = NOT TRACKED. Changed only together with a movement. */
    currentQuantity: numeric("current_quantity", { precision: 14, scale: 3 }),
    openingQuantity: numeric("opening_quantity", { precision: 14, scale: 3 }),
    openedAt: timestamp("opened_at", { withTimezone: true }),

    /* ---- thresholds and cost: operator-set, NULL = not set ---- */
    reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 }),
    targetStock: numeric("target_stock", { precision: 14, scale: 3 }),
    /**
     * Rupees per unit, to the paisa (Stage 22.6; whole rupees before). NULL =
     * MISSING. The latest recorded cost. Consumables are often bought below a
     * rupee a unit, e.g. ₹0.50 a label.
     */
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
    /** Where the cost came from: `purchase:<id>`, `opening:<movement>` or `manual`. */
    unitCostSource: text("unit_cost_source"),
    unitCostUpdatedAt: timestamp("unit_cost_updated_at", { withTimezone: true }),
    unitCostUpdatedBy: text("unit_cost_updated_by"),

    /** Incremented with every balance change. */
    version: integer("version").notNull().default(0),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_items_definition_idx").on(table.definitionKey),
    uniqueIndex("inventory_items_sku_idx").on(table.sku),
    uniqueIndex("inventory_items_product_idx").on(table.productId),
    index("inventory_items_type_idx").on(table.itemType, table.active),
    index("inventory_items_supplier_idx").on(table.supplierId),
    check("inventory_items_quantity_check", sql`${table.currentQuantity} is null or ${table.currentQuantity} >= 0`),
    check("inventory_items_thresholds_check", sql`(${table.reorderLevel} is null or ${table.reorderLevel} >= 0) and (${table.targetStock} is null or ${table.targetStock} >= 0)`),
    check("inventory_items_cost_check", sql`${table.unitCost} is null or ${table.unitCost} >= 0`),
    check("inventory_items_product_check", sql`${table.productId} is null or ${table.itemType} = 'FINISHED_PRODUCT'`),
  ],
);

/* ------------------------------------------------------------------ *
 * Movements — append-only
 * ------------------------------------------------------------------ */

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    type: inventoryMovementTypeEnum("type").notNull(),
    /** When it happened in the business, as the operator states it. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Signed change to the balance: positive in, negative out. */
    quantityDelta: numeric("quantity_delta", { precision: 14, scale: 3 }).notNull(),
    /** The balance immediately after this movement. */
    balanceAfter: numeric("balance_after", { precision: 14, scale: 3 }).notNull(),
    /** Whole rupees per unit, when this movement carries a cost. */
    /** Rupees per unit, to the paisa (Stage 22.6). */
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
    /** `purchase`, `manufacturing_job`, `order`, `manual`. */
    referenceType: text("reference_type").notNull(),
    referenceId: text("reference_id"),
    supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    /** The operator's reason. Required for adjustments. */
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_movements_item_idx").on(table.itemId, table.occurredAt),
    index("inventory_movements_occurred_idx").on(table.occurredAt),
    index("inventory_movements_type_idx").on(table.type),
    index("inventory_movements_reference_idx").on(table.referenceType, table.referenceId),
    check("inventory_movements_balance_check", sql`${table.balanceAfter} >= 0`),
    check("inventory_movements_cost_check", sql`${table.unitCost} is null or ${table.unitCost} >= 0`),
  ],
);

/* ------------------------------------------------------------------ *
 * Purchases — the one procurement step there is
 * ------------------------------------------------------------------ */

export const inventoryPurchases = pgTable(
  "inventory_purchases",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    /** Rupees per unit, to the paisa (Stage 22.6). */
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
    /** The supplier's invoice or order number. */
    reference: text("reference"),
    status: inventoryPurchaseStatusEnum("status").notNull().default("ordered"),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedBy: text("received_by"),
    /** The PURCHASE movement the receipt wrote. */
    movementId: text("movement_id").references(() => inventoryMovements.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_purchases_status_idx").on(table.status, table.createdAt),
    index("inventory_purchases_item_idx").on(table.itemId),
    check("inventory_purchases_quantity_check", sql`${table.quantity} > 0`),
    check("inventory_purchases_cost_check", sql`${table.unitCost} is null or ${table.unitCost} >= 0`),
    check(
      "inventory_purchases_receipt_check",
      sql`(${table.status} = 'received') = (${table.movementId} is not null and ${table.receivedAt} is not null)`,
    ),
  ],
);

/* ------------------------------------------------------------------ *
 * Product consumption — expected inputs per finished unit (Stage 22.7)
 * ------------------------------------------------------------------ */

/**
 * What the business expects one finished unit of a product to consume: a
 * manual bill of materials. A reference, never a movement — nothing here
 * changes stock. Actual use is still recorded in `inventory_movements`.
 *
 * `product_id` is the catalog product id (`p-101`), the same stable id order
 * lines and finished-product items use; the catalog lives in Payload, so there
 * is no foreign key to it. The input is an existing inventory item (raw
 * material or consumable); its name, unit and cost are read from there.
 *
 * `quantity` is in the item's own unit (85 g of a kg item is 0.085). A line is
 * removed by deactivating it, so who removed what, and when, stays on record.
 * At most one active line per product and item.
 */
export const productConsumption = pgTable(
  "product_consumption",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_consumption_active_idx").on(table.productId, table.inventoryItemId).where(sql`${table.active}`),
    index("product_consumption_product_idx").on(table.productId),
    index("product_consumption_item_idx").on(table.inventoryItemId),
    check("product_consumption_quantity_check", sql`${table.quantity} > 0`),
  ],
);

export const inventorySchema = {
  suppliers,
  inventoryItems,
  inventoryMovements,
  inventoryPurchases,
  productConsumption,
};
