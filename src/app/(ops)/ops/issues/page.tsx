import type { Metadata } from "next";
import Link from "next/link";

import { Select } from "@/components/forms/Select";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterForm } from "@/components/ops/FilterForm";
import { IssueList } from "@/components/ops/IssueList";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { Panel } from "@/components/structure/Panel";
import { formatCount } from "@/lib/ops/format";
import { listOpsIssues } from "@/lib/ops/issues";
import { requireOperator } from "@/lib/ops/operator";
import {
  ISSUE_KINDS,
  ISSUE_KIND_LABEL,
  SEVERITY_LABEL,
  STALLED_AFTER_HOURS,
  countBySeverity,
} from "@/lib/ops/pipeline";
import { ISSUE_SEVERITIES, parseIssueListQuery, type SearchParamsRecord } from "@/lib/ops/query";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Issues" };

const PATH = "/ops/issues";

const SEVERITY_OPTIONS = [
  { value: "", label: "Any severity" },
  ...ISSUE_SEVERITIES.map((severity) => ({ value: severity, label: SEVERITY_LABEL[severity] })),
];

const KIND_OPTIONS = [
  { value: "", label: "Any kind" },
  ...ISSUE_KINDS.map((kind) => ({ value: kind, label: ISSUE_KIND_LABEL[kind] })),
];

const DEMO_OPTIONS = [
  { value: "", label: "Demo: included" },
  { value: "exclude", label: "Demo: hidden" },
  { value: "only", label: "Demo only" },
];

/**
 * The exception centre.
 *
 * Derived, not stored: each entry is a condition that is true of a live record
 * right now, so an issue closes itself the moment the record moves. There is no
 * acknowledge button, because acknowledging would hide something still true.
 */
export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const query = parseIssueListQuery(params);
  const now = new Date();

  const all = await listOpsIssues(operator);
  const counts = countBySeverity(all);

  const issues = all.filter((issue) => {
    if (query.severity && issue.severity !== query.severity) return false;
    if (query.kind && issue.kind !== query.kind) return false;
    if (query.demo === "exclude" && issue.demo) return false;
    if (query.demo === "only" && !issue.demo) return false;
    return true;
  });

  const filtered = Boolean(query.severity || query.kind || query.demo);

  return (
    <>
      <PageHeader
        title="Issues"
        description="Everything that needs an operator: failed payments, stopped production, parcels that have not moved."
      />

      <section className={styles.kpis} aria-label="Issues by severity">
        <KpiCard
          label="High"
          value={formatCount(counts.high)}
          detail="Money or a part is at risk"
          href={`${PATH}?severity=high`}
          signal={counts.high > 0 ? "danger" : undefined}
        />
        <KpiCard
          label="Medium"
          value={formatCount(counts.medium)}
          detail="Progress has stopped"
          href={`${PATH}?severity=medium`}
          signal={counts.medium > 0 ? "warning" : undefined}
        />
        <KpiCard label="Low" value={formatCount(counts.low)} detail="Worth a look" href={`${PATH}?severity=low`} />
      </section>

      <FilterForm action={PATH} label="Filter issues" clearHref={PATH} active={filtered}>
        <Select
          name="severity"
          size="sm"
          label="Severity"
          options={SEVERITY_OPTIONS}
          defaultValue={query.severity ?? ""}
        />
        <Select name="kind" size="sm" label="Kind" options={KIND_OPTIONS} defaultValue={query.kind ?? ""} />
        <Select name="demo" size="sm" label="Demo orders" options={DEMO_OPTIONS} defaultValue={query.demo ?? ""} />
      </FilterForm>

      <Panel
        title={filtered ? "Matching issues" : "Open issues"}
        titleAs="h2"
        meta={`${formatCount(issues.length)} shown`}
        padded={false}
      >
        {issues.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title={filtered ? "Nothing matches these filters" : "Nothing needs attention"}
            action={
              filtered ? (
                <Link href={PATH} className={styles.clear}>
                  Clear filters
                </Link>
              ) : undefined
            }
          >
            <p>
              {filtered
                ? "No open issue matches. Clear the filters to see everything open."
                : "No failed payments, held or failed jobs, overdue parts, or parcels waiting to be shipped."}
            </p>
          </EmptyState>
        ) : (
          <IssueList issues={issues} now={now} />
        )}
      </Panel>

      <p className={styles.note}>
        Issues are worked out from live records each time this page loads. A job with no reported milestone for{" "}
        {STALLED_AFTER_HOURS} hours is listed as quiet; a job on hold is listed as held instead, because the hold
        already says why it stopped.
      </p>
    </>
  );
}
