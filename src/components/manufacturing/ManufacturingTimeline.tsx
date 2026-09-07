import clsx from "clsx";

import { Icon } from "@/components/core";
import { ProgressBar } from "./ProgressBar";
import styles from "./ManufacturingTimeline.module.css";

export type StageState = "pending" | "active" | "complete" | "failed";

export interface ManufacturingStage {
  label: string;
  state: StageState;
  /** Technical note, e.g. a timestamp or machine id. */
  meta?: string;
  /** 0–100. Rendered only on the active stage. */
  progress?: number;
}

export interface ManufacturingTimelineProps {
  stages: readonly ManufacturingStage[];
  /** Accessible name, e.g. "Manufacturing status for order SADA-10428". */
  label?: string;
  className?: string;
}

const STATE_TEXT: Record<StageState, string> = {
  pending: "not started",
  active: "in progress",
  complete: "complete",
  failed: "failed",
};

/**
 * Seven-stage manufacturing tracker. Replaces the generic shipment timeline —
 * the stages describe physical production, not courier handoffs.
 *
 * Stage data is supplied by the caller from backend state; this renders it.
 */
export function ManufacturingTimeline({
  stages,
  label = "Manufacturing status",
  className,
}: ManufacturingTimelineProps) {
  return (
    <ol className={clsx(styles.timeline, className)} aria-label={label}>
      {stages.map((stage, index) => {
        const last = index === stages.length - 1;

        return (
          <li
            key={stage.label}
            className={clsx(styles.stage, styles[stage.state])}
            aria-current={stage.state === "active" ? "step" : undefined}
          >
            <div className={styles.rail}>
              <span className={styles.marker} aria-hidden="true">
                {stage.state === "complete" && <Icon name="check" size={12} />}
                {stage.state === "active" && <span className={styles.pip} />}
                {stage.state === "failed" && <Icon name="x" size={12} />}
              </span>
              {!last && <span className={styles.connector} aria-hidden="true" />}
            </div>

            <div className={styles.body}>
              <div className={styles.top}>
                <span className={styles.name}>
                  <span className={styles.index} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.label}>{stage.label}</span>
                  {/* State never depends on colour or shape alone. */}
                  <span className="u-visually-hidden">
                    {` — ${STATE_TEXT[stage.state]}`}
                  </span>
                </span>
                {stage.meta && <span className={styles.meta}>{stage.meta}</span>}
              </div>

              {stage.state === "active" && stage.progress != null && (
                <ProgressBar
                  value={stage.progress}
                  label={stage.label}
                  className={styles.progress}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
