"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import { Icon } from "@/components/core";
import { ACCOUNT_SECTIONS, isSectionActive } from "@/lib/account/navigation";
import styles from "./AccountNav.module.css";

export interface AccountNavProps {
  className?: string;
}

/**
 * Account navigation.
 *
 * One component, two layouts. A sidebar from 1024px and a horizontal rail
 * below it — the same list, the same markup, the same accessible name, laid out
 * differently by CSS.
 *
 * Not a select-and-navigate control on mobile: a `<select>` that moves the page
 * needs JavaScript to do anything, hides five of the six destinations behind an
 * interaction, and cannot be reached by a keyboard without committing to a
 * choice. Six links that scroll are discoverable, tabbable and work before
 * hydration.
 *
 * Client-only for one reason — the active section depends on the pathname,
 * which a Server Component cannot read. Everything else about the account
 * portal renders on the server.
 */
export function AccountNav({ className }: AccountNavProps) {
  const pathname = usePathname();

  return (
    <nav className={clsx(styles.nav, className)} aria-label="Account">
      <ul className={styles.list}>
        {ACCOUNT_SECTIONS.map((section) => {
          const active = isSectionActive(pathname, section);

          return (
            <li key={section.href} className={styles.item}>
              <Link
                href={section.href}
                className={clsx("u-plain", styles.link, active && styles.active)}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.glyph} aria-hidden="true">
                  <Icon name={section.icon} size={16} />
                </span>
                <span className={styles.label}>{section.label}</span>
                {/* Marks position; never decoration. */}
                <span className={styles.rule} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
