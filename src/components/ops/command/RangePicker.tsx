import Link from "next/link";
import clsx from "clsx";

import { Icon } from "@/components/core/Icon";
import {
  BUSINESS_TIME_ZONE,
  RANGE_PRESETS,
  RANGE_PRESET_LABEL,
  rangeParams,
  type DateRange,
} from "@/lib/ops/analytics/range";
import { hrefWith, type ParamValues } from "@/lib/ops/query";

import styles from "./command.module.css";

/**
 * The analytics date range: preset links and a custom from–to form.
 *
 * A plain GET form and plain links, so the range is in the URL, works without
 * JavaScript and survives a reload. The selected range is always stated in
 * words beside the controls, with the calendar it is counted in.
 */
export function RangePicker({
  path,
  range,
  keep = {},
}: {
  path: string;
  range: DateRange;
  /** Other parameters of the page, kept when the range changes. */
  keep?: ParamValues;
}) {
  const presets = RANGE_PRESETS.filter((preset) => preset !== "custom");

  return (
    <div className={styles.range}>
      <nav className={styles.presets} aria-label="Date range">
        {presets.map((preset) => (
          <Link
            key={preset}
            href={hrefWith(path, { ...keep, ...rangeParams({ ...range, preset }) }, { from: null, to: null })}
            className={clsx(styles.preset, range.preset === preset && styles.presetActive)}
            aria-current={range.preset === preset ? "true" : undefined}
          >
            {RANGE_PRESET_LABEL[preset]}
          </Link>
        ))}
      </nav>

      <form action={path} method="get" className={styles.custom} aria-label="Custom date range">
        {Object.entries(keep).map(([key, value]) =>
          value === undefined || value === "" ? null : <input key={key} type="hidden" name={key} value={String(value)} />,
        )}
        <input type="hidden" name="range" value="custom" />
        <label className={styles.dateField}>
          <span className={styles.dateLabel}>From</span>
          <input type="date" name="from" required defaultValue={range.fromDay} className={styles.dateInput} />
        </label>
        <label className={styles.dateField}>
          <span className={styles.dateLabel}>To</span>
          <input type="date" name="to" required defaultValue={range.toDay} className={styles.dateInput} />
        </label>
        <button type="submit" className={clsx(styles.preset, range.preset === "custom" && styles.presetActive)}>
          Apply
        </button>
      </form>

      <p className={styles.rangeLabel} aria-live="polite">
        <Icon name="clock" size={14} />
        <span>
          {RANGE_PRESET_LABEL[range.preset]} · {range.label}
        </span>
        <span className="u-visually-hidden"> — business days in {BUSINESS_TIME_ZONE.label} (UTC+05:30)</span>
      </p>
      {range.notice && (
        <p className={styles.notice} role="status">
          <Icon name="info" size={14} />
          {range.notice}
        </p>
      )}
    </div>
  );
}
