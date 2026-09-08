import Link from "next/link";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { MobileNav, type NavItem } from "./MobileNav";
import { NavLink } from "./NavLink";
import styles from "./Header.module.css";

/** Apple-like simplicity: five destinations, nothing more. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/shop", label: "Shop" },
  { href: "/custom-print", label: "Custom Print" },
  { href: "/materials", label: "Materials" },
  { href: "/solutions", label: "Solutions" },
  { href: "/how-it-works", label: "How It Works" },
];

export interface HeaderProps {
  items?: readonly NavItem[];
  /** Rendered as a badge on the cart control. Omit or 0 hides it. */
  cartCount?: number;
  className?: string;
}

/**
 * Sticky platform header. Wordmark left, five links centre, utilities right.
 *
 * A Server Component — only the active-link marker and the mobile drawer need
 * the client, and each is isolated in its own small component.
 */
export function Header({
  items = PRIMARY_NAV,
  cartCount = 0,
  className,
}: HeaderProps) {
  return (
    <header className={clsx(styles.header, className)}>
      <Link href="/" className={styles.wordmark} aria-label="SADA 3D — home">
        <span className={styles.wordmarkSada}>SADA</span>
        <span className={styles.wordmarkAccent}>3D</span>
      </Link>

      <nav className={styles.nav} aria-label="Main">
        {items.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>

      <div className={styles.utilities}>
        {/* Search lives in the catalog toolbar, so this is a link to it rather
            than a control that opens an overlay. */}
        <Link
          href="/shop"
          className={clsx("u-plain", styles.utilityLink)}
          aria-label="Search parts"
          title="Search parts"
        >
          <span className={styles.utility}>
            <Icon name="search" size={17} />
          </span>
        </Link>

        <Link
          href="/account"
          className={clsx("u-plain", styles.utilityLink)}
          aria-label="Account"
          title="Account"
        >
          <span className={styles.utility}>
            <Icon name="user" size={17} />
          </span>
        </Link>

        <Link
          href="/cart"
          className={clsx("u-plain", styles.utilityLink, styles.cart)}
          aria-label={
            cartCount > 0 ? `Cart, ${cartCount} items` : "Cart, empty"
          }
          title="Cart"
        >
          <span className={styles.utility}>
            <Icon name="shopping-cart" size={17} />
          </span>
          {cartCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </Link>

        <MobileNav items={items} className={styles.menuButton} />
      </div>
    </header>
  );
}
