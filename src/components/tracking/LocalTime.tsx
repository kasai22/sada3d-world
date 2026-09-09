"use client";

import { useEffect, useState } from "react";

export interface LocalTimeProps {
  /** UTC ISO 8601. */
  value: string;
  /** Date only, for things that do not need a clock time. */
  dateOnly?: boolean;
  className?: string;
}

/**
 * A timestamp in the reader's timezone.
 *
 * Stored UTC, rendered local. The server has no way to know where the reader
 * is, so the first render is a fixed UTC form that both sides agree on, and the
 * local form replaces it after mount — no hardcoded timezone, and no hydration
 * mismatch.
 *
 * The machine-readable value in `dateTime` is always the original instant.
 */
export function LocalTime({ value, dateOnly = false, className }: LocalTimeProps) {
  const [text, setText] = useState(() => utc(value, dateOnly));

  /* eslint-disable react-hooks/set-state-in-effect -- the reader's timezone is
     an external system the server cannot see. Formatting during render would
     make the server and the client disagree, so this deliberately renders the
     shared UTC form first and localises it after mount. */
  useEffect(() => {
    setText(local(value, dateOnly));
  }, [value, dateOnly]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <time dateTime={value} className={className}>
      {text}
    </time>
  );
}

/** Deterministic on both sides: the same string on the server and the client. */
function utc(value: string, dateOnly: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const day = date.toISOString().slice(0, 10);
  return dateOnly ? day : `${day} ${date.toISOString().slice(11, 16)} UTC`;
}

function local(value: string, dateOnly: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}
