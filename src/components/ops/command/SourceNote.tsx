import { LocalTime } from "@/components/tracking/LocalTime";
import type { Traced } from "@/lib/ops/analytics/types";

import styles from "./command.module.css";

/**
 * Where a figure came from: its source, what it counts, the range and when it
 * was read. Every analytics panel ends with one.
 */
export function SourceNote({ trace, cached }: { trace: Traced; cached?: string }) {
  return (
    <dl className={styles.source}>
      <div>
        <dt>Source</dt>
        <dd>{trace.source}</dd>
      </div>
      <div>
        <dt>Counts</dt>
        <dd>{trace.definition}</dd>
      </div>
      {trace.range && (
        <div>
          <dt>Range</dt>
          <dd>{trace.range.label}</dd>
        </div>
      )}
      <div>
        <dt>Read</dt>
        <dd>
          <LocalTime value={trace.generatedAt} />
          {cached ? ` · ${cached}` : ""}
        </dd>
      </div>
    </dl>
  );
}
