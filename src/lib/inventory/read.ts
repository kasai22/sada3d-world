import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/db/client";
import {
  inventoryItems,
  inventoryMovements,
  inventoryPurchases,
  manufacturingEvents,
  manufacturingJobs,
  orderItems,
  suppliers,
} from "@/lib/db/schema";
import type { OperatorSession } from "@/lib/ops/operator";

import {
  INVENTORY_GROUPS,
  INVENTORY_ITEM_TYPES,
  fromNumeric,
  groupOf,
  paiseFromNumeric,
  reconcile,
  reorderQuantity,
  rupees,
  stockStatus,
  stockValue,
  type InventoryGroup,
  type InventoryItemType,
  type InventoryMovementType,
  type Reconciliation,
  type StockStatus,
} from "./rules";

/**
 * Inventory reads (Stage 22; Stage 22.6 adds consumables, suppliers on items,
 * per-group figures and filters). Operator-only, aggregated in the database.
 *
 * The summary is one aggregate query; the item list is the definitions (tens,
 * not thousands) capped at `ITEM_LIMIT` and filtered in SQL; movements are
 * always a page. Nothing here loads the ledger to add it up in the process.
 *
 * Costs are rupees to the paisa (`unitCost: 0.5` is fifty paise per unit of the
 * item's own unit). A missing cost is `null`, never 0.
 */

export const ITEM_LIMIT = 500;
export const MOVEMENT_PAGE_SIZE = 20;

export interface InventoryItemView {
  id: string;
  name: string;
  sku: string | null;
  itemType: InventoryItemType;
  group: InventoryGroup;
  category: string | null;
  material: string | null;
  colour: string | null;
  unit: string;
  productId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  notes: string | null;
  active: boolean;
  /** Milli-units; null = not tracked. */
  current: number | null;
  reorderLevel: number | null;
  targetStock: number | null;
  /** Rupees per unit, to the paisa; null = missing. */
  unitCost: number | null;
  unitCostSource: string | null;
  status: StockStatus;
  reorderQuantity: number | null;
  /** Rupees, to the paisa; null when quantity or cost is unknown. */
  value: number | null;
  openedAt: string | null;
  updatedAt: string;
}

export interface StockCounts {
  items: number;
  tracked: number;
  notTracked: number;
  outOfStock: number;
  /** Above zero and at or below the reorder level. */
  lowStock: number;
  /** Out of stock or low. */
  reorderRequired: number;
  /** Tracked with no reorder level set. */
  noReorderLevel: number;
  /** Tracked with no unit cost. */
  missingCost: number;
  /** Sum of quantity × cost over tracked items that have a cost, rupees to the paisa. */
  valueOfCosted: number;
  /** True only when every tracked item has a cost — then `valueOfCosted` is the value. */
  valuationComplete: boolean;
}

export interface InventorySummary extends StockCounts {
  openPurchases: number;
  suppliers: number;
  /** Stage 22.6: the same counts for raw materials, finished products and consumables. */
  byGroup: Record<InventoryGroup, StockCounts>;
}

export interface MovementView {
  id: string;
  itemId: string;
  itemName: string;
  itemType: InventoryItemType;
  unit: string;
  type: InventoryMovementType;
  occurredAt: string;
  delta: number;
  balanceAfter: number;
  /** Rupees per unit, to the paisa. */
  unitCost: number | null;
  referenceType: string;
  referenceId: string | null;
  supplierName: string | null;
  notes: string | null;
  createdBy: string;
}

export interface PurchaseView {
  id: string;
  itemId: string;
  itemName: string;
  itemType: InventoryItemType;
  unit: string;
  supplierName: string | null;
  quantity: number;
  /** Rupees per unit, to the paisa. */
  unitCost: number | null;
  reference: string | null;
  createdAt: string;
  createdBy: string;
}

export interface SupplierView {
  id: string;
  name: string;
  supplierType: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  notes: string | null;
  active: boolean;
  /** Active items that name this supplier as their usual source. */
  items: number;
}

const optionalIso = (value: Date | null) => (value ? value.toISOString() : null);
const costOf = (value: string | null) => {
  const paise = paiseFromNumeric(value);
  return paise === null ? null : rupees(paise);
};

