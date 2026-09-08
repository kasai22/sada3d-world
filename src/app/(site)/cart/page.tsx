import type { Metadata } from "next";

import { CartView } from "@/components/cart";
import { Breadcrumbs } from "@/components/structure";
import { readCart } from "@/lib/cart/service";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review the parts you intend to order.",
  alternates: { canonical: "/cart" },
  // A cart is personal to one browser. Nothing here belongs in an index.
  robots: { index: false, follow: false },
};

/**
 * The cart.
 *
 * Dynamic by necessity: it reads the cart cookie, prices every line against the
 * catalog and re-runs the quote engine for custom parts. None of that can be
 * prerendered, and none of it should be.
 */
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await readCart();

  return (
    <div className={`bg-engineering ${styles.page}`}>
      <div className="u-container">
        <div className={styles.intro}>
          <Breadcrumbs className={styles.crumbs} items={[{ label: "Cart" }]} />
          <h1 className={styles.title}>Cart</h1>
          <p className={styles.description}>
            Review your items before checkout. Prices are confirmed against the
            catalog each time this page loads.
          </p>
        </div>

        <CartView cart={cart} />
      </div>
    </div>
  );
}
