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
}

/**
 * One headline figure: a label, a value and one line of context. The value is
 * mono, as every figure in the system is; the label says what was counted and
 * the detail says over what.
 */
export function KpiCard({ label, value, detail, icon, href, signal }: KpiCardProps) {
  const body = (
    <>
      <span className={styles.top}>
        <span className={styles.label}>{label}</span>
        {icon && <Icon name={icon} size={16} />}
      </span>
      <span className={styles.value}>{value}</span>
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
