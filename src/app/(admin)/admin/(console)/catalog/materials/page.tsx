import type { Metadata } from "next";

import { catalogTabs } from "@/components/ops/areas";
import styles from "@/components/ops/command/command.module.css";
import { EmptyState } from "@/components/ops/EmptyState";
import { PageHeader, PanelLink } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { capabilityOverview } from "@/lib/ops/analytics/catalog";
import { listMaterials } from "@/lib/ops/catalog-admin";
import type { OpsTone } from "@/lib/ops/labels";
import { requireOperator } from "@/lib/ops/operator";
import { cmsCollectionHref } from "@/lib/ops/routes";

export const metadata: Metadata = { title: "Materials" };

const PATH = "/admin/catalog/materials";

const CAPABILITY_TONE: Record<string, OpsTone> = { AVAILABLE: "success", COMING_SOON: "info", UNAVAILABLE: "neutral" };
const CAPABILITY_LABEL: Record<string, string> = { AVAILABLE: "Available", COMING_SOON: "Coming soon", UNAVAILABLE: "Unavailable" };

/**
 * Catalog › Materials: the material library customers choose from, with each
 * material's capability status from the business decision ledger.
 */
export default async function MaterialsPage() {
  const operator = await requireOperator(PATH);
  const result = await listMaterials(operator);
  const capability = capabilityOverview();

  return (
    <>
      <PageHeader
        title="Catalog"
        description="Materials in the library. Whether a material can be sold is a business decision recorded in the decision ledger, not a CMS field."
      />
      <SectionTabs label="Catalog" tabs={catalogTabs("materials")} />

      <Panel
        title="Manufacturing capability"
        titleAs="h2"
        meta="Decision ledger"
        actions={<PanelLink href="/admin/catalog#capability">Details</PanelLink>}
        className={styles.section}
      >
        <p className={styles.lead}>
          Available: {capability.available.length > 0 ? capability.available.map((entry) => entry.label).join(" · ") : "nothing approved yet"}
        </p>
        <p className={styles.lead}>
          Coming soon: {capability.comingSoon.length > 0 ? capability.comingSoon.map((entry) => entry.label).join(" · ") : "none"}
        </p>
      </Panel>

      {!result.ok ? (
        <Panel padded={false}>
          <EmptyState tone="problem" icon="error" title="Materials are unavailable">
            <p>{result.problem}</p>
          </EmptyState>
        </Panel>
      ) : result.rows.length === 0 ? (
        <Panel padded={false}>
          <EmptyState icon="palette" title="No materials yet">
            <p>Materials are imported from the canonical catalog (npm run content:import) or created in Advanced CMS.</p>
          </EmptyState>
        </Panel>
      ) : (
        <>
          <TableFrame label="Materials" caption="Material library with capability status and properties">
            <thead>
              <tr>
                <Th>Material</Th>
                <Th>Capability</Th>
                <Th hide="sm">Processes</Th>
                <Th hide="md">Strength · Flex · Heat</Th>
                <Th align="right" hide="lg">
                  Swatches
                </Th>
                <Th hide="sm">Status</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const status = row.capabilityStatus ?? "UNAVAILABLE";
                return (
                  <Tr key={row.id}>
                    <Td>
                      <Stack
                        primary={<RowLink href={cmsCollectionHref("materials", row.id)}>{row.name}</RowLink>}
                        secondary={[row.value.toUpperCase(), row.code].filter(Boolean).join(" · ")}
                      />
                    </Td>
                    <Td nowrap>
                      <StatusBadge tone={CAPABILITY_TONE[status] ?? "neutral"}>{CAPABILITY_LABEL[status] ?? status}</StatusBadge>
                    </Td>
                    <Td hide="sm" mono>
                      {row.technologies.map((value) => value.toUpperCase()).join(", ") || "—"}
                    </Td>
                    <Td hide="md" mono>
                      {row.properties.strength} · {row.properties.flexibility} · {row.properties.heat}
                      <span className="u-visually-hidden"> (each out of 5)</span>
                    </Td>
                    <Td align="right" hide="lg" mono>
                      {row.swatches}
                    </Td>
                    <Td hide="sm" nowrap>
                      <StatusBadge tone={row.published ? "success" : "warning"}>{row.published ? "Published" : "Draft"}</StatusBadge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableFrame>
          <p className={styles.gap}>Properties are rated 1–5 in the CMS. Each material opens in Advanced CMS.</p>
        </>
      )}
    </>
  );
}
