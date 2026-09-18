import type { Metadata } from "next";

import { Icon } from "@/components/core/Icon";
import styles from "@/components/ops/command/command.module.css";
import { RangePicker } from "@/components/ops/command/RangePicker";
import { SourceNote } from "@/components/ops/command/SourceNote";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader, PanelLink } from "@/components/ops/PageHeader";
import { TrendChart } from "@/components/ops/TrendChart";
import { Panel } from "@/components/structure/Panel";
import { getCustomerSummary, getOrderSummary } from "@/lib/ops/analytics/orders";
import { BUSINESS_TIME_ZONE, businessDay, parseRange } from "@/lib/ops/analytics/range";
import { getRevenuePeriods, getRevenueSummary } from "@/lib/ops/analytics/revenue";
import { formatCount, formatINR } from "@/lib/ops/format";
import { PAYMENT_STATE_LABEL } from "@/lib/ops/labels";
import { requireOperator } from "@/lib/ops/operator";
import { paymentAdapterStatus } from "@/lib/ops/payments";
import { PAYMENT_STATES, type SearchParamsRecord } from "@/lib/ops/query";

export const metadata: Metadata = { title: "Sales" };

const PATH = "/admin/sales";

/**
 * Sales: how much Reality 3D sold, over the range in the URL and over the
 * standing periods. Revenue only — the system records no cost, so there is no
 * margin or profit here, and nothing is estimated or projected.
 */
