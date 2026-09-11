import { Button } from "@/components/core";
import { Breadcrumbs } from "@/components/structure";
import { getCustomerContext, resolveCredentialsAdapter } from "@/lib/account/identity";
import { signInHref } from "@/lib/account/routes";

import { AccountState } from "./AccountState";
import styles from "./AccountSignInRequired.module.css";

export interface AccountSignInRequiredProps {
  /** Where to come back to after signing in. Validated by signInHref. */
  returnTo?: string;
}

/**
 * The account, to someone who is not signed in.
 *
 * Every account page renders this when `requireCustomerContext` finds no
 * session. It distinguishes the three reasons there can be no customer,
 * because each needs a different sentence:
 *
 *   the session expired        "sign in again" — the provider refused a session
 *                              this browser presented
 *   nobody is signed in        sign in, or create an account
 *   accounts are unavailable   this deployment has no Supabase Auth, and there
 *                              is no form to offer
 *
 * The guest route — following an order with its reference and email — is
 * offered in all three, because it works without an account.
 */
export async function AccountSignInRequired({ returnTo }: AccountSignInRequiredProps) {
  const credentials = resolveCredentialsAdapter();
  const { sessionExpired } = await getCustomerContext();

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <Breadcrumbs className={styles.crumbs} items={[{ label: "Account" }]} />

        <div className={styles.layout}>
          {!credentials ? (
            <AccountState
              tone="unavailable"
              icon="user"
              code="Not available"
              title="Your account"
              titleAs="h1"
              actions={
                <Button href="/orders" size="lg">
                  Track an order
                </Button>
              }
            >
              <p>
                Customer accounts are not available in this environment. You can
                still follow an order with its reference and the email it was
                placed with.
              </p>
            </AccountState>
          ) : (
            <AccountState
              icon="user"
              code={sessionExpired ? "Session expired" : "Sign in required"}
              title="Your account"
              titleAs="h1"
              actions={
                <>
                  <Button
                    href={signInHref(returnTo, sessionExpired ? { status: "expired" } : {})}
                    size="lg"
                  >
                    Sign in
                  </Button>
                  {!sessionExpired && (
                    <Button
                      href={signInHref(returnTo, { mode: "signup" })}
                      variant="secondary"
                      size="lg"
                    >
                      Create an account
                    </Button>
                  )}
                  <Button href="/orders" variant="secondary" size="lg">
                    Track an order
                  </Button>
                </>
              }
            >
              <p>
                {sessionExpired
                  ? "Your session has expired. Sign in again to continue where you left off."
                  : "Sign in to see your orders, follow what is being made, and manage your saved designs, saved parts and delivery addresses."}
              </p>
              <p>
                An order placed without an account can still be followed with its
                reference and the email it was placed with.
              </p>
            </AccountState>
          )}
        </div>
      </div>
    </div>
  );
}
