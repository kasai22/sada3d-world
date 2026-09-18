import type { Metadata } from "next";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import { catalogTabs } from "@/components/ops/areas";
import styles from "@/components/ops/command/command.module.css";
import { EmptyState } from "@/components/ops/EmptyState";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { LocalTime } from "@/components/tracking/LocalTime";
import { getCatalogHealth } from "@/lib/ops/analytics/catalog";
import { MEDIA_LIMIT, listMedia } from "@/lib/ops/catalog-admin";
import { formatBytes, formatCount } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { hrefWith } from "@/lib/ops/query";
import { cmsCollectionHref } from "@/lib/ops/routes";

export const metadata: Metadata = { title: "Media" };

const PATH = "/admin/catalog/media";

/**
 * Catalog › Media: the media library and how many products still lack an
 * approved image. Uploading stays in Advanced CMS, where files are stored.
 * No thumbnails are loaded: files may not be present on every deployment, and
 * a broken image would say less than the file name.
 */
export default async function MediaPage() {
  const operator = await requireOperator(PATH);
  const [catalog, media] = await Promise.all([getCatalogHealth(operator), listMedia(operator)]);

  return (
    <>
      <PageHeader
        title="Catalog"
        description="Product photography and approved renders. A product's image counts only with a recorded media approval."
        actions={
          <Button href={`${cmsCollectionHref("media")}/create`} size="sm" variant="primary" iconLeft="upload">
            Upload media (Advanced CMS)
          </Button>
        }
      />
      <SectionTabs label="Catalog" tabs={catalogTabs("media")} />

      {catalog.reachable && (
        <section className={styles.kpis} aria-label="Media figures">
          <KpiCard label="Library files" meta="Now" value={formatCount(catalog.mediaLibrary)} icon="scan" detail="Files in the media library." />
          <KpiCard label="Approved imagery" meta="Now" value={formatCount(catalog.media.APPROVED)} icon="check-circle" detail="Products with approved media." />
          <KpiCard
            label="Awaiting approval"
            meta="Now"
            value={formatCount(catalog.media.PROPOSED)}
            icon="clock"
            detail="An image with no recorded approval."
            href={hrefWith("/admin/catalog", { view: "media" })}
            signal={catalog.media.PROPOSED > 0 ? "warning" : undefined}
          />
          <KpiCard
            label="No image"
            meta="Now"
            value={formatCount(catalog.media.MISSING)}
            icon="alert"
            detail="Products without any image."
            href={hrefWith("/admin/catalog", { view: "media" })}
          />
        </section>
      )}

      {!media.ok ? (
        <Panel padded={false}>
          <EmptyState tone="problem" icon="error" title="The media library is unavailable">
            <p>{media.problem}</p>
          </EmptyState>
        </Panel>
      ) : media.rows.length === 0 ? (
        <Panel padded={false}>
          <EmptyState icon="scan" title="No media uploaded yet">
            <p>Upload approved product photographs or renders. No imagery is generated or substituted.</p>
          </EmptyState>
        </Panel>
      ) : (
        <TableFrame label="Media library" caption="Media files, newest first">
          <thead>
            <tr>
              <Th>File</Th>
              <Th hide="sm">Kind</Th>
              <Th hide="md">Dimensions</Th>
              <Th align="right" hide="md">
                Size
              </Th>
              <Th hide="sm">Status</Th>
              <Th align="right" hide="lg">
                Updated
              </Th>
            </tr>
          </thead>
          <tbody>
            {media.rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Stack
                    primary={<RowLink href={cmsCollectionHref("media", row.id)}>{row.alt}</RowLink>}
                    secondary={[row.filename, row.credit && `Credit: ${row.credit}`].filter(Boolean).join(" · ") || "No file name"}
                  />
                </Td>
                <Td hide="sm">{row.kind === "photo" ? "Photograph" : row.kind === "render" ? "Render" : "—"}</Td>
                <Td hide="md" mono>
                  {row.width && row.height ? `${row.width} × ${row.height}` : "—"}
                </Td>
                <Td align="right" hide="md" mono nowrap>
                  {row.filesize ? formatBytes(row.filesize) : "—"}
                </Td>
                <Td hide="sm" nowrap>
                  <StatusBadge tone={row.published ? "success" : "warning"}>{row.published ? "Published" : "Draft"}</StatusBadge>
                </Td>
                <Td align="right" hide="lg" mono nowrap>
                  <LocalTime value={row.updatedAt} dateOnly />
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}
      {media.ok && media.total !== undefined && media.total > MEDIA_LIMIT && (
        <p className={styles.gap}>
          <Icon name="info" size={14} />
          Showing the newest {formatCount(MEDIA_LIMIT)} of {formatCount(media.total)} files. The full library is in Advanced CMS.
        </p>
      )}
    </>
  );
}
