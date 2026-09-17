import type { Metadata } from "next";

import { Button } from "@/components/core/Button";
import { catalogTabs } from "@/components/ops/areas";
import styles from "@/components/ops/command/command.module.css";
import { EmptyState } from "@/components/ops/EmptyState";
import { PageHeader } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { LocalTime } from "@/components/tracking/LocalTime";
import { listCategories } from "@/lib/ops/catalog-admin";
import { formatCount } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { hrefWith } from "@/lib/ops/query";
import { cmsCollectionHref } from "@/lib/ops/routes";

export const metadata: Metadata = { title: "Categories" };

const PATH = "/admin/catalog/categories";

/**
 * Catalog › Categories: the category tree the storefront browses, with how many
 * products are filed under each. Categories are CMS data; each opens in
 * Advanced CMS, where drafts and publishing live.
 */
export default async function CategoriesPage() {
  const operator = await requireOperator(PATH);
  const result = await listCategories(operator);

  const rows = result.ok ? result.rows : [];
  const browse = rows.filter((row) => row.isBrowse).sort((a, b) => (a.browseOrder ?? 999) - (b.browseOrder ?? 999));
  const leaves = rows.filter((row) => !row.isBrowse);

  return (
    <>
      <PageHeader
        title="Catalog"
        description="Categories customers browse by. A product is filed under one leaf category and one browse category."
        actions={
          <Button href={`${cmsCollectionHref("categories")}/create`} size="sm" variant="primary" iconLeft="plus">
            New category (Advanced CMS)
          </Button>
        }
      />
      <SectionTabs label="Catalog" tabs={catalogTabs("categories")} />

      {!result.ok ? (
        <Panel padded={false}>
          <EmptyState tone="problem" icon="error" title="Categories are unavailable">
            <p>{result.problem}</p>
          </EmptyState>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel padded={false}>
          <EmptyState icon="library" title="No categories yet">
            <p>Create a browse category first (a top-level destination), then its leaf categories.</p>
          </EmptyState>
        </Panel>
      ) : (
        <>
          <TableFrame label="Categories" caption="Categories with their place in the tree and product counts">
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Type</Th>
                <Th hide="md">Parent</Th>
                <Th align="right">Products</Th>
                <Th hide="sm">Status</Th>
                <Th hide="lg">Source</Th>
                <Th align="right" hide="lg">
                  Updated
                </Th>
              </tr>
            </thead>
            <tbody>
              {[...browse, ...leaves].map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Stack primary={<RowLink href={cmsCollectionHref("categories", row.id)}>{row.name}</RowLink>} secondary={row.value} />
                  </Td>
                  <Td nowrap>
                    <StatusBadge tone={row.isBrowse ? "accent" : "neutral"} dot={false}>
                      {row.isBrowse ? `Browse${row.browseOrder !== null ? ` · #${row.browseOrder}` : ""}` : "Leaf"}
                    </StatusBadge>
                  </Td>
                  <Td hide="md">{row.parentName ?? <span className={styles.quiet}>—</span>}</Td>
                  <Td align="right" mono>
                    {row.products > 0 && !row.isBrowse ? (
                      <a href={hrefWith("/admin/products", { category: row.name })}>{formatCount(row.products)}</a>
                    ) : (
                      formatCount(row.products)
                    )}
                  </Td>
                  <Td hide="sm" nowrap>
                    <StatusBadge tone={row.published ? "success" : "warning"}>{row.published ? "Published" : "Draft"}</StatusBadge>
                  </Td>
                  <Td hide="lg">{row.source === "seed" ? "Repository seed" : "Administrator"}</Td>
                  <Td align="right" hide="lg" mono nowrap>
                    <LocalTime value={row.updatedAt} dateOnly />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableFrame>
          <p className={styles.gap}>
            {formatCount(browse.length)} browse and {formatCount(leaves.length)} leaf categories. Each category opens in Advanced CMS.
          </p>
        </>
      )}
    </>
  );
}
