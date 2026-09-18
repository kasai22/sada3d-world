/**
 * Product consumption rules (Stage 22.7). Pure and client-safe.
 *
 * A product's consumption is what the business *expects* one finished unit to
 * use: entered by an operator, never estimated. It is stored in the input
 * item's own unit (85 g of a kg item is 0.085 kg) at the ledger's precision, so
 * an expected figure and an actual movement are always comparable.
 *
 * Only mass and volume convert (g ↔ kg, ml ↔ L). Every other unit — pieces,
 * metres, packs, boxes — is entered as itself: "5 pcs of PLA" is refused.
 */

import { MILLI, formatQuantity, parseQuantity, type InventoryItemType } from "./rules";

/** How many of the smallest unit one of each unit is. */
const FAMILIES: Record<string, Record<string, number>> = {
  mass: { g: 1, kg: 1000 },
  volume: { ml: 1, L: 1000 },
};

const familyOf = (unit: string) => Object.values(FAMILIES).find((family) => unit in family);

/** Units a quantity for an item in `itemUnit` may be entered in, smallest first. */
export function entryUnitsFor(itemUnit: string): string[] {
  const family = familyOf(itemUnit);
  return family ? Object.keys(family) : [itemUnit];
}

/** The unit a per-unit quantity reads best in: a kg item's 0.085 is shown as 85 g. */
export function preferredEntryUnit(itemUnit: string): string {
  return entryUnitsFor(itemUnit)[0] ?? itemUnit;
}

export type Conversion = { ok: true; milli: number } | { ok: false; reason: string };

/**
 * A quantity entered in `entryUnit`, as milli-units of `itemUnit`. Refused when
 * the units are unrelated, or when the result is finer than the ledger keeps
 * (a thousandth of the item's unit: 1 g for a kg item).
 */
export function toItemUnit(entered: number, entryUnit: string, itemUnit: string): Conversion {
  if (entryUnit === itemUnit) return { ok: true, milli: entered };
  const family = familyOf(itemUnit);
  if (!family || !(entryUnit in family)) {
    return { ok: false, reason: `Unit is incompatible with this inventory item, which is counted in ${itemUnit}.` };
  }
  const scaled = (entered * family[entryUnit]!) / family[itemUnit]!;
  if (!Number.isInteger(scaled)) {
    const smallest = formatQuantity(family[itemUnit]!, Object.keys(family)[0]);
    return { ok: false, reason: `Too precise: this item is recorded to ${smallest}.` };
  }
  return { ok: true, milli: scaled };
}

/** Milli-units of `itemUnit` as the friendliest entry unit: { milli: 85000, unit: "g" } for 0.085 kg. */
export function toFriendly(milli: number, itemUnit: string): { milli: number; unit: string } {
  const family = familyOf(itemUnit);
  if (!family) return { milli, unit: itemUnit };
  const smallest = Object.keys(family)[0]!;
  if (itemUnit === smallest || milli >= MILLI) return { milli, unit: itemUnit };
  return { milli: milli * family[itemUnit]!, unit: smallest };
}

/** "85 g" for 0.085 kg; "1 pcs"; "1.2 kg". */
export function formatPerUnit(milli: number, itemUnit: string): string {
  const friendly = toFriendly(milli, itemUnit);
  return formatQuantity(friendly.milli, friendly.unit);
}

/**
 * Expected input cost of one line, in paise, from the item's real unit cost
 * (rupees per item unit). Null when the cost is not recorded — never a guess.
 */
export function lineCostPaise(milli: number, unitCostRupees: number | null): number | null {
  if (unitCostRupees === null) return null;
  return Math.round((milli * Math.round(unitCostRupees * 100)) / MILLI);
}

/** Inputs a product may consume: anything but finished stock. */
export const isConsumableInput = (itemType: InventoryItemType) => itemType !== "FINISHED_PRODUCT";

/* ------------------------------------------------------------------ *
 * The submitted lines
 * ------------------------------------------------------------------ */

export const MAX_LINES = 50;
export const MAX_LINE_NOTE = 200;

/** One line as the form sends it: the quantity as typed, in the unit chosen. */
export interface ConsumptionLineInput {
  inventoryItemId: string;
  quantity: string;
  unit: string;
  notes: string;
}

export type LineErrors = Record<number, string>;

/**
 * Reads the form's JSON. Shape only: the items themselves are checked against
 * the inventory by the service. Errors are per row index.
 */
export function parseConsumptionLines(raw: unknown): { lines: ConsumptionLineInput[]; errors: LineErrors; problem?: string } {
  if (raw === undefined || raw === null || raw === "") return { lines: [], errors: {} };
  let data: unknown;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { lines: [], errors: {}, problem: "The consumption lines could not be read. Reload the page and try again." };
  }
  if (!Array.isArray(data)) return { lines: [], errors: {}, problem: "The consumption lines could not be read." };
  if (data.length > MAX_LINES) return { lines: [], errors: {}, problem: `A product can list at most ${MAX_LINES} inputs.` };

  const errors: LineErrors = {};
  const lines = data.map((entry, index): ConsumptionLineInput => {
    const record = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string).trim() : "");
    const line = { inventoryItemId: text("inventoryItemId"), quantity: text("quantity"), unit: text("unit"), notes: text("notes") };
    if (!line.inventoryItemId) errors[index] = "Choose a material or consumable.";
    else if (!/^[A-Za-z0-9_:-]{1,128}$/.test(line.inventoryItemId)) errors[index] = "That inventory item does not exist.";
    else if (!line.quantity) errors[index] = "Quantity must be greater than 0.";
    else if (parseQuantity(line.quantity) === null) errors[index] = "Quantity is a number with up to three decimals.";
    else if (parseQuantity(line.quantity) === 0) errors[index] = "Quantity must be greater than 0.";
    else if (!line.unit) errors[index] = "Choose a unit.";
    else if (line.notes.length > MAX_LINE_NOTE) errors[index] = `Notes are limited to ${MAX_LINE_NOTE} characters.`;
    return line;
  });

  const seen = new Map<string, number>();
  lines.forEach((line, index) => {
    if (!line.inventoryItemId || errors[index]) return;
    const first = seen.get(line.inventoryItemId);
    if (first !== undefined) errors[index] = `This item is already listed (row ${first + 1}). Combine the quantities in one row.`;
    else seen.set(line.inventoryItemId, index);
  });

  return { lines, errors };
}

/** Saved lines as form rows, each in its friendliest unit. */
export function rowsFromLines(
  lines: readonly { inventoryItemId: string; display: { milli: number; unit: string }; notes: string | null }[],
): ConsumptionLineInput[] {
  return lines.map((line) => ({
    inventoryItemId: line.inventoryItemId,
    quantity: formatQuantity(line.display.milli).replace(/,/g, ""),
    unit: line.display.unit,
    notes: line.notes ?? "",
  }));
}
