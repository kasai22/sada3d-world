import type { Metadata } from "next";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import { ActivityFeed } from "@/components/ops/ActivityFeed";
import { AttentionList } from "@/components/ops/command/AttentionList";
import { BarList } from "@/components/ops/command/BarList";
import styles from "@/components/ops/command/command.module.css";
import { Meter } from "@/components/ops/command/Meter";
import { RangePicker } from "@/components/ops/command/RangePicker";
import { RecentOrders } from "@/components/ops/command/RecentOrders";
import { SourceNote } from "@/components/ops/command/SourceNote";
import { StageChips } from "@/components/ops/command/StageChips";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader, PanelLink } from "@/components/ops/PageHeader";
import { PipelineStrip } from "@/components/ops/PipelineStrip";
import { TrendChart } from "@/components/ops/TrendChart";
import { Panel } from "@/components/structure/Panel";
import { LocalTime } from "@/components/tracking/LocalTime";
import { getDatabase } from "@/lib/db/client";
import { getAttention } from "@/lib/ops/analytics/attention";
import { getCatalogHealth } from "@/lib/ops/analytics/catalog";
import { getInventoryStatus } from "@/lib/ops/analytics/inventory";
import { getManufacturingSummary } from "@/lib/ops/analytics/manufacturing";
import { getOrderStageCounts, getOrderSummary } from "@/lib/ops/analytics/orders";
import { getProductPerformance } from "@/lib/ops/analytics/products";
import { BUSINESS_TIME_ZONE, businessDay, parseRange, rangeParams } from "@/lib/ops/analytics/range";
import { getRevenuePeriods, getRevenueSummary } from "@/lib/ops/analytics/revenue";
import { readActivity } from "@/lib/ops/dashboard";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { listOpsOrders } from "@/lib/ops/orders";
import { paymentAdapterStatus } from "@/lib/ops/payments";
import { hrefWith, parseOrderListQuery, type SearchParamsRecord } from "@/lib/ops/query";
import { CMS_HOME } from "@/lib/ops/routes";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Command Center" };

const PATH = "/admin";
const RECENT_ORDERS = 8;
const TOP_PRODUCTS = 5;

/** Where each summary stage is on the production board. */
const BOARD_COLUMN = {
  queued: "queued",
  printing: "printing",
  post_processing: "finishing",
  quality: "inspection",
  ready: "packing",
} as const;

/**
 * The Reality 3D Command Center.
 *
 * One page that answers: how much did we sell, how many orders, what is
 * selling, what needs manufacturing attention, what inventory is low, what
 * needs approval, and what needs the owner today. Every figure comes from a
 * service in `lib/ops/analytics`, over the range in the URL, and says where it
 * came from. Where the records do not exist, the page says so instead of
 * showing a number.
 */
