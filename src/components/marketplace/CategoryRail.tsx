import Link from "next/link";
import clsx from "clsx";

import { categoryLabel } from "@/lib/catalog/taxonomy";
import { categoryHref } from "@/lib/routes";
import type { FacetCounts } from "@/lib/catalog/types";
import styles from "./CategoryRail.module.css";

export interface CategoryRailProps {
  /** Category currently being browsed, when on a category route. */
  active?: string;
  /** Browse categories of the served catalog, from getBrowseCategories(). */
  categories: readonly string[];
  /** Counts for the unfiltered catalog, so the rail reads the same everywhere. */
  counts: FacetCounts;
}

/**
 * Category navigation.
 *
 * A horizontal rail of real links to /shop/[category], not a grid of tiles —
 * it stays a navigation aid rather than competing with the results below it.
 */
export function CategoryRail({ active, categories, counts }: CategoryRailProps) {
  return (
    <nav aria-label="Product categories">
      <ul className={styles.rail}>
        {categories.map((value, index) => {
          const isActive = value === active;
          const count = counts[value] ?? 0;

          return (
            <li
              key={value}
              className={clsx(styles.item, isActive && styles.active)}
            >
              <Link
                href={categoryHref(value)}
                className={clsx("u-plain", styles.link)}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={styles.index} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.name}>{categoryLabel(value)}</span>
                <span className={styles.count}>
                  {count} {count === 1 ? "part" : "parts"}
                </span>
                <span className={styles.rule} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
