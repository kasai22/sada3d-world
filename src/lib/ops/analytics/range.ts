import { readDate, readEnum, type ParamValues, type SearchParamsRecord } from "../query";

/**
 * Analytics date ranges.
 *
 * Every figure the command centre shows is over an explicit range, and the
 * range is part of the URL, so a view is a link that means the same thing
 * tomorrow as it does today.
 *
 * ── The business day ─────────────────────────────────────────────────────
 *
 * Reality 3D trades in India, so "today" and "this month" are Indian calendar
 * days. India Standard Time is a fixed UTC+05:30 with no daylight saving, which
 * is why an offset — rather than a timezone database — is enough, and why the
 * SQL buckets (`analytics/sql.ts`) use the same offset and cannot disagree with
 * the boundaries computed here.
 *
 * Pure and client-safe: no server imports.
 */

export const BUSINESS_TIME_ZONE = { label: "IST", offsetMinutes: 330 } as const;

const OFFSET_MS = BUSINESS_TIME_ZONE.offsetMinutes * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The longest custom range, so a typo in a year cannot ask for a century of buckets. */
export const MAX_RANGE_DAYS = 3 * 366;
/** Longer ranges are bucketed by month. */
export const DAILY_BUCKET_MAX_DAYS = 92;

export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "mtd", "ytd", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const DEFAULT_PRESET: Exclude<RangePreset, "custom"> = "mtd";

export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  mtd: "This month",
  ytd: "Year to date",
  custom: "Custom",
};

export interface DateRange {
  preset: RangePreset;
  /** Inclusive start, as an instant (the business day's midnight). */
  start: Date;
  /** Exclusive end, as an instant (midnight after the last business day). */
  end: Date;
  /** First and last business day, inclusive, `YYYY-MM-DD`. */
  fromDay: string;
  toDay: string;
  days: number;
  bucket: "day" | "month";
  /** e.g. "1 Sep – 16 Sep 2026 · IST". */
  label: string;
  /** Set when the URL asked for a range that could not be honoured. */
  notice?: string;
}

/* ------------------------------------------------------------------ *
 * Business-day arithmetic
 * ------------------------------------------------------------------ */

/** The business calendar day an instant falls on. */
export function businessDay(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a business day begins. */
export function startOfBusinessDay(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - OFFSET_MS);
}

export function addDays(day: string, amount: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00.000Z`) - Date.parse(`${fromDay}T00:00:00.000Z`)) / DAY_MS) + 1;
}

/** Monday of the business week containing `day` (ISO weeks). */
export function startOfWeek(day: string): string {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_YEAR_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDay(day: string, withYear = false): string {
  return (withYear ? DAY_YEAR_FORMAT : DAY_FORMAT).format(new Date(`${day}T00:00:00.000Z`));
}

function describe(fromDay: string, toDay: string): string {
  const zone = BUSINESS_TIME_ZONE.label;
  if (fromDay === toDay) return `${formatDay(fromDay, true)} · ${zone}`;
  const sameYear = fromDay.slice(0, 4) === toDay.slice(0, 4);
  return `${formatDay(fromDay, !sameYear)} – ${formatDay(toDay, true)} · ${zone}`;
}

/* ------------------------------------------------------------------ *
 * Ranges
 * ------------------------------------------------------------------ */

export function rangeFromDays(preset: RangePreset, fromDay: string, toDay: string, notice?: string): DateRange {
  const days = daysBetween(fromDay, toDay);
  return {
    preset,
    start: startOfBusinessDay(fromDay),
    end: startOfBusinessDay(addDays(toDay, 1)),
    fromDay,
    toDay,
    days,
    bucket: days > DAILY_BUCKET_MAX_DAYS ? "month" : "day",
    label: describe(fromDay, toDay),
    ...(notice ? { notice } : {}),
  };
}

export function presetRange(preset: Exclude<RangePreset, "custom">, now: Date): DateRange {
  const today = businessDay(now);
  switch (preset) {
    case "today":
      return rangeFromDays(preset, today, today);
    case "7d":
      return rangeFromDays(preset, addDays(today, -6), today);
    case "30d":
      return rangeFromDays(preset, addDays(today, -29), today);
    case "90d":
      return rangeFromDays(preset, addDays(today, -89), today);
    case "mtd":
      return rangeFromDays(preset, `${today.slice(0, 7)}-01`, today);
    case "ytd":
      return rangeFromDays(preset, `${today.slice(0, 4)}-01-01`, today);
  }
}

/**
 * The range a URL asks for. Anything unrecognised falls back to the current
 * month and says so, rather than silently showing a different period.
 */
export function parseRange(params: SearchParamsRecord, now: Date): DateRange {
  const preset: RangePreset = readEnum(params, "range", RANGE_PRESETS) ?? DEFAULT_PRESET;
  if (preset !== "custom") return presetRange(preset, now);

  let from = readDate(params, "from");
  let to = readDate(params, "to");
  if (!from || !to) {
    return { ...presetRange(DEFAULT_PRESET, now), notice: "A custom range needs both a start and an end date; showing this month." };
  }
  if (from > to) [from, to] = [to, from];

  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return {
      ...presetRange(DEFAULT_PRESET, now),
      notice: `A custom range can span at most ${MAX_RANGE_DAYS} days; showing this month.`,
    };
  }
  return rangeFromDays("custom", from, to);
}

export function rangeParams(range: DateRange): ParamValues {
  if (range.preset === "custom") return { range: "custom", from: range.fromDay, to: range.toDay };
  return { range: range.preset === DEFAULT_PRESET ? undefined : range.preset };
}

/**
 * The bucket keys a range covers, in order: business days (`YYYY-MM-DD`) or
 * months (`YYYY-MM`). Buckets with no records are still listed, as zero.
 */
export function bucketKeys(range: DateRange): string[] {
  if (range.bucket === "day") {
    return Array.from({ length: range.days }, (_, index) => addDays(range.fromDay, index));
  }
  const keys: string[] = [];
  let [year, month] = range.fromDay.slice(0, 7).split("-").map(Number) as [number, number];
  const last = range.toDay.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    keys.push(key);
    if (key >= last) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/* ------------------------------------------------------------------ *
 * Standing periods
 * ------------------------------------------------------------------ */

export type PeriodId = "today" | "week" | "month" | "year";

export const PERIOD_LABEL: Record<PeriodId, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
};

/** Today, this ISO week, this month and this year, each up to the end of today. */
export function standingPeriods(now: Date): Record<PeriodId, DateRange> {
  const today = businessDay(now);
  return {
    today: rangeFromDays("today", today, today),
    week: rangeFromDays("custom", startOfWeek(today), today),
    month: rangeFromDays("mtd", `${today.slice(0, 7)}-01`, today),
    year: rangeFromDays("ytd", `${today.slice(0, 4)}-01-01`, today),
  };
}
