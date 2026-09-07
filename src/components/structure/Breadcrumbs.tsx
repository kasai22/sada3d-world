import Link from "next/link";
import clsx from "clsx";

import styles from "./Breadcrumbs.module.css";

export interface Crumb {
  label: string;
  /** Omit on the final crumb — the current page is not a link. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: readonly Crumb[];
  className?: string;
}

/**
 * Technical breadcrumb trail — mono, uppercase, slash separators.
 *
 * Rendered as an ordered list so screen readers announce position and length.
 * Pair with BreadcrumbList structured data on indexable pages.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={clsx(styles.nav, className)}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const last = index === items.length - 1;

          return (
            <li key={item.label} className={styles.crumb}>
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined} className={styles.current}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className={styles.link}>
                  {item.label}
                </Link>
              )}
              {!last && (
                <span aria-hidden="true" className={styles.separator}>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
