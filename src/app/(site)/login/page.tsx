import type { Metadata } from "next";

import { AccountState } from "@/components/account";
import { Button } from "@/components/core";
import { Breadcrumbs } from "@/components/structure";
import { safeReturnPath } from "@/lib/account/routes";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * The sign-in seam.
 *
 * Phase 17 replaces this page with Supabase Auth. Until then it exists so that
 * every "Sign in" in the portal has somewhere honest to lead, and so that the
 * address Phase 17 needs to own is already the address everything points at.
 *
 * There is no form here. A sign-in form that authenticates nobody is worse than
 * none: it collects an email and a password, does nothing with either, and
 * teaches customers to type a password into a page that has no business
 * receiving one.
 *
 * The `next` parameter is read and validated, so the return path Phase 17 needs
 * already survives the round trip — and is already refused when it points
 * anywhere but the account. Nothing is echoed back into the page.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Validated on the way in, so an unsafe value never reaches a link. The value
  // itself is never rendered — it is a destination, not content.
  const returnTo = safeReturnPath(next);

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <Breadcrumbs className={styles.crumbs} items={[{ label: "Sign in" }]} />

        <div className={styles.layout}>
          <AccountState
            tone="unavailable"
            icon="user"
            code="Not open yet"
            title="Accounts are not open yet"
            titleAs="h1"
            actions={
              <>
                <Button href="/orders" size="lg">
                  Track an order
                </Button>
                <Button
                  href={returnTo ?? "/shop"}
                  variant="secondary"
                  size="lg"
                >
                  {returnTo ? "Back to your account" : "Browse the marketplace"}
                </Button>
              </>
            }
          >
            <p>
              SADA 3D does not offer customer sign-in yet. When it does, this is
              where you will sign in and your orders, designs, saved parts and
              addresses will be waiting.
            </p>
            <p>
              In the meantime you can follow any order with its reference and
              the email it was placed with.
            </p>
          </AccountState>
        </div>
      </div>
    </div>
  );
}
