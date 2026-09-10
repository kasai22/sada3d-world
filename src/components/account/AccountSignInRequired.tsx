import { Button } from "@/components/core";
import { Breadcrumbs } from "@/components/structure";
import { signInHref } from "@/lib/account/routes";

import { AccountState } from "./AccountState";
import styles from "./AccountSignInRequired.module.css";

export interface AccountSignInRequiredProps {
  /** Where to come back to once accounts exist. Validated by signInHref. */
  returnTo?: string;
}

/**
 * The account, to someone who is not signed in.
 *
 * This is what every account route renders today, in production, because there
 * is no authentication: `lib/account/identity.ts` has no trusted identity to
 * offer and does not invent one.
 *
 * It says two true things and no more — what an account is for, and that
 * signing in is not available yet. It does not offer a form that cannot
 * authenticate anyone, and it does not imply that an account is waiting.
 *
 * The one thing a customer can do right now is track an order with its
 * reference and email, which is the Phase 12 guest route and genuinely works.
 * It is offered here rather than buried.
 */
export function AccountSignInRequired({ returnTo }: AccountSignInRequiredProps) {
  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <Breadcrumbs className={styles.crumbs} items={[{ label: "Account" }]} />

        <div className={styles.layout}>
          <AccountState
            icon="user"
            code="Sign in required"
            title="Your account"
            titleAs="h1"
            actions={
              <>
                <Button href={signInHref(returnTo)} size="lg">
                  Sign in
                </Button>
                <Button href="/orders" variant="secondary" size="lg">
                  Track an order
                </Button>
              </>
            }
          >
            <p>
              Sign in to see your orders, follow what is being made, and manage
              your saved designs, saved parts and delivery addresses.
            </p>
            <p>
              Accounts are not open yet. You can still follow an order with its
              reference and the email it was placed with.
            </p>
          </AccountState>
        </div>
      </div>
    </div>
  );
}
