import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./command.module.css";

export interface BarListRow {
  id: string;
  label: ReactNode;
  /** Secondary text under the label. */
  note?: ReactNode;
  value: number;
  /** The value as read, e.g. "₹1,200". */
  display: string;
  href?: string;
}

/**
 * A ranked list with a single-hue bar per row: magnitude only, one series, so
 * no legend and no categorical colour. Bars are scaled to the largest value
 * shown and the number is always printed beside them.
 */
export function BarList({ rows, label }: { rows: readonly BarListRow[]; label: string }) {
  const max = Math.max(0, ...rows.map((row) => row.value));

  return (
    <ol className={styles.barList} aria-label={label}>
      {rows.map((row) => {
        const width = max > 0 ? Math.max((row.value / max) * 100, row.value > 0 ? 1.5 : 0) : 0;
        const name = row.href ? (
          <Link href={row.href} className={styles.barName}>
            {row.label}
          </Link>
        ) : (
          <span className={styles.barName}>{row.label}</span>
        );
        return (
          <li key={row.id} className={styles.barRow}>
            <span className={styles.barText}>
              {name}
              {row.note && <span className={styles.barNote}>{row.note}</span>}
            </span>
            <span className={styles.barValue}>{row.display}</span>
            <span className={styles.barTrack} aria-hidden="true">
              <span className={styles.barFill} style={{ width: `${width}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
