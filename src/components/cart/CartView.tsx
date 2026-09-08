import { Button, Icon } from "@/components/core";
import type { PricedCart } from "@/lib/cart/types";

import { CartLineRow } from "./CartLineRow";
import { CartSummary } from "./CartSummary";
import styles from "./CartView.module.css";

export interface CartViewProps {
  cart: PricedCart;
}

/**
 * The cart.
 *
 * A Server Component. The cart is read, priced and validated on the server, and
 * only the per-line controls are interactive — so the page ships the cart's
 * interactions and not the cart's arithmetic.
 */
export function CartView({ cart }: CartViewProps) {
  if (cart.lines.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyGlyph} aria-hidden="true">
          <Icon name="shopping-cart" size={28} />
        </span>
        <h2 className={styles.emptyTitle}>Your cart is empty.</h2>
        <p className={styles.emptyBody}>
          Explore products or start a custom print.
        </p>
        <div className={styles.emptyActions}>
          <Button href="/shop" size="lg">
            Explore products
          </Button>
          <Button href="/custom-print" variant="secondary" size="lg">
            Start a custom print
          </Button>
        </div>
      </div>
    );
  }

  const blocking = cart.issues.filter((issue) => issue.severity === "blocking");

  return (
    <div className={styles.layout}>
      <section className={styles.items} aria-labelledby="cart-items-title">
        <div className={styles.itemsHead}>
          <h2 className={styles.itemsTitle} id="cart-items-title">
            Your items
          </h2>
          <span className={styles.count}>
            {cart.totals.unitCount} {cart.totals.unitCount === 1 ? "unit" : "units"}
          </span>
        </div>

        <ul className={styles.lines}>
          {cart.lines.map((priced) => (
            <CartLineRow key={priced.line.id} priced={priced} />
          ))}
        </ul>
      </section>

      <CartSummary
        totals={cart.totals}
        className={styles.summary}
        blockedReason={
          blocking.length > 0
            ? blocking.length === 1
              ? "One item needs attention before checkout."
              : `${blocking.length} items need attention before checkout.`
            : undefined
        }
      />
    </div>
  );
}
