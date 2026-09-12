import { formatBytes } from "@/lib/bytes";
import { formatINR } from "@/lib/money";

/**
 * Console formatting.
 *
 * Client-safe and pure. Money and file sizes reuse the application's single
 * formatters so the console never rounds a figure differently from the
 * storefront that showed it to the customer.
 */

export { formatBytes, formatINR };

const COUNT = new Intl.NumberFormat("en-IN");

export function formatCount(value: number): string {
  return COUNT.format(value);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function span(milliseconds: number): string {
  if (milliseconds < MINUTE) return "<1m";
  if (milliseconds < HOUR) return `${Math.floor(milliseconds / MINUTE)}m`;
  if (milliseconds < DAY) return `${Math.floor(milliseconds / HOUR)}h`;
  if (milliseconds < 14 * DAY) return `${Math.floor(milliseconds / DAY)}d`;
  return `${Math.floor(milliseconds / (7 * DAY))}w`;
}

/**
 * Compact elapsed time for an "Age" column: `<1m`, `42m`, `5h`, `3d`, `6w`.
 *
 * Rendered on the server against one clock per request. A future instant (an
 * estimate not yet reached) reads `in 5h`.
 */
export function formatAge(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const elapsed = now.getTime() - at;
  return elapsed < 0 ? `in ${span(-elapsed)}` : span(elapsed);
}

export function formatAgo(iso: string, now: Date): string {
  const age = formatAge(iso, now);
  if (age === "—" || age.startsWith("in ")) return age;
  return age === "<1m" ? "just now" : `${age} ago`;
}

export function formatMillimetres(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function formatDimensions(size: { x: number; y: number; z: number }): string {
  return `${formatMillimetres(size.x)} × ${formatMillimetres(size.y)} × ${formatMillimetres(size.z)} MM`;
}

export function formatVolume(cubicMillimetres: number): string {
  return `${formatCount(Math.round((cubicMillimetres / 1000) * 10) / 10)} CM³`;
}

export function shortHash(value: string, length = 12): string {
  return value.slice(0, length);
}

export function humanise(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Up to two initials, for an avatar. Never empty. */
export function initials(name: string): string {
  const letters = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}
