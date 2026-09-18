"use client";

import { useEffect } from "react";

import { Button } from "@/components/core/Button";
import { EmptyState } from "@/components/ops/EmptyState";

/**
 * A console page failed to load. The shell stays, so the operator can go
 * elsewhere; the error goes to the console, and only its digest — which matches
 * a server log line and identifies nothing about a customer — is shown.
 */
export default function OpsPageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Operations console page failed:", error);
  }, [error]);

  return (
    <EmptyState
      tone="problem"
      icon="alert"
      title="This page could not be loaded"
      action={
        <>
          <Button size="sm" onClick={() => retry()}>
            Try again
          </Button>
          <Button href="/admin" size="sm" variant="secondary">
            Dashboard
          </Button>
        </>
      }
    >
      <p>The records behind this page could not be read. Nothing was changed.</p>
      {error.digest && <p>Reference {error.digest}</p>}
    </EmptyState>
  );
}
