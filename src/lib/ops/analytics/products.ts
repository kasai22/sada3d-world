import { and, count, countDistinct, desc, eq, isNotNull, isNull, notInArray, sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { orderItems, orders } from "@/lib/db/schema";

import type { OperatorSession } from "../operator";
import { type DateRange } from "./range";
import { DATA_SOURCES, countsAsRevenue, money, placedIn } from "./sql";
import type { Traced } from "./types";

/**
 * ProductAnalyticsService — what is selling, and in which categories.
 *
 * ── What an order line knows ─────────────────────────────────────────────
 *
 * Every line snapshots its type, the name it was sold under, quantity and line
 * total. Since Stage 22 a catalog line also snapshots the product id, SKU and
 * category (leaf and browse root) with their names. Lines placed before that
 * have no product id or category, and nothing back-fills them.
 *
 * So a product is identified by its product id where the line recorded one,
 * and by the name it was sold under where it did not; and category revenue is
 * reported for categorised lines only, with the uncategorised remainder shown
 * as unavailable — never assigned to a category by matching names.
 *
 * ── What counts ──────────────────────────────────────────────────────────
 *
 * `soldLines`: lines of orders that count as revenue (`countsAsRevenue`),
 * excluding lines that were themselves cancelled or failed. Line revenue is the
 * line total — the item subtotal, before shipping and GST. Product and category
 * figures use the same condition, so their totals agree.
 *
 * Nothing here labels anything a best seller. Tables are sorted by revenue;
 * that is a sort, not a claim.
 */

export const PRODUCT_LIMIT = 10;
export const PRODUCT_LIMIT_MAX = 100;
export const CATEGORY_LIMIT = 100;

export interface ProductPerformanceRow {
  type: "catalog" | "custom";
  /** The catalog product id, when the lines recorded one. */
  productId: string | null;
  /** The most recent name the product was sold under. */
  name: string;
  sku: string | null;
  /** The most recent category name recorded, when any line recorded one. */
  categoryName: string | null;
  units: number;
  revenue: number;
  orders: number;
}

export interface ProductPerformance extends Traced {
  rows: ProductPerformanceRow[];
  /** Distinct products sold in the range; `rows` may be the first few. */
  distinct: number;
  byType: Record<"catalog" | "custom", { units: number; revenue: number; orders: number }>;
  totals: { units: number; revenue: number };
}

export interface CategoryRevenueRow {
  id: string;
  /** The most recent name recorded for this category. */
  name: string;
  /** For a leaf: its browse root, as most recently recorded. */
  parentName: string | null;
  units: number;
  revenue: number;
  orders: number;
}

export interface CategoryRevenue extends Traced {
  /** Leaf categories. */
  categories: CategoryRevenueRow[];
  /** Browse roots, e.g. Mechanical. */
  browse: CategoryRevenueRow[];
  /** Catalog lines with a recorded category. */
  categorised: { lines: number; units: number; revenue: number };
  /** Catalog lines placed before categories were recorded: revenue whose category is unknown. */
  uncategorised: { lines: number; units: number; revenue: number; orders: number; firstPlaced: string | null; lastPlaced: string | null };
  /** Custom prints are not catalog products and have no category; reported beside the categories. */
  custom: { lines: number; units: number; revenue: number; orders: number };
}

/** The line population every product and category figure counts. */
export function soldLines(range: DateRange): SQL {
  return and(
    countsAsRevenue(),
    placedIn(range),
    notInArray(orderItems.fulfillmentStatus, ["cancelled", "failed"]),
  ) as SQL;
}

const units = () => sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number);
const revenue = () => money(sql`sum(${orderItems.lineTotal})`);
const orderCount = () => countDistinct(orderItems.orderReference);
/** The value on the most recently placed line of the group. */
const latest = (column: SQL | typeof orderItems.name) =>
  sql<string | null>`(array_agg(${column} order by ${orders.placedAt} desc) filter (where ${column} is not null))[1]`;

/** A product is its recorded id, or — before ids were recorded — the name it was sold under. */
const productKey = sql<string>`coalesce('id:' || ${orderItems.productId}, 'name:' || ${orderItems.name})`;

