import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import styles from "@/components/ops/command/command.module.css";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterForm } from "@/components/ops/FilterForm";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Panel } from "@/components/structure/Panel";
import { LocalTime } from "@/components/tracking/LocalTime";
import { getCatalogHealth, type CatalogProductRow } from "@/lib/ops/analytics/catalog";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import {
  APPROVAL_LABEL,
  CLASS_LABEL,
  LAUNCH_TONE,
  MEDIA_LABEL,
  READINESS_TONE,
  STAGE_LABEL,
  priceLabel,
} from "@/lib/ops/product-labels";
import { hrefWith, readEnum, readText, type SearchParamsRecord } from "@/lib/ops/query";
import type { LaunchStage } from "@/payload/workflow";

export const metadata: Metadata = { title: "Products" };

const PATH = "/admin/products";

const STAGES = ["not-ready", "review", "approved", "launch-ready"] as const;
const STAGE_BY_PARAM: Record<(typeof STAGES)[number], LaunchStage> = {
  "not-ready": "NOT READY",
  review: "READY FOR REVIEW",
  approved: "APPROVED",
  "launch-ready": "LAUNCH READY",
};
const APPROVALS = ["draft", "proposed", "provisional", "approved", "archived"] as const;
const CLASSES = ["STANDARD_CATALOG_PRODUCT", "CONFIGURABLE_PRODUCT", "QUOTE_ONLY_PRODUCT"] as const;
const FEATURED = ["yes", "no"] as const;

