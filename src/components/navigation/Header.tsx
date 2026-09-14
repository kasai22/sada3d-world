import Link from "next/link";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { developmentIdentityEnabled } from "@/lib/account/development";
import { PRIMARY_NAV, type NavItem } from "@/lib/navigation";
import { ROUTES } from "@/lib/routes";

import { AccountLink } from "./AccountLink";
import { CartLink } from "./CartLink";
import { MobileNav } from "./MobileNav";
import { NavLink } from "./NavLink";
import styles from "./Header.module.css";

/*
 * The five destinations now live in lib/navigation so a test can enumerate
 * them. Re-exported because components already import PRIMARY_NAV from here.
 */
export { PRIMARY_NAV };

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
      <Link href={ROUTES.home} className={styles.wordmark} aria-label="Reality 3D — home">
        <span className={styles.wordmarkName}>Reality</span>
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
          href={ROUTES.shop}
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