export default async function CommandCenterPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const now = new Date();
  const range = parseRange(params, now);
  const db = await getDatabase();

  const [revenue, periods, orders, stageCounts, recent, products, manufacturing, catalog, attention, activity, inventory] =
    await Promise.all([
      getRevenueSummary(operator, range, now),
      getRevenuePeriods(operator, now),
      getOrderSummary(operator, range, now),
      getOrderStageCounts(operator),
      listOpsOrders(operator, parseOrderListQuery({}), RECENT_ORDERS),
      getProductPerformance(operator, range, { limit: TOP_PRODUCTS, now }),
      getManufacturingSummary(operator, range, now),
      getCatalogHealth(operator),
      getAttention(operator),
      readActivity(operator, db, { limit: 8 }),
      getInventoryStatus(operator, now),
    ]);

  const adapter = paymentAdapterStatus();
  const { figure } = revenue;
  const hasSales = figure.orders > 0;
  const keep = rangeParams(range);
  const pendingApprovals = catalog.stages["READY FOR REVIEW"] + catalog.pricesAwaitingApproval;
  const rangeMeta = range.label;

  const moneyNote = [
    figure.mockPayments > 0 && `${formatCount(figure.mockPayments)} via mock payments — no money moved`,
    figure.provisional > 0 && `${formatCount(figure.provisional)} on provisional pricing`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title="Command Center"
        description={`${BRAND.tagline} How Reality 3D is selling, making and shipping — and what needs you today.`}
        meta={
          <span className={styles.stamp}>
            As of <LocalTime value={now.toISOString()} />
          </span>
        }
        actions={
          <>
            <Button href="/admin/manufacturing" size="sm" variant="secondary" iconLeft="factory">
              Production board
            </Button>
            <Button href="/admin/products" size="sm" variant="secondary" iconLeft="box">
              Products
            </Button>
            <Button href={CMS_HOME} size="sm" variant="ghost" iconLeft="settings-2">
              Advanced CMS
            </Button>
          </>
        }
      />

      <RangePicker path={PATH} range={range} />

      {/* ---------------- 1. Headline figures ---------------- */}
      <section className={`${styles.kpis} ${styles.kpisWide}`} aria-label="Key figures">
        <KpiCard
          label="Revenue"
          meta={rangeMeta}
          value={hasSales ? formatINR(figure.amount) : "No sales yet"}
          muted={!hasSales}
          detail={
            hasSales
              ? `${formatCount(figure.orders)} paid ${figure.orders === 1 ? "order" : "orders"}${figure.averageOrderValue !== null ? ` · ${formatINR(figure.averageOrderValue)} average` : ""}${moneyNote ? ` · ${moneyNote}` : ""}`
              : "Appears once a paid order is placed in this range."
          }
          icon="wallet"
          href={hrefWith("/admin/sales", keep)}
        />
        <KpiCard
          label="Orders"
          meta={rangeMeta}
          value={orders.placed > 0 ? formatCount(orders.placed) : "No orders yet"}
          muted={orders.placed === 0}
          detail={
            orders.placed > 0
              ? `${formatCount(orders.open)} open now${orders.demoPlaced > 0 ? ` · ${formatCount(orders.demoPlaced)} demo excluded` : ""}`
              : "Orders placed in this range appear here."
          }
          icon="clipboard"
          href="/admin/orders"
        />
        <KpiCard
          label="Open production"
          meta="Now"
          value={manufacturing.active > 0 ? formatCount(manufacturing.active) : "No jobs"}
          muted={manufacturing.active === 0}
          detail={
            manufacturing.active > 0
              ? manufacturing.held > 0
                ? `${formatCount(manufacturing.held)} on hold`
                : "None on hold"
              : "Custom parts appear here when ordered."
          }
          icon="factory"
          href="/admin/manufacturing"
          signal={manufacturing.held > 0 ? "warning" : undefined}
        />
        <KpiCard
          label="Inventory value"
          meta="Now · at latest cost"
          value={inventory.value !== null ? formatINR(inventory.value) : inventory.initialized ? "Unavailable" : "Not tracked"}
          muted={inventory.value === null}
          detail={
            inventory.value !== null
              ? `${formatCount(inventory.summary.tracked)} tracked ${inventory.summary.tracked === 1 ? "item" : "items"}`
              : inventory.initialized
                ? `${formatCount(inventory.summary.missingCost)} tracked ${inventory.summary.missingCost === 1 ? "item has" : "items have"} no unit cost`
                : "Inventory not initialized."
          }
          icon="boxes"
          href="/admin/inventory"
        />
        <KpiCard
          label="Low stock items"
          meta="Now"
          value={inventory.initialized ? formatCount(inventory.summary.reorderRequired) : "Not tracked"}
          muted={!inventory.initialized}
          detail={
            inventory.initialized
              ? `${formatCount(inventory.summary.outOfStock)} out of stock · ${formatCount(inventory.summary.lowStock)} below reorder level${
                  manufacturing.heldForMaterial > 0 ? ` · ${formatCount(manufacturing.heldForMaterial)} held for material` : ""
                }`
              : manufacturing.heldForMaterial > 0
                ? `${formatCount(manufacturing.heldForMaterial)} ${manufacturing.heldForMaterial === 1 ? "job" : "jobs"} held for material`
                : "No opening stock entered yet."
          }
          icon="layers"
          href={inventory.initialized ? "/admin/inventory?status=REORDER" : "/admin/inventory"}
          signal={
            manufacturing.heldForMaterial > 0 || inventory.summary.outOfStock > 0
              ? "danger"
              : inventory.summary.lowStock > 0
                ? "warning"
                : undefined
          }
        />
        <KpiCard
          label="Pending approvals"
          meta="Now"
          value={catalog.reachable ? formatCount(pendingApprovals) : "Unavailable"}
          muted={!catalog.reachable}
          detail={
            catalog.reachable
              ? `${formatCount(catalog.stages["READY FOR REVIEW"])} products · ${formatCount(catalog.pricesAwaitingApproval)} prices`
              : "The CMS could not be read."
          }
          icon="check-circle"
          href="/admin/catalog"
          signal={pendingApprovals > 0 ? "warning" : undefined}
        />
      </section>

      {/* ---------------- 2. Needs your attention ---------------- */}
      <Panel
        title="Needs your attention"
        titleAs="h2"
        meta={attention.length > 0 ? `${formatCount(attention.length)} ${attention.length === 1 ? "item" : "items"} · now` : "now"}
        actions={<PanelLink href="/admin/issues">Exception centre</PanelLink>}
        padded={false}
        className={styles.section}
      >
        {attention.length === 0 ? (
          <EmptyState compact icon="check-circle" title="Nothing needs your attention">
            <p>No failed payments, production problems, parcels to dispatch, or catalog items waiting for a decision.</p>
          </EmptyState>
        ) : (
          <AttentionList items={attention} />
        )}
      </Panel>

      {/* ---------------- 3. Sales ---------------- */}
      <Panel
        title="Sales"
        titleAs="h2"
        meta={`Revenue · ${range.label}`}
        actions={<PanelLink href={hrefWith("/admin/sales", keep)}>Sales</PanelLink>}
        padded={false}
        className={styles.section}
      >
        <dl className={styles.periods}>
          {periods.map((period) => (
            <div key={period.id} className={styles.period}>
              <dt>{period.label}</dt>
              <dd>
                <span className={styles.periodValue}>
                  {period.figure.orders > 0 ? formatINR(period.figure.amount) : "—"}
                </span>
                <span className={styles.periodNote}>
                  {period.figure.orders > 0
                    ? `${formatCount(period.figure.orders)} paid · ${period.range.label}`
                    : `No sales · ${period.range.label}`}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {hasSales ? (
          <div className={styles.padded}>
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
          <EmptyState compact icon="wallet" title="No sales data yet">
            <p>
              Paid orders appear here by the {BUSINESS_TIME_ZONE.label} day they were placed, with revenue per{" "}
              {revenue.bucket}. Nothing is estimated or projected.
            </p>
          </EmptyState>
        )}
        {revenue.stopped.orders > 0 && (
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            {formatCount(revenue.stopped.orders)} paid {revenue.stopped.orders === 1 ? "order was" : "orders were"} later
            cancelled or failed ({formatINR(revenue.stopped.amount)}). They are not in revenue, and no refund is recorded.
          </p>
        )}
        {adapter.configured && adapter.mode === "mock" && (
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            Payments are in mock mode on this deployment: a “paid” order here moved no money.
          </p>
        )}
        <SourceNote trace={revenue} />
      </Panel>

      {/* ---------------- 4. Orders and products ---------------- */}
      <div className={styles.columns}>
        <Panel
          title="Recent orders"
          titleAs="h2"
          meta="Newest first · all orders"
          actions={<PanelLink href="/admin/orders">All orders</PanelLink>}
          padded={false}
        >
          <div className={styles.padded}>
            <StageChips counts={stageCounts} />
          </div>
          {recent.total === 0 ? (
            <EmptyState compact icon="clipboard" title="No orders yet">
              <p>Orders appear here as customers place them, with payment, production and dispatch status.</p>
            </EmptyState>
          ) : (
            <RecentOrders rows={recent.rows} now={now} />
          )}
        </Panel>

        <Panel
          title="What is selling"
          titleAs="h2"
          meta={`By revenue · ${range.label}`}
          actions={<PanelLink href={hrefWith("/admin/analytics/products", keep)}>Product sales</PanelLink>}
          padded={false}
        >
          {products.rows.length === 0 ? (
            <EmptyState compact icon="box" title="No product sales yet">
              <p>Once paid orders exist in this range, each product and custom print sold appears here with units and revenue.</p>
            </EmptyState>
          ) : (
            <BarList
              label="Products by revenue"
              rows={products.rows.map((row) => ({
                id: `${row.type}:${row.name}`,
                label: row.name,
                note: `${row.type === "custom" ? "Custom print" : "Catalog"} · ${formatCount(row.units)} ${row.units === 1 ? "unit" : "units"} · ${formatCount(row.orders)} ${row.orders === 1 ? "order" : "orders"}`,
                value: row.revenue,
                display: formatINR(row.revenue),
              }))}
            />
          )}
          <SourceNote trace={products} />
        </Panel>
      </div>

      {/* ---------------- 5. Manufacturing ---------------- */}
      <Panel
        title="Manufacturing"
        titleAs="h2"
        meta={`Active now · dispatched ${range.label}`}
        actions={<PanelLink href="/admin/manufacturing">Production board</PanelLink>}
        padded={false}
        className={styles.section}
      >
        {manufacturing.active === 0 && manufacturing.inRange.started === 0 && manufacturing.inRange.dispatched === 0 ? (
          <EmptyState compact icon="factory" title="No production jobs yet">
            <p>
              Each custom part ordered becomes a job. Its stage — queued, printing, post-processing, quality, ready,
              dispatched — appears here from the production records.
            </p>
          </EmptyState>
        ) : (
          <PipelineStrip
            label="Manufacturing jobs by stage"
            stages={[
              ...manufacturing.stages.map((entry) => ({
                id: entry.stage.id,
                label: entry.stage.label,
                count: entry.count,
                held: entry.held,
                terminal: false,
                href: `/admin/manufacturing#${BOARD_COLUMN[entry.stage.id]}`,
              })),
              {
                id: "dispatched",
                label: "Dispatched",
                count: manufacturing.inRange.dispatched,
                held: 0,
                terminal: false,
                href: hrefWith("/admin/orders", { stage: "shipped" }),
              },
            ]}
          />
        )}
        <p className={styles.gap}>
          <Icon name="info" size={14} />
          {manufacturing.utilisation.reason}
        </p>
        <SourceNote trace={manufacturing} />
      </Panel>

      {/* ---------------- 6. Catalog and inventory ---------------- */}
      <div className={`${styles.columns} ${styles.columnsEven}`}>
        <Panel
          title="Catalog health"
          titleAs="h2"
          meta={catalog.reachable ? `${formatCount(catalog.total)} products · now` : "Unavailable"}
          actions={<PanelLink href="/admin/catalog">Catalog</PanelLink>}
          padded={false}
        >
          {!catalog.reachable ? (
            <EmptyState compact tone="problem" icon="error" title="Catalog health is unavailable">
              <p>{catalog.problem}</p>
            </EmptyState>
          ) : catalog.total === 0 ? (
            <EmptyState compact icon="box" title="No products yet">
              <p>New products appear here with their launch stage and what blocks them.</p>
            </EmptyState>
          ) : (
            <div className={styles.meters}>
              <Meter
                label="Launch ready"
                ready={catalog.stages["LAUNCH READY"]}
                partial={catalog.stages.APPROVED + catalog.stages["READY FOR REVIEW"]}
                total={catalog.total}
                readyLabel="sellable"
                partialLabel="approved or awaiting approval"
                note={`${formatCount(catalog.approval.provisional)} provisional · ${formatCount(catalog.stages["NOT READY"])} not ready`}
              />
              <Meter
                label="Manufacturing readiness"
                ready={catalog.manufacturing.APPROVED}
                total={catalog.total}
                readyLabel="approved"
                note={
                  catalog.manufacturing.COMING_SOON > 0
                    ? `${formatCount(catalog.manufacturing.COMING_SOON)} on Coming Soon capabilities`
                    : undefined
                }
              />
              <Meter
                label="Pricing readiness"
                ready={catalog.price.APPROVED + catalog.price.QUOTE_ONLY}
                partial={catalog.price.PROVISIONAL}
                total={catalog.total}
                readyLabel="approved or quote-only"
                partialLabel="provisional"
              />
              <Meter
                label="Media readiness"
                ready={catalog.media.APPROVED}
                partial={catalog.media.PROPOSED}
                total={catalog.total}
                readyLabel="approved"
                partialLabel="awaiting media approval"
              />
            </div>
          )}
          <SourceNote trace={catalog} cached="refreshed at most every minute, and on publish" />
        </Panel>

        <div className={styles.stack}>
          <Panel
            title="Inventory"
            titleAs="h2"
            meta={inventory.initialized ? `${formatCount(inventory.summary.tracked)} of ${formatCount(inventory.summary.items)} tracked` : "Not initialized"}
            actions={<PanelLink href="/admin/inventory">Inventory</PanelLink>}
            padded={false}
          >
            {!inventory.initialized ? (
              <EmptyState compact icon="boxes" title="Inventory not initialized">
                <p>
                  Add opening stock or receive your first purchase to start tracking.
                  {inventory.summary.items > 0
                    ? ` ${formatCount(inventory.summary.items)} ${inventory.summary.items === 1 ? "item is" : "items are"} defined and not tracked yet.`
                    : ""}
                </p>
              </EmptyState>
            ) : (
              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt>Out of stock</dt>
                  <dd>{formatCount(inventory.summary.outOfStock)}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>Below reorder level</dt>
                  <dd>{formatCount(inventory.summary.lowStock)}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>Not tracked</dt>
                  <dd>{formatCount(inventory.summary.notTracked)}</dd>
                </div>
                <div className={styles.fact}>
                  <dt>Awaiting receipt</dt>
                  <dd>{formatCount(inventory.summary.openPurchases)}</dd>
                </div>
              </dl>
            )}
            {manufacturing.heldForMaterial > 0 && (
              <p className={styles.gap}>
                <Icon name="alert" size={14} />
                {formatCount(manufacturing.heldForMaterial)} production{" "}
                {manufacturing.heldForMaterial === 1 ? "job is" : "jobs are"} held because material is unavailable.
              </p>
            )}
          </Panel>

          <Panel title="Recent activity" titleAs="h2" meta="Latest 8" padded={false}>
            {activity.length === 0 ? (
              <EmptyState compact icon="activity" title="No activity yet">
                <p>Orders, production milestones, shipments and design uploads appear here as they happen.</p>
              </EmptyState>
            ) : (
              <ActivityFeed entries={activity} now={now} />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