export async function getProductPerformance(
  _operator: OperatorSession,
  range: DateRange,
  options: { limit?: number; now?: Date } = {},
): Promise<ProductPerformance> {
  const db = await getDatabase();
  const limit = Math.min(Math.max(1, options.limit ?? PRODUCT_LIMIT), PRODUCT_LIMIT_MAX);
  const counted = soldLines(range);
  const lineRevenue = revenue();
  const lineUnits = units();

  const [rows, distinct, byTypeRows] = await Promise.all([
    db
      .select({
        type: orderItems.type,
        productId: sql<string | null>`max(${orderItems.productId})`,
        name: latest(orderItems.name),
        sku: latest(sql`${orderItems.productSku}`),
        categoryName: latest(sql`${orderItems.categoryName}`),
        units: lineUnits,
        revenue: lineRevenue,
        orders: orderCount(),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(counted)
      .groupBy(orderItems.type, productKey)
      .orderBy(desc(lineRevenue), desc(lineUnits), productKey)
      .limit(limit),
    db
      .select({ value: count() })
      .from(
        db
          .selectDistinct({ type: orderItems.type, key: productKey.as("key") })
          .from(orderItems)
          .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
          .where(counted)
          .as("sold"),
      ),
    db
      .select({ type: orderItems.type, units: units(), revenue: revenue(), orders: orderCount() })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(counted)
      .groupBy(orderItems.type),
  ]);

  const byType = {
    catalog: { units: 0, revenue: 0, orders: 0 },
    custom: { units: 0, revenue: 0, orders: 0 },
  };
  for (const row of byTypeRows) {
    byType[row.type] = { units: Number(row.units), revenue: Number(row.revenue), orders: Number(row.orders) };
  }

  return {
    range,
    rows: rows.map((row) => ({
      type: row.type,
      productId: row.productId,
      name: row.name ?? "",
      sku: row.sku,
      categoryName: row.categoryName,
      units: Number(row.units),
      revenue: Number(row.revenue),
      orders: Number(row.orders),
    })),
    distinct: Number(distinct[0]?.value ?? 0),
    byType,
    totals: {
      units: byType.catalog.units + byType.custom.units,
      revenue: byType.catalog.revenue + byType.custom.revenue,
    },
    source: DATA_SOURCES.orderItems,
    definition:
      "Order lines of paid orders (excluding demonstration, cancelled and failed orders, and cancelled or failed lines), grouped by the product id recorded on the line, or by the name it was sold under where none was recorded. Revenue is the line total, before shipping and GST.",
    generatedAt: (options.now ?? new Date()).toISOString(),
  };
}

export const CATEGORY_DEFINITION =
  "The same order lines as product performance. A catalog line is attributed to the category recorded on it when the order was placed; lines placed before categories were recorded are reported as unavailable, not assigned. Custom prints have no category and are shown separately.";

/** Revenue by category, from the categories snapshotted on each line. Five aggregate queries. */
export async function getCategoryRevenue(
  _operator: OperatorSession,
  range: DateRange,
  now: Date = new Date(),
): Promise<CategoryRevenue> {
  const db = await getDatabase();
  const counted = soldLines(range);
  const catalog = eq(orderItems.type, "catalog");
  const leafRevenue = revenue();
  const rootRevenue = revenue();

  const base = () =>
    db
      .select({ lines: count(), units: units(), revenue: revenue(), orders: orderCount() })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference));

  const [leaves, roots, [categorised], [uncategorised], [custom], [span]] = await Promise.all([
    db
      .select({
        id: orderItems.categoryId,
        name: latest(sql`${orderItems.categoryName}`),
        parentName: latest(sql`${orderItems.browseCategoryName}`),
        units: units(),
        revenue: leafRevenue,
        orders: orderCount(),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(and(counted, catalog, isNotNull(orderItems.categoryId)))
      .groupBy(orderItems.categoryId)
      .orderBy(desc(leafRevenue), orderItems.categoryId)
      .limit(CATEGORY_LIMIT),
    db
      .select({
        id: orderItems.browseCategoryId,
        name: latest(sql`${orderItems.browseCategoryName}`),
        units: units(),
        revenue: rootRevenue,
        orders: orderCount(),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(and(counted, catalog, isNotNull(orderItems.browseCategoryId)))
      .groupBy(orderItems.browseCategoryId)
      .orderBy(desc(rootRevenue), orderItems.browseCategoryId)
      .limit(CATEGORY_LIMIT),
    base().where(and(counted, catalog, isNotNull(orderItems.categoryId))),
    base().where(and(counted, catalog, isNull(orderItems.categoryId))),
    base().where(and(counted, eq(orderItems.type, "custom"))),
    db
      .select({
        first: sql<string | null>`to_char(min(${orders.placedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
        last: sql<string | null>`to_char(max(${orders.placedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.reference, orderItems.orderReference))
      .where(and(counted, catalog, isNull(orderItems.categoryId))),
  ]);

  const toRow = (row: { id: string | null; name: string | null; parentName?: string | null; units: number; revenue: number; orders: number }) => ({
    id: row.id ?? "",
    name: row.name ?? row.id ?? "",
    parentName: row.parentName ?? null,
    units: Number(row.units),
    revenue: Number(row.revenue),
    orders: Number(row.orders),
  });
  const totals = (row: { lines: number; units: number; revenue: number; orders: number } | undefined) => ({
    lines: Number(row?.lines ?? 0),
    units: Number(row?.units ?? 0),
    revenue: Number(row?.revenue ?? 0),
    orders: Number(row?.orders ?? 0),
  });

  const categorisedTotals = totals(categorised);
  return {
    range,
    categories: leaves.map(toRow),
    browse: roots.map(toRow),
    categorised: { lines: categorisedTotals.lines, units: categorisedTotals.units, revenue: categorisedTotals.revenue },
    uncategorised: { ...totals(uncategorised), firstPlaced: span?.first ?? null, lastPlaced: span?.last ?? null },
    custom: totals(custom),
    source: DATA_SOURCES.orderItems,
    definition: CATEGORY_DEFINITION,
    generatedAt: now.toISOString(),
  };
}
