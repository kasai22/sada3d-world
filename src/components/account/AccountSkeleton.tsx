import clsx from "clsx";

import styles from "./AccountSkeleton.module.css";

export interface SkeletonPanelProps {
  /** How many rows the real content will have. Match it, do not guess high. */
  rows?: number;
  className?: string;
}

/**
 * Placeholders shaped like the content that replaces them.
 *
 * Two rules keep these honest:
 *
 *   · they carry no numbers, no references and no labels. A skeleton showing
 *     "3 orders" would be inventing a count, and a customer who then saw none
 *     would have been told something false while the page loaded.
 *
 *   · they match the real shape closely enough that nothing jumps. A block the
 *     wrong height is a layout shift dressed up as a loading state.
 *
 * Hidden from assistive technology. The route's own loading boundary is what
 * announces that something is coming; a screen reader does not need six empty
 * grey rectangles read to it.
 */
export function SkeletonCards({ rows = 3, className }: SkeletonPanelProps) {
  return (
    <div className={clsx(styles.stack, className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.card}>
          <div className={styles.head}>
            <div className={styles.column}>
              <span className={clsx(styles.bar, styles.eyebrow)} />
              <span className={clsx(styles.bar, styles.title)} />
              <span className={clsx(styles.bar, styles.meta)} />
            </div>
            <span className={clsx(styles.bar, styles.figure)} />
          </div>
          <div className={styles.rows}>
            <span className={clsx(styles.bar, styles.row)} />
            <span className={clsx(styles.bar, styles.row)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Section spacing between placeholder blocks, matching the real page. */
export function SkeletonGroup({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={styles.group}>{children}</div>;
}

/** A panel of stacked lines, for the overview's side sections. */
export function SkeletonLines({ rows = 4, className }: SkeletonPanelProps) {
  return (
    <div className={clsx(styles.panel, className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className={clsx(styles.bar, styles.row)} />
      ))}
    </div>
  );
}
