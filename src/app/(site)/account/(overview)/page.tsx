import type { Metadata } from "next";

import {
  AccountIdentity,
  AccountShell,
  AccountSignInRequired,
  AccountState,
  ActiveManufacturing,
  CustomerOrderCard,
} from "@/components/account";
import { Button } from "@/components/core";
import { SectionHeading } from "@/components/structure";
import { requireCustomerContext } from "@/lib/account/identity";
import {
  countCustomerOrders,
  listActiveManufacturing,
  listCustomerOrders,
} from "@/lib/account/orders";
import { seedTrackingFixtures } from "@/lib/orders/fixtures";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Dynamic by necessity: everything on this page is one customer's private
 * record, resolved per request. None of it can be prerendered and none of it
 * should be cached.
 */
export const dynamic = "force-dynamic";

const RECENT_ORDERS = 3;
const ACTIVE_PARTS = 4;

/**
 * The account overview.
 *
 * An operational summary, not a dashboard. No spend totals, no order counts
 * dressed up as metrics, no reward points — none of that is a thing SADA 3D
 * knows about a customer, and a portal is not improved by inventing figures for
 * it to display.
 *
 * What is here is what a customer would actually come to check: who they are
 * signed in as, what has been ordered recently, and what is being made right
 * now. Sections that have nothing to say are not rendered as empty cards; the
 * page shows one empty state and the useful ways out of it.
 */
export default async function AccountPage() {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) return <AccountSignInRequired returnTo="/account" />;

  await seedTrackingFixtures();

  const { identity, profile, development } = gate.context;

  const [recent, active, total] = await Promise.all([
    listCustomerOrders(identity, { limit: RECENT_ORDERS }),
    listActiveManufacturing(identity, ACTIVE_PARTS),
    countCustomerOrders(identity),
  ]);

  return (
    <AccountShell
      title="Overview"
      description="Your orders and anything currently being made."
    >
      <div className={styles.overview}>
        <section aria-labelledby="account-identity">
          <SectionHeading as="h2" id="account-identity" size="sm">
            Signed in as
          </SectionHeading>
          <AccountIdentity profile={profile} development={development} />
        </section>

        {active.length > 0 && (
          <section aria-labelledby="account-production">
            <SectionHeading
              as="h2"
              id="account-production"
              size="sm"
              meta={`${active.length} ${active.length === 1 ? "part" : "parts"}`}
            >
              In production
            </SectionHeading>
            <ActiveManufacturing items={active} />
          </section>
        )}

        <section aria-labelledby="account-recent">
          <SectionHeading
            as="h2"
            id="account-recent"
            size="sm"
            meta={total > 0 ? `${total} total` : undefined}
          >
            Recent orders
          </SectionHeading>

          {recent.length === 0 ? (
            <AccountState
              icon="package"
              code="No orders"
              title="No orders yet"
              actions={
                <>
                  <Button href="/shop" size="lg">
                    Browse the marketplace
                  </Button>
                  <Button href="/custom-print" variant="secondary" size="lg">
                    Start a custom print
                  </Button>
                </>
              }
            >
              <p>When you place your first order, it will appear here.</p>
            </AccountState>
          ) : (
            <>
              <ul className={styles.orders}>
                {recent.map((order) => (
                  <li key={order.reference}>
                    <CustomerOrderCard order={order} />
                  </li>
                ))}
              </ul>

              {total > recent.length && (
                <p className={styles.more}>
                  <Button href="/account/orders" variant="secondary">
                    View all orders
                  </Button>
                </p>
              )}
            </>
          )}
        </section>

        {recent.length > 0 && (
          <section aria-labelledby="account-actions">
            <SectionHeading as="h2" id="account-actions" size="sm">
              Start something
            </SectionHeading>
            <div className={styles.actions}>
              <Button href="/custom-print" size="lg" iconRight="arrow-right">
                Start a custom print
              </Button>
              <Button href="/shop" variant="secondary" size="lg">
                Browse the marketplace
              </Button>
            </div>
          </section>
        )}
      </div>
    </AccountShell>
  );
}
