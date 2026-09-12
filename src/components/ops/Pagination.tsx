import Link from "next/link";

import { Icon } from "@/components/core/Icon";
import { formatCount } from "@/lib/ops/format";

import styles from "./Pagination.module.css";

export interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  /** What is being paged, for the landmark name, e.g. "Orders". */
  label: string;
}

/** Previous and next, with the range shown. Links, so every page is addressable. */
export function Pagination({ page, pageCount, total, pageSize, hrefFor, label }: PaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const beyond = start > total;

  return (
    <nav className={styles.pagination} aria-label={`${label} pages`}>
      <p className={styles.range}>
        {beyond ? (
          <>No results on page {page}.</>
        ) : (
          <>
            <span className={styles.number}>
              {formatCount(start)}–{formatCount(end)}
            </span>{" "}
            of <span className={styles.number}>{formatCount(total)}</span>
          </>
        )}
      </p>

      <div className={styles.controls}>
        {page > 1 ? (
          <Link href={hrefFor(Math.min(page - 1, pageCount))} className={styles.control} rel="prev">
            <Icon name="chevron-left" size={14} />
            Previous
          </Link>
        ) : (
          <span className={styles.control} aria-disabled="true">
            <Icon name="chevron-left" size={14} />
            Previous
          </span>
        )}

        <span className={styles.pageOf}>
          Page {Math.min(page, pageCount)} of {pageCount}
        </span>

        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={styles.control} rel="next">
            Next
            <Icon name="chevron-right" size={14} />
          </Link>
        ) : (
          <span className={styles.control} aria-disabled="true">
            Next
            <Icon name="chevron-right" size={14} />
          </span>
        )}
      </div>
    </nav>
  );
}
