import type { Metadata } from "next";

import { Button } from "@/components/core/Button";
import { analyticsTabs } from "@/components/ops/areas";
import { Icon } from "@/components/core/Icon";
import styles from "@/components/ops/command/command.module.css";
import { RangePicker } from "@/components/ops/command/RangePicker";
import { SourceNote } from "@/components/ops/command/SourceNote";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Panel } from "@/components/structure/Panel";
import { BarList } from "@/components/ops/command/BarList";
import { LocalTime } from "@/components/tracking/LocalTime";
import { PRODUCT_LIMIT_MAX, getCategoryRevenue, getProductPerformance } from "@/lib/ops/analytics/products";
import { parseRange, rangeParams } from "@/lib/ops/analytics/range";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import type { SearchParamsRecord } from "@/lib/ops/query";

export const metadata: Metadata = { title: "Product sales" };

const PATH = "/admin/analytics/products";

const share = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/**
 * Product sales: what sold, from order lines. Sorted by revenue — a
 * sort, not a "best seller" claim. Product management is at /admin/products;
 * catalog readiness is on the Catalog page.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const now = new Date();
  const range = parseRange(await searchParams, now);
  const [performance, categories] = await Promise.all([
    getProductPerformance(operator, range, { limit: PRODUCT_LIMIT_MAX, now }),
    getCategoryRevenue(operator, range, now),
  ]);
  const { byType, totals } = performance;

  return (
    <>
      <PageHeader
        title="Product sales"
        description="What sold, from paid order lines: units, orders and revenue per product or custom print."
        actions={
          <>
            <Button href="/admin/products" size="sm" variant="secondary" iconLeft="box">
              Manage products
            </Button>
          </>
        }
      />

      <SectionTabs label="Analytics" tabs={analyticsTabs("products", rangeParams(range))} />

      <RangePicker path={PATH} range={range} />

      <section className={styles.kpis} aria-label="Product figures">
        <KpiCard
          label="Products sold"
          meta={range.label}
          value={performance.distinct > 0 ? formatCount(performance.distinct) : "No sales yet"}
          muted={performance.distinct === 0}
          detail="Distinct names sold under, catalog and custom."
          icon="box"
        />
        <KpiCard label="Units sold" meta={range.label} value={formatCount(totals.units)} detail="Quantities on sold lines." icon="boxes" />
        <KpiCard
          label="Catalog parts"
          meta={range.label}
          value={formatINR(byType.catalog.revenue)}
          detail={`${formatCount(byType.catalog.units)} units · ${formatCount(byType.catalog.orders)} orders`}
          icon="package"
        />
        <KpiCard
          label="Custom prints"
          meta={range.label}
          value={formatINR(byType.custom.revenue)}
          detail={`${formatCount(byType.custom.units)} parts · ${formatCount(byType.custom.orders)} orders`}
          icon="file-box"
        />
      </section>

      <Panel
        title="Revenue by product"
        titleAs="h2"
        meta={
          performance.distinct > performance.rows.length
            ? `Top ${performance.rows.length} of ${formatCount(performance.distinct)} · ${range.label}`
            : range.label
        }
        padded={false}
        className={styles.section}
      >
        {performance.rows.length === 0 ? (
          <EmptyState icon="box" title="No product sales yet">
            <p>
              Once paid orders exist in this range, every product and custom print sold is listed here with its units,
              orders and line revenue.
            </p>
          </EmptyState>
        ) : (
          <TableFrame label="Revenue by product" caption="Products sold in the range, by line revenue">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th hide="md">Category</Th>
                <Th hide="sm">Type</Th>
                <Th align="right">Units</Th>
                <Th align="right" hide="sm">
                  Orders
                </Th>
                <Th align="right">Revenue</Th>
                <Th align="right" hide="md">
                  Share
                </Th>
              </tr>
            </thead>
            <tbody>
              {performance.rows.map((row) => (
                <Tr key={`${row.type}:${row.productId ?? row.name}`}>
                  <Td>
                    <Stack
                      primary={row.name}
                      secondary={
                        row.type === "custom"
                          ? "Customer's own file"
                          : row.productId
                            ? [row.productId.toUpperCase(), row.sku].filter(Boolean).join(" · ")
                            : "Sold before product ids were recorded"
                      }
                    />
                  </Td>
                  <Td hide="md">
                    {row.categoryName ?? <span className={styles.quiet}>{row.type === "custom" ? "—" : "Not recorded"}</span>}
                  </Td>
                  <Td hide="sm">
                    <StatusBadge tone={row.type === "custom" ? "info" : "neutral"} dot={false}>
                      {row.type === "custom" ? "Custom print" : "Catalog"}
                    </StatusBadge>
                  </Td>
                  <Td align="right" mono>
                    {formatCount(row.units)}
                  </Td>
                  <Td align="right" mono hide="sm">
                    {formatCount(row.orders)}
                  </Td>
                  <Td align="right" mono nowrap>
                    {formatINR(row.revenue)}
                  </Td>
                  <Td align="right" mono hide="md">
                    {share(row.revenue, totals.revenue)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableFrame>
        )}
        <SourceNote trace={performance} />
      </Panel>

      <Panel
        title="Revenue by category"
        titleAs="h2"
        meta={range.label}
        padded={false}
        className={styles.section}
      >
        {categories.categorised.lines === 0 ? (
          <EmptyState compact icon="layers" title="No categorized sales yet">
            <p>Category revenue will appear as new orders are placed. Each catalog line now records its category when it is ordered.</p>
          </EmptyState>
        ) : (
          <div className={`${styles.columns} ${styles.columnsEven} ${styles.flush}`}>
            <div>
              <p className={`${styles.heading} ${styles.headingInset}`}>
                By browse category
              </p>
              <BarList
                label="Revenue by browse category"
                rows={categories.browse.map((row) => ({
                  id: row.id,
                  label: row.name,
                  note: `${formatCount(row.units)} units · ${formatCount(row.orders)} orders`,
                  value: row.revenue,
                  display: formatINR(row.revenue),
                }))}
              />
            </div>
            <div>
              <p className={`${styles.heading} ${styles.headingInset}`}>
                By category
              </p>
              <BarList
                label="Revenue by category"
                rows={categories.categories.map((row) => ({
                  id: row.id,
                  label: row.name,
                  note: `${row.parentName ? `${row.parentName} · ` : ""}${formatCount(row.units)} units · ${formatCount(row.orders)} orders`,
                  value: row.revenue,
                  display: formatINR(row.revenue),
                }))}
              />
            </div>
          </div>
        )}
        {categories.uncategorised.lines > 0 && (
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            <span>
              Historical category data unavailable for {formatINR(categories.uncategorised.revenue)} of catalog revenue (
              {formatCount(categories.uncategorised.lines)} {categories.uncategorised.lines === 1 ? "line" : "lines"}
              {categories.uncategorised.firstPlaced && categories.uncategorised.lastPlaced && (
                <>
                  , placed <LocalTime value={categories.uncategorised.firstPlaced} dateOnly /> –{" "}
                  <LocalTime value={categories.uncategorised.lastPlaced} dateOnly />
                </>
              )}
              ). Those lines were ordered before categories were recorded and are not assigned by guesswork.
            </span>
          </p>
        )}
        {categories.custom.lines > 0 && (
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            Custom prints have no catalog category: {formatINR(categories.custom.revenue)} across{" "}
            {formatCount(categories.custom.orders)} {categories.custom.orders === 1 ? "order" : "orders"}.
          </p>
        )}
        <SourceNote trace={categories} />
      </Panel>
    </>
  );
}
