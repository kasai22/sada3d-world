import { and, count, countDistinct, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { inventoryItems, inventoryMovements, orderItems, orders } from "@/lib/db/schema";
import { fromNumeric } from "@/lib/inventory/rules";

import type { OperatorSession } from "../operator";
import { soldLines } from "./products";
import type { DateRange } from "./range";
import { DATA_SOURCES, money, within } from "./sql";
import type { Traced } from "./types";

/**
 * MaterialAnalyticsService (Stage 22.5) — which materials were sold and used.
 *
 * Two recorded facts, and one stated gap:
 *
 *   · Custom prints record the material they were quoted in
 *     (`order_items.source_configuration->>'material'`), so custom-print
 *     revenue and parts are reported per material.
 *   · Raw-material stock movements (usage and waste) are recorded per
 *     inventory item, which carries its material and colour.
 *   · Catalog lines record no material. Their revenue is reported as
 *     "material not recorded" and never assigned from today's catalog.
 */

export interface MaterialSalesRow {
  material: string;
  lines: number;
  units: number;
  revenue: number;
  orders: number;
}

export interface MaterialUsageRow {
  itemId: string;
  name: string;
  material: string | null;
  colour: string | null;
  unit: string;
  /** Milli-units consumed by usage movements in the range (positive). */
  used: number;
  /** Milli-units written off as waste in the range (positive). */
  wasted: number;
  movements: number;
}

export interface MaterialAnalytics extends Traced {
  sales: MaterialSalesRow[];
  /** Custom lines sold with no material in their recorded configuration. */
  customUnrecorded: { lines: number; revenue: number };
  /** Catalog lines: no material is recorded on them. */
  catalogUnrecorded: { lines: number; units: number; revenue: number };
  usage: MaterialUsageRow[];
  /** Raw-material items defined at all — separates "no usage" from "nothing to use". */
  rawItems: number;
}

export const MATERIAL_DEFINITION =
  "Custom-print lines by the material in their recorded quote configuration, using the same sold-line rule as product revenue (line totals, before shipping and GST). Raw-material usage and waste are the inventory ledger's USAGE and WASTE movements dated in the range. Catalog lines record no material and are reported as such.";

const recordedMaterial = sql<string | null>`nullif(trim(${orderItems.sourceConfiguration}->>'material'), '')`;

export async function getMaterialAnalytics(
  _operator: OperatorSession,
  range: DateRange,
  now: Date = new Date(),
): Promise<MaterialAnalytics> {
  const db = await getDatabase();
  const sold = soldLines(range);
  const lineRevenue = money(sql`sum(${orderItems.lineTotal})`);
  const lineUnits = sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number);

  const [salesRows, catalogRows, usageRows, [rawCount]] = await Promise.all([
    db
      .select({
        material: recordedMaterial,
        lines: count(),
        units: lineUnits,
        revenue: lineRevenue,
        orders: countDistinct(orderItems.orderReference),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(and(sold, eq(orderItems.type, "custom")))
      .groupBy(recordedMaterial),
    db
      .select({ lines: count(), units: lineUnits, revenue: lineRevenue })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(and(sold, eq(orderItems.type, "catalog"))),
    db
      .select({
        itemId: inventoryItems.id,
        name: inventoryItems.name,
        material: inventoryItems.material,
        colour: inventoryItems.colour,
        unit: inventoryItems.unit,
        used: sql<string>`coalesce(sum(-${inventoryMovements.quantityDelta}) filter (where ${inventoryMovements.type} = 'USAGE'), 0)`,
        wasted: sql<string>`coalesce(sum(-${inventoryMovements.quantityDelta}) filter (where ${inventoryMovements.type} = 'WASTE'), 0)`,
        movements: count(),
      })
      .from(inventoryMovements)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.itemId))
      .where(
        and(
          eq(inventoryItems.itemType, "RAW_MATERIAL"),
          inArray(inventoryMovements.type, ["USAGE", "WASTE"]),
          within(inventoryMovements.occurredAt, range),
        ),
      )
      .groupBy(inventoryItems.id, inventoryItems.name, inventoryItems.material, inventoryItems.colour, inventoryItems.unit),
    db.select({ value: count() }).from(inventoryItems).where(eq(inventoryItems.itemType, "RAW_MATERIAL")),
  ]);

  const recorded = salesRows.filter((row): row is typeof row & { material: string } => row.material !== null);
  const unrecorded = salesRows.find((row) => row.material === null);

  return {
    sales: recorded
      .map((row) => ({
        material: row.material.toUpperCase(),
        lines: Number(row.lines),
        units: Number(row.units),
        revenue: Number(row.revenue),
        orders: Number(row.orders),
      }))
      .sort((a, b) => b.revenue - a.revenue || a.material.localeCompare(b.material)),
    customUnrecorded: { lines: Number(unrecorded?.lines ?? 0), revenue: Number(unrecorded?.revenue ?? 0) },
    catalogUnrecorded: {
      lines: Number(catalogRows[0]?.lines ?? 0),
      units: Number(catalogRows[0]?.units ?? 0),
      revenue: Number(catalogRows[0]?.revenue ?? 0),
    },
    usage: usageRows
      .map((row) => ({
        itemId: row.itemId,
        name: row.name,
        material: row.material,
        colour: row.colour,
        unit: row.unit,
        used: fromNumeric(row.used) ?? 0,
        wasted: fromNumeric(row.wasted) ?? 0,
        movements: Number(row.movements),
      }))
      .sort((a, b) => b.used + b.wasted - (a.used + a.wasted) || a.name.localeCompare(b.name)),
    rawItems: Number(rawCount?.value ?? 0),
    range,
    source: `${DATA_SOURCES.orderItems} · Application database · inventory_movements joined to inventory_items`,
    definition: MATERIAL_DEFINITION,
    generatedAt: now.toISOString(),
  };
}

