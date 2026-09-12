"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";

import styles from "./TrendChart.module.css";

export interface TrendPoint {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  value: number;
}

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00.000Z`));
}

/** A clean top for the axis and at most four ticks: 0, step, 2·step … */
function scale(max: number): { top: number; ticks: number[] } {
  const target = Math.max(max, 1);
  const rough = target / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? magnitude * 10;
  const top = Math.max(step, Math.ceil(target / step) * step);
  const ticks: number[] = [];
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick);
  return { top, ticks };
}

/**
 * One series over days, as columns.
 *
 * Steel columns with today's in Titanium Orange — the current period is the
 * one accent. One axis, clean ticks, hairline grid. The keyboard reaches every
 * value through one tab stop and the arrow keys; hover and focus show the same
 * readout; and the full series is available as a table.
 */
export function TrendChart({
  data,
  label,
  unit,
}: {
  data: readonly TrendPoint[];
  label: string;
  /** Singular and plural, e.g. ["order", "orders"]. */
  unit: readonly [string, string];
}) {
  const [cursor, setCursor] = useState(data.length - 1);
  const [shown, setShown] = useState<number | null>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  const { top, ticks } = scale(Math.max(0, ...data.map((point) => point.value)));
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const describe = (point: TrendPoint) =>
    `${dayLabel(point.day)}: ${point.value} ${point.value === 1 ? unit[0] : unit[1]}`;

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const last = data.length - 1;
    const next =
      event.key === "ArrowRight"
        ? Math.min(cursor + 1, last)
        : event.key === "ArrowLeft"
          ? Math.max(cursor - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;

    if (next === null) return;
    event.preventDefault();
    setCursor(next);
    setShown(next);
    bars.current[next]?.focus();
  }

  const labelled = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  const active = shown === null ? null : data[shown];

  return (
    <figure className={styles.figure}>
      <figcaption className="u-visually-hidden">
        {label}: {total} {total === 1 ? unit[0] : unit[1]} in {data.length} days.
      </figcaption>

      <div className={styles.plot}>
        <div className={styles.axis} aria-hidden="true">
          {ticks.map((tick) => (
            <div key={tick} className={styles.gridLine} style={{ bottom: `${(tick / top) * 100}%` }}>
              <span className={styles.tick}>{tick}</span>
            </div>
          ))}
        </div>

        <div className={styles.bars} role="group" aria-label={`${label}. Use the arrow keys to read each day.`} onKeyDown={move}>
          {data.map((point, index) => {
            const today = index === data.length - 1;
            return (
              <div
                key={point.day}
                className={styles.slot}
                onPointerEnter={() => setShown(index)}
                onPointerLeave={() => setShown(null)}
              >
                <span
                  ref={(node) => {
                    bars.current[index] = node;
                  }}
                  role="img"
                  tabIndex={index === cursor ? 0 : -1}
                  aria-label={describe(point)}
                  className={clsx(styles.bar, today && styles.today, point.value === 0 && styles.zero)}
                  style={{ height: point.value === 0 ? undefined : `${(point.value / top) * 100}%` }}
                  onFocus={() => {
                    setCursor(index);
                    setShown(index);
                  }}
                  onBlur={() => setShown(null)}
                />
                {shown === index && active && (
                  <span className={styles.tooltip} aria-hidden="true">
                    <strong className={styles.tooltipValue}>{active.value}</strong>
                    <span className={styles.tooltipLabel}>{dayLabel(active.day)}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.xAxis} aria-hidden="true">
        {data.map((point, index) => (
          <span key={point.day} className={styles.xLabel}>
            {labelled.has(index) ? (index === data.length - 1 ? "Today" : dayLabel(point.day)) : ""}
          </span>
        ))}
      </div>

      <details className={styles.details}>
        <summary className={styles.summary}>View as table</summary>
        <table className={styles.table}>
          <caption className="u-visually-hidden">{label}</caption>
          <thead>
            <tr>
              <th scope="col">Day (UTC)</th>
              <th scope="col">{unit[1]}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.day}>
                <td>{dayLabel(point.day)}</td>
                <td>{point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
