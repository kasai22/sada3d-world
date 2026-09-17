import type { Metadata } from "next";

import { Button } from "@/components/core/Button";
import { PageHeader } from "@/components/ops/PageHeader";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Panel } from "@/components/structure/Panel";
import { SpecTable } from "@/components/structure/SpecTable";
import { requireOperator } from "@/lib/ops/operator";
import { BRAND } from "@/lib/brand";
import { ADMIN_HOME, CMS_HOME, LEGACY_OPS_HOME, OPERATOR_ACCOUNT_PATH, cmsCollectionHref, cmsGlobalHref } from "@/lib/ops/routes";
import { getSystemStatus } from "@/lib/ops/system";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Settings" };

const PATH = "/admin/settings";

function Ok({ ok, label }: { ok: boolean; label: string }) {
  return <StatusBadge tone={ok ? "success" : "danger"}>{label}</StatusBadge>;
}

/**
 * What this deployment is connected to, and who is signed in.
 *
 * Booleans, modes and the names of variables that are missing — never a value,
 * a host, a bucket or a key. Operator accounts are managed in Payload, which is
 * where operator authentication lives; this page links there rather than
 * duplicating it.
 */
export default async function SettingsPage() {
  const operator = await requireOperator(PATH);
  const status = await getSystemStatus(operator);

  return (
    <>
      <PageHeader
        title="Settings"
        description="What this deployment is connected to. Values are never shown — only whether something is configured."
      />

      <div className={styles.grid}>
        <Panel title="You" titleAs="h2">
          <SpecTable
            dense
            caption="Signed-in operator"
            rows={[
              { label: "Name", value: operator.name },
              { label: "Email", value: operator.email },
              { label: "Operator id", value: operator.id },
              { label: "Environment", value: status.environment },
            ]}
          />
          <div className={styles.actions}>
            <Button href={OPERATOR_ACCOUNT_PATH} size="sm" variant="secondary">
              Account &amp; password
            </Button>
            <Button href={cmsCollectionHref("users")} size="sm" variant="ghost">
              Operators
            </Button>
          </div>
          <p className={styles.note}>
            Operators are Payload users. Anyone who can open Advanced CMS can open Reality 3D Admin; there is no second
            account system and no separate role. Customers can never sign in here.
          </p>
        </Panel>

        <Panel title="Infrastructure" titleAs="h2">
          <SpecTable
            dense
            caption="Infrastructure"
            rows={[
              {
                label: "Database",
                value: <Ok ok={status.database.reachable} label={status.database.reachable ? "Reachable" : "Unreachable"} />,
              },
              {
                label: "Design storage",
                value: (
                  <Ok
                    ok={status.storage.configured}
                    label={status.storage.configured ? (status.storage.provider ?? "Configured") : "Not configured"}
                  />
                ),
              },
              {
                label: "Customer sign-in",
                value: (
                  <Ok
                    ok={status.customerAuth.status === "configured"}
                    label={status.customerAuth.status === "configured" ? "Configured" : status.customerAuth.status}
                  />
                ),
              },
              {
                label: "Payments",
                value: status.payments.configured ? (
                  <StatusBadge tone={status.payments.mode === "live" ? "success" : "warning"}>
                    {status.payments.name} · {status.payments.mode}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="danger">Misconfigured</StatusBadge>
                ),
              },
              {
                label: "Demonstration orders",
                value: status.demoOrders ? "Seeded in this environment" : "Not seeded",
              },
            ]}
          />

          {(status.storage.problems.length > 0 || status.customerAuth.problems.length > 0) && (
            <ul className={styles.problems}>
              {[...status.storage.problems, ...status.customerAuth.problems].map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          {!status.payments.configured && <p className={styles.problem}>{status.payments.problem}</p>}
        </Panel>

        <Panel title="Manufacturing" titleAs="h2">
          <SpecTable
            dense
            caption="Manufacturing configuration"
            rows={[
              {
                label: "Machine limits",
                value: (
                  <StatusBadge tone={status.manufacturing.constraints === "configured" ? "success" : "warning"}>
                    {status.manufacturing.constraints}
                  </StatusBadge>
                ),
              },
              { label: "Analyser version", value: status.manufacturing.analysisVersion },
            ]}
          />
          <p className={styles.note}>
            No build volume, minimum feature size or part-count limit is configured, so size and feature checks do not
            run during manufacturability assessment. Printers are not modelled: a job records the machine it was
            assigned to, and there is no machine registry to manage here yet.
          </p>
        </Panel>

        <Panel title="Brand and addresses" titleAs="h2">
          <SpecTable
            dense
            caption="Brand and admin addresses"
            rows={[
              { label: "Brand", value: BRAND.name },
              { label: "Tagline", value: BRAND.tagline },
              { label: "Domain", value: BRAND.domain },
              { label: "Reality 3D Admin", value: ADMIN_HOME },
              { label: "Advanced CMS", value: CMS_HOME },
              { label: "Former console", value: `${LEGACY_OPS_HOME} → ${ADMIN_HOME}` },
            ]}
          />
          <p className={styles.note}>
            The brand is defined in code (src/lib/brand.ts), not in a setting, so it cannot be changed from here.
          </p>
        </Panel>

        <Panel title="Advanced CMS" titleAs="h2">
          <p className={styles.note}>
            Payload runs underneath Reality 3D Admin and stores the catalog with drafts, versions and publishing.
            Approvals, publishing, uploads, homepage copy and operator accounts are managed there.
          </p>
          <div className={styles.actions}>
            <Button href={cmsGlobalHref("homepage")} size="sm" variant="secondary">
              Homepage copy
            </Button>
            <Button href={cmsCollectionHref("products")} size="sm" variant="secondary">
              Product records
            </Button>
            <Button href={CMS_HOME} size="sm" variant="ghost">
              All collections
            </Button>
          </div>
          <p className={styles.note}>
            Stock and unit costs are in Inventory; approved selling prices are in Catalog › Pricing. Price multipliers
            live in the pricing rules, in code, on purpose.
          </p>
        </Panel>
      </div>
    </>
  );
}
