import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import { catalogTabs } from "@/components/ops/areas";
import { Icon } from "@/components/core/Icon";
import styles from "@/components/ops/command/command.module.css";
import { Meter } from "@/components/ops/command/Meter";
import { SourceNote } from "@/components/ops/command/SourceNote";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Panel } from "@/components/structure/Panel";
import { getCatalogHealth, type CatalogProductRow } from "@/lib/ops/analytics/catalog";
import { formatCount } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { hrefWith, readEnum, type SearchParamsRecord } from "@/lib/ops/query";
import { LAUNCH_TONE as STAGE_TONE, READINESS_TONE } from "@/lib/ops/product-labels";

export const metadata: Metadata = { title: "Catalog" };

const PATH = "/admin/catalog";

const VIEWS = ["all", "review", "approved", "price", "media", "manufacturing", "blocked"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABEL: Record<View, string> = {
  all: "All",
  review: "Awaiting approval",
  approved: "Approved, unpublished",
  price: "Price awaiting approval",
  media: "Media missing",
  manufacturing: "Manufacturing not approved",
  blocked: "Not ready",
};

const VIEW_FILTER: Record<View, (row: CatalogProductRow) => boolean> = {
  all: () => true,
  review: (row) => row.stage === "READY FOR REVIEW",
  approved: (row) => row.stage === "APPROVED",
  price: (row) => row.priceAwaitingApproval,
  media: (row) => row.media === "MISSING" || row.media === "PROPOSED",
  manufacturing: (row) => row.manufacturing !== "APPROVED",
  blocked: (row) => row.stage === "NOT READY",
};


const readable = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());

/**
 * Catalog health: every product's launch stage and what blocks it, with the
 * manufacturing capability decisions behind them. Read-only — each product
 * opens in its Reality 3D workspace.
 */
