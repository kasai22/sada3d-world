import type { Metadata } from "next";

import { Icon } from "@/components/core/Icon";
import { analyticsTabs } from "@/components/ops/areas";
import { BarList } from "@/components/ops/command/BarList";
import styles from "@/components/ops/command/command.module.css";
import { RangePicker } from "@/components/ops/command/RangePicker";
import { SourceNote } from "@/components/ops/command/SourceNote";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader, PanelLink } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { formatQuantity } from "@/lib/inventory/rules";
import { getMaterialAnalytics } from "@/lib/ops/analytics/materials";
import { parseRange, rangeParams } from "@/lib/ops/analytics/range";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { hrefWith, type SearchParamsRecord } from "@/lib/ops/query";

export const metadata: Metadata = { title: "Material usage" };

const PATH = "/admin/analytics/materials";

/**
 * Analytics › Material usage: custom-print sales by the material they were
 * quoted in, and raw material used and wasted according to the inventory
 * ledger. Catalog lines record no material, and the page says so.
 */
export default async function MaterialAnalyticsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const now = new Date();
  const range = parseRange(await searchParams, now);
  const keep = rangeParams(range);
  const data = await getMaterialAnalytics(operator, range, now);

  const customRevenue = data.sales.reduce((sum, row) => sum + row.revenue, 0) + data.customUnrecorded.revenue;
  const customParts = data.sales.reduce((sum, row) => sum + row.units, 0);
  const usedItems = data.usage.filter((row) => row.used > 0).length;
  const wasteItems = data.usage.filter((row) => row.wasted > 0).length;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Which materials were sold and consumed over the selected range — from recorded quote configurations and the inventory ledger."
      />

      <SectionTabs label="Analytics" tabs={analyticsTabs("materials", keep)} />

      <RangePicker path={PATH} range={range} />

      <section className={styles.kpis} aria-label="Material figures">
        <KpiCard
          label="Custom-print revenue"
          meta={range.label}
          value={customRevenue > 0 ? formatINR(customRevenue) : "No custom sales"}
          muted={customRevenue === 0}
          detail={`${formatCount(customParts)} parts with a recorded material`}
          icon="file-box"
        />
        <KpiCard
          label="Materials sold"
          meta={range.label}
          value={formatCount(data.sales.length)}
          detail="Distinct materials on custom-print lines."
          icon="palette"
        />
        <KpiCard
          label="Raw material used"
          meta={range.label}
          value={data.rawItems === 0 ? "Not tracked" : formatCount(usedItems)}
          muted={data.rawItems === 0}
          detail={data.rawItems === 0 ? "No raw-material items are defined yet." : "Items with usage movements."}
          icon="layers"
          href="/admin/inventory"
        />
        <KpiCard
          label="Waste recorded"
          meta={range.label}
          value={data.rawItems === 0 ? "Not tracked" : formatCount(wasteItems)}
          muted={data.rawItems === 0}
          detail={data.rawItems === 0 ? "Inventory not initialized." : "Items with waste written off."}
          icon="trash"
          signal={wasteItems > 0 ? "warning" : undefined}
        />
      </section>

      <div className={`${styles.columns} ${styles.columnsEven}`}>
        <Panel title="Custom-print revenue by material" titleAs="h2" meta={range.label} padded={false}>
          {data.sales.length === 0 ? (
            <EmptyState compact icon="palette" title="No custom-print sales in this range">
              <p>Paid custom prints appear here under the material they were quoted in.</p>
            </EmptyState>
          ) : (
            <BarList
              label="Custom-print revenue by material"
              rows={data.sales.map((row) => ({
                id: row.material,
                label: row.material,
                note: `${formatCount(row.units)} ${row.units === 1 ? "part" : "parts"} · ${formatCount(row.orders)} ${row.orders === 1 ? "order" : "orders"}`,
                value: row.revenue,
                display: formatINR(row.revenue),
              }))}
            />
          )}
          {data.customUnrecorded.lines > 0 && (
            <p className={styles.gap}>
              <Icon name="info" size={14} />
              {formatCount(data.customUnrecorded.lines)} custom {data.customUnrecorded.lines === 1 ? "line has" : "lines have"} no
              material in their recorded configuration ({formatINR(data.customUnrecorded.revenue)}).
            </p>
          )}
          {data.catalogUnrecorded.lines > 0 && (
            <p className={styles.gap}>
              <Icon name="info" size={14} />
              Catalog lines record no material: {formatINR(data.catalogUnrecorded.revenue)} across{" "}
              {formatCount(data.catalogUnrecorded.units)} units is not split by material, and is not assigned from today&apos;s catalog.
            </p>
          )}
          <SourceNote trace={data} />
        </Panel>

        <Panel
          title="Raw material consumed"
          titleAs="h2"
          meta={range.label}
          actions={<PanelLink href="/admin/inventory">Inventory</PanelLink>}
          padded={false}
        >
          {data.rawItems === 0 ? (
            <EmptyState compact icon="boxes" title="Inventory not initialized">
              <p>Create the inventory definitions and enter opening stock to track filament usage and waste.</p>
            </EmptyState>
          ) : data.usage.length === 0 ? (
            <EmptyState compact icon="layers" title="No usage or waste recorded in this range">
              <p>Usage is recorded against a production job; waste needs a reason. Both appear here once entered.</p>
            </EmptyState>
          ) : (
            <TableFrame label="Raw material consumed" caption="Usage and waste per raw-material item in the range">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Used</Th>
                  <Th align="right">Wasted</Th>
                  <Th align="right" hide="sm">
                    Movements
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.usage.map((row) => (
                  <Tr key={row.itemId}>
                    <Td>
                      <Stack
                        primary={row.name}
                        secondary={[row.material?.toUpperCase(), row.colour].filter(Boolean).join(" · ") || "Material not set"}
                      />
                    </Td>
                    <Td align="right" mono nowrap>
                      {formatQuantity(row.used, row.unit)}
                    </Td>
                    <Td align="right" mono nowrap>
                      {row.wasted > 0 ? formatQuantity(row.wasted, row.unit) : "—"}
                    </Td>
                    <Td align="right" mono hide="sm">
                      <a href={hrefWith("/admin/inventory", { item: row.itemId })}>{formatCount(row.movements)}</a>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Panel>
      </div>
    </>
  );
}
