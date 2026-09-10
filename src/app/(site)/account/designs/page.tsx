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
 *   unavailable  designs cannot be stored yet, and the page says why. This is
 *                what it shows today — `lib/custom-print/storage.ts` keeps an
 *                uploaded model in the browser and sends it nowhere.
 *   empty        storage works and this customer has saved nothing.
 *   populated    the designs, each rendered from a view with no storage key.
 *
 * Showing "no saved designs" today would imply designs could be saved and that
 * this customer had not, which is not what is true.
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
            You can still upload a model, get a quote and order a part — the
            file stays in your browser for the length of that session.
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
          <p>Your designs will appear here when you save or upload one.</p>
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
