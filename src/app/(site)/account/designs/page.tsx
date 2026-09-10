import type { Metadata } from "next";

import {
  AccountShell,
  AccountSignInRequired,
  AccountState,
  DesignCard,
} from "@/components/account";
import { Button } from "@/components/core";
import { listCustomerDesigns } from "@/lib/account/designs";
import { requireCustomerContext } from "@/lib/account/identity";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Your designs",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Saved manufacturing designs.
 *
 * Three states, and the difference between the first two is the point:
 *
 *   unavailable  designs cannot be stored in this deployment — no storage or
 *                no database — and the page says why.
 *   empty        storage works and this customer has stored nothing.
 *   populated    their verified designs, each rendered from a view with no
 *                storage key, each downloadable through the authorised route.
 *
 * Showing "no saved designs" where storage is not configured would imply
 * designs could be saved and that this customer had not.
 */
export default async function AccountDesignsPage() {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) {
    return <AccountSignInRequired returnTo="/account/designs" />;
  }

  const result = await listCustomerDesigns(gate.context.identity);

  return (
    <AccountShell
      title="Designs"
      description="Manufacturing files you have saved, and the orders they were made for."
      crumbs={[{ label: "Designs" }]}
    >
      {result.status === "unavailable" ? (
        <AccountState
          tone="unavailable"
          icon="box"
          code="Not available yet"
          title="Designs cannot be saved yet"
          actions={
            <Button href="/custom-print" size="lg" iconRight="arrow-right">
              Start a custom print
            </Button>
          }
        >
          <p>{result.reason}</p>
          <p>
            You can still select a model and get a quote. The file stays in
            your browser, and a part cannot be ordered until its file is stored.
          </p>
        </AccountState>
      ) : result.items.length === 0 ? (
        <AccountState
          icon="box"
          code="No designs"
          title="No saved designs"
          actions={
            <Button href="/custom-print" size="lg">
              Start a custom print
            </Button>
          }
        >
          <p>
            Models you upload in Custom print are stored here once they have
            been verified.
          </p>
        </AccountState>
      ) : (
        <ul className={styles.grid}>
          {result.items.map((design) => (
            <li key={design.id}>
              <DesignCard design={design} />
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
