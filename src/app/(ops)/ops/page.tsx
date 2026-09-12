import type { Metadata } from "next";

import { Button } from "@/components/core/Button";
import { ActivityFeed } from "@/components/ops/ActivityFeed";
import { EmptyState } from "@/components/ops/EmptyState";
import { IssueList } from "@/components/ops/IssueList";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader, PanelLink } from "@/components/ops/PageHeader";
import { PipelineStrip } from "@/components/ops/PipelineStrip";
import { TrendChart } from "@/components/ops/TrendChart";
import { Panel } from "@/components/structure/Panel";
import { LocalTime } from "@/components/tracking/LocalTime";
import { DASHBOARD_WINDOW_DAYS, TREND_DAYS, getDashboard } from "@/lib/ops/dashboard";
import { formatCount, formatINR } from "@/lib/ops/format";
import { listOpsIssues } from "@/lib/ops/issues";
import { requireOperator } from "@/lib/ops/operator";
import { paymentAdapterStatus } from "@/lib/ops/payments";
import { countBySeverity } from "@/lib/ops/pipeline";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The command centre.
 *
 * Four figures an operator acts on, the pipeline as it stands, what needs
 * attention, what just happened, and one trend. No figure here is a target,
 * a projection or a comparison the business has not defined.
 */
export default async function DashboardPage() {
  const operator = await requireOperator("/ops");
  const now = new Date();

  const [dashboard, issues] = await Promise.all([getDashboard(operator, now), listOpsIssues(operator)]);
  const adapter = paymentAdapterStatus();
  const severity = countBySeverity(issues);
  const { kpis } = dashboard;

  const paymentNote = !adapter.configured
    ? " · payment provider misconfigured"
    : adapter.mode === "mock"
      ? " · mock payments, no money moved"
      : "";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs attention across orders, production and payments."
        meta={
          <span className={styles.stamp}>
            As of <LocalTime value={now.toISOString()} />
          </span>
        }
        actions={
          <Button href="/ops/production" size="sm" variant="secondary" iconLeft="factory">
            Production board
          </Button>
        }
      />

      <section className={styles.kpis} aria-label="Key figures">
        <KpiCard
          label="Orders"
          value={formatCount(kpis.ordersInWindow)}
          detail={`Last ${DASHBOARD_WINDOW_DAYS} days · ${formatCount(kpis.openOrders)} open`}
          icon="clipboard"
          href="/ops/orders"
        />
        <KpiCard
          label="Active production"
          value={formatCount(kpis.activeJobs)}
          detail={kpis.heldJobs > 0 ? `${formatCount(kpis.heldJobs)} on hold` : "None on hold"}
          icon="factory"
          href="/ops/production"
          signal={kpis.heldJobs > 0 ? "warning" : undefined}
        />
        <KpiCard
          label="Paid order value"
          value={formatINR(kpis.paidValueInWindow)}
          detail={`${formatCount(kpis.paidOrdersInWindow)} paid · last ${DASHBOARD_WINDOW_DAYS} days${paymentNote}`}
          icon="wallet"
          href="/ops/payments?status=paid"
        />
        <KpiCard
          label="Open issues"
          value={formatCount(issues.length)}
          detail={
            severity.high > 0
              ? `${formatCount(severity.high)} high severity`
              : severity.medium > 0
                ? `${formatCount(severity.medium)} medium severity`
                : "Nothing high or medium"
          }
          icon="alert"
          href="/ops/issues"
          signal={severity.high > 0 ? "danger" : severity.medium > 0 ? "warning" : undefined}
        />
      </section>

      <Panel
        title="Production pipeline"
        titleAs="h2"
        meta={`${formatCount(kpis.activeJobs)} active`}
        actions={<PanelLink href="/ops/production">Board</PanelLink>}
        padded={false}
        className={styles.section}
      >
        <PipelineStrip
          label="Manufacturing jobs by production stage"
          stages={dashboard.pipeline.map((stage) => ({
            id: stage.column.id,
            label: stage.column.label,
            count: stage.count,
            held: stage.held,
            terminal: stage.column.terminal,
            href: `/ops/production#${stage.column.id}`,
          }))}
        />
      </Panel>

      <div className={styles.columns}>
        <Panel
          title="Action required"
          titleAs="h2"
          meta={`${formatCount(issues.length)} open`}
          actions={<PanelLink href="/ops/issues">All issues</PanelLink>}
          padded={false}
        >
          {issues.length === 0 ? (
            <EmptyState compact icon="check-circle" title="Nothing needs attention">
              <p>No failed payments, held or failed jobs, or parcels waiting to be shipped.</p>
            </EmptyState>
          ) : (
            <IssueList issues={issues.slice(0, 6)} now={now} />
          )}
        </Panel>

        <Panel title="Recent activity" titleAs="h2" padded={false}>
          {dashboard.activity.length === 0 ? (
            <EmptyState compact icon="activity" title="No activity yet">
              <p>Orders, production milestones, shipments and design uploads appear here as they happen.</p>
            </EmptyState>
          ) : (
            <ActivityFeed entries={dashboard.activity} now={now} />
          )}
        </Panel>
      </div>

      <Panel title="Orders placed per day" titleAs="h2" meta={`Last ${TREND_DAYS} days · UTC`} className={styles.section}>
        <TrendChart
          label="Orders placed per day"
          unit={["order", "orders"]}
          data={dashboard.trend.map((point) => ({ day: point.day, value: point.orders }))}
        />
      </Panel>
    </>
  );
}