/**
 * Product management: every product in the catalog — drafts included — with
 * its commercial identity and launch readiness, filterable. Each row opens the
 * product's Reality 3D workspace.
 *
 * The list is the catalog health read (every product's latest version, judged
 * by the launch assessment, cached for a minute and dropped on publish), so
 * filters run over tens of rows in the server, not in the browser.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const query = {
    q: readText(params, "q"),
    stage: readEnum(params, "stage", STAGES),
    approval: readEnum(params, "approval", APPROVALS),
    category: readText(params, "category"),
    material: readText(params, "material"),
    class: readEnum(params, "class", CLASSES),
    featured: readEnum(params, "featured", FEATURED),
  };
  const current = { ...query };
  const filtered = Object.values(query).some(Boolean);

  const catalog = await getCatalogHealth(operator);
  const all = catalog.products;
  const categories = [...new Set(all.map((row) => row.categoryName).filter((name): name is string => Boolean(name)))].sort();
  const materials = [...new Set(all.map((row) => row.material).filter((value): value is string => Boolean(value)))].sort();

  const needle = query.q?.toLowerCase();
  const matches = (row: CatalogProductRow) =>
    (!needle || [row.name, row.productId, row.sku ?? ""].some((value) => value.toLowerCase().includes(needle))) &&
    (!query.stage || row.stage === STAGE_BY_PARAM[query.stage]) &&
    (!query.approval || row.approvalStatus === query.approval) &&
    (!query.category || row.categoryName === query.category) &&
    (!query.material || row.material === query.material) &&
    (!query.class || row.productClass === query.class) &&
    (!query.featured || row.featured === (query.featured === "yes"));
  const rows = all.filter(matches);

  const stageCount = (stage: LaunchStage) => catalog.stages[stage];

  return (
    <>
      <PageHeader
        title="Products"
        description="Every catalog product, drafts included — its identity, commercial definition and launch readiness. Open a product to work on it."
        meta={
          catalog.reachable ? (
            <span className={styles.stamp}>
              {formatCount(rows.length)} of {formatCount(all.length)}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button href="/admin/analytics/products" size="sm" variant="secondary" iconLeft="gauge">
              Product sales
            </Button>
            <Button href="/admin/products/create" size="sm" variant="primary" iconLeft="plus">
              Add product
            </Button>
          </>
        }
      />

      {!catalog.reachable ? (
        <Panel padded={false}>
          <EmptyState tone="problem" icon="error" title="Products are unavailable">
            <p>{catalog.problem} Reload the page; if it persists, check the database on the Settings page.</p>
          </EmptyState>
        </Panel>
      ) : (
        <>
          <section className={styles.kpis} aria-label="Product figures">
            <KpiCard label="Products" meta="Now" value={formatCount(catalog.total)} detail={`${formatCount(catalog.published)} published`} icon="box" />
            <KpiCard
              label="Launch ready"
              meta="Now"
              value={formatCount(stageCount("LAUNCH READY"))}
              detail="Approved, published and sellable."
              icon="check-circle"
              href={hrefWith(PATH, { stage: "launch-ready" })}
            />
            <KpiCard
              label="Awaiting approval"
              meta="Now"
              value={formatCount(stageCount("READY FOR REVIEW"))}
              detail={`${formatCount(catalog.pricesAwaitingApproval)} prices awaiting approval`}
              icon="clock"
              href={hrefWith(PATH, { stage: "review" })}
              signal={stageCount("READY FOR REVIEW") > 0 ? "warning" : undefined}
            />
            <KpiCard
              label="Not ready"
              meta="Now"
              value={formatCount(stageCount("NOT READY"))}
              detail="At least one launch prerequisite fails."
              icon="alert"
              href={hrefWith(PATH, { stage: "not-ready" })}
            />
          </section>

          <nav className={styles.chips} aria-label="Launch stage">
            {[undefined, ...STAGES].map((stage) => {
              const active = query.stage === stage;
              return (
                <Link
                  key={stage ?? "all"}
                  href={hrefWith(PATH, current, { stage: stage ?? null })}
                  className={clsx(styles.chip, active && styles.chipActive)}
                  aria-current={active ? "true" : undefined}
                >
                  {stage ? STAGE_LABEL[STAGE_BY_PARAM[stage]] : "All"}
                  <span className={styles.chipCount}>{formatCount(stage ? stageCount(STAGE_BY_PARAM[stage]) : all.length)}</span>
                </Link>
              );
            })}
          </nav>

          <FilterForm action={PATH} label="Filter products" clearHref={PATH} active={filtered}>
            <Input name="q" type="search" size="sm" label="Search" placeholder="Name, product ID or SKU" defaultValue={query.q ?? ""} icon="search" />
            <Select
              name="category"
              size="sm"
              label="Category"
              defaultValue={query.category ?? ""}
              options={[{ value: "", label: "Any category" }, ...categories.map((name) => ({ value: name, label: name }))]}
            />
            <Select
              name="material"
              size="sm"
              label="Material"
              defaultValue={query.material ?? ""}
              options={[{ value: "", label: "Any material" }, ...materials.map((value) => ({ value, label: value.toUpperCase() }))]}
            />
            <Select
              name="class"
              size="sm"
              label="Class"
              defaultValue={query.class ?? ""}
              options={[{ value: "", label: "Any class" }, ...CLASSES.map((value) => ({ value, label: CLASS_LABEL[value] }))]}
            />
            <Select
              name="approval"
              size="sm"
              label="Approval"
              defaultValue={query.approval ?? ""}
              options={[{ value: "", label: "Any approval" }, ...APPROVALS.map((value) => ({ value, label: APPROVAL_LABEL[value] }))]}
            />
            <Select
              name="featured"
              size="sm"
              label="Featured"
              defaultValue={query.featured ?? ""}
              options={[
                { value: "", label: "Featured or not" },
                { value: "yes", label: "Featured" },
                { value: "no", label: "Not featured" },
              ]}
            />
            {query.stage && <input type="hidden" name="stage" value={query.stage} />}
          </FilterForm>

          {rows.length === 0 ? (
            <Panel padded={false}>
              <EmptyState
                icon="box"
                title={filtered ? "No products match these filters" : "No products yet"}
                action={filtered ? <Link href={PATH}>Clear filters</Link> : undefined}
              >
                <p>
                  {filtered
                    ? "Try a different search, or clear the filters to see every product."
                    : "Create the first product with Add product. It starts as a draft and appears here with its launch readiness."}
                </p>
              </EmptyState>
            </Panel>
          ) : (
            <TableFrame label="Products" caption="Catalog products with commercial definition and launch readiness">
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th hide="md">SKU</Th>
                  <Th hide="lg">Category</Th>
                  <Th hide="md">Material</Th>
                  <Th hide="lg">Class</Th>
                  <Th align="right">Price</Th>
                  <Th hide="lg">Media</Th>
                  <Th hide="sm">Approval</Th>
                  <Th>Launch</Th>
                  <Th hide="lg">Featured</Th>
                  <Th align="right" hide="lg">
                    Updated
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Stack
                        primary={<RowLink href={row.href}>{row.name}</RowLink>}
                        secondary={`${row.productId.toUpperCase()} · ${row.published ? "published" : "not published"}`}
                      />
                    </Td>
                    <Td hide="md" mono nowrap>
                      {row.sku ?? <span className={styles.quiet}>Not assigned</span>}
                    </Td>
                    <Td hide="lg">{row.categoryName ?? <span className={styles.quiet}>—</span>}</Td>
                    <Td hide="md" mono>
                      {row.material?.toUpperCase() ?? <span className={styles.quiet}>—</span>}
                    </Td>
                    <Td hide="lg" nowrap>
                      {row.productClass ? CLASS_LABEL[row.productClass] : <span className={styles.quiet}>—</span>}
                    </Td>
                    <Td align="right" nowrap>
                      <Stack
                        primary={<span className={styles.mono}>{row.productClass === "QUOTE_ONLY_PRODUCT" ? "Quote" : row.price > 0 ? formatINR(row.price) : "—"}</span>}
                        secondary={priceLabel(row.priceReadiness)}
                      />
                    </Td>
                    <Td hide="lg" nowrap>
                      <StatusBadge tone={READINESS_TONE[row.media]}>{MEDIA_LABEL[row.media]}</StatusBadge>
                    </Td>
                    <Td hide="sm" nowrap>
                      {APPROVAL_LABEL[row.approvalStatus]}
                    </Td>
                    <Td nowrap>
                      <StatusBadge tone={LAUNCH_TONE[row.stage]}>{STAGE_LABEL[row.stage]}</StatusBadge>
                    </Td>
                    <Td hide="lg">{row.featured ? "Featured" : <span className={styles.quiet}>No</span>}</Td>
                    <Td align="right" hide="lg" mono nowrap>
                      <LocalTime value={row.updatedAt} dateOnly />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </>
      )}
    </>
  );
}
