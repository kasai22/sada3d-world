import type { Metadata } from "next";

import {
  AccountShell,
  AccountSignInRequired,
  AccountState,
  SavedProducts,
} from "@/components/account";
import { Button } from "@/components/core";
import { requireCustomerContext } from "@/lib/account/identity";
import { listSavedProducts } from "@/lib/account/saved";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Saved parts",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Saved marketplace parts.
 *
 * Nothing is seeded here, so a new customer sees the empty state — which is
 * the truth. The saving itself is not yet offered from the marketplace: this
 * phase builds the store, the service and the account view, and the product
 * pages connect to `saveItemAction` when the marketplace next changes.
 */
export default async function AccountSavedPage() {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) {
    return <AccountSignInRequired returnTo="/account/saved" />;
  }

  const items = await listSavedProducts(gate.context.identity);

  return (
    <AccountShell
      title="Saved"
      description="Parts you have kept to come back to."
      crumbs={[{ label: "Saved" }]}
      meta={
        items.length > 0 ? (
          <span className={styles.count}>
            {items.length} {items.length === 1 ? "part" : "parts"}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <AccountState
          icon="heart"
          code="Nothing saved"
          title="Nothing saved yet"
          actions={
            <Button href="/shop" size="lg">
              Browse the marketplace
            </Button>
          }
        >
          <p>Save products you want to come back to.</p>
        </AccountState>
      ) : (
        <SavedProducts items={items} />
      )}

      <p className={styles.footnote}>
        Saved parts are references to the catalog, so prices and availability
        are always the current ones.
      </p>
    </AccountShell>
  );
}
