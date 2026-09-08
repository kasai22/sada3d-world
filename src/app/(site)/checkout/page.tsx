import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout";
import { Button, Icon } from "@/components/core";
import { Breadcrumbs } from "@/components/structure";
import { reviewCheckout } from "@/lib/checkout/service";
import { resolvePaymentAdapter } from "@/lib/payment/service";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Review your order before payment.",
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Checkout.
 *
 * The cart is revalidated here before the form is shown, so a problem is
 * surfaced while it can still be fixed rather than at the moment of payment.
 * It is revalidated again server-side when the order is placed — this pass is
 * for the customer's benefit, not the system's trust.
 */
export default async function CheckoutPage() {
  const cart = await reviewCheckout();

  if (cart.lines.length === 0) redirect("/cart");

  const blocking = cart.issues.filter((issue) => issue.severity === "blocking");

  let developmentPayment = true;
  try {
    developmentPayment = resolvePaymentAdapter().mode !== "live";
  } catch {
    // A misconfigured provider is reported when the order is placed, in the
    // one place that can do anything about it.
  }

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <div className={styles.intro}>
          <Breadcrumbs
            className={styles.crumbs}
            items={[{ label: "Cart", href: "/cart" }, { label: "Checkout" }]}
          />
          <h1 className={styles.title}>Checkout</h1>
          <p className={styles.description}>
            Review your order before payment.
          </p>
        </div>

        {blocking.length > 0 ? (
          <div className={styles.blocked} role="alert">
            <h2 className={styles.blockedTitle}>
              <Icon name="alert" size={18} />
              Your cart changed. Review the items before continuing.
            </h2>
            <ul className={styles.blockedList}>
              {blocking.map((issue) => (
                <li key={`${issue.lineId}-${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
            <Button href="/cart" variant="secondary" size="lg">
              Review cart
            </Button>
          </div>
        ) : (
          <CheckoutForm cart={cart} developmentPayment={developmentPayment} />
        )}
      </div>
    </div>
  );
}
