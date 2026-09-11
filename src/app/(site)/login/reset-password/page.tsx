import type { Metadata } from "next";

import { AccountState, PasswordUpdateForm } from "@/components/account";
import { Button } from "@/components/core";
import { Breadcrumbs } from "@/components/structure";
import { requireCustomerContext, resolveCredentialsAdapter } from "@/lib/account/identity";
import { signInHref } from "@/lib/account/routes";

import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/*
 * Always rendered per request. Whether the form appears depends on this
 * request's session; a prerendered copy would show one visitor's answer — or
 * the build machine's configuration — to everyone.
 */
export const dynamic = "force-dynamic";

/**
 * Where a recovery link ends up.
 *
 * `/auth/confirm` has already exchanged the link for a session. This page asks
 * the server whether that session exists — the provider's answer, not a flag in
 * the URL — and offers the form only if it does. Without one, the link expired
 * or was used, and the page says so and offers a new one.
 */
export default async function ResetPasswordPage() {
  const credentials = resolveCredentialsAdapter();
  const gate = credentials ? await requireCustomerContext() : null;

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <Breadcrumbs
          className={styles.crumbs}
          items={[{ label: "Sign in", href: "/login" }, { label: "New password" }]}
        />

        <div className={styles.layout}>
          {!credentials ? (
            <AccountState
              tone="unavailable"
              icon="user"
              code="Not available"
              title="Accounts are not available here"
              titleAs="h1"
            >
              <p>Customer sign-in is not configured in this environment.</p>
            </AccountState>
          ) : gate?.authenticated ? (
            <PasswordUpdateForm />
          ) : (
            <AccountState
              tone="problem"
              icon="alert"
              code="Link expired"
              title="This reset link can no longer be used"
              titleAs="h1"
              actions={
                <Button href={signInHref(undefined, { mode: "forgot" })} size="lg">
                  Request a new link
                </Button>
              }
            >
              <p>
                Password reset links work once and expire after a short time. Request
                a new one and open it in this browser.
              </p>
            </AccountState>
          )}
        </div>
      </div>
    </div>
  );
}
