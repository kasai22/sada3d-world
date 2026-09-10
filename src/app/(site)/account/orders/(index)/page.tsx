import type { Metadata } from "next";
import Link from "next/link";

import {
  AccountShell,
  AccountSignInRequired,
  AccountState,
  CustomerOrderCard,
  OrderFilterBar,
} from "@/components/account";
import { Button } from "@/components/core";
import { requireCustomerContext } from "@/lib/account/identity";
import {
  listCustomerOrders,
  matchesOrderFilter,
  parseOrderFilter,
  type CustomerOrderFilter,
} from "@/lib/account/orders";
import { seedTrackingFixtures } from "@/lib/orders/fixtures";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

const FILTER_EMPTY: Record<CustomerOrderFilter, string> = {
  all: "No orders yet",
  active: "Nothing in progress",
  completed: "Nothing completed yet",
  closed: "Nothing closed",
};

/**
 * Order history.
 *
 * The filter is in the URL, so a filtered list is shareable, survives a
 * refresh and works with the back button. That is the whole reason it is not
 * client state.
 *
 * Counts are computed from the customer's own orders, so a bucket never invites
 * someone into an empty list without warning them it is empty.
 */
export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const gate = await requireCustomerContext();
  if (!gate.authenticated) {
    return <AccountSignInRequired returnTo="/account/orders" />;
  }

  await seedTrackingFixtures();

  const { status } = await searchParams;
  const filter = parseOrderFilter(status);

  // One read, then counted and filtered in memory: four queries for four
  // buckets would ask the same question four times.
  const all = await listCustomerOrders(gate.context.identity);
  const orders = all.filter((order) => matchesOrderFilter(order.status, filter));

  const counts: Record<CustomerOrderFilter, number> = {
    all: all.length,
    active: all.filter((order) => matchesOrderFilter(order.status, "active")).length,
    completed: all.filter((order) => matchesOrderFilter(order.status, "completed"))
      .length,
    closed: all.filter((order) => matchesOrderFilter(order.status, "closed")).length,
  };

  return (
    <AccountShell
      title="Orders"
      description="Every order you have placed, and where each one has got to."
      crumbs={[{ label: "Orders" }]}
    >
      {all.length > 0 && <OrderFilterBar active={filter} counts={counts} />}

      {orders.length === 0 ? (
        <AccountState
          icon="package"
          code={`No ${filter === "all" ? "orders" : filter} orders`}
          title={FILTER_EMPTY[filter]}
          actions={
            filter === "all" ? (
              <>
                <Button href="/shop" size="lg">
                  Browse the marketplace
                </Button>
                <Button href="/custom-print" variant="secondary" size="lg">
                  Start a custom print
                </Button>
              </>
            ) : (
              <Button href="/account/orders" variant="secondary" size="lg">
                Show all orders
              </Button>
            )
          }
        >
          <p>
            {filter === "all"
              ? "When you place your first order, it will appear here."
              : "Nothing matches this filter right now."}
          </p>
        </AccountState>
      ) : (
        <ul className={styles.orders}>
          {orders.map((order) => (
            <li key={order.reference}>
              <CustomerOrderCard order={order} />
            </li>
          ))}
        </ul>
      )}

      <p className={styles.guest}>
        Placed an order without an account?{" "}
        <Link href="/orders">Track it with its reference and email</Link>.
      </p>
    </AccountShell>
  );
}