export default async function CatalogPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const view = readEnum(await searchParams, "view", VIEWS) ?? "all";
  const catalog = await getCatalogHealth(operator);
  const rows = catalog.products.filter(VIEW_FILTER[view]);
  const { capability } = catalog;

  return (
    <>
      <PageHeader
        title="Catalog"
        description="Launch readiness for every product, from the same assessment as the product workspace's launch panel."
        actions={
          <Button href="/admin/products" size="sm" variant="secondary" iconLeft="box">
            Manage products
          </Button>
        }
      />

      <SectionTabs label="Catalog" tabs={catalogTabs("health")} />

      {!catalog.reachable ? (
        <Panel padded={false}>
          <EmptyState tone="problem" icon="error" title="Catalog health is unavailable">
            <p>{catalog.problem} Nothing on this page is shown as zero in its place.</p>
          </EmptyState>
        </Panel>
      ) : (
        <>
          <section className={`${styles.kpis}`} aria-label="Catalog figures">
            <KpiCard label="Products" meta="Now" value={formatCount(catalog.total)} detail={`${formatCount(catalog.published)} published`} icon="box" />
            <KpiCard
              label="Launch ready"
              meta="Now"
              value={formatCount(catalog.stages["LAUNCH READY"])}
              detail={`${formatCount(catalog.approval.approved)} approved · ${formatCount(catalog.stages.APPROVED)} unpublished`}
              icon="check-circle"
            />
            <KpiCard
              label="Provisional"
              meta="Now"
              value={formatCount(catalog.approval.provisional)}
              detail={`${formatCount(catalog.approval.proposed)} proposed · ${formatCount(catalog.approval.draft)} draft`}
              icon="clock"
            />
            <KpiCard
              label="Not ready"
              meta="Now"
              value={formatCount(catalog.stages["NOT READY"])}
              detail={`${formatCount(catalog.stages["READY FOR REVIEW"])} ready for review`}
              icon="alert"
              href={hrefWith(PATH, { view: "blocked" })}
              signal={catalog.stages["NOT READY"] > 0 ? "warning" : undefined}
            />
          </section>

          <div className={`${styles.columns} ${styles.columnsEven}`}>
            <Panel title="Readiness" titleAs="h2" meta={`${formatCount(catalog.total)} products`} padded={false}>
              {catalog.total === 0 ? (
                <EmptyState compact icon="box" title="No products yet">
                  <p>New products appear here with their launch stage as soon as they are created.</p>
                </EmptyState>
              ) : (
                <div className={styles.meters}>
                  <Meter
                    label="Manufacturing readiness"
                    ready={catalog.manufacturing.APPROVED}
                    total={catalog.total}
                    readyLabel="approved"
                    note={`${formatCount(catalog.manufacturing.NOT_APPROVED)} not approved · ${formatCount(catalog.manufacturing.COMING_SOON)} on Coming Soon capabilities`}
                  />
                  <Meter
                    label="Pricing readiness"
                    ready={catalog.price.APPROVED + catalog.price.QUOTE_ONLY}
                    partial={catalog.price.PROVISIONAL}
                    total={catalog.total}
                    readyLabel="approved or quote-only"
                    partialLabel="provisional"
                    note={`${formatCount(catalog.priceApprovals)} price approval ${catalog.priceApprovals === 1 ? "record" : "records"}`}
                  />
                  <Meter
                    label="Media readiness"
                    ready={catalog.media.APPROVED}
                    partial={catalog.media.PROPOSED}
                    total={catalog.total}
                    readyLabel="approved"
                    partialLabel="awaiting media approval"
                    note={`${formatCount(catalog.mediaLibrary)} files in the media library`}
                  />
                </div>
              )}
              <SourceNote trace={catalog} cached="refreshed at most every minute, and on publish" />
            </Panel>

            <Panel title="Manufacturing capability" titleAs="h2" meta="Decision ledger" padded={false} id="capability">
              <div className={styles.padded}>
                <p className={styles.heading}>Available</p>
                <p className={styles.lead}>
                  {capability.available.length > 0
                    ? capability.available.map((entry) => entry.label).join(" · ")
                    : "Nothing is approved yet."}
                </p>
              </div>
              <div className={styles.padded}>
                <p className={styles.heading}>Coming soon</p>
                <p className={styles.lead}>
                  {capability.comingSoon.length > 0
                    ? capability.comingSoon.map((entry) => entry.label).join(" · ")
                    : "No capability is on the roadmap."}
                </p>
              </div>
              <div className={styles.padded}>
                <p className={styles.heading}>Blocking every manufacturing approval</p>
                {capability.missingLimitations.length > 0 ? (
                  <ul className={styles.list}>
                    {capability.missingLimitations.map((limitation) => (
                      <li key={limitation}>{limitation} — not validated</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.lead}>Every launch-required limitation is stated.</p>
                )}
              </div>
              <p className={styles.gap}>
                <Icon name="info" size={14} />
                Capability is recorded in the business decision ledger (npm run content:decisions), not in the CMS.
              </p>
            </Panel>
          </div>

          <Panel title="Products" titleAs="h2" meta={`${VIEW_LABEL[view]} · ${formatCount(rows.length)}`} padded={false} className={styles.section}>
            <div className={styles.padded}>
              <nav className={styles.chips} aria-label="Catalog views">
                {VIEWS.map((option) => (
                  <Link
                    key={option}
                    href={hrefWith(PATH, { view: option === "all" ? undefined : option })}
                    className={clsx(styles.chip, view === option && styles.chipActive)}
                    aria-current={view === option ? "true" : undefined}
                  >
                    {VIEW_LABEL[option]}
                    <span className={styles.chipCount}>{formatCount(catalog.products.filter(VIEW_FILTER[option]).length)}</span>
                  </Link>
                ))}
              </nav>
            </div>
            {rows.length === 0 ? (
              <EmptyState compact icon="check-circle" title={view === "all" ? "No products yet" : "No products in this view"}>
                <p>{view === "all" ? "New products appear here as soon as they are created." : "Nothing is in this condition right now."}</p>
              </EmptyState>
            ) : (
              <TableFrame label="Products" caption="Products with launch stage and readiness">
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Stage</Th>
                    <Th hide="sm">Manufacturing</Th>
                    <Th hide="sm">Price</Th>
                    <Th hide="md">Media</Th>
                    <Th align="right" hide="md">
                      Blockers
                    </Th>
                    <Th align="right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <Stack
                          primary={<RowLink href={row.href}>{row.name}</RowLink>}
                          secondary={`${row.productId} · ${readable(row.approvalStatus)} · ${row.published ? "published" : "not published"}`}
                        />
                      </Td>
                      <Td nowrap>
                        <StatusBadge tone={STAGE_TONE[row.stage]}>{readable(row.stage)}</StatusBadge>
                      </Td>
                      <Td hide="sm" nowrap>
                        <StatusBadge tone={READINESS_TONE[row.manufacturing]}>{readable(row.manufacturing)}</StatusBadge>
                      </Td>
                      <Td hide="sm" nowrap>
                        <StatusBadge tone={READINESS_TONE[row.priceReadiness]}>
                          {readable(row.priceReadiness)}
                          {row.priceAwaitingApproval ? " · awaiting" : ""}
                        </StatusBadge>
                      </Td>
                      <Td hide="md" nowrap>
                        <StatusBadge tone={READINESS_TONE[row.media]}>{readable(row.media)}</StatusBadge>
                      </Td>
                      <Td align="right" mono hide="md">
                        {formatCount(row.blockers)}
                      </Td>
                      <Td align="right" nowrap>
                        <span title={row.readiness}>Open</span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableFrame>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
