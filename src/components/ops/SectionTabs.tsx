import Link from "next/link";
import clsx from "clsx";

import styles from "./SectionTabs.module.css";

export interface SectionTab {
  label: string;
  href: string;
  /** Marks this tab as the current page. */
  current: boolean;
  /** An optional count shown after the label. */
  count?: string;
}

/**
 * Sibling pages of one admin area (Analytics, Catalog, a product workspace),
 * as links. Each tab is its own URL, so a view can be bookmarked and shared.
 */
export function SectionTabs({ label, tabs }: { label: string; tabs: readonly SectionTab[] }) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      <ul className={styles.list}>
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              className={clsx(styles.tab, tab.current && styles.current)}
              aria-current={tab.current ? "page" : undefined}
              scroll={false}
            >
              {tab.label}
              {tab.count !== undefined && <span className={styles.count}>{tab.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
