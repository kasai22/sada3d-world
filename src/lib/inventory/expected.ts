/**
 * Expected consumption for a set of order lines (Stage 22.7).
 *
 * Pure: per-unit lines × quantity, summed by inventory item. This is a plan,
 * never a record — it creates no movement and is shown apart from the actual
 * usage the ledger holds.
 */

import { formatPerUnit } from "./consumption-rules";

export interface ExpectedLineSource {
  productId: string;
  name: string;
  quantity: number;
}

export interface PerUnitInput {
  inventoryItemId: string;
  item: { name: string; sku: string | null; unit: string; typeLabel: string };
  /** Milli-units per finished unit. */
  quantity: number;
  /** Paise per finished unit; null when the item has no cost. */
  costPaise: number | null;
}

export interface ExpectedInput {
  inventoryItemId: string;
  name: string;
  sku: string | null;
  typeLabel: string;
  unit: string;
  /** Milli-units across the order. */
  quantity: number;
  display: string;
  /** Paise across the order; null when any contributing line has no cost. */
  costPaise: number | null;
}

export interface ExpectedConsumption {
  inputs: ExpectedInput[];
  /** Product names whose lines were included. */
  covered: string[];
  /** Product names on the order with no consumption defined. */
  undefinedFor: string[];
  totalCostPaise: number | null;
}

export function expectedConsumption(
  lines: readonly ExpectedLineSource[],
  perUnit: ReadonlyMap<string, { lines: readonly PerUnitInput[] }>,
): ExpectedConsumption {
  const byItem = new Map<string, ExpectedInput>();
  const covered: string[] = [];
  const undefinedFor: string[] = [];

  for (const line of lines) {
    const defined = perUnit.get(line.productId)?.lines ?? [];
    if (defined.length === 0) {
      undefinedFor.push(line.name);
      continue;
    }
    covered.push(line.name);
    for (const input of defined) {
      const quantity = input.quantity * line.quantity;
      const cost = input.costPaise === null ? null : input.costPaise * line.quantity;
      const existing = byItem.get(input.inventoryItemId);
      if (existing) {
        existing.quantity += quantity;
        existing.costPaise = existing.costPaise === null || cost === null ? null : existing.costPaise + cost;
      } else {
        byItem.set(input.inventoryItemId, {
          inventoryItemId: input.inventoryItemId,
          name: input.item.name,
          sku: input.item.sku,
          typeLabel: input.item.typeLabel,
          unit: input.item.unit,
          quantity,
          display: "",
          costPaise: cost,
        });
      }
    }
  }

  const inputs = [...byItem.values()]
    .map((input) => ({ ...input, display: formatPerUnit(input.quantity, input.unit) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalCostPaise =
    inputs.length === 0 || inputs.some((input) => input.costPaise === null)
      ? null
      : inputs.reduce((sum, input) => sum + (input.costPaise ?? 0), 0);

  return { inputs, covered, undefinedFor, totalCostPaise };
}
