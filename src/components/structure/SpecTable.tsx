import type { ReactNode } from "react";
import clsx from "clsx";

import styles from "./SpecTable.module.css";

export interface SpecRow {
  label: string;
  value: ReactNode;
}

export interface SpecTableProps {
  rows: readonly SpecRow[];
  dense?: boolean;
  /** Row labels whose value is rendered in Titanium Orange. Ration these. */
  highlight?: readonly string[];
  /** Accessible name for the table, e.g. "Technical specifications". */
  caption?: string;
  className?: string;
}

/** Technical specifications table — label left, mono value right, hairline rows. */
export function SpecTable({
  rows,
  dense = false,
  highlight = [],
  caption,
  className,
}: SpecTableProps) {
  return (
    <table className={clsx(styles.table, dense && styles.dense, className)}>
      {caption && <caption className="u-visually-hidden">{caption}</caption>}
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={styles.row}>
            <th scope="row" className={styles.key}>
              {row.label}
            </th>
            <td
              className={clsx(
                styles.value,
                highlight.includes(row.label) && styles.highlight,
              )}
            >
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