function toItemView(row: typeof inventoryItems.$inferSelect, supplierName: string | null = null): InventoryItemView {
  const levels = {
    current: fromNumeric(row.currentQuantity),
    reorderLevel: fromNumeric(row.reorderLevel),
    targetStock: fromNumeric(row.targetStock),
  };
  const unitCost = costOf(row.unitCost);
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    itemType: row.itemType,
    group: groupOf(row.itemType),
    category: row.category,
    material: row.material,
    colour: row.colour,
    unit: row.unit,
    productId: row.productId,
    supplierId: row.supplierId,
    supplierName,
    notes: row.notes,
    active: row.active,
    ...levels,
    unitCost,
    unitCostSource: row.unitCostSource,
    status: stockStatus(levels),
    reorderQuantity: reorderQuantity(levels),
    value: stockValue(levels.current, unitCost),
    openedAt: optionalIso(row.openedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Summary — one query, once per request
 * ------------------------------------------------------------------ */

const EMPTY_COUNTS: StockCounts = {
  items: 0,
  tracked: 0,
  notTracked: 0,
  outOfStock: 0,
  lowStock: 0,
  reorderRequired: 0,
  noReorderLevel: 0,
  missingCost: 0,
  valueOfCosted: 0,
  valuationComplete: false,
};

/** Adds per-type rows into counts. Pure. Values are paise until the end. */
export function combineCounts(
  rows: readonly {
    items: number;
    tracked: number;
    outOfStock: number;
    lowStock: number;
    noReorderLevel: number;
    missingCost: number;
    valuePaise: number;
  }[],
): StockCounts {
  const sum = (key: keyof (typeof rows)[number]) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const items = sum("items");
  const tracked = sum("tracked");
  const outOfStock = sum("outOfStock");
  const lowStock = sum("lowStock");
  const missingCost = sum("missingCost");
  return {
    items,
    tracked,
    notTracked: items - tracked,
    outOfStock,
    lowStock,
    reorderRequired: outOfStock + lowStock,
    noReorderLevel: sum("noReorderLevel"),
    missingCost,
    valueOfCosted: sum("valuePaise") / 100,
    valuationComplete: tracked > 0 && missingCost === 0,
  };
}

const loadSummary = cache(async (): Promise<InventorySummary> => {
  const db = await getDatabase();
  const q = inventoryItems.currentQuantity;
  const level = inventoryItems.reorderLevel;
  const n = (expression: SQL) => sql<number>`${expression}`.mapWith(Number);

  const [rows, [purchases], [supplierCount]] = await Promise.all([
    db
      .select({
        itemType: inventoryItems.itemType,
        items: n(sql`count(*)`),
        tracked: n(sql`count(*) filter (where ${q} is not null)`),
        outOfStock: n(sql`count(*) filter (where ${q} = 0)`),
        lowStock: n(sql`count(*) filter (where ${q} > 0 and ${level} is not null and ${q} <= ${level})`),
        noReorderLevel: n(sql`count(*) filter (where ${q} is not null and ${level} is null)`),
        missingCost: n(sql`count(*) filter (where ${q} is not null and ${inventoryItems.unitCost} is null)`),
        valuePaise: n(sql`coalesce(round(sum(${q} * ${inventoryItems.unitCost}) * 100), 0)`),
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.active, true))
      .groupBy(inventoryItems.itemType),
    db.select({ value: count() }).from(inventoryPurchases).where(eq(inventoryPurchases.status, "ordered")),
    db.select({ value: count() }).from(suppliers).where(eq(suppliers.active, true)),
  ]);

  const byGroup = Object.fromEntries(
    INVENTORY_GROUPS.map((group) => [group, combineCounts(rows.filter((row) => groupOf(row.itemType) === group))]),
  ) as Record<InventoryGroup, StockCounts>;

  return {
    ...(rows.length === 0 ? EMPTY_COUNTS : combineCounts(rows)),
    openPurchases: Number(purchases?.value ?? 0),
    suppliers: Number(supplierCount?.value ?? 0),
    byGroup,
  };
});

export async function getInventorySummary(_operator: OperatorSession): Promise<InventorySummary> {
  return loadSummary();
}

/* ------------------------------------------------------------------ *
 * Lists
 * ------------------------------------------------------------------ */

export interface ItemFilter {
  includeInactive?: boolean;
  group?: InventoryGroup;
  /** Name, SKU, material, colour or category. */
  q?: string;
  material?: string;
  colour?: string;
  supplierId?: string;
  category?: string;
  status?: StockStatus;
}

const typesOf = (group: InventoryGroup): InventoryItemType[] => INVENTORY_ITEM_TYPES.filter((type) => groupOf(type) === group);
const like = (text: string) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

export async function listInventoryItems(_operator: OperatorSession, filter: ItemFilter = {}): Promise<InventoryItemView[]> {
  const db = await getDatabase();
  const conditions: (SQL | undefined)[] = [
    filter.includeInactive ? undefined : eq(inventoryItems.active, true),
    filter.group ? inArray(inventoryItems.itemType, typesOf(filter.group)) : undefined,
    filter.material ? eq(inventoryItems.material, filter.material) : undefined,
    filter.colour ? eq(inventoryItems.colour, filter.colour) : undefined,
    filter.supplierId ? eq(inventoryItems.supplierId, filter.supplierId) : undefined,
    filter.category ? eq(inventoryItems.category, filter.category) : undefined,
    filter.q
      ? or(
          ilike(inventoryItems.name, like(filter.q)),
          ilike(inventoryItems.sku, like(filter.q)),
          ilike(inventoryItems.material, like(filter.q)),
          ilike(inventoryItems.colour, like(filter.q)),
          ilike(inventoryItems.category, like(filter.q)),
          ilike(inventoryItems.productId, like(filter.q)),
        )
      : undefined,
  ];

  const rows = await db
    .select({ item: inventoryItems, supplierName: suppliers.name })
    .from(inventoryItems)
    .leftJoin(suppliers, eq(suppliers.id, inventoryItems.supplierId))
    .where(and(...conditions))
    .orderBy(asc(inventoryItems.itemType), asc(inventoryItems.category), asc(inventoryItems.material), asc(inventoryItems.colour), asc(inventoryItems.name))
    .limit(ITEM_LIMIT);

  const views = rows.map(({ item, supplierName }) => toItemView(item, supplierName));
  return filter.status ? views.filter((view) => view.status === filter.status) : views;
}

export async function listInventoryMovements(
  _operator: OperatorSession,
  options: { page?: number; itemId?: string; group?: InventoryGroup } = {},
): Promise<{ rows: MovementView[]; total: number; page: number; pageCount: number }> {
  const db = await getDatabase();
  const page = Math.max(1, Math.min(options.page ?? 1, 10_000));
  const where = and(
    options.itemId ? eq(inventoryMovements.itemId, options.itemId) : undefined,
    options.group ? inArray(inventoryItems.itemType, typesOf(options.group)) : undefined,
  );

  const [rows, [total]] = await Promise.all([
    db
      .select({
        movement: inventoryMovements,
        itemName: inventoryItems.name,
        itemType: inventoryItems.itemType,
        unit: inventoryItems.unit,
        supplierName: suppliers.name,
      })
      .from(inventoryMovements)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.itemId))
      .leftJoin(suppliers, eq(suppliers.id, inventoryMovements.supplierId))
      .where(where)
      .orderBy(desc(inventoryMovements.occurredAt), desc(inventoryMovements.createdAt))
      .limit(MOVEMENT_PAGE_SIZE)
      .offset((page - 1) * MOVEMENT_PAGE_SIZE),
    db
      .select({ value: count() })
      .from(inventoryMovements)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.itemId))
      .where(where),
  ]);

  const totalCount = Number(total?.value ?? 0);
  return {
    rows: rows.map(({ movement, itemName, itemType, unit, supplierName }) => ({
      id: movement.id,
      itemId: movement.itemId,
      itemName,
      itemType,
      unit,
      type: movement.type,
      occurredAt: movement.occurredAt.toISOString(),
      delta: fromNumeric(movement.quantityDelta) ?? 0,
      balanceAfter: fromNumeric(movement.balanceAfter) ?? 0,
      unitCost: costOf(movement.unitCost),
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      supplierName,
      notes: movement.notes,
      createdBy: movement.createdBy,
    })),
    total: totalCount,
    page,
    pageCount: Math.max(1, Math.ceil(totalCount / MOVEMENT_PAGE_SIZE)),
  };
}

