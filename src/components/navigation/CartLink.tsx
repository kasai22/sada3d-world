"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { CART_CHANGED_EVENT } from "@/lib/cart/intent";
import styles from "./Header.module.css";

const COUNT_COOKIE = "sada3d_cart_count";

/**
 * Reads the count the server last wrote.
 *
 * Not a second source of truth: the cart service writes this value in the same
 * operation that writes the cart, so the badge cannot show a number the cart
 * does not hold. It is a display copy, deliberately readable by the browser,
 * while the cart itself stays in an HttpOnly cookie the page cannot touch.
 */
function readCount(): number {
  if (typeof document === "undefined") return 0;

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COUNT_COOKIE}=([^;]*)`),
  );
  const value = Number(match?.[1]);

  return Number.isInteger(value) && value > 0 ? value : 0;
}

export interface CartLinkProps {
  className?: string;
}

/**
 * Header cart control.
 *
 * A client island so the count can be shown without making every page in the
 * site dynamic. Reading the cart on the server in the layout would opt the
 * homepage, the product pages and the marketplace out of static rendering to
 * display one number, which is a poor trade.
 *
 * The count is total units, matching the totals layer: two products plus three
 * custom units reads as five.
 */
export function CartLink({ className }: CartLinkProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(readCount());
    sync();

    // After a mutation, and when the tab is returned to — another tab may have
    // changed the same cart.
    window.addEventListener(CART_CHANGED_EVENT, sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <Link
      href="/cart"
      className={clsx("u-plain", styles.utilityLink, styles.cart, className)}
      aria-label={
        count > 0
          ? `Cart, ${count} ${count === 1 ? "unit" : "units"}`
          : "Cart, empty"
      }
      title="Cart"
    >
      <span className={styles.utility}>
        <Icon name="shopping-cart" size={17} />
      </span>
      {count > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
