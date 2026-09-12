import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

import styles from "./Panel.module.css";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  title?: string;
  /** Right-hand technical note in the header, e.g. "PART_00492". */
  meta?: string;
  /** Header controls beside the meta, e.g. a "View all" link. */
  actions?: ReactNode;
  /** Heading level for the title. Defaults to h3; pass what fits the outline. */
  titleAs?: "h2" | "h3" | "h4";
  /** Square corners plus machined corner ticks. */
  technical?: boolean;
  /** Set false when the panel holds a table or list that supplies its own insets. */
  padded?: boolean;
  elevated?: boolean;
}

/**
 * Carbon surface container.
 *
 * Structure comes from hairlines and surface-value steps, so the panel carries
 * no shadow at rest; `elevated` is for overlays and floating summaries only.
 */
export function Panel({
  children,
  title,
  meta,
  actions,
  titleAs: Title = "h3",
  technical = false,
  padded = true,
  elevated = false,
  className,
  ...rest
}: PanelProps) {
  return (
    <section
      className={clsx(
        styles.panel,
        technical && styles.technical,
        elevated && styles.elevated,
        className,
      )}
      {...rest}
    >
      {title && (
        <header className={styles.header}>
          <Title className={styles.title}>{title}</Title>
          {(meta || actions) && (
            <span className={styles.aside}>
              {meta && <span className={styles.meta}>{meta}</span>}
              {actions}
            </span>
          )}
        </header>
      )}

      <div className={clsx(styles.body, !padded && styles.flush)}>{children}</div>

      {technical && (
        <>
          <span className={clsx(styles.tick, styles.tickTL)} aria-hidden="true" />
          <span className={clsx(styles.tick, styles.tickTR)} aria-hidden="true" />
          <span className={clsx(styles.tick, styles.tickBR)} aria-hidden="true" />
          <span className={clsx(styles.tick, styles.tickBL)} aria-hidden="true" />
        </>
      )}
    </section>
  );
}
