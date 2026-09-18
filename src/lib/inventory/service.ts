import { TransactionRollbackError, and, eq, sql } from "drizzle-orm";

import { MATERIAL_DEFINITIONS, capabilityStatus } from "@/content/catalog/capabilities";
import { approvedColours } from "@/content/catalog/decisions";
import { getDatabase, type AppDatabase } from "@/lib/db/client";
import {
  inventoryItems,
  inventoryMovements,
  inventoryPurchases,
  manufacturingEvents,
  manufacturingJobs,
  orders,
  suppliers,
} from "@/lib/db/schema";
import type { OperatorSession } from "@/lib/ops/operator";
import type { OpsActionResult } from "@/lib/ops/types";

import {
  CONSUMABLE_CATEGORIES,
  INVENTORY_ITEM_TYPES,
  INVENTORY_UNITS,
  MANUAL_MOVEMENT_TYPES,
  applyDelta,
  fromNumeric,
  needsReason,
  paiseFromNumeric,
  paiseToNumeric,
  parseCost,
  parseQuantity,
  toNumeric,
  type InventoryItemType,
  type InventoryMovementType,
} from "./rules";

/**
 * Inventory writes (Stage 22).
 *
 * ── Every quantity change is a movement ──────────────────────────────────
 *
 * The balance on `inventory_items` is changed in exactly one place,
 * `writeMovement`, inside a transaction that has locked the item row
 * (`SELECT … FOR UPDATE`) and that also appends the movement. Two operators
 * receiving or using the same stock at once are serialised by that lock: the
 * second reads the balance the first produced, and a movement that would take
 * stock below zero is refused. Nothing accepts a quantity to *set*.
 *
 * ── Who may call ─────────────────────────────────────────────────────────
 *
 * Every exported function takes an `OperatorSession`, which only the console's
 * gate mints (`lib/ops/operator.ts`). Inputs arrive as `unknown` from forms and
 * are validated here, not trusted.
 *
 * ── What it never does ───────────────────────────────────────────────────
 *
 * Invent a quantity or a cost; estimate material use from geometry; deduct
 * stock because a job exists. Usage is recorded by an operator, against a job
 * that has actually started printing.
 */

type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
type Result = OpsActionResult;

export const MAX_TEXT = 200;
export const MAX_NOTE = 500;
const COST_REFUSAL = "Unit cost is rupees per unit, up to two decimals, e.g. 250 or 0.50.";

const refuse = (message: string): Result => ({ ok: false, message });
const done = (message: string): Result => ({ ok: true, message });

/** Postgres raises these for a constraint the input broke; they become refusals, not crashes. */
function constraintMessage(error: unknown): string | null {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return "Another record already uses that value (SKU, name or product).";
  if (code === "23514") return "That value is outside what the record allows.";
  return null;
}

/* ------------------------------------------------------------------ *
 * Input reading
 * ------------------------------------------------------------------ */

function record(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
}

/** Trimmed text within a bound; "" and absent are undefined; too long is null. */
function optionalText(value: unknown, max = MAX_TEXT): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return trimmed.length <= max ? trimmed : null;
}

function requiredText(value: unknown, max = MAX_TEXT): string | null {
  const text = optionalText(value, max);
  return typeof text === "string" ? text : null;
}

/** Paise. "" is "not given"; anything else must be a non-negative amount with at most two decimals. */
function optionalCost(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return parseCost(value);
}

function optionalQuantity(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return parseQuantity(typeof value === "number" ? String(value) : value);
}

