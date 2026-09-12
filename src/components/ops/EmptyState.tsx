import type { ReactNode } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "@/components/core/Icon";

import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  /** `problem` for a failure; it is announced. */
  tone?: "neutral" | "problem";
  compact?: boolean;
}

/**
 * What a region shows when it has nothing — or could not load.
 *
 * Says why, and what to do next, in one or two sentences. No hooks and no
 * server imports, so both a page and a client error boundary can render it.
 */
export function EmptyState({
  title,
  children,
  icon = "inbox",
  action,
  tone = "neutral",
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(styles.state, tone === "problem" && styles.problem, compact && styles.compact)}
      role={tone === "problem" ? "alert" : undefined}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <p className={styles.title}>{title}</p>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
