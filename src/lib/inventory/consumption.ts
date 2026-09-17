import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { inventoryItems, productConsumption } from "@/lib/db/schema";
import type { OperatorSession } from "@/lib/ops/operator";

import {
  MAX_LINE_NOTE,
  isConsumableInput,
  lineCostPaise,
  parseConsumptionLines,
  toFriendly,
  toItemUnit,
  type ConsumptionLineInput,
  type LineErrors,
} from "./consumption-rules";
import {
  ITEM_TYPE_LABEL,
  fromNumeric,
  groupOf,
  paiseFromNumeric,
  parseQuantity,
  rupees,
  stockStatus,
  toNumeric,
  type InventoryGroup,
  type InventoryItemType,
  type StockStatus,
} from "./rules";

/**
 * Product consumption (Stage 22.7): what one finished unit of a product is
 * expected to use, as a list of existing inventory items and quantities.
 *
 *   · A reference, not a movement. Nothing here reads or writes stock; actual
 *     use is recorded as an inventory movement, by an operator, when it happens.
 *   · The inventory item is the source of truth for the input's name, unit,
 *     supplier, cost and stock. A line holds only the item id, the quantity in
 *     the item's unit, and a note.
 *   · Expected cost is derived from the item's recorded unit cost when there is
 *     one, and is never stored, never a price.
 *
 * Operator-only, like every inventory read and write.
 */

type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const newId = () => `pcn_${crypto.randomUUID()}`;

export interface ConsumptionInputOption {
  id: string;
  name: string;
  sku: string | null;
  itemType: InventoryItemType;
  group: InventoryGroup;
  typeLabel: string;
  material: string | null;
  colour: string | null;
  category: string | null;
  unit: string;
  status: StockStatus;
  /** Rupees per item unit; null when missing. Read-only, for the estimate. */
  unitCost: number | null;
}

export interface ConsumptionLine {
  id: string;
  inventoryItemId: string;
  item: ConsumptionInputOption & { active: boolean };
  /** Milli-units of the item's unit. */
  quantity: number;
  /** The same quantity in the friendliest unit, for display and editing. */
  display: { milli: number; unit: string };
  notes: string | null;
  /** Paise per finished unit, from the item's recorded cost; null when the cost is missing. */
  costPaise: number | null;
  updatedBy: string;
  updatedAt: string;
}

export interface ProductConsumption {
  productId: string;
  lines: ConsumptionLine[];
  /** Paise per finished unit, only when every line has a cost. */
  totalCostPaise: number | null;
  /** Paise over the lines that have a cost. */
  costedPaise: number;
  missingCost: number;
  /** Lines whose input is not tracked, or tracked and at zero. */
  notStocked: number;
}

function optionOf(row: typeof inventoryItems.$inferSelect): ConsumptionInputOption {
  const paise = paiseFromNumeric(row.unitCost);
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    itemType: row.itemType,
    group: groupOf(row.itemType),
    typeLabel: ITEM_TYPE_LABEL[row.itemType],
    material: row.material,
    colour: row.colour,
    category: row.category,
    unit: row.unit,
    status: stockStatus({ current: fromNumeric(row.currentQuantity), reorderLevel: fromNumeric(row.reorderLevel), targetStock: null }),
    unitCost: paise === null ? null : rupees(paise),
  };
}

