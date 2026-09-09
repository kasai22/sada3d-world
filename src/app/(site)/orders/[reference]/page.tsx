import type { Metadata } from "next";
import Link from "next/link";

import { Button, Icon } from "@/components/core";
import { Breadcrumbs } from "@/components/structure";
import { OrderTrackingView } from "@/components/tracking";
import { seedTrackingFixtures } from "@/lib/orders/fixtures";
import { hasGrant } from "@/lib/orders/grants";
import { getOrderTracking } from "@/lib/orders/service";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Order tracking",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Order tracking.
 *
 * Authorization happens here, before anything is read: the browser must hold a
 * server-issued grant for this reference — the receipt from placing the order,
 * or a lookup that proved the reference and the email together.
 *
 * Without one the page says the same thing whether the order exists or not.
 * Distinguishing "not yours" from "no such order" would turn the URL into a way
 * of discovering which references are real.
 */
export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  await seedTrackingFixtures();

  const { reference: raw } = await params;
  const reference = decodeURIComponent(raw).trim().toUpperCase();

  const granted = await hasGrant(reference);
  const tracking = granted ? await getOrderTracking(reference) : undefined;

  if (!tracking) {
    return (
      <div className={`bg-engineering ${styles.page}`}>
        <div className="u-container">
          <div className={styles.denied}>
            <span className={styles.glyph} aria-hidden="true">
              <Icon name="info" size={28} />
            </span>
            <h1 className={styles.deniedTitle}>Order not available</h1>
            <p className={styles.deniedBody}>
              This order cannot be shown here. Look it up with its reference and
              the email it was placed with.
            </p>
            <Button href="/orders" size="lg">
              Track an order
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <Breadcrumbs
          className={styles.crumbs}
          items={[
            { label: "Orders", href: "/orders" },
            { label: tracking.order.reference },
          ]}
        />

        <OrderTrackingView order={tracking.order} jobs={tracking.jobs} />

        <p className={styles.help}>
          Looking for a different order?{" "}
          <Link href="/orders">Track another order</Link>.
        </p>
      </div>
    </div>
  );
}
