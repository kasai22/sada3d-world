"use client";

import { useEffect } from "react";

import { Button } from "@/components/core";
import styles from "@/components/marketplace/MarketplaceStates.module.css";

/**
 * Catalog error boundary.
 *
 * Says what happened and offers a retry. The underlying error goes to the
 * console for diagnostics and is never rendered — a stack trace is not a
 * customer-facing message.
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Catalog request failed:", error);
  }, [error]);

  return (
    <div className="bg-commerce">
      <div
        className="u-container"
        style={{ paddingBlock: "var(--space-section)" }}
      >
        <div className={styles.state} role="alert">
          <p className={styles.code}>
            ERR_CATALOG{error.digest ? ` · ${error.digest}` : ""}
          </p>

          <h1 className={styles.title}>Products couldn&rsquo;t be loaded.</h1>

          <p className={styles.body}>
            Something interrupted the catalog request. Your filters are still in
            the address bar, so retrying keeps them.
          </p>

          <div className={styles.actions}>
            <Button onClick={reset}>Try again</Button>
            <Button href="/" variant="secondary">
              Return home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
