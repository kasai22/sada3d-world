import Link from "next/link";
import type { ReactNode } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "@/components/core/Icon";

import styles from "./KpiCard.module.css";

export interface KpiCardProps {
  label: string;
  value: string;
  detail?: ReactNode;
  icon?: IconName;
  /** The whole card opens the list behind the number. */
  href?: string;
  /** A left rule for a figure that needs attention. Always paired with `detail` text. */
  signal?: "warning" | "danger";
  /** What the figure covers — a date range, "Now" — in technical type under the label. */
  meta?: string;
  /** The figure is not available (e.g. not tracked); the value reads as a statement, not a number. */
  muted?: boolean;
}

/**
 * One headline figure: a label, a value and one line of context. The value is
 * mono, as every figure in the system is; the label says what was counted and
 * the detail says over what.
 */
export function KpiCard({ label, value, detail, icon, href, signal, meta, muted = false }: KpiCardProps) {
  const body = (
    <>
      <span className={styles.top}>
        <span className={styles.label}>{label}</span>
        {icon && <Icon name={icon} size={16} />}
      </span>
      {meta && <span className={styles.meta}>{meta}</span>}
      <span className={clsx(styles.value, muted && styles.mutedValue)}>{value}</span>
      {detail && <span className={styles.detail}>{detail}</span>}
    </>
  );

  const className = clsx(styles.card, signal && styles[signal], href && styles.linked);

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
