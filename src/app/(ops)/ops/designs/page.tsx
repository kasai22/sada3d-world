import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";

import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterForm } from "@/components/ops/FilterForm";
import { PageHeader } from "@/components/ops/PageHeader";
import { Pagination } from "@/components/ops/Pagination";
import { DesignStateBadge, StatusBadge } from "@/components/ops/StatusBadge";
import { Above, CellLink, RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { formatAge, formatBytes, formatCount, formatDimensions } from "@/lib/ops/format";
import { listOpsDesigns, type DesignAnalysisSummary, type OpsDesignRow } from "@/lib/ops/designs";
import { DESIGN_STORAGE_LABEL } from "@/lib/ops/labels";
import { requireOperator } from "@/lib/ops/operator";
import {
  DESIGN_STATES,
  designQueryParams,
  hrefWith,
  parseDesignListQuery,
  type SearchParamsRecord,
} from "@/lib/ops/query";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Designs" };

const PATH = "/ops/designs";

const STATE_OPTIONS = [
  { value: "", label: "Active states" },
  ...DESIGN_STATES.map((state) => ({ value: state, label: DESIGN_STORAGE_LABEL[state] })),
];

const ANALYSIS_OPTIONS = [
  { value: "", label: "Any analysis" },
  { value: "analysed", label: "Analysed" },
  { value: "not_analysed", label: "Not analysed" },
];

/** Measured facts, or the reason there are none. Never a zero standing in for unknown. */
function analysisText(analysis: DesignAnalysisSummary): string {
  switch (analysis.state) {
    case "available":
      return `${formatDimensions(analysis.dimensionsMm)}${
        analysis.triangles === null ? "" : ` · ${formatCount(analysis.triangles)} triangles`
      }`;
    case "unsupported":
      return "Not a mesh format — never measured";
    case "pending":
      return "Not verified yet";
    case "missing":
      return "No stored measurement";
    case "unreadable":
      return "Stored measurement unreadable";
  }
}

function Printability({ analysis }: { analysis: DesignAnalysisSummary }) {
  if (analysis.state !== "available") {
    return <span className={styles.quiet}>Unknown</span>;
  }

  if (!analysis.manufacturable) {
    return (
      <StatusBadge tone="danger">
        {analysis.blocking} blocking {analysis.blocking === 1 ? "issue" : "issues"}
      </StatusBadge>
    );
  }

  return analysis.advisories > 0 ? (
    <StatusBadge tone="warning">
      {analysis.advisories} {analysis.advisories === 1 ? "advisory" : "advisories"}
    </StatusBadge>
  ) : (
    <StatusBadge tone="success">No findings</StatusBadge>
  );
}

function DesignCard({ design, now }: { design: OpsDesignRow; now: Date }) {
  return (
    <li className={styles.card}>
      <Link href={`/ops/designs/${design.id}`} className={styles.cardLink}>
        <span className={styles.thumb} aria-hidden="true">
          {design.format}
        </span>
        <span className={styles.cardName}>{design.name}</span>
      </Link>
      <p className={styles.cardMeta}>{analysisText(design.analysis)}</p>
      <div className={styles.cardTags}>
        <DesignStateBadge state={design.state} />
        <Printability analysis={design.analysis} />
      </div>
      <p className={styles.cardFoot}>
        {formatBytes(design.sizeBytes)} · {formatAge(design.createdAt, now)} ago
        {design.orderReferences.length > 0 ? ` · ${design.orderReferences.length} orders` : ""}
      </p>
    </li>
  );
}

/**
 * Customer design files.
 *
 * What is known about the file and what was measured from its bytes. The stored
 * object itself is not reachable from here: there is no operator download path
 * in the storage design, and inventing one would be a security decision rather
 * than an interface one.
 */
export default async function DesignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const query = parseDesignListQuery(params);
  const now = new Date();

  const page = await listOpsDesigns(operator, query);
  const filtered = Boolean(query.q || query.state || query.format || query.analysis || query.customer);
  const current = designQueryParams(query);

  return (
    <>
      <PageHeader
        title="Designs"
        description="Files customers uploaded, what verification found, and what the geometry measures."
        meta={
          <span className={styles.count}>
            {formatCount(page.total)} {page.total === 1 ? "design" : "designs"}
          </span>
        }
        actions={
          <div className={styles.views} role="group" aria-label="View">
            <Link
              href={hrefWith(PATH, current, { view: null, page: null })}
              className={clsx(styles.view, query.view === "list" && styles.viewActive)}
              aria-current={query.view === "list" ? "true" : undefined}
            >
              List
            </Link>
            <Link
              href={hrefWith(PATH, current, { view: "grid", page: null })}
              className={clsx(styles.view, query.view === "grid" && styles.viewActive)}
              aria-current={query.view === "grid" ? "true" : undefined}
            >
              Grid
            </Link>
          </div>
        }
      />

      <FilterForm action={PATH} label="Filter designs" clearHref={PATH} active={filtered}>
        <Input
          name="q"
          type="search"
          size="sm"
          label="Search"
          placeholder="Filename or design id"
          defaultValue={query.q ?? ""}
          icon="search"
        />
        <Select name="state" size="sm" label="State" options={STATE_OPTIONS} defaultValue={query.state ?? ""} />
        <Input name="format" size="sm" label="Format" placeholder="STL" defaultValue={query.format ?? ""} />
        <Select
          name="analysis"
          size="sm"
          label="Analysis"
          options={ANALYSIS_OPTIONS}
          defaultValue={query.analysis ?? ""}
        />
        {query.view === "grid" && <input type="hidden" name="view" value="grid" />}
        {query.customer && <input type="hidden" name="customer" value={query.customer} />}
      </FilterForm>

      {page.total === 0 ? (
        <Panel padded={false}>
          <EmptyState
            icon="file-box"
            title={filtered ? "No designs match" : "No designs yet"}
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
                ? "No uploaded file matches this search."
                : "Designs appear here when a customer uploads a model for a custom part."}
            </p>
          </EmptyState>
        </Panel>
      ) : query.view === "grid" ? (
        <ul className={styles.grid}>
          {page.rows.map((design) => (
            <DesignCard key={design.id} design={design} now={now} />
          ))}
        </ul>
      ) : (
        <TableFrame label="Designs" caption="Uploaded design files with their analysis">
          <thead>
            <tr>
              <Th>File</Th>
              <Th hide="sm">State</Th>
              <Th hide="md">Measured</Th>
              <Th>Printability</Th>
              <Th hide="md">Customer</Th>
              <Th align="right" hide="lg">
                Orders
              </Th>
              <Th align="right">Uploaded</Th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((design) => (
              <Tr key={design.id}>
                <Td>
                  <div className={styles.fileCell}>
                    <span className={styles.formatTile} aria-hidden="true">
                      {design.format}
                    </span>
                    <Stack
                      primary={<RowLink href={`/ops/designs/${design.id}`}>{design.name}</RowLink>}
                      secondary={`${formatBytes(design.sizeBytes)} · ${design.id}`}
                    />
                  </div>
                </Td>
                <Td hide="sm">
                  <DesignStateBadge state={design.state} />
                </Td>
                <Td hide="md" muted>
                  {analysisText(design.analysis)}
                </Td>
                <Td>
                  <Printability analysis={design.analysis} />
                </Td>
                <Td hide="md">
                  <Above>
                    <CellLink href={`/ops/customers/${design.customer.id}`}>
                      {design.customer.name ?? design.customer.id}
                    </CellLink>
                  </Above>
                </Td>
                <Td align="right" hide="lg" mono>
                  {design.orderReferences.length}
                </Td>
                <Td align="right" mono nowrap>
                  {formatAge(design.createdAt, now)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      <Pagination
        label="Designs"
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        pageSize={page.pageSize}
        hrefFor={(target) => hrefWith(PATH, current, { page: target })}
      />
    </>
  );
}