export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const now = new Date();
  const range = parseRange(await searchParams, now);

  const [revenue, periods, orders, people] = await Promise.all([
    getRevenueSummary(operator, range, now),
    getRevenuePeriods(operator, now),
    getOrderSummary(operator, range, now),
    getCustomerSummary(operator, range, now),
  ]);

  const adapter = paymentAdapterStatus();
  const { figure } = revenue;
  const hasSales = figure.orders > 0;
  const current = range.toDay === businessDay(now) ? (range.bucket === "day" ? "Today" : "This month") : null;

  return (
    <>
      <PageHeader
        title="Sales"
        description="Revenue from paid orders, by the day each order was placed. No costs are recorded, so no margin or profit is shown."
      />

      <RangePicker path={PATH} range={range} />

      <section className={styles.kpis} aria-label="Sales figures">
        <KpiCard
          label="Revenue"
          meta={range.label}
          value={hasSales ? formatINR(figure.amount) : "No sales yet"}
          muted={!hasSales}
          detail={hasSales ? "Recorded totals of paid orders." : "Appears once a paid order is placed in this range."}
          icon="wallet"
        />
        <KpiCard
          label="Paid orders"
          meta={range.label}
          value={formatCount(figure.orders)}
          detail={
            figure.mockPayments > 0
              ? `${formatCount(figure.mockPayments)} via mock payments — no money moved`
              : "Payment recorded as paid."
          }
          icon="check-circle"
          href="/admin/payments?status=paid"
          signal={figure.mockPayments > 0 ? "warning" : undefined}
        />
        <KpiCard
          label="Average order value"
          meta={range.label}
          value={figure.averageOrderValue === null ? "—" : formatINR(figure.averageOrderValue)}
          muted={figure.averageOrderValue === null}
          detail={figure.averageOrderValue === null ? "No paid orders to average." : "Revenue ÷ paid orders."}
          icon="gauge"
        />
        <KpiCard
          label="Paid, then cancelled"
          meta={range.label}
          value={revenue.stopped.orders > 0 ? formatINR(revenue.stopped.amount) : "None"}
          muted={revenue.stopped.orders === 0}
          detail={
            revenue.stopped.orders > 0
              ? `${formatCount(revenue.stopped.orders)} ${revenue.stopped.orders === 1 ? "order" : "orders"} · not in revenue · no refund recorded`
              : "No paid order in this range was cancelled or failed."
          }
          icon="ban"
          href="/admin/orders?stage=cancelled"
          signal={revenue.stopped.orders > 0 ? "warning" : undefined}
        />
      </section>

      <Panel title="Standing periods" titleAs="h2" meta={`${BUSINESS_TIME_ZONE.label} calendar`} padded={false} className={styles.section}>
        <dl className={styles.periods}>
          {periods.map((period) => (
            <div key={period.id} className={styles.period}>
              <dt>{period.label}</dt>
              <dd>
                <span className={styles.periodValue}>{period.figure.orders > 0 ? formatINR(period.figure.amount) : "—"}</span>
                <span className={styles.periodNote}>
                  {period.figure.orders > 0
                    ? `${formatCount(period.figure.orders)} paid · AOV ${formatINR(period.figure.averageOrderValue ?? 0)}`
                    : "No sales"}
                </span>
                <span className={styles.periodNote}>{period.range.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title={`Revenue per ${revenue.bucket}`} titleAs="h2" meta={range.label} padded={false} className={styles.section}>
        {hasSales ? (
          <div className={styles.padded}>
            <TrendChart
              label={`Revenue per ${revenue.bucket}`}
              unit={["rupee", "rupees"]}
              format="inr"
              zone={BUSINESS_TIME_ZONE.label}
              currentLabel={current}
              data={revenue.series.map((point) => ({ day: point.key, value: point.amount }))}
            />
          </div>
        ) : (
          <EmptyState compact icon="wallet" title="No sales data yet">
            <p>Revenue per {revenue.bucket} appears here once paid orders exist in this range.</p>
          </EmptyState>
        )}
        {adapter.configured && adapter.mode === "mock" && (
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            Payments are in mock mode on this deployment: a “paid” order here moved no money.
          </p>
        )}
        {figure.provisional > 0 && (
          <p className={styles.gap}>
            <Icon name="info" size={14} />
            {formatCount(figure.provisional)} of these orders were placed against provisional pricing.
          </p>
        )}
        <SourceNote trace={revenue} />
      </Panel>

      <div className={`${styles.columns} ${styles.columnsEven}`}>
        <Panel
          title={`Orders placed per ${orders.bucket}`}
          titleAs="h2"
          meta={range.label}
          actions={<PanelLink href="/admin/orders">Orders</PanelLink>}
          padded={false}
        >
          {orders.placed > 0 ? (
            <div className={styles.padded}>
              <TrendChart
                label={`Orders placed per ${orders.bucket}`}
                unit={["order", "orders"]}
                zone={BUSINESS_TIME_ZONE.label}
                currentLabel={current}
                data={orders.series.map((point) => ({ day: point.key, value: point.orders }))}
              />
            </div>
          ) : (
            <EmptyState compact icon="clipboard" title="No orders yet">
              <p>Every order placed in this range is counted here, paid or not.</p>
            </EmptyState>
          )}
          <dl className={styles.facts}>
            {PAYMENT_STATES.map((state) => (
              <div key={state} className={styles.fact}>
                <dt>Payment {PAYMENT_STATE_LABEL[state].toLowerCase()}</dt>
                <dd>{formatCount(orders.byPayment[state])}</dd>
              </div>
            ))}
          </dl>
          <SourceNote trace={orders} />
        </Panel>

        <Panel
          title="Customers"
          titleAs="h2"
          meta={range.label}
          actions={<PanelLink href="/admin/customers">Customers</PanelLink>}
          padded={false}
        >
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Ordering accounts</dt>
              <dd>{formatCount(people.orderingAccounts)}</dd>
              <span className={styles.factNote}>Signed-in customers with an order</span>
            </div>
            <div className={styles.fact}>
              <dt>Guest orders</dt>
              <dd>{formatCount(people.guestOrders)}</dd>
              <span className={styles.factNote}>Placed without an account</span>
            </div>
            <div className={styles.fact}>
              <dt>New accounts</dt>
              <dd>{formatCount(people.newAccounts)}</dd>
              <span className={styles.factNote}>First signed in during the range</span>
            </div>
            <div className={styles.fact}>
              <dt>Repeat accounts</dt>
              <dd>{formatCount(people.repeatAccounts)}</dd>
              <span className={styles.factNote}>Two or more paid orders by the range end</span>
            </div>
          </dl>
          <SourceNote trace={people} />
        </Panel>
      </div>
    </>
  );
}
