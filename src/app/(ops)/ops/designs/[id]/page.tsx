import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/core/Button";
import { EmptyState } from "@/components/ops/EmptyState";
import { PageHeader } from "@/components/ops/PageHeader";
import { DemoTag, DesignStateBadge, OrderStatusBadge, StatusBadge } from "@/components/ops/StatusBadge";
import { RowLink, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { SpecTable } from "@/components/structure/SpecTable";
import { LocalTime } from "@/components/tracking/LocalTime";
import { getOpsDesign } from "@/lib/ops/designs";
import { formatBytes, formatCount, formatDimensions, formatVolume } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";

import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Design ${decodeURIComponent(id).slice(0, 32)}` };
}

function measurement(value: { state: string; value?: number; unit?: string; reason?: string }): string {
  if (value.state === "available" && typeof value.value === "number") {
    return `${formatCount(Math.round(value.value * 100) / 100)} ${value.unit ?? ""}`.trim();
  }
  return value.reason ?? "Not available";
}

/**
 * One design: the file, what verification established, and what the geometry
 * measures. Manufacturability is computed now against today's machine
 * constraints, so it agrees with what the customer is shown.
 */
export default async function DesignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operator = await requireOperator(`/ops/designs/${id}`);
  const design = await getOpsDesign(operator, id);

  if (!design) {
    return (
      <>
        <PageHeader
          title="Design not found"
          crumbs={[{ label: "Designs", href: "/ops/designs" }, { label: "Not found" }]}
        />
        <Panel padded={false}>
          <EmptyState
            icon="search"
            title="No design with that id"
            action={
              <Button href="/ops/designs" size="sm" variant="secondary">
                All designs
              </Button>
            }
          >
            <p>The design may have been removed by its owner.</p>
          </EmptyState>
        </Panel>
      </>
    );
  }

  const analysis = design.analysisDetail;

  return (
    <>
      <PageHeader
        title={design.name}
        crumbs={[{ label: "Designs", href: "/ops/designs" }, { label: design.name }]}
        meta={
          <>
            <DesignStateBadge state={design.state} />
            <StatusBadge tone="neutral" dot={false}>
              {design.format}
            </StatusBadge>
          </>
        }
        description={
          <>
            {formatBytes(design.sizeBytes)} · uploaded <LocalTime value={design.createdAt} /> ·{" "}
            {design.customer.name ? (
              <Link href={`/ops/customers/${design.customer.id}`}>{design.customer.name}</Link>
            ) : (
              <Link href={`/ops/customers/${design.customer.id}`}>{design.customer.id}</Link>
            )}
          </>
        }
        actions={
          <Button href={`/ops/designs?customer=${design.customer.id}`} size="sm" variant="secondary" iconLeft="user">
            Their designs
          </Button>
        }
      />

      {design.failure && (
        <Panel title="Verification refused this file" titleAs="h2" className={styles.problem}>
          <p className={styles.problemText}>{design.failure.message}</p>
          <p className={styles.note}>Code: {design.failure.code}</p>
        </Panel>
      )}

      <div className={styles.columns}>
        <div className={styles.main}>
          <Panel title="Geometry" titleAs="h2">
            {analysis ? (
              <>
                <SpecTable
                  caption="Measured geometry"
                  highlight={["Bounding box"]}
                  rows={[
                    { label: "Bounding box", value: formatDimensions(analysis.boundingBoxMm) },
                    {
                      label: "Volume",
                      value:
                        analysis.volume.state === "available"
                          ? formatVolume(analysis.volume.value)
                          : analysis.volume.reason,
                    },
                    { label: "Surface area", value: measurement(analysis.surfaceArea) },
                    { label: "Triangles", value: measurement(analysis.triangleCount) },
                    { label: "Objects", value: formatCount(analysis.objectCount) },
                    { label: "Meshes", value: formatCount(analysis.meshCount) },
                    { label: "Topology", value: analysis.topology.status.replace(/_/g, " ") },
                    { label: "Boundary edges", value: formatCount(analysis.topology.boundaryEdges) },
                    { label: "Non-manifold edges", value: formatCount(analysis.topology.nonManifoldEdges) },
                    { label: "Degenerate triangles", value: formatCount(analysis.topology.degenerateTriangles) },
                    { label: "Unit", value: `${analysis.unit.unit} · ${analysis.unit.declared ? "declared" : "assumed"}` },
                    { label: "Analysis", value: analysis.identity },
                  ]}
                />
                <p className={styles.note}>{analysis.unit.note}</p>
              </>
            ) : (
              <EmptyState
                compact
                icon="scan"
                title={
                  design.analysis.state === "unsupported"
                    ? "This format is never measured"
                    : design.analysis.state === "pending"
                      ? "Not measured yet"
                      : design.analysis.state === "unreadable"
                        ? "The stored measurement could not be read"
                        : "No stored measurement"
                }
              >
                <p>
                  {design.analysis.state === "unsupported"
                    ? "STEP files are stored and verified, but they are not meshes, so nothing is measured from them."
                    : design.analysis.state === "pending"
                      ? "A design is measured when its upload is verified."
                      : "The file was verified, but no analysis is stored for its contents at the current analyser version."}
                </p>
              </EmptyState>
            )}
          </Panel>

          {analysis && (
            <Panel title="Manufacturability" titleAs="h2" className={styles.block}>
              <div className={styles.verdict}>
                <StatusBadge tone={analysis.manufacturability.manufacturable ? "success" : "danger"}>
                  {analysis.manufacturability.manufacturable ? "Can be manufactured" : "Blocked"}
                </StatusBadge>
                {analysis.manufacturability.constraints === "unconfigured" && (
                  <StatusBadge tone="warning">Machine limits not configured</StatusBadge>
                )}
              </div>

              {analysis.manufacturability.findings.length === 0 ? (
                <p className={styles.note}>Nothing was found against this geometry.</p>
              ) : (
                <ul className={styles.findings}>
                  {analysis.manufacturability.findings.map((finding) => (
                    <li key={`${finding.code}-${finding.message}`} className={styles.finding}>
                      <StatusBadge tone={finding.severity === "blocking" ? "danger" : "warning"}>
                        {finding.severity}
                      </StatusBadge>
                      <span>{finding.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {analysis.manufacturability.constraints === "unconfigured" && (
                <p className={styles.note}>
                  No build volume, minimum feature size or part-count limit is configured in this deployment, so size
                  and feature checks did not run. An empty result is not a pass.
                </p>
              )}
            </Panel>
          )}

          {analysis && analysis.warnings.length > 0 && (
            <Panel title="Analyser warnings" titleAs="h2" className={styles.block}>
              <ul className={styles.findings}>
                {analysis.warnings.map((warning) => (
                  <li key={warning.code} className={styles.finding}>
                    <StatusBadge tone="warning">{warning.code.replace(/_/g, " ")}</StatusBadge>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Orders" titleAs="h2" meta={`${design.orders.length} using this file`} padded={false} className={styles.block}>
            {design.orders.length === 0 ? (
              <EmptyState compact icon="clipboard" title="Not ordered yet">
                <p>This design has not been manufactured for any order.</p>
              </EmptyState>
            ) : (
              <TableFrame flush label="Orders this design was made for" caption="Orders this design was made for">
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Status</Th>
                    <Th align="right">Placed</Th>
                  </tr>
                </thead>
                <tbody>
                  {design.orders.map((order) => (
                    <Tr key={order.reference}>
                      <Td nowrap>
                        <RowLink href={`/ops/orders/${order.reference}`} mono>
                          {order.reference}
                        </RowLink>
                        {order.demo && <DemoTag />}
                      </Td>
                      <Td>
                        <OrderStatusBadge status={order.status} />
                      </Td>
                      <Td align="right" mono nowrap>
                        {order.placedAt.slice(0, 10)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableFrame>
            )}
          </Panel>
        </div>

        <aside className={styles.side} aria-label="File detail">
          <Panel title="File" titleAs="h2">
            <SpecTable
              dense
              caption="File detail"
              rows={[
                { label: "Design id", value: design.id },
                { label: "Format", value: design.format },
                { label: "Size", value: formatBytes(design.sizeBytes) },
                { label: "Content type", value: design.contentType ?? "Not recorded" },
                { label: "Checksum", value: design.checksum ?? "Not verified" },
                { label: "State", value: <DesignStateBadge state={design.state} /> },
                { label: "Uploaded", value: <LocalTime value={design.createdAt} /> },
                {
                  label: "Verified",
                  value: design.verifiedAt ? <LocalTime value={design.verifiedAt} /> : "Not verified",
                },
                { label: "Last change", value: <LocalTime value={design.updatedAt} /> },
                ...(design.deletedAt
                  ? [{ label: "Deleted", value: <LocalTime value={design.deletedAt} /> }]
                  : []),
                ...(design.objectRemovedAt
                  ? [{ label: "File removed", value: <LocalTime value={design.objectRemovedAt} /> }]
                  : []),
              ]}
            />
            <p className={styles.note}>
              The stored file is private to its owner. The console shows what is known about it and never a link to the
              bytes — there is no operator download path in the storage design.
            </p>
          </Panel>

          <Panel title="Customer" titleAs="h2" className={styles.block}>
            <SpecTable
              dense
              caption="Customer"
              rows={[
                {
                  label: "Account",
                  value: <Link href={`/ops/customers/${design.customer.id}`}>{design.customer.id}</Link>,
                },
                { label: "Name", value: design.customer.name ?? "No order placed yet" },
              ]}
            />
            <p className={styles.note}>Name comes from their most recent order, not from the identity provider.</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
