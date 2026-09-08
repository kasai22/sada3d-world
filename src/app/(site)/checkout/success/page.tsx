import type { Metadata } from "next";
import { cookies } from "next/headers";

import { OrderConfirmation } from "@/components/checkout";
import { Button, Icon } from "@/components/core";
import { findOrder } from "@/lib/checkout/service";
import { ORDER_COOKIE } from "@/lib/checkout/cookies";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Order received",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Order confirmation.
 *
 * The reference arrives in an HttpOnly cookie rather than the URL: an order
 * reference in a shareable link is an order reference in a referrer header, a
 * browser history and a bookmark.
 */
export default async function CheckoutSuccessPage() {
  const store = await cookies();
  const reference = store.get(ORDER_COOKIE)?.value;
  const order = reference ? await findOrder(reference) : undefined;

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        {order ? (
          <OrderConfirmation order={order} />
        ) : (
          <div className={styles.missing}>
            <span className={styles.glyph} aria-hidden="true">
              <Icon name="info" size={28} />
            </span>
            <h1 className={styles.title}>No recent order</h1>
            <p className={styles.body}>
              There is no order to show here. If you have just placed one, the
              confirmation was sent to your email address.
            </p>
            <Button href="/shop" size="lg">
              Continue browsing
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
