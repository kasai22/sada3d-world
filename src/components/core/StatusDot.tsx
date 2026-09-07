import clsx from "clsx";

import styles from "./StatusDot.module.css";

export type ManufacturingStatus =
  | "idle"
  | "queued"
  | "processing"
  | "printing"
  | "quality"
  | "packaging"
  | "shipped"
  | "delivered"
  | "paused"
  | "failed"
  | "complete";

const COLOR: Record<ManufacturingStatus, string> = {
  idle: "var(--status-idle)",
  queued: "var(--status-idle)",
  processing: "var(--status-info)",
  printing: "var(--status-active)",
  quality: "var(--status-info)",
  packaging: "var(--status-info)",
  shipped: "var(--status-success)",
  delivered: "var(--status-success)",
  paused: "var(--status-warning)",
  failed: "var(--status-danger)",
  complete: "var(--status-success)",
};

export interface StatusDotProps {
  status?: ManufacturingStatus;
  pulse?: boolean;
  size?: number;
  /**
   * Text label. The design system requires status to never depend on colour
   * alone, so omit this only where adjacent text already names the state.
   */
  label?: string;
  className?: string;
}

/** Manufacturing status indicator. Colour is never the only carrier of meaning. */
export function StatusDot({
  status = "idle",
  pulse = false,
  size = 8,
  label,
  className,
}: StatusDotProps) {
  return (
    <span
      className={clsx(styles.wrap, className)}
      style={
        {
          "--dot-color": COLOR[status],
          "--dot-size": `${size}px`,
        } as React.CSSProperties
      }
    >
      <span className={clsx(styles.dot, pulse && styles.pulse)} aria-hidden="true" />
      {label && <span className={styles.label}>{label}</span>}
    </span>
  );
}