/** A business date, `YYYY-MM-DD`, not in the future; noon IST so the day never shifts. Defaults to now. */
function occurredAt(value: unknown, now: Date): Date | null {
  if (value === undefined || value === null || value === "") return now;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T06:30:00.000Z`);
  if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value)) return null;
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return null;
  return date;
}

const IDENTIFIER = /^[A-Za-z0-9_:-]{1,128}$/;
const isIdentifier = (value: unknown): value is string => typeof value === "string" && IDENTIFIER.test(value);

const actorOf = (operator: OperatorSession) => operator.email;
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/* ------------------------------------------------------------------ *
 * The one place a balance changes
 * ------------------------------------------------------------------ */

interface MovementWrite {
  itemId: string;
  type: InventoryMovementType;
  quantity: number;
  occurredAt: Date;
  /** Paise per unit. */
  unitCost?: number;
  referenceType: string;
  referenceId?: string;
  supplierId?: string;
  notes?: string;
  actor: string;
}

type ItemRow = typeof inventoryItems.$inferSelect;

async function lockItem(tx: Transaction, itemId: string): Promise<ItemRow | undefined> {
  const [row] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).for("update");
  return row;
}

/**
 * Appends a movement and moves the balance, in the caller's transaction, with
 * the item already locked by `lockItem`.
 */
async function writeMovement(
  tx: Transaction,
  item: ItemRow,
  write: MovementWrite,
): Promise<{ ok: true; movementId: string; balance: number } | { ok: false; reason: string }> {
  const next = applyDelta(fromNumeric(item.currentQuantity), write.type, write.quantity);
  if (!next.ok) return next;

  const movementId = newId("mov");
  const now = new Date();

  await tx.insert(inventoryMovements).values({
    id: movementId,
    itemId: item.id,
    type: write.type,
    occurredAt: write.occurredAt,
    quantityDelta: toNumeric(next.delta),
    balanceAfter: toNumeric(next.balance),
    unitCost: write.unitCost === undefined ? null : paiseToNumeric(write.unitCost),
    referenceType: write.referenceType,
    referenceId: write.referenceId ?? null,
    supplierId: write.supplierId ?? null,
    notes: write.notes ?? null,
    createdBy: write.actor,
    createdAt: now,
  });

  await tx
    .update(inventoryItems)
    .set({
      currentQuantity: toNumeric(next.balance),
      ...(write.type === "OPENING_BALANCE" ? { openingQuantity: toNumeric(next.balance), openedAt: write.occurredAt } : {}),
      ...(write.unitCost !== undefined
        ? {
            unitCost: paiseToNumeric(write.unitCost),
            unitCostSource: `${write.referenceType}:${write.referenceId ?? movementId}`,
            unitCostUpdatedAt: now,
            unitCostUpdatedBy: write.actor,
          }
        : {}),
      version: sql`${inventoryItems.version} + 1`,
      updatedBy: write.actor,
      updatedAt: now,
    })
    .where(eq(inventoryItems.id, item.id));

  return { ok: true, movementId, balance: next.balance };
}

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

/**
 * What an item is, by type (Stage 22.6):
 *
 *   raw material      an AVAILABLE material in one of its approved colours; the
 *                     name and the definition key follow from them, so the same
 *                     filament cannot be defined twice
 *   finished product  a catalog product, by its id — the catalog owns its name
 *                     and SKU; the caller passes the catalog's products
 *   consumable        a name, a category and a unit the operator chooses
 *   packaging, spare part, other   a name and a unit (kept from Stage 22)
 *
 * No item is created with stock: it is NOT TRACKED until an opening balance or
 * a received purchase.
 */
export interface ItemCatalogProduct {
  id: string;
  name: string;
}

export async function createInventoryItem(
  operator: OperatorSession,
  input: unknown,
  catalog: readonly ItemCatalogProduct[] = [],
): Promise<Result> {
  const data = record(input);
  const itemType = INVENTORY_ITEM_TYPES.find((type) => type === data.itemType);
  const unit = INVENTORY_UNITS.find((candidate) => candidate === data.unit);
  const sku = optionalText(data.sku, 64);
  const categoryText = optionalText(data.category, 64);
  const material = optionalText(data.material, 32);
  const colour = optionalText(data.colour, 32);
  const productId = optionalText(data.productId, 64);
  const supplierId = optionalText(data.supplierId, 128);
  const notes = optionalText(data.notes, MAX_NOTE);
  const reorderLevel = optionalQuantity(data.reorderLevel);
  const targetStock = optionalQuantity(data.targetStock);
  const unitCost = optionalCost(data.unitCost);

  if (!itemType) return refuse("Choose what kind of item this is.");
  if (!unit) return refuse(`Choose the unit its quantities are counted in: ${INVENTORY_UNITS.join(", ")}.`);
  if ([sku, categoryText, material, colour, productId, supplierId, notes].includes(null)) return refuse("One of the text fields is too long.");
  if (reorderLevel === null || targetStock === null) return refuse("Reorder level and target stock must be quantities, up to three decimals.");
  if (unitCost === null) return refuse(COST_REFUSAL);
  if (productId && itemType !== "FINISHED_PRODUCT") return refuse("Only a finished product links to a catalog product.");

  let name: string | null;
  let definitionKey: string | null = null;
  let category: string | null = categoryText ?? null;

  switch (itemType) {
    case "RAW_MATERIAL": {
      const definition = MATERIAL_DEFINITIONS.find((entry) => entry.value === material);
      if (!definition) return refuse("Choose the material this stock is.");
      const status = capabilityStatus("material", definition.value);
      if (status !== "AVAILABLE") {
        return refuse(`${definition.label} is ${status === "COMING_SOON" ? "coming soon" : "not available"}, so it has no stock to track yet.`);
      }
      const colours = approvedColours(definition.value);
      if (!colour || !colours.includes(colour)) {
        return refuse(`Choose an approved colour for ${definition.label}: ${colours.join(", ") || "none is approved"}.`);
      }
      name = `${definition.label} ${colour.charAt(0).toUpperCase()}${colour.slice(1)}`;
      definitionKey = `material:${definition.value}:${colour}`;
      category = "Filament";
      break;
    }
    case "FINISHED_PRODUCT": {
      if (!productId) return refuse("Choose the catalog product this stock is.");
      const product = catalog.find((entry) => entry.id === productId);
      if (!product) return refuse("That product is not in the catalog.");
      name = product.name.trim().slice(0, MAX_TEXT);
      definitionKey = `product:${productId}`;
      category = "Finished product";
      break;
    }
    case "CONSUMABLE": {
      name = requiredText(data.name);
      if (!name) return refuse("Give the consumable a name.");
      const known = CONSUMABLE_CATEGORIES.find((entry) => entry === categoryText);
      if (!known) return refuse(`Choose a category: ${CONSUMABLE_CATEGORIES.join(", ")}.`);
      category = known;
      break;
    }
    default:
      name = requiredText(data.name);
      if (!name) return refuse("Give the item a name.");
  }

  const actor = actorOf(operator);
  const now = new Date();
  const id = newId("inv");
  try {
    const db = await getDatabase();
    if (supplierId && !(await supplierExists(db, supplierId))) return refuse("That supplier does not exist.");
    if (definitionKey) {
      const [existing] = await db
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(eq(inventoryItems.definitionKey, definitionKey))
        .limit(1);
      if (existing) return refuse(`${name} is already defined. Open it to enter stock.`);
    }
    await db.insert(inventoryItems).values({
      id,
      definitionKey,
      sku: sku ?? null,
      name,
      itemType,
      category,
      material: itemType === "RAW_MATERIAL" ? (material ?? null) : null,
      colour: itemType === "RAW_MATERIAL" ? (colour ?? null) : null,
      unit,
      productId: itemType === "FINISHED_PRODUCT" ? (productId ?? null) : null,
      supplierId: supplierId ?? null,
      notes: notes ?? null,
      reorderLevel: reorderLevel === undefined ? null : toNumeric(reorderLevel),
      targetStock: targetStock === undefined ? null : toNumeric(targetStock),
      ...(unitCost !== undefined
        ? { unitCost: paiseToNumeric(unitCost), unitCostSource: "manual", unitCostUpdatedAt: now, unitCostUpdatedBy: actor }
        : {}),
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    const message = constraintMessage(error);
    if (message) return refuse(message);
    throw error;
  }
  return { ok: true, id, message: `${name} added. Its stock is not tracked until an opening balance is entered.` };
}

/**
 * Thresholds, cost, SKU, supplier, notes, a consumable's category and whether
 * the item is in use. Never the quantity. A field left out is unchanged;
 * `clear` names fields to unset.
 */
export async function updateInventoryItem(operator: OperatorSession, input: unknown): Promise<Result> {
  const data = record(input);
  if (!isIdentifier(data.itemId)) return refuse("That item does not exist.");
  if ("currentQuantity" in data || "quantity" in data) {
    return refuse("Stock is changed by recording a movement, never by editing the item.");
  }

  const clear = new Set(Array.isArray(data.clear) ? data.clear.filter((value): value is string => typeof value === "string") : []);
  const reorderLevel = optionalQuantity(data.reorderLevel);
  const targetStock = optionalQuantity(data.targetStock);
  const unitCost = optionalCost(data.unitCost);
  const sku = optionalText(data.sku, 64);
  const supplierId = optionalText(data.supplierId, 128);
  const notes = optionalText(data.notes, MAX_NOTE);
  const category = optionalText(data.category, 64);
  if (reorderLevel === null || targetStock === null) return refuse("Reorder level and target stock must be quantities, up to three decimals.");
  if (unitCost === null) return refuse(COST_REFUSAL);
  if (sku === null || supplierId === null || notes === null || category === null) return refuse("One of the text fields is too long.");

  const actor = actorOf(operator);
  const now = new Date();
  const changes: Partial<typeof inventoryItems.$inferInsert> = {};
  if (reorderLevel !== undefined) changes.reorderLevel = toNumeric(reorderLevel);
  else if (clear.has("reorderLevel")) changes.reorderLevel = null;
  if (targetStock !== undefined) changes.targetStock = toNumeric(targetStock);
  else if (clear.has("targetStock")) changes.targetStock = null;
  if (sku !== undefined) changes.sku = sku;
  else if (clear.has("sku")) changes.sku = null;
  if (supplierId !== undefined) changes.supplierId = supplierId;
  else if (clear.has("supplierId")) changes.supplierId = null;
  if (notes !== undefined) changes.notes = notes;
  else if (clear.has("notes")) changes.notes = null;
  if (unitCost !== undefined) {
    Object.assign(changes, { unitCost: paiseToNumeric(unitCost), unitCostSource: "manual", unitCostUpdatedAt: now, unitCostUpdatedBy: actor });
  } else if (clear.has("unitCost")) {
    Object.assign(changes, { unitCost: null, unitCostSource: null, unitCostUpdatedAt: now, unitCostUpdatedBy: actor });
  }
  if (typeof data.active === "boolean") changes.active = data.active;

  if (Object.keys(changes).length === 0 && category === undefined) return refuse("Nothing to change.");

  try {
    const db = await getDatabase();
    const [item] = await db
      .select({ itemType: inventoryItems.itemType })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, data.itemId))
      .limit(1);
    if (!item) return refuse("That item does not exist.");
    if (category !== undefined) {
      if (item.itemType !== "CONSUMABLE") return refuse("Only a consumable's category can be changed here.");
      const known = CONSUMABLE_CATEGORIES.find((entry) => entry === category);
      if (!known) return refuse(`Choose a category: ${CONSUMABLE_CATEGORIES.join(", ")}.`);
      changes.category = known;
    }
    if (changes.supplierId && !(await supplierExists(db, changes.supplierId))) return refuse("That supplier does not exist.");

    const updated = await db
      .update(inventoryItems)
      .set({ ...changes, updatedBy: actor, updatedAt: now })
      .where(eq(inventoryItems.id, data.itemId))
      .returning({ name: inventoryItems.name });
    if (updated.length === 0) return refuse("That item does not exist.");
    return done(`${updated[0]!.name} updated.`);
  } catch (error) {
    const message = constraintMessage(error);
    if (message) return refuse(message);
    throw error;
  }
}


export interface DefinitionProduct {
  /** Catalog product id, e.g. "p-101". */
  id: string;
  name: string;
}

/**
 * Creates the inventory definitions the business has decided on, without stock.
 *
 *   raw materials      every material the decision ledger makes AVAILABLE, in
 *                      each of its approved colours — never a roadmap material
 *   finished products  the catalog products the caller passes
 *
 * Idempotent: a definition that exists is left exactly as it is, stock and all.
 * Nothing is given a quantity or a cost.
 */
export async function syncInventoryDefinitions(
  operator: OperatorSession,
  catalog: readonly DefinitionProduct[],
): Promise<Result & { created: number }> {
  const actor = actorOf(operator);
  const now = new Date();

  const rawMaterials = MATERIAL_DEFINITIONS.filter((material) => capabilityStatus("material", material.value) === "AVAILABLE").flatMap(
    (material) =>
      approvedColours(material.value).map((colour) => ({
        definitionKey: `material:${material.value}:${colour}`,
        name: `${material.label} ${colour.charAt(0).toUpperCase()}${colour.slice(1)}`,
        itemType: "RAW_MATERIAL" as InventoryItemType,
        category: "Filament",
        material: material.value,
        colour,
        unit: "kg",
        productId: null,
      })),
  );

  const products = catalog
    .filter((product) => isIdentifier(product.id) && typeof product.name === "string" && product.name.trim())
    .map((product) => ({
      definitionKey: `product:${product.id}`,
      name: product.name.trim().slice(0, MAX_TEXT),
      itemType: "FINISHED_PRODUCT" as InventoryItemType,
      category: "Finished product",
      material: null,
      colour: null,
      unit: "pcs",
      productId: product.id,
    }));

  const rows = [...rawMaterials, ...products].map((definition) => ({
    id: newId("inv"),
    ...definition,
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
  }));
  if (rows.length === 0) return { ok: true, message: "There are no definitions to create.", created: 0 };

  const db = await getDatabase();
  // A product already linked by hand keeps its item; the unique product index makes this a no-op too.
  const inserted = await db.insert(inventoryItems).values(rows).onConflictDoNothing().returning({ id: inventoryItems.id });

  return {
    ok: true,
    created: inserted.length,
    message:
      inserted.length === 0
        ? "Every definition already exists. Nothing changed."
        : `${inserted.length} ${inserted.length === 1 ? "definition" : "definitions"} created, not tracked until opening stock is entered.`,
  };
}

/* ------------------------------------------------------------------ *
 * Opening balance
 * ------------------------------------------------------------------ */

export async function recordOpeningBalance(operator: OperatorSession, input: unknown, now: Date = new Date()): Promise<Result> {
  const data = record(input);
  const quantity = parseQuantity(data.quantity);
  const unitCost = optionalCost(data.unitCost);
  const when = occurredAt(data.occurredAt, now);
  const reference = optionalText(data.reference);
  const notes = optionalText(data.notes, MAX_NOTE);

  if (!isIdentifier(data.itemId)) return refuse("That item does not exist.");
  if (quantity === null) return refuse("Enter the counted quantity, up to three decimals. Zero is allowed if the shelf is empty.");
  if (unitCost === null) return refuse(COST_REFUSAL);
  if (!when) return refuse("The count date must be a real date, not in the future.");
  if (!reference) return refuse("Say where the count is recorded, e.g. a stock-take sheet.");
  if (notes === null) return refuse("The note is too long.");

  const db = await getDatabase();
  return db.transaction(async (tx) => {
    const item = await lockItem(tx, data.itemId as string);
    if (!item) return refuse("That item does not exist.");
    const written = await writeMovement(tx, item, {
      itemId: item.id,
      type: "OPENING_BALANCE",
      quantity,
      occurredAt: when,
      ...(unitCost !== undefined ? { unitCost } : {}),
      referenceType: "opening",
      referenceId: reference,
      ...(notes ? { notes } : {}),
      actor: actorOf(operator),
    });
    if (!written.ok) return refuse(written.reason);
    return done(`Opening stock for ${item.name} recorded. It is now tracked.`);
  });
}

/* ------------------------------------------------------------------ *
 * Usage, sales, returns, adjustments, waste
 * ------------------------------------------------------------------ */

/** Material is consumed once a job has started printing — the event log says whether it has. */
async function jobHasPrinted(tx: Transaction, jobId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: manufacturingEvents.id })
    .from(manufacturingEvents)
    .innerJoin(manufacturingJobs, eq(manufacturingJobs.id, manufacturingEvents.jobId))
    .where(and(eq(manufacturingEvents.jobId, jobId), eq(manufacturingEvents.type, "PRINT_STARTED")))
    .limit(1);
  return Boolean(row);
}

export async function recordStockMovement(operator: OperatorSession, input: unknown, now: Date = new Date()): Promise<Result> {
  const data = record(input);
  const type = MANUAL_MOVEMENT_TYPES.find((candidate) => candidate === data.type);
  const quantity = parseQuantity(data.quantity);
  const when = occurredAt(data.occurredAt, now);
  const notes = optionalText(data.notes, MAX_NOTE);
  const reference = optionalText(data.reference);

  if (!isIdentifier(data.itemId)) return refuse("That item does not exist.");
  if (!type) return refuse("Choose what kind of movement this is.");
  if (quantity === null || quantity === 0) return refuse("Enter a quantity above zero, up to three decimals.");
  if (!when) return refuse("The date must be a real date, not in the future.");
  if (notes === null || reference === null) return refuse("A text field is too long.");

  const jobId = type === "USAGE" ? optionalText(data.jobId, 128) : undefined;
  const orderReference = type === "SALE" || type === "RETURN" ? optionalText(data.orderReference, 64) : undefined;
  if (jobId === null || orderReference === null) return refuse("That reference is too long.");
  if (needsReason(type, { hasJob: Boolean(jobId) }) && !notes) {
    return refuse(
      type === "USAGE"
        ? "Say why: usage that is not recorded against a production job is only auditable with its reason."
        : "Say why: an adjustment or waste is only auditable with its reason.",
    );
  }

  const db = await getDatabase();
  return db.transaction(async (tx) => {
    const item = await lockItem(tx, data.itemId as string);
    if (!item) return refuse("That item does not exist.");

    if (type === "USAGE" && item.itemType === "RAW_MATERIAL" && !jobId) {
      return refuse("Material usage is recorded against the production job that used it.");
    }
    if (jobId && !(await jobHasPrinted(tx, jobId))) {
      return refuse("That job has not started printing, so it has not used material yet.");
    }
    if (orderReference) {
      const [order] = await tx.select({ reference: orders.reference }).from(orders).where(eq(orders.reference, orderReference)).limit(1);
      if (!order) return refuse("That order does not exist.");
    }

    const written = await writeMovement(tx, item, {
      itemId: item.id,
      type,
      quantity,
      occurredAt: when,
      referenceType: jobId ? "manufacturing_job" : orderReference ? "order" : "manual",
      ...(jobId ? { referenceId: jobId } : orderReference ? { referenceId: orderReference } : reference ? { referenceId: reference } : {}),
      ...(notes ? { notes } : {}),
      actor: actorOf(operator),
    });
    if (!written.ok) return refuse(written.reason);
    return done(`${item.name}: movement recorded.`);
  });
}

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

export async function createSupplier(operator: OperatorSession, input: unknown): Promise<Result> {
  const data = record(input);
  const name = requiredText(data.name);
  const fields = {
    supplierType: optionalText(data.supplierType, 64),
    contactPerson: optionalText(data.contactPerson),
    phone: optionalText(data.phone, 32),
    email: optionalText(data.email, 254),
    paymentTerms: optionalText(data.paymentTerms),
    notes: optionalText(data.notes, MAX_NOTE),
  };
  const leadText = typeof data.leadTimeDays === "string" ? data.leadTimeDays.trim() : data.leadTimeDays;
  const leadTimeDays = leadText === undefined || leadText === "" || leadText === null ? undefined : /^\d{1,3}$/.test(String(leadText)) ? Number(leadText) : null;

  if (!name) return refuse("Give the supplier a name.");
  if (Object.values(fields).includes(null)) return refuse("One of the fields is too long.");
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return refuse("That email address is not valid.");
  if (leadTimeDays === null) return refuse("Lead time is a whole number of days.");

  const actor = actorOf(operator);
  try {
    const db = await getDatabase();
    await db.insert(suppliers).values({
      id: newId("sup"),
      name,
      supplierType: fields.supplierType ?? null,
      contactPerson: fields.contactPerson ?? null,
      phone: fields.phone ?? null,
      email: fields.email ?? null,
      leadTimeDays: leadTimeDays ?? null,
      paymentTerms: fields.paymentTerms ?? null,
      notes: fields.notes ?? null,
      createdBy: actor,
    });
  } catch (error) {
    const message = constraintMessage(error);
    if (message) return refuse(message);
    throw error;
  }
  return done(`${name} added.`);
}

/* ------------------------------------------------------------------ *
 * Purchases
 * ------------------------------------------------------------------ */

async function supplierExists(db: AppDatabase | Transaction, supplierId: string): Promise<boolean> {
  const [row] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
  return Boolean(row);
}

async function receive(
  tx: Transaction,
  operator: OperatorSession,
  purchase: typeof inventoryPurchases.$inferSelect,
  when: Date,
  startsFromZero: boolean,
): Promise<Result> {
  const item = await lockItem(tx, purchase.itemId);
  if (!item) return refuse("The purchased item no longer exists.");
  const actor = actorOf(operator);

  if (item.currentQuantity === null) {
    if (!startsFromZero) {
      return refuse(
        `${item.name} is not tracked yet. Enter its opening stock first, or confirm there was none before this purchase.`,
      );
    }
    const opened = await writeMovement(tx, item, {
      itemId: item.id,
      type: "OPENING_BALANCE",
      quantity: 0,
      occurredAt: when,
      referenceType: "opening",
      referenceId: `purchase:${purchase.id}`,
      notes: "Confirmed by the operator: no stock before this purchase.",
      actor,
    });
    if (!opened.ok) return refuse(opened.reason);
    item.currentQuantity = toNumeric(0);
  }

  const quantity = fromNumeric(purchase.quantity) ?? 0;
  const written = await writeMovement(tx, item, {
    itemId: item.id,
    type: "PURCHASE",
    quantity,
    occurredAt: when,
    ...(purchase.unitCost !== null ? { unitCost: paiseFromNumeric(purchase.unitCost) ?? undefined } : {}),
    referenceType: "purchase",
    referenceId: purchase.id,
    ...(purchase.supplierId ? { supplierId: purchase.supplierId } : {}),
    ...(purchase.reference ? { notes: `Supplier reference ${purchase.reference}` } : {}),
    actor,
  });
  if (!written.ok) return refuse(written.reason);

  await tx
    .update(inventoryPurchases)
    .set({ status: "received", receivedAt: when, receivedBy: actor, movementId: written.movementId, updatedAt: new Date() })
    .where(eq(inventoryPurchases.id, purchase.id));

  return done(`Received into ${item.name}.`);
}

export async function createPurchase(operator: OperatorSession, input: unknown, now: Date = new Date()): Promise<Result> {
  const data = record(input);
  const quantity = parseQuantity(data.quantity);
  const unitCost = optionalCost(data.unitCost);
  const reference = optionalText(data.reference);
  const notes = optionalText(data.notes, MAX_NOTE);
  const supplierId = optionalText(data.supplierId, 128);
  const receivedNow = data.receivedNow === true || data.receivedNow === "on";
  const when = occurredAt(data.receivedAt, now);

  if (!isIdentifier(data.itemId)) return refuse("Choose the item being bought.");
  if (quantity === null || quantity === 0) return refuse("Enter a quantity above zero, up to three decimals.");
  if (unitCost === null) return refuse(COST_REFUSAL);
  if (reference === null || notes === null || supplierId === null) return refuse("A text field is too long.");
  if (!when) return refuse("The receipt date must be a real date, not in the future.");

  let refusal: Result | undefined;
  const db = await getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const [item] = await tx
        .select({ id: inventoryItems.id, name: inventoryItems.name })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, data.itemId as string));
      if (!item) return refuse("That item does not exist.");
      if (supplierId && !(await supplierExists(tx, supplierId))) return refuse("That supplier does not exist.");

      const [purchase] = await tx
        .insert(inventoryPurchases)
        .values({
          id: newId("pur"),
          itemId: item.id,
          supplierId: supplierId ?? null,
          quantity: toNumeric(quantity),
          unitCost: unitCost === undefined ? null : paiseToNumeric(unitCost),
          reference: reference ?? null,
          notes: notes ?? null,
          createdBy: actorOf(operator),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!receivedNow) return done(`Purchase of ${item.name} recorded. Confirm receipt when it arrives.`);

      const received = await receive(tx, operator, purchase!, when, data.startsFromZero === true || data.startsFromZero === "on");
      if (!received.ok) {
        // "Received now" that cannot be received is not recorded at all, rather than half-recorded.
        refusal = received;
        tx.rollback();
      }
      return received;
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError && refusal) return refusal;
    throw error;
  }
}

export async function receivePurchase(operator: OperatorSession, input: unknown, now: Date = new Date()): Promise<Result> {
  const data = record(input);
  if (!isIdentifier(data.purchaseId)) return refuse("That purchase does not exist.");
  const when = occurredAt(data.receivedAt, now);
  if (!when) return refuse("The receipt date must be a real date, not in the future.");

  const db = await getDatabase();
  return db.transaction(async (tx) => {
    const [purchase] = await tx
      .select()
      .from(inventoryPurchases)
      .where(eq(inventoryPurchases.id, data.purchaseId as string))
      .for("update");
    if (!purchase) return refuse("That purchase does not exist.");
    if (purchase.status !== "ordered") return refuse(`That purchase is already ${purchase.status}.`);
    return receive(tx, operator, purchase, when, data.startsFromZero === true || data.startsFromZero === "on");
  });
}

export async function cancelPurchase(operator: OperatorSession, input: unknown): Promise<Result> {
  const data = record(input);
  if (!isIdentifier(data.purchaseId)) return refuse("That purchase does not exist.");
  const db = await getDatabase();
  const updated = await db
    .update(inventoryPurchases)
    .set({ status: "cancelled", notes: sql`coalesce(${inventoryPurchases.notes} || ' · ', '') || ${`Cancelled by ${actorOf(operator)}`}`, updatedAt: new Date() })
    .where(and(eq(inventoryPurchases.id, data.purchaseId), eq(inventoryPurchases.status, "ordered")))
    .returning({ id: inventoryPurchases.id });
  return updated.length > 0 ? done("Purchase cancelled. No stock moved.") : refuse("Only a purchase that has not been received can be cancelled.");
}

export type { InventoryItemType };