export async function listOpenPurchases(_operator: OperatorSession): Promise<PurchaseView[]> {
  const db = await getDatabase();
  const rows = await db
    .select({
      purchase: inventoryPurchases,
      itemName: inventoryItems.name,
      itemType: inventoryItems.itemType,
      unit: inventoryItems.unit,
      supplierName: suppliers.name,
    })
    .from(inventoryPurchases)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryPurchases.itemId))
    .leftJoin(suppliers, eq(suppliers.id, inventoryPurchases.supplierId))
    .where(eq(inventoryPurchases.status, "ordered"))
    .orderBy(asc(inventoryPurchases.createdAt))
    .limit(100);
  return rows.map(({ purchase, itemName, itemType, unit, supplierName }) => ({
    id: purchase.id,
    itemId: purchase.itemId,
    itemName,
    itemType,
    unit,
    supplierName,
    quantity: fromNumeric(purchase.quantity) ?? 0,
    unitCost: costOf(purchase.unitCost),
    reference: purchase.reference,
    createdAt: purchase.createdAt.toISOString(),
    createdBy: purchase.createdBy,
  }));
}

export async function listSuppliers(_operator: OperatorSession): Promise<SupplierView[]> {
  const db = await getDatabase();
  const itemCount = sql<number>`(select count(*) from ${inventoryItems} where ${inventoryItems.supplierId} = ${suppliers.id} and ${inventoryItems.active})`.mapWith(Number);
  const rows = await db
    .select({ supplier: suppliers, items: itemCount })
    .from(suppliers)
    .orderBy(desc(suppliers.active), asc(suppliers.name))
    .limit(200);
  return rows.map(({ supplier, items }) => ({
    id: supplier.id,
    name: supplier.name,
    supplierType: supplier.supplierType,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    leadTimeDays: supplier.leadTimeDays,
    paymentTerms: supplier.paymentTerms,
    notes: supplier.notes,
    active: supplier.active,
    items: Number(items ?? 0),
  }));
}

