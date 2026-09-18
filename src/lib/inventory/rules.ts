/**
 * Inventory rules (Stage 22). Pure and client-safe.
 *
 * ── Quantities are exact ─────────────────────────────────────────────────
 *
 * Stock is kept in thousandths of the item's unit ("milli-units") as integers,
 * so 1.8 kg − 0.35 kg is 1.45 kg and not 1.4500000000000002. The database stores
 * `numeric(14,3)`; nothing between them is a float.
 *
 * ── Unknown is not zero ──────────────────────────────────────────────────
 *
 * A NULL balance is NOT_TRACKED. It is never healthy, never out of stock and
 * never part of a valuation. A NULL cost is MISSING, and a valuation that would
 * need it is reported as unavailable rather than summed without it.
 */

import {
  CONSUMABLE_CATEGORIES,
  INVENTORY_ITEM_TYPES,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_UNITS,
} from "@/lib/db/inventory.constants";

export { CONSUMABLE_CATEGORIES, INVENTORY_ITEM_TYPES, INVENTORY_MOVEMENT_TYPES, INVENTORY_UNITS };

export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

/**
 * The three kinds the inventory page is organised by (Stage 22.6). Packaging,
 * spare parts and "other" are kept for items that already use them, and are
 * shown with consumables: supporting stock, not what products are made of.
 */
export type InventoryGroup = "RAW_MATERIAL" | "FINISHED_PRODUCT" | "CONSUMABLE";
export const INVENTORY_GROUPS: readonly InventoryGroup[] = ["RAW_MATERIAL", "FINISHED_PRODUCT", "CONSUMABLE"];

export function groupOf(type: InventoryItemType): InventoryGroup {
  return type === "RAW_MATERIAL" || type === "FINISHED_PRODUCT" ? type : "CONSUMABLE";
}

export const GROUP_LABEL: Record<InventoryGroup, string> = {
  RAW_MATERIAL: "Raw materials",
  FINISHED_PRODUCT: "Finished products",
  CONSUMABLE: "Consumables",
};

export const GROUP_DESCRIPTION: Record<InventoryGroup, string> = {
  RAW_MATERIAL: "What products are made from: approved filament, by material and colour.",
  FINISHED_PRODUCT: "Catalog products made ahead and held as stock.",
  CONSUMABLE: "What supports production and dispatch, and is used up: packaging, adhesive, nozzles, cleaning and workshop supplies.",
};

export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const ITEM_TYPE_LABEL: Record<InventoryItemType, string> = {
  RAW_MATERIAL: "Raw material",
  FINISHED_PRODUCT: "Finished product",
  CONSUMABLE: "Consumable",
  PACKAGING: "Packaging",
  SPARE_PART: "Spare part",
  OTHER: "Other",
};

export const MOVEMENT_TYPE_LABEL: Record<InventoryMovementType, string> = {
  OPENING_BALANCE: "Opening balance",
  PURCHASE: "Purchase received",
  USAGE: "Used in production",
  SALE: "Sold",
  RETURN: "Returned",
  ADJUSTMENT_IN: "Adjustment in",
  ADJUSTMENT_OUT: "Adjustment out",
  WASTE: "Waste",
};

/** +1 adds to stock, −1 takes from it. */
export const MOVEMENT_DIRECTION: Record<InventoryMovementType, 1 | -1> = {
  OPENING_BALANCE: 1,
  PURCHASE: 1,
  RETURN: 1,
  ADJUSTMENT_IN: 1,
  USAGE: -1,
  SALE: -1,
  ADJUSTMENT_OUT: -1,
  WASTE: -1,
};

/**
 * Movements an operator records directly. Opening balances and purchases have
 * their own flows, because each has rules of its own (once only; a receipt).
 */
export const MANUAL_MOVEMENT_TYPES = ["USAGE", "SALE", "RETURN", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WASTE"] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

/** Movements that must say why: a correction or a loss is only auditable with its reason. */
export const REASON_REQUIRED: ReadonlySet<InventoryMovementType> = new Set(["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WASTE"]);

/* ------------------------------------------------------------------ *
 * Quantities
 * ------------------------------------------------------------------ */

export const MILLI = 1000;
/** numeric(14,3): eleven integer digits. */
export const MAX_MILLI = 99_999_999_999_999;

/** "1.8" → 1800. Positive or zero, at most three decimals; anything else is null. */
export function parseQuantity(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const match = /^(\d{1,11})(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(3, "0"));
  const value = whole * MILLI + fraction;
  return value <= MAX_MILLI ? value : null;
}

/** A `numeric` value as the database returns it, or null. */
export function fromNumeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" ? value.toFixed(3) : value;
  const match = /^(-?)(\d+)(?:\.(\d{1,3})\d*)?$/.exec(text.trim());
  if (!match) return null;
  const magnitude = Number(match[2]) * MILLI + Number((match[3] ?? "").padEnd(3, "0"));
  return match[1] ? -magnitude : magnitude;
}

/** 1450 → "1.450", for the database. */
export function toNumeric(milli: number): string {
  const sign = milli < 0 ? "-" : "";
  const magnitude = Math.abs(milli);
  return `${sign}${Math.floor(magnitude / MILLI)}.${String(magnitude % MILLI).padStart(3, "0")}`;
}

const QUANTITY = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** 1450, "kg" → "1.45 kg". */
export function formatQuantity(milli: number, unit?: string): string {
  const text = QUANTITY.format(milli / MILLI);
  return unit ? `${text} ${unit}` : text;
}

