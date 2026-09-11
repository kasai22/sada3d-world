import Link from "next/link";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { developmentIdentityEnabled } from "@/lib/account/development";

import { AccountLink } from "./AccountLink";
import { CartLink } from "./CartLink";
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
  className?: string;
}

/**
 * Sticky platform header. Wordmark left, five links centre, utilities right.
 *
 * A Server Component — only the active-link marker and the mobile drawer need
 * the client, and each is isolated in its own small component.
 */
export function Header({ items = PRIMARY_NAV, className }: HeaderProps) {
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

        {/* A client island like the cart: it reads a non-secret hint, so the
            header can say "Sign in" or "Account" without any page becoming
            dynamic. Reading the environment here is build-safe; no cookie is. */}
        <AccountLink development={developmentIdentityEnabled()} />

        {/* The only client island in the header: it reads the count the cart
            service wrote, so no page has to become dynamic to show it. */}
        <CartLink />

        <MobileNav items={items} className={styles.menuButton} />
      </div>
    </header>
  );
}