/** Summarises lines. Pure. */
export function summariseConsumption(productId: string, lines: ConsumptionLine[]): ProductConsumption {
  const costed = lines.filter((line) => line.costPaise !== null);
  return {
    productId,
    lines,
    costedPaise: costed.reduce((sum, line) => sum + (line.costPaise ?? 0), 0),
    totalCostPaise: lines.length > 0 && costed.length === lines.length ? costed.reduce((sum, line) => sum + (line.costPaise ?? 0), 0) : null,
    missingCost: lines.length - costed.length,
    notStocked: lines.filter((line) => line.item.status === "NOT_TRACKED" || line.item.status === "OUT_OF_STOCK").length,
  };
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

async function readLines(db: AppDatabase | Transaction, productIds: readonly string[]): Promise<Map<string, ConsumptionLine[]>> {
  const byProduct = new Map<string, ConsumptionLine[]>(productIds.map((id) => [id, []]));
  if (productIds.length === 0) return byProduct;
  const rows = await db
    .select({ line: productConsumption, item: inventoryItems })
    .from(productConsumption)
    .innerJoin(inventoryItems, eq(inventoryItems.id, productConsumption.inventoryItemId))
    .where(and(inArray(productConsumption.productId, [...productIds]), eq(productConsumption.active, true)))
    .orderBy(asc(inventoryItems.itemType), asc(inventoryItems.name));

  for (const { line, item } of rows) {
    const quantity = fromNumeric(line.quantity) ?? 0;
    const option = optionOf(item);
    byProduct.get(line.productId)?.push({
      id: line.id,
      inventoryItemId: line.inventoryItemId,
      item: { ...option, active: item.active },
      quantity,
      display: toFriendly(quantity, item.unit),
      notes: line.notes,
      costPaise: lineCostPaise(quantity, option.unitCost),
      updatedBy: line.updatedBy,
      updatedAt: line.updatedAt.toISOString(),
    });
  }
  return byProduct;
}

/** A product's expected inputs per finished unit. An empty list means "not defined", never "uses nothing". */
export async function getProductConsumption(_operator: OperatorSession, productId: string): Promise<ProductConsumption> {
  if (!PRODUCT_ID.test(productId)) return summariseConsumption(productId, []);
  const db = await getDatabase();
  const lines = (await readLines(db, [productId])).get(productId) ?? [];
  return summariseConsumption(productId, lines);
}

/** Several products at once — one query — for order and job views. */
export async function getConsumptionForProducts(
  _operator: OperatorSession,
  productIds: readonly string[],
): Promise<Map<string, ProductConsumption>> {
  const ids = [...new Set(productIds.filter((id) => PRODUCT_ID.test(id)))];
  const db = await getDatabase();
  const lines = await readLines(db, ids);
  return new Map(ids.map((id) => [id, summariseConsumption(id, lines.get(id) ?? [])]));
}

/** Items a product may consume: active raw materials and consumables. Never finished stock. */
export async function listConsumptionInputs(_operator: OperatorSession): Promise<ConsumptionInputOption[]> {
  const db = await getDatabase();
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.active, true), ne(inventoryItems.itemType, "FINISHED_PRODUCT")))
    .orderBy(asc(inventoryItems.itemType), asc(inventoryItems.material), asc(inventoryItems.colour), asc(inventoryItems.name));
  return rows.map(optionOf);
}

export interface ItemUsage {
  productId: string;
  quantity: number;
  display: { milli: number; unit: string };
  notes: string | null;
}

/** The products whose expected consumption names this item. */
export async function listProductsUsingItem(_operator: OperatorSession, itemId: string): Promise<ItemUsage[]> {
  const db = await getDatabase();
  const rows = await db
    .select({ line: productConsumption, unit: inventoryItems.unit })
    .from(productConsumption)
    .innerJoin(inventoryItems, eq(inventoryItems.id, productConsumption.inventoryItemId))
    .where(and(eq(productConsumption.inventoryItemId, itemId), eq(productConsumption.active, true)))
    .orderBy(asc(productConsumption.productId));
  return rows.map(({ line, unit }) => {
    const quantity = fromNumeric(line.quantity) ?? 0;
    return { productId: line.productId, quantity, display: toFriendly(quantity, unit), notes: line.notes };
  });
}

/* ------------------------------------------------------------------ *
 * Validation and the one write
 * ------------------------------------------------------------------ */

interface ResolvedLine {
  inventoryItemId: string;
  milli: number;
  notes: string | null;
}

export type ConsumptionResult =
  | { ok: true; message: string; added: number; changed: number; removed: number }
  | { ok: false; message: string; errors: LineErrors };