/* ------------------------------------------------------------------ *
 * Stock status and reorder
 * ------------------------------------------------------------------ */

export type StockStatus = "NOT_TRACKED" | "OUT_OF_STOCK" | "REORDER" | "HEALTHY" | "NO_REORDER_LEVEL";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  NOT_TRACKED: "Not tracked",
  OUT_OF_STOCK: "Out of stock",
  REORDER: "Reorder",
  HEALTHY: "Healthy",
  NO_REORDER_LEVEL: "No reorder level",
};

export interface StockLevels {
  /** Milli-units; null = not tracked. */
  current: number | null;
  reorderLevel: number | null;
  targetStock: number | null;
}

/**
 * Where an item stands. Known zero is out of stock; unknown is not tracked. At or
 * below the reorder level is a reorder. Above it is healthy — and without a
 * reorder level nobody has said what healthy means, so it is not called that.
 */
export function stockStatus({ current, reorderLevel }: StockLevels): StockStatus {
  if (current === null) return "NOT_TRACKED";
  if (current === 0) return "OUT_OF_STOCK";
  if (reorderLevel === null) return "NO_REORDER_LEVEL";
  return current <= reorderLevel ? "REORDER" : "HEALTHY";
}

/** max(target − current, 0), or null when either is unknown. */
export function reorderQuantity({ current, targetStock }: StockLevels): number | null {
  if (current === null || targetStock === null) return null;
  return Math.max(targetStock - current, 0);
}

/* ------------------------------------------------------------------ *
 * Costs — rupees to the paisa (Stage 22.6)
 * ------------------------------------------------------------------ */

/** ₹1 crore per unit: far above any real unit cost, and a guard against a typo. */
export const MAX_UNIT_COST_PAISE = 1_000_000_000;

/** "0.5" → 50 paise; "250" → 25000. At most two decimals; anything else is null. */
export function parseCost(text: unknown): number | null {
  const raw = typeof text === "number" ? String(text) : typeof text === "string" ? text.trim().replace(/^₹\s*/, "") : "";
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return paise <= MAX_UNIT_COST_PAISE ? paise : null;
}

/** A `numeric(12,2)` cost as the database returns it → paise, or null. */
export function paiseFromNumeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,2})\d*)?$/.exec(text);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}

/** 50 → "0.50", for the database. */
export const paiseToNumeric = (paise: number): string => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;

/** Paise → rupees, for display. */
export const rupees = (paise: number): number => paise / 100;

/**
 * Stock value in rupees, rounded to the paisa, or null when the quantity or the
 * cost is unknown. `unitCost` is rupees per unit of the item's own unit.
 */
export function stockValue(current: number | null, unitCost: number | null): number | null {
  if (current === null || unitCost === null) return null;
  const paise = Math.round(unitCost * 100);
  return Math.round((current * paise) / MILLI) / 100;
}

/**
 * The next balance, or the reason there is none. Stock never goes below zero:
 * a count that says otherwise is corrected with an adjustment, which is audited.
 */
export function applyDelta(
  current: number | null,
  type: InventoryMovementType,
  quantity: number,
): { ok: true; balance: number; delta: number } | { ok: false; reason: string } {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_MILLI) {
    return { ok: false, reason: "The quantity is not a valid amount." };
  }
  if (type === "OPENING_BALANCE") {
    if (current !== null) {
      return { ok: false, reason: "This item already has an opening balance. Record an adjustment to correct it." };
    }
    return { ok: true, balance: quantity, delta: quantity };
  }
  if (current === null) {
    return { ok: false, reason: "This item is not tracked yet. Enter its opening stock first." };
  }
  if (quantity === 0) return { ok: false, reason: "A movement needs a quantity above zero." };

  const delta = MOVEMENT_DIRECTION[type] * quantity;
  const balance = current + delta;
  if (balance < 0) {
    return { ok: false, reason: "That would take stock below zero. Check the count, or record an adjustment first." };
  }
  if (balance > MAX_MILLI) return { ok: false, reason: "That would exceed the largest quantity that can be stored." };
  return { ok: true, balance, delta };
}

/* ------------------------------------------------------------------ *
 * Reconciliation
 * ------------------------------------------------------------------ */

export interface Reconciliation {
  opening: number;
  byType: Record<InventoryMovementType, number>;
  /** Opening + every movement since, from the ledger. */
  ledgerBalance: number;
  /** The stored balance. */
  current: number | null;
  /** True when the two agree. */
  balanced: boolean;
}

/** Why the item has what it has: the ledger, summed by type, against the stored balance. */
export function reconcile(deltasByType: Partial<Record<InventoryMovementType, number>>, current: number | null): Reconciliation {
  const byType = Object.fromEntries(INVENTORY_MOVEMENT_TYPES.map((type) => [type, deltasByType[type] ?? 0])) as Record<
    InventoryMovementType,
    number
  >;
  const ledgerBalance = Object.values(byType).reduce((sum, value) => sum + value, 0);
  return {
    opening: byType.OPENING_BALANCE,
    byType,
    ledgerBalance,
    current,
    balanced: current === null ? ledgerBalance === 0 : ledgerBalance === current,
  };
}

/**
 * Whether a movement must say why (Stage 22.6). Adjustments and waste always
 * do. Usage does when it is not recorded against a production job — a
 * consumable used for maintenance or packing is only auditable with its reason.
 */
export function needsReason(type: InventoryMovementType, context: { hasJob: boolean }): boolean {
  return REASON_REQUIRED.has(type) || (type === "USAGE" && !context.hasJob);
}
