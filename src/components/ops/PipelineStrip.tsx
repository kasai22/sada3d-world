import Link from "next/link";
import clsx from "clsx";

import styles from "./PipelineStrip.module.css";

export interface PipelineStage {
  id: string;
  label: string;
  count: number;
  held: number;
  terminal: boolean;
  href: string;
}

/**
 * The production pipeline as counts, left to right in manufacturing order.
 * Each stage opens its column on the production board.
 */
export function PipelineStrip({ stages, label }: { stages: readonly PipelineStage[]; label: string }) {
  return (
    <ol className={styles.strip} aria-label={label}>
      {stages.map((stage) => (
        <li
          key={stage.id}
          className={clsx(styles.stage, stage.count === 0 && styles.empty, stage.terminal && styles.terminal)}
        >
          <Link href={stage.href} className={styles.link}>
            <span className={styles.label}>{stage.label}</span>
            <span className={styles.count}>
              {stage.count}
              <span className="u-visually-hidden"> {stage.count === 1 ? "job" : "jobs"}</span>
            </span>
            <span className={clsx(styles.held, stage.held > 0 && styles.heldActive)}>
              {stage.held > 0 ? `${stage.held} held` : stage.terminal ? "Last 7 days" : " "}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