/** Checks lines against the inventory. Reads only. */
async function resolve(
  db: AppDatabase | Transaction,
  lines: readonly ConsumptionLineInput[],
  errors: LineErrors,
): Promise<ResolvedLine[]> {
  const ids = [...new Set(lines.map((line) => line.inventoryItemId).filter(Boolean))];
  const items = ids.length > 0 ? await db.select().from(inventoryItems).where(inArray(inventoryItems.id, ids)) : [];
  const byId = new Map(items.map((item) => [item.id, item]));

  const resolved: ResolvedLine[] = [];
  lines.forEach((line, index) => {
    if (errors[index]) return;
    const item = byId.get(line.inventoryItemId);
    if (!item) {
      errors[index] = "That inventory item does not exist.";
      return;
    }
    if (!isConsumableInput(item.itemType)) {
      errors[index] = "Finished products cannot be used as manufacturing inputs.";
      return;
    }
    if (!item.active) {
      errors[index] = "This inventory item is inactive.";
      return;
    }
    const conversion = toItemUnit(parseQuantity(line.quantity) ?? 0, line.unit, item.unit);
    if (!conversion.ok) {
      errors[index] = conversion.reason;
      return;
    }
    if (conversion.milli <= 0) {
      errors[index] = "Quantity must be greater than 0.";
      return;
    }
    resolved.push({ inventoryItemId: item.id, milli: conversion.milli, notes: line.notes.slice(0, MAX_LINE_NOTE) || null });
  });
  return resolved;
}

/**
 * Checks submitted lines without writing — for the create page, before the
 * product exists.
 */
export async function checkConsumptionLines(_operator: OperatorSession, raw: unknown): Promise<ConsumptionResult> {
  const parsed = parseConsumptionLines(raw);
  if (parsed.problem) return { ok: false, message: parsed.problem, errors: {} };
  const errors = { ...parsed.errors };
  const db = await getDatabase();
  await resolve(db, parsed.lines, errors);
  return Object.keys(errors).length > 0
    ? { ok: false, message: "Some consumption lines need attention.", errors }
    : { ok: true, message: "Lines are valid.", added: 0, changed: 0, removed: 0 };
}

/**
 * Makes a product's expected consumption exactly the submitted lines, in one
 * transaction: new items are added, changed quantities or notes updated, and
 * items no longer listed deactivated (kept, with who removed them). Nothing is
 * written if any line is invalid. Stock and the ledger are not touched.
 */
export async function replaceProductConsumption(operator: OperatorSession, productId: string, raw: unknown): Promise<ConsumptionResult> {
  if (!PRODUCT_ID.test(productId)) return { ok: false, message: "That product does not exist.", errors: {} };
  const parsed = parseConsumptionLines(raw);
  if (parsed.problem) return { ok: false, message: parsed.problem, errors: {} };
  const errors = { ...parsed.errors };
  const actor = operator.email;
  const db = await getDatabase();

  return db.transaction(async (tx) => {
    const resolved = await resolve(tx, parsed.lines, errors);
    if (Object.keys(errors).length > 0) return { ok: false, message: "Some consumption lines need attention.", errors };

    const existing = await tx
      .select()
      .from(productConsumption)
      .where(and(eq(productConsumption.productId, productId), eq(productConsumption.active, true)))
      .for("update");
    const byItem = new Map(existing.map((row) => [row.inventoryItemId, row]));
    const keep = new Set(resolved.map((line) => line.inventoryItemId));
    const now = new Date();
    let added = 0;
    let changed = 0;
    let removed = 0;

    for (const row of existing) {
      if (keep.has(row.inventoryItemId)) continue;
      await tx.update(productConsumption).set({ active: false, updatedBy: actor, updatedAt: now }).where(eq(productConsumption.id, row.id));
      removed += 1;
    }
    for (const line of resolved) {
      const quantity = toNumeric(line.milli);
      const current = byItem.get(line.inventoryItemId);
      if (!current) {
        await tx.insert(productConsumption).values({
          id: newId(),
          productId,
          inventoryItemId: line.inventoryItemId,
          quantity,
          notes: line.notes,
          createdBy: actor,
          updatedBy: actor,
          createdAt: now,
          updatedAt: now,
        });
        added += 1;
      } else if (fromNumeric(current.quantity) !== line.milli || (current.notes ?? null) !== line.notes) {
        await tx.update(productConsumption).set({ quantity, notes: line.notes, updatedBy: actor, updatedAt: now }).where(eq(productConsumption.id, current.id));
        changed += 1;
      }
    }

    const message =
      added + changed + removed === 0
        ? "No changes to save."
        : `Saved: ${[added && `${added} added`, changed && `${changed} changed`, removed && `${removed} removed`].filter(Boolean).join(", ")}. Stock is not changed.`;
    return { ok: true, message, added, changed, removed };
  });
}

