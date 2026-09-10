"use client";

import { useEffect } from "react";

import { AccountState } from "@/components/account";
import { Button } from "@/components/core";

import styles from "./error.module.css";

/**
 * The account error boundary.
 *
 * Says what happened and offers the two things that help: try again, or go to
 * the part of the portal that is probably still fine.
 *
 * The error itself goes to the console. Nothing about it is rendered — a stack
 * trace, a database identifier or a query fragment on a customer's screen is
 * both useless to them and a gift to anyone probing the portal. The digest is
 * shown because it is the one value that lets support match this screen to a
 * server log, and it identifies an occurrence rather than a customer.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Account request failed:", error);
  }, [error]);

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <div className={styles.layout} role="alert">
          <AccountState
            tone="problem"
            icon="alert"
            code={`ERR_ACCOUNT${error.digest ? ` · ${error.digest}` : ""}`}
            title="Your account could not be loaded"
            titleAs="h1"
            actions={
              <>
                <Button onClick={reset} size="lg">
                  Try again
                </Button>
                <Button href="/" variant="secondary" size="lg">
                  Return home
                </Button>
              </>
            }
          >
            <p>
              Something interrupted the request. Nothing about your orders has
              changed — this page could not read them.
            </p>
          </AccountState>
        </div>
      </div>
    </div>
  );
}
