import type { CSSProperties } from "react";
import clsx from "clsx";

import styles from "./ProgressBar.module.css";

export type ProgressTone = "active" | "paused" | "failed" | "complete";

export interface ProgressBarProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  label?: string;
  showValue?: boolean;
  /** Number of segments in the track. */
  segments?: number;
  tone?: ProgressTone;
  className?: string;
}

const TONE_COLOR: Record<ProgressTone, string> = {
  active: "var(--orange-500)",
  paused: "var(--status-warning)",
  failed: "var(--status-danger)",
  complete: "var(--status-success)",
};

/** Manufacturing progress. Segmented orange fill against a titanium track. */
export function ProgressBar({
  value,
  label,
  showValue = true,
  segments = 20,
  tone = "active",
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const filled = Math.round((clamped / 100) * segments);

  return (
    <div
      className={clsx(styles.wrap, className)}
      style={{ "--tone-color": TONE_COLOR[tone] } as CSSProperties}
    >
      {(label || showValue) && (
        <div className={styles.head}>
          {label && <span className={styles.label}>{label}</span>}
          {showValue && <span className={styles.value}>{clamped}%</span>}
        </div>
      )}

      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${clamped}%`}
        aria-label={label}
      >
        {Array.from({ length: segments }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={clsx(
              styles.segment,
              index < filled && styles.filled,
              index === filled - 1 && styles.head_segment,
            )}
          />
        ))}
      </div>
    </div>
  );
}
