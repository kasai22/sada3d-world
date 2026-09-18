import type { InventoryItemView } from "@/lib/inventory/read";
import { STOCK_STATUS_LABEL, formatQuantity, type StockStatus } from "@/lib/inventory/rules";
import type { OpsTone } from "@/lib/ops/labels";

/**
 * How inventory figures read (Stage 22.6). Pure and client-safe, so the item
 * tables, the ledger and the forms say the same thing the same way.
 */

export const STATUS_TONE: Record<StockStatus, OpsTone> = {
  NOT_TRACKED: "neutral",
  OUT_OF_STOCK: "danger",
  REORDER: "warning",
  HEALTHY: "success",
  NO_REORDER_LEVEL: "info",
};

export { STOCK_STATUS_LABEL };

const WHOLE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const PAISE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹250 · ₹0.50 · ₹1,250.75 — paise only when there are any. */
export function formatCost(rupees: number): string {
  return Number.isInteger(rupees) ? WHOLE.format(rupees) : PAISE.format(rupees);
}

/** A unit cost with its unit: "₹0.50 / pcs". Missing is said, never zero. */
export const costPerUnit = (rupees: number | null, unit: string) => (rupees === null ? "Missing" : `${formatCost(rupees)} / ${unit}`);

/** A stock figure with its unit, or "Not tracked" — unknown is never shown as 0. */
export const stockText = (milli: number | null, unit: string) => (milli === null ? "Not tracked" : formatQuantity(milli, unit));

/** A threshold, or an em dash when none is set. */
export const levelText = (milli: number | null, unit: string) => (milli === null ? "—" : formatQuantity(milli, unit));

export const signedQuantity = (milli: number, unit: string) =>
  `${milli > 0 ? "+" : milli < 0 ? "−" : ""}${formatQuantity(Math.abs(milli), unit)}`;

/** Today in IST, for date inputs. */
export const todayInIndia = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export const capitalise = (value: string | null) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "—");

/** Status filters the item tabs accept. MISSING_COST is not a stock status but a cost gap. */
export const ITEM_STATUS_FILTERS = ["OUT_OF_STOCK", "REORDER", "NOT_TRACKED", "NO_REORDER_LEVEL", "HEALTHY", "MISSING_COST"] as const;
export type ItemStatusFilter = (typeof ITEM_STATUS_FILTERS)[number];

export const STATUS_FILTER_LABEL: Record<ItemStatusFilter, string> = {
  ...STOCK_STATUS_LABEL,
  MISSING_COST: "Missing cost",
};

/**
 * The next thing to do for an item, in words. Pure: the item's own status
 * decides it, so the overview's "needs action" list and each tab agree.
 */
export function nextStep(item: InventoryItemView): string {
  switch (item.status) {
    case "NOT_TRACKED":
      return "Enter opening stock";
    case "OUT_OF_STOCK":
      return item.reorderQuantity ? `Reorder ${formatQuantity(item.reorderQuantity, item.unit)}` : "Reorder — set a target to size it";
    case "REORDER":
      return item.reorderQuantity ? `Reorder ${formatQuantity(item.reorderQuantity, item.unit)}` : "Reorder — set a target to size it";
    case "NO_REORDER_LEVEL":
      return "Set a reorder level";
    default:
      return item.unitCost === null ? "Record a unit cost" : "No action";
  }
}

