import Link from "next/link";
import clsx from "clsx";

import { Button } from "@/components/core";
import { buildHref } from "@/lib/catalog/params";
import type { CatalogQuery } from "@/lib/catalog/types";
import styles from "./MarketplacePagination.module.css";

export interface MarketplacePaginationProps {
  query: CatalogQuery;
  pathname: string;
  page: number;
  pageCount: number;
}

/**
 * Page links, not infinite scroll.
 *
 * Pagination is predictable, shareable, crawlable, and maps directly onto a
 * server-side LIMIT/OFFSET when the catalog moves to Payload. Load-more would
 * force result state back into the client.
 */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const window = new Set<number>([1, pageCount, page]);
  if (page - 1 > 1) window.add(page - 1);
  if (page + 1 < pageCount) window.add(page + 1);

  const pages = [...window].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];

  pages.forEach((value, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && value - previous > 1) out.push("gap");
    out.push(value);
  });

  return out;
}

export function MarketplacePagination({
  query,
  pathname,
  page,
  pageCount,
}: MarketplacePaginationProps) {
  if (pageCount <= 1) return null;

  const items = pageWindow(page, pageCount);

  return (
    <nav className={styles.nav} aria-label="Pagination">
      <p className={styles.status}>
        Page {page} of {pageCount}
      </p>

      <ul className={styles.pages}>
        <li>
          {page > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft="arrow-left"
              href={buildHref(pathname, query, { page: page - 1 })}
            >
              Previous
            </Button>
          ) : (
            <Button variant="ghost" size="sm" iconLeft="arrow-left" disabled>
              Previous
            </Button>
          )}
        </li>

        {items.map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className={styles.ellipsis}>
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  className={clsx(styles.page, styles.current)}
                  aria-current="page"
                >
                  {String(item).padStart(2, "0")}
                </span>
              ) : (
                <Link
                  href={buildHref(pathname, query, { page: item })}
                  className={styles.page}
                  aria-label={`Page ${item}`}
                >
                  {String(item).padStart(2, "0")}
                </Link>
              )}
            </li>
          ),
        )}

        <li>
          {page < pageCount ? (
            <Button
              variant="ghost"
              size="sm"
              iconRight="arrow-right"
              href={buildHref(pathname, query, { page: page + 1 })}
            >
              Next
            </Button>
          ) : (
            <Button variant="ghost" size="sm" iconRight="arrow-right" disabled>
              Next
            </Button>
          )}
        </li>
      </ul>
    </nav>
  );
}
