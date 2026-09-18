import { formatCount } from "@/lib/ops/format";

import styles from "./command.module.css";

/**
 * How much of a whole is ready: a two-part bar (ready, part-way) with the
 * counts written out, so the bar is never the only way to read it.
 */
export function Meter({
  label,
  ready,
  partial = 0,
  total,
  readyLabel,
  partialLabel,
  note,
}: {
  label: string;
  ready: number;
  partial?: number;
  total: number;
  readyLabel: string;
  partialLabel?: string;
  note?: string;
}) {
  const share = (value: number) => (total > 0 ? `${(value / total) * 100}%` : "0%");
  const summary = [
    `${formatCount(ready)} of ${formatCount(total)} ${readyLabel}`,
    partial > 0 && partialLabel ? `${formatCount(partial)} ${partialLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.meter}>
      <span className={styles.meterLabel}>{label}</span>
      <span className={styles.meterValue}>{summary}</span>
      <span className={styles.meterTrack} aria-hidden="true">
        {ready > 0 && <span className={styles.meterReady} style={{ width: share(ready) }} />}
        {partial > 0 && <span className={styles.meterPartial} style={{ width: share(partial) }} />}
      </span>
      {note && <span className={styles.meterNote}>{note}</span>}
    </div>
  );
}
