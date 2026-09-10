import type { ReactNode } from "react";
import clsx from "clsx";

import { Icon, type IconName } from "@/components/core";
import styles from "./AccountState.module.css";

export interface AccountStateProps {
  /**
   * What kind of nothing this is.
   *
   * `empty`        the collection is readable and holds nothing
   * `unavailable`  the collection cannot be read yet, and the copy says why
   * `problem`      something failed; the copy says what to do about it
   */
  tone?: "empty" | "unavailable" | "problem";
  icon?: IconName;
  /** Short technical marker above the title, e.g. "NO ORDERS". */
  code?: string;
  title: string;
  /**
   * Heading level for the title.
   *
   * Defaults to h2, which is right inside a section of a page that already has
   * its own h1. A page whose *whole* content is one of these states — sign-in
   * required, an error boundary — passes h1, because a page with no h1 has no
   * name.
   */
  titleAs?: "h1" | "h2" | "h3";
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * The account's empty, unavailable and error states.
 *
 * One component for all three, because they differ in copy and tone rather
 * than in structure, and three near-identical components would drift apart.
 *
 * `empty` and `unavailable` are kept distinct deliberately. "You have no saved
 * designs" and "designs cannot be stored yet" are different statements, and
 * showing the first when the second is true would tell the customer they have
 * lost something they never had.
 *
 * `problem` announces itself: the surrounding page marks it `role="alert"`
 * where the failure happened after the page was already on screen.
 */
export function AccountState({
  tone = "empty",
  icon,
  code,
  title,
  titleAs: Title = "h2",
  children,
  actions,
  className,
}: AccountStateProps) {
  return (
    <div className={clsx(styles.state, styles[tone], className)}>
      {icon && (
        <span className={styles.glyph} aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
      )}

      {code && <p className={styles.code}>{code}</p>}

      <Title className={styles.title}>{title}</Title>

      <div className={styles.body}>{children}</div>

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
