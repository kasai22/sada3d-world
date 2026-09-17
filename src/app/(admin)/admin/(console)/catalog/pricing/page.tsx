import type { Metadata } from "next";

import { Button } from "@/components/core/Button";
import { catalogTabs } from "@/components/ops/areas";
import styles from "@/components/ops/command/command.module.css";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { getCatalogHealth } from "@/lib/ops/analytics/catalog";
import { listPriceApprovals } from "@/lib/ops/catalog-admin";
import { formatCount, formatINR } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { READINESS_TONE, priceLabel } from "@/lib/ops/product-labels";
import { cmsCollectionHref } from "@/lib/ops/routes";

export const metadata: Metadata = { title: "Pricing" };

const PATH = "/admin/catalog/pricing";

/**
 * Catalog › Pricing: each product's price and whether it is approved, and the
 * append-only price approval ledger. Approvals are recorded in Advanced CMS;
 * a record is never edited, a newer one supersedes it.
 */
export default async function PricingPage() {
  const operator = await requireOperator(PATH);
  const [catalog, approvals] = await Promise.all([getCatalogHealth(operator), listPriceApprovals(operator)]);

  return (
    <>
      <PageHeader
        title="Catalog"
        description="Prices and price approvals. A fixed price is sellable only when an approval in effect matches it; quote-only products are priced from geometry."
        actions={
          <Button href={`${cmsCollectionHref("price-approvals")}/create`} size="sm" variant="primary" iconLeft="plus">
            Record price approval (Advanced CMS)
          </Button>
        }
      />
      <SectionTabs label="Catalog" tabs={catalogTabs("pricing")} />

      {catalog.reachable && (
        <section className={styles.kpis} aria-label="Pricing figures">
          <KpiCard label="Approved" meta="Now" value={formatCount(catalog.price.APPROVED)} detail="Fixed price with a matching approval." icon="check-circle" />
          <KpiCard label="Quote only" meta="Now" value={formatCount(catalog.price.QUOTE_ONLY)} detail="Priced per order from geometry." icon="scan" />
          <KpiCard
            label="Provisional"
            meta="Now"
            value={formatCount(catalog.price.PROVISIONAL)}
            detail={`${formatCount(catalog.pricesAwaitingApproval)} with a figure awaiting approval`}
            icon="clock"
            signal={catalog.pricesAwaitingApproval > 0 ? "warning" : undefined}
          />
          <KpiCard label="No price" meta="Now" value={formatCount(catalog.price.MISSING)} detail="No figure entered." icon="alert" />
        </section>
      )}

      <Panel
        title="Product prices"
        titleAs="h2"
        meta={catalog.reachable ? `${formatCount(catalog.total)} products` : "Unavailable"}
        padded={false}
        className={styles.section}
      >
        {!catalog.reachable ? (
          <EmptyState compact tone="problem" icon="error" title="Prices are unavailable">
            <p>{catalog.problem}</p>
          </EmptyState>
        ) : catalog.products.length === 0 ? (
          <EmptyState compact icon="wallet" title="No products yet">
            <p>Prices appear here once products exist.</p>
          </EmptyState>
        ) : (
          <TableFrame label="Product prices" caption="Each product's price and price readiness">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th align="right">Price</Th>
                <Th>Readiness</Th>
              </tr>
            </thead>
            <tbody>
              {catalog.products.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Stack primary={<RowLink href={`${row.href}?tab=pricing`}>{row.name}</RowLink>} secondary={row.productId.toUpperCase()} />
                  </Td>
                  <Td align="right" mono nowrap>
                    {row.productClass === "QUOTE_ONLY_PRODUCT" ? "Quote" : row.price > 0 ? formatINR(row.price) : "—"}
                  </Td>
                  <Td nowrap>
                    <StatusBadge tone={READINESS_TONE[row.priceReadiness]}>
                      {priceLabel(row.priceReadiness)}
                      {row.priceAwaitingApproval ? " · awaiting approval" : ""}
                    </StatusBadge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Panel>

      <Panel title="Price approval ledger" titleAs="h2" meta="Append-only · newest first" padded={false}>
        {!approvals.ok ? (
          <EmptyState compact tone="problem" icon="error" title="The ledger is unavailable">
            <p>{approvals.problem}</p>
          </EmptyState>
        ) : approvals.rows.length === 0 ? (
          <EmptyState compact icon="wallet" title="No price approvals recorded">
            <p>Every price is provisional until the business records an approval with its reference and approver.</p>
          </EmptyState>
        ) : (
          <TableFrame label="Price approvals" caption="Recorded price approvals">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th align="right">Amount</Th>
                <Th>Effective from</Th>
                <Th hide="sm">Reference</Th>
                <Th hide="md">Approved by</Th>
              </tr>
            </thead>
            <tbody>
              {approvals.rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Stack
                      primary={
                        row.productId !== null ? (
                          <RowLink href={`/admin/products/${row.productId}?tab=pricing`}>{row.productName ?? `Product #${row.productId}`}</RowLink>
                        ) : (
                          "Product removed"
                        )
                      }
                      secondary={row.productCode?.toUpperCase()}
                    />
                  </Td>
                  <Td align="right" mono nowrap>
                    {formatINR(row.amount)}
                  </Td>
                  <Td mono nowrap>
                    {row.effectiveFrom}
                  </Td>
                  <Td hide="sm">{row.reference}</Td>
                  <Td hide="md">{row.approvedBy}</Td>
                </Tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Panel>
    </>
  );
}
