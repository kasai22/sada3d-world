/**
 * The inventory enums' values, with no database import, so client components
 * and pure rules can name them. `inventory.schema.ts` builds its enums from these.
 */

export const INVENTORY_ITEM_TYPES = [
  "RAW_MATERIAL",
  "FINISHED_PRODUCT",
  "CONSUMABLE",
  "PACKAGING",
  "SPARE_PART",
  "OTHER",
] as const;

export const INVENTORY_MOVEMENT_TYPES = [
  "OPENING_BALANCE",
  "PURCHASE",
  "USAGE",
  "SALE",
  "RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "WASTE",
] as const;

export const INVENTORY_PURCHASE_STATUSES = ["ordered", "received", "cancelled"] as const;

/**
 * Units an inventory item may be counted in (Stage 22.6). Chosen per item; every
 * quantity and every cost of the item is in its unit — ₹250 per pack is not ₹250
 * per piece.
 */
export const INVENTORY_UNITS = ["pcs", "g", "kg", "ml", "L", "m", "pack", "box"] as const;

/** How consumables are grouped (Stage 22.6). A grouping, not a list of stocked items. */
export const CONSUMABLE_CATEGORIES = [
  "Printing consumables",
  "Packaging",
  "Post-processing",
  "Maintenance",
  "Workshop",
  "Other",
] as const;
