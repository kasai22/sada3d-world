import type { Metadata } from "next";

import {
  AccountShell,
  AccountSignInRequired,
  AccountState,
} from "@/components/account";
import { Button, Tag, type TagTone } from "@/components/core";
import { LocalTime, OrderTrackingView } from "@/components/tracking";
import { requireCustomerContext } from "@/lib/account/identity";
import { getCustomerOrder } from "@/lib/account/orders";
import { seedTrackingFixtures } from "@/lib/orders/fixtures";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<OrderStatus, TagTone> = {
  pending: "neutral",
  awaiting_payment: "warning",
  confirmed: "accent",
  fulfillment_in_progress: "accent",
  partially_fulfilled: "accent",
  fulfilled: "success",
  cancelled: "neutral",
  failed: "danger",
};

/**
 * One order, in the account.
 *
 * Authorization is ownership and nothing else: `getCustomerOrder` matches the
 * order's `customerId` against the signed-in identity before it reads anything.
 * It deliberately does **not** fall back to the Phase 12 guest grant — an
 * account page that accepted a receipt cookie would be an account page that
 * shows orders the account does not own.
 *
 * The Phase 12 guest route is untouched and still works: `/orders/[reference]`
 * runs on the receipt or the reference-plus-email lookup, exactly as before.
 *
 * An order belonging to someone else and an order that does not exist give the
 * identical answer. Distinguishing them would turn this URL into a way of
 * discovering which references are real.
 *
 * The tracking itself is Phase 12's `OrderTrackingView`, reused whole. It
 * already renders the four state machines as four separate facts and already
 * shows only the customer-safe manufacturing projection. A second order view
 * would be a second chance to leak something.
 */
export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const gate = await requireCustomerContext();
  const { ref } = await params;
  const reference = decodeURIComponent(ref).trim().toUpperCase();

  if (!gate.authenticated) {
    return <AccountSignInRequired returnTo="/account/orders" />;
  }

  await seedTrackingFixtures();

  const tracking = await getCustomerOrder(gate.context.identity, reference);

  if (!tracking) {
    return (
      <AccountShell
        title="Order not available"
        crumbs={[{ label: "Orders", href: "/account/orders" }, { label: "Not found" }]}
      >
        <AccountState
          icon="info"
          code="Not available"
          title="This order is not on your account"
          actions={
            <>
              <Button href="/account/orders" size="lg">
                Your orders
              </Button>
              <Button href="/orders" variant="secondary" size="lg">
                Track an order
              </Button>
            </>
          }
        >
          <p>
            No order on this account matches that reference. If it was placed
            without an account, follow it with its reference and the email it
            was placed with.
          </p>
        </AccountState>
      </AccountShell>
    );
  }

  const { order } = tracking;

  return (
    <AccountShell
      title={order.reference}
      crumbs={[
        { label: "Orders", href: "/account/orders" },
        { label: order.reference },
      ]}
      meta={
        <>
          <Tag tone={STATUS_TONE[order.status]}>
            {ORDER_STATUS_LABEL[order.status]}
          </Tag>
          <span className={styles.placed}>
            Placed <LocalTime value={order.placedAt} dateOnly />
          </span>
        </>
      }
    >
      <OrderTrackingView
        order={order}
        jobs={tracking.jobs}
        // The page heads itself with the reference; a second h1 inside would
        // give the document two.
        heading={false}
        action={
          <Button href="/account/orders" variant="secondary" size="lg">
            Back to orders
          </Button>
        }
      />
    </AccountShell>
  );
}
