"use client";

import { useEffect } from "react";

import { Button } from "@/components/core/Button";
import { EmptyState } from "@/components/ops/EmptyState";

import styles from "./error.module.css";

/**
 * The console could not start: operator authentication or the database did
 * not answer. There is no shell to render inside, and nothing is shown that
 * would need either.
 */
export default function OpsUnavailable({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Operations console unavailable:", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <EmptyState
          tone="problem"
          icon="alert"
          title="The operations console is unavailable"
          action={
            <>
              <Button size="sm" onClick={() => retry()}>
                Try again
              </Button>
              <Button href="/admin" size="sm" variant="secondary">
                Open the CMS
              </Button>
            </>
          }
        >
          <p>
            Operator sign-in or the database could not be reached, so no records can be shown.
          </p>
          {error.digest && <p>Reference {error.digest}</p>}
        </EmptyState>
      </div>
    </main>
  );
}
