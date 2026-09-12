import clsx from "clsx";

import { LocalTime } from "@/components/tracking/LocalTime";
import type { OpsTone } from "@/lib/ops/labels";

import styles from "./Timeline.module.css";

export interface TimelineEntry {
  id: string;
  at: string;
  title: string;
  detail?: string;
  actor?: string;
  note?: string;
  tone: OpsTone;
}

/**
 * State changes in time order, newest first.
 *
 * An ordered list: position carries sequence for assistive technology. Times
 * render in the reader's timezone. Actor and note are internal and appear only
 * here, in the console.
 */
export function Timeline({ entries, label }: { entries: readonly TimelineEntry[]; label: string }) {
  return (
    <ol className={styles.timeline} aria-label={label}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.entry}>
          <span className={clsx(styles.marker, styles[entry.tone])} aria-hidden="true" />
          <div className={styles.content}>
            <div className={styles.head}>
              <span className={styles.title}>{entry.title}</span>
              <LocalTime value={entry.at} className={styles.time} />
            </div>
            {entry.detail && <p className={styles.detail}>{entry.detail}</p>}
            {(entry.actor || entry.note) && (
              <p className={styles.meta}>
                {entry.actor && <span className={styles.actor}>{entry.actor}</span>}
                {entry.note && <span className={styles.note}>“{entry.note}”</span>}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
