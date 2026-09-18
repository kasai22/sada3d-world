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
import { TrendChart } from "@/components/ops/TrendChart";
import { Panel } from "@/components/structure/Panel";
import { getManufacturingSummary } from "@/lib/ops/analytics/manufacturing";
import { getOrderSummary } from "@/lib/ops/analytics/orders";
import { BUSINESS_TIME_ZONE, businessDay, parseRange, rangeParams } from "@/lib/ops/analytics/range";
import { getRevenueSummary } from "@/lib/ops/analytics/revenue";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { ORDER_STATUSES, hrefWith, type SearchParamsRecord } from "@/lib/ops/query";
import { ORDER_STATUS_LABEL } from "@/lib/orders/types";

export const metadata: Metadata = { title: "Revenue analytics" };

const PATH = "/admin/analytics";

/**
 * Analytics › Revenue: revenue over the range, and how orders and production
 * behaved. Counts from the records, split the ways the records support. Product
 * sales and material usage are the sibling tabs, with the same range.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const now = new Date();
  const range = parseRange(await searchParams, now);
  const keep = rangeParams(range);

  const [revenue, orders, manufacturing] = await Promise.all([
    getRevenueSummary(operator, range, now),
    getOrderSummary(operator, range, now),
    getManufacturingSummary(operator, range, now),
  ]);

  const { lines } = orders;
  const { inRange } = manufacturing;
  const totalLines = lines.catalog.lines + lines.custom.lines;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Revenue, orders and production over the selected range, counted from the records. Nothing is estimated or projected."
      />

      <SectionTabs label="Analytics" tabs={analyticsTabs("revenue", keep)} />

      <RangePicker path={PATH} range={range} />

      <Panel
        title="Revenue trend"
        titleAs="h2"
        meta={`Rupees per ${revenue.bucket} · ${range.label} · ${BUSINESS_TIME_ZONE.label}`}
        actions={<PanelLink href={hrefWith("/admin/sales", keep)}>Sales</PanelLink>}
        padded={false}
        className={styles.section}
      >
        {revenue.figure.orders > 0 ? (
          <div className={styles.padded}>
            <p className={styles.lead}>
              {formatINR(revenue.figure.amount)} from {formatCount(revenue.figure.orders)} paid{" "}
              {revenue.figure.orders === 1 ? "order" : "orders"}
            </p>
            <TrendChart
              label={`Revenue per ${revenue.bucket}`}
              unit={["rupee", "rupees"]}
              format="inr"
              zone={BUSINESS_TIME_ZONE.label}
              data={revenue.series.map((point) => ({ day: point.key, value: point.amount }))}
              currentLabel={range.toDay === businessDay(now) ? (range.bucket === "day" ? "Today" : "This month") : null}
            />
          </div>
        ) : (
          <EmptyState compact icon="wallet" title="No sales in this range">
            <p>
              Paid orders appear here by the {BUSINESS_TIME_ZONE.label} {revenue.bucket} they were placed. Choose a wider
              range, or wait for the first paid order.
            </p>
          </EmptyState>
        )}
        <SourceNote trace={revenue} />
      </Panel>

      <section className={styles.kpis} aria-label="Range figures">
        <KpiCard
          label="Orders placed"
          meta={range.label}
          value={formatCount(orders.placed)}
          detail={orders.demoPlaced > 0 ? `${formatCount(orders.demoPlaced)} demonstration orders excluded` : "Real orders only."}
          icon="clipboard"
          href={hrefWith("/admin/sales", keep)}
        />
        <KpiCard
          label="Jobs started"
          meta={range.label}
          value={formatCount(inRange.started)}
          detail="Custom parts that entered production."
          icon="factory"
        />
        <KpiCard
          label="Jobs completed"
          meta={range.label}
          value={formatCount(inRange.completed)}
          detail={`${formatCount(inRange.dispatched)} parts dispatched`}
          icon="check-circle"
        />
        <KpiCard
          label="Quality rejections"
          meta={range.label}
          value={formatCount(inRange.rejected)}
          detail={`${formatCount(inRange.failed)} jobs failed`}
          icon="alert"
          signal={inRange.failed > 0 ? "danger" : inRange.rejected > 0 ? "warning" : undefined}
        />
      </section>

      <div className={`${styles.columns} ${styles.columnsEven}`}>
        <Panel
          title="Orders by current status"
          titleAs="h2"
          meta={range.label}
          actions={<PanelLink href="/admin/orders">Orders</PanelLink>}
          padded={false}
        >
          {orders.placed === 0 ? (
            <EmptyState compact icon="clipboard" title="No orders yet">
              <p>Orders placed in this range appear here, grouped by where each one stands now.</p>
            </EmptyState>
          ) : (
            <BarList
              label="Orders by status"
              rows={ORDER_STATUSES.filter((status) => orders.byStatus[status] > 0).map((status) => ({
                id: status,
                label: ORDER_STATUS_LABEL[status],
                value: orders.byStatus[status],
                display: formatCount(orders.byStatus[status]),
                href: hrefWith("/admin/orders", { status, demo: "exclude" }),
              }))}
            />
          )}
          <SourceNote trace={orders} />
        </Panel>

        <Panel title="What was ordered" titleAs="h2" meta={range.label} padded={false}>
          {totalLines === 0 ? (
            <EmptyState compact icon="box" title="No order lines yet">
              <p>Catalog parts and custom prints ordered in this range are counted here.</p>
            </EmptyState>
          ) : (
            <BarList
              label="Order lines by type"
              rows={[
                {
                  id: "catalog",
                  label: "Catalog parts",
                  note: `${formatCount(lines.catalog.units)} units`,
                  value: lines.catalog.lines,
                  display: `${formatCount(lines.catalog.lines)} lines`,
                },
                {
                  id: "custom",
                  label: "Custom prints",
                  note: `${formatCount(lines.custom.units)} parts`,
                  value: lines.custom.lines,
                  display: `${formatCount(lines.custom.lines)} lines`,
                },
              ]}
            />
          )}
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            Units and revenue per product are on the Product sales tab.
          </p>
        </Panel>
      </div>

      <div className={`${styles.columns} ${styles.columnsEven}`}>
        <Panel
          title="Production on the floor"
          titleAs="h2"
          meta="Now"
          actions={<PanelLink href="/admin/manufacturing">Board</PanelLink>}
          padded={false}
        >
          {manufacturing.active === 0 ? (
            <EmptyState compact icon="factory" title="No production jobs yet">
              <p>Active jobs appear here by stage once custom parts are ordered.</p>
            </EmptyState>
          ) : (
            <BarList
              label="Active jobs by stage"
              rows={manufacturing.stages.map((entry) => ({
                id: entry.stage.id,
                label: entry.stage.label,
                note: entry.held > 0 ? `${formatCount(entry.held)} on hold · ${entry.stage.hint}` : entry.stage.hint,
                value: entry.count,
                display: formatCount(entry.count),
              }))}
            />
          )}
          {manufacturing.demoActive > 0 && (
            <p className={styles.gap}>
              <Icon name="info" size={14} />
              {formatCount(manufacturing.demoActive)} of these belong to demonstration orders.
            </p>
          )}
          <SourceNote trace={manufacturing} />
        </Panel>

        <Panel title="Machines" titleAs="h2" meta="Now" padded={false}>
          {manufacturing.machines.length === 0 ? (
            <EmptyState compact icon="cpu" title="No machine assignments yet">
              <p>When an active job records the machine it was assigned to, the number of jobs per machine appears here.</p>
            </EmptyState>
          ) : (
            <BarList
              label="Active jobs per assigned machine"
              rows={manufacturing.machines.map((machine) => ({
                id: machine.machineId,
                label: <span className={styles.mono}>{machine.machineId}</span>,
                value: machine.activeJobs,
                display: `${formatCount(machine.activeJobs)} ${machine.activeJobs === 1 ? "job" : "jobs"}`,
              }))}
            />
          )}
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            {manufacturing.utilisation.reason}
          </p>
        </Panel>
      </div>
    </>
  );
}