/* ------------------------------------------------------------------ *
 * Jobs material can be recorded against (Stage 22.6)
 * ------------------------------------------------------------------ */

export interface UsableJob {
  id: string;
  orderReference: string;
  itemName: string;
  state: string;
}

export const USABLE_JOB_LIMIT = 50;

/**
 * Production jobs that have started printing, newest first — the only jobs the
 * ledger accepts usage against. Offered as a choice so an operator never types
 * a job id.
 */
export async function listUsableJobs(_operator: OperatorSession): Promise<UsableJob[]> {
  const db = await getDatabase();
  const printed = db
    .select({ jobId: manufacturingEvents.jobId })
    .from(manufacturingEvents)
    .where(eq(manufacturingEvents.type, "PRINT_STARTED"));
  const rows = await db
    .select({
      id: manufacturingJobs.id,
      orderReference: manufacturingJobs.orderReference,
      itemName: orderItems.name,
      state: manufacturingJobs.state,
    })
    .from(manufacturingJobs)
    .innerJoin(orderItems, eq(orderItems.id, manufacturingJobs.orderItemId))
    .where(inArray(manufacturingJobs.id, printed))
    .orderBy(desc(manufacturingJobs.updatedAt))
    .limit(USABLE_JOB_LIMIT);
  return rows.map((row) => ({ ...row, state: String(row.state) }));
}

/* ------------------------------------------------------------------ *
 * One item: why it has what it has
 * ------------------------------------------------------------------ */

export interface ItemLedger {
  item: InventoryItemView;
  reconciliation: Reconciliation;
}

export async function getItemLedger(_operator: OperatorSession, itemId: string): Promise<ItemLedger | undefined> {
  const db = await getDatabase();
  const [[row], sums] = await Promise.all([
    db
      .select({ item: inventoryItems, supplierName: suppliers.name })
      .from(inventoryItems)
      .leftJoin(suppliers, eq(suppliers.id, inventoryItems.supplierId))
      .where(eq(inventoryItems.id, itemId))
      .limit(1),
    db
      .select({
        type: inventoryMovements.type,
        total: sql<string>`sum(${inventoryMovements.quantityDelta})::text`,
      })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.itemId, itemId)))
      .groupBy(inventoryMovements.type),
  ]);
  if (!row) return undefined;

  const item = toItemView(row.item, row.supplierName);
  const deltas = Object.fromEntries(sums.map((sum) => [sum.type, fromNumeric(sum.total) ?? 0]));
  return { item, reconciliation: reconcile(deltas, item.current) };
}
