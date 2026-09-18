import { getInventorySummary, type InventorySummary } from "@/lib/inventory/read";

import type { OperatorSession } from "../operator";
import { getCatalogHealth } from "./catalog";
import { getHeldForMaterial } from "./manufacturing";
import { DATA_SOURCES } from "./sql";
import type { Traced } from "./types";

/**
 * InventoryAnalyticsService — what stock Reality 3D holds.
 *
 * Since Stage 22 this reads the inventory domain (`lib/inventory`): items,
 * their server-maintained balances and the append-only movement ledger. It
 * adds no figure of its own. What it keeps saying plainly:
 *
 *   · an item without an opening balance is NOT TRACKED, not out of stock;
 *   · inventory value is a number only when every tracked item has a cost —
 *     otherwise it is "unavailable", with the costed part shown as a part;
 *   · a job held for material is a real stock signal even where stock is
 *     not tracked.
 */

export interface InventoryStatus extends Traced {
  /** At least one item has an opening balance. */
  initialized: boolean;
  summary: InventorySummary;
  /** Whole rupees, only when the valuation is complete. */
  value: number | null;
  heldForMaterial: number;
  /** Products labelled "In stock" in the catalog, which is a label and not a count. */
  declaredInStock: number | null;
}

export const INVENTORY_DEFINITION =
  "Balances maintained by the inventory ledger: opening balances, purchases received, usage, sales, returns, adjustments and waste. Untracked items (no opening balance) are counted separately and never as zero. Value is quantity × latest recorded unit cost, and only when every tracked item has a cost.";

export async function getInventoryStatus(operator: OperatorSession, now: Date = new Date()): Promise<InventoryStatus> {
  const [summary, heldForMaterial, catalog] = await Promise.all([
    getInventorySummary(operator),
    getHeldForMaterial(operator),
    getCatalogHealth(operator),
  ]);

  return {
    initialized: summary.tracked > 0,
    summary,
    value: summary.valuationComplete ? summary.valueOfCosted : null,
    heldForMaterial,
    declaredInStock: catalog.reachable ? catalog.declaredInStock : null,
    source: `Application database · inventory_items and inventory_movements · ${DATA_SOURCES.jobs}`,
    definition: INVENTORY_DEFINITION,
    generatedAt: now.toISOString(),
  };
}
