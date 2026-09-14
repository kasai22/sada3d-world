import type { Metadata } from "next";

import { AccountState, AuthForms, SignOutButton } from "@/components/account";
import { Button } from "@/components/core";
import { Breadcrumbs } from "@/components/structure";
import { getCustomerContext, resolveCredentialsAdapter } from "@/lib/account/identity";
import { parseLoginMode, parseLoginStatus, safeReturnPath } from "@/lib/account/routes";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Sign in, create an account, recover a password.
 *
 * Three states, each true:
 *
 *   signed in        a session already exists — the page says so and offers the
 *                    account or sign-out, rather than a form to sign in again
 *   not configured   this deployment has no Supabase Auth; accounts are not
 *                    available and there is no form that authenticates nobody
 *   the forms        sign in, create account, forgot password
 *
 * The query string can choose a tab (`mode`), a notice (`status`) and a return
 * path (`next`). Each is parsed against a closed list or the redirect allowlist
 * on the way in; none of their text is rendered.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; mode?: string | string[]; status?: string | string[] }>;
}) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined;

  const next = safeReturnPath(single(params.next));
  const mode = parseLoginMode(single(params.mode));
  const status = parseLoginStatus(single(params.status));

  const credentials = resolveCredentialsAdapter();
  const context = await getCustomerContext();

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <Breadcrumbs className={styles.crumbs} items={[{ label: "Sign in" }]} />

        <div className={styles.layout}>
          {context.identity && !context.development ? (
            <AccountState
              icon="check-circle"
              code="Signed in"
              title="You are signed in"
              titleAs="h1"
              actions={
                <>
                  <Button href={next ?? "/account"} size="lg" iconRight="arrow-right">
                    {next ? "Continue" : "Go to your account"}
                  </Button>
                  <SignOutButton variant="secondary" size="lg" />
                </>
              }
            >
              <p>
                {context.profile?.email
                  ? `Signed in as ${context.profile.email}.`
                  : "This browser has an active session."}
              </p>
            </AccountState>
          ) : !credentials ? (
            <AccountState
              tone="unavailable"
              icon="user"
              code="Not available"
              title="Accounts are not available here"
              titleAs="h1"
              actions={
                <>
                  <Button href="/orders" size="lg">
                    Track an order
                  </Button>
                  <Button href={next ?? "/shop"} variant="secondary" size="lg">
                    {next ? "Back" : "Browse the marketplace"}
                  </Button>
                </>
              }
            >
              <p>
                Customer sign-in is not configured in this environment, so there
                is no form here — a form that signs nobody in would only collect
                passwords.
              </p>
              {context.development && (
                <p>
                  This local build is using the development identity for the
                  account portal. Set the Supabase variables to use real accounts.
                </p>
              )}
              <p>You can still follow any order with its reference and email.</p>
            </AccountState>
          ) : (
            <>
              <h1 className="u-visually-hidden">Sign in to Reality 3D</h1>
              <AuthForms initialMode={mode} next={next} status={status} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
