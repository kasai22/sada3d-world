import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";

import styles from "./SectionHeading.module.css";

export interface SectionHeadingProps {
  children: ReactNode;
  /** Zero-padded step or section index, e.g. "01". */
  index?: string;
  /** Right-hand technical note, e.g. "12 MACHINES ONLINE". */
  meta?: string;
  /** Width of the orange rule in px. Ignored when `full` is set. */
  width?: number;
  /** Full-bleed rule, used across page sections rather than inside panels. */
  full?: boolean;
  align?: "left" | "center";
  size?: "sm" | "md" | "lg";
  /**
   * Heading level. Defaults to h2 — pass the level that fits the document
   * outline rather than choosing by visual size.
   */
  as?: "h1" | "h2" | "h3" | "h4";
  className?: string;
}

/**
 * The Titanium Orange Line — the SADA 3D signature. An uppercase label above a
 * 2px orange rule. Opens every section, panel and technical block.
 */
export function SectionHeading({
  children,
  index,
  meta,
  width = 48,
  full = false,
  align = "left",
  size = "md",
  as: Tag = "h2",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={clsx(styles.heading, align === "center" && styles.center, className)}
      style={
        { "--rule-width": full ? "100%" : `${width}px` } as CSSProperties
      }
    >
      <div className={styles.top}>
        <span className={styles.title}>
          {index && (
            <span className={styles.index} aria-hidden="true">
              {index}
            </span>
          )}
          <Tag className={clsx(styles.text, styles[size])}>{children}</Tag>
        </span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
      <span className={styles.rule} aria-hidden="true" />
    </div>
  );
}
