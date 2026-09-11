/**
 * Server action arguments, checked at runtime.
 *
 * A server action is a public POST endpoint. Its TypeScript signature describes
 * what the application's own form sends; it constrains nothing a request can
 * carry. So an action takes `unknown`, reads the fields its service accepts —
 * each the right type and a bounded length — and passes on only those.
 *
 * ── Projection, not refusal ──────────────────────────────────────────────
 *
 * The JSON API refuses unknown fields by name (`rejectUnknownFields`). Actions
 * project instead: an extra field is dropped here and never reaches the
 * service. The effect on the service is the same — it sees only allowlisted
 * fields — and a form that sends a harmless extra keeps working.
 *
 * Business rules — is this product in the catalog, is this quantity allowed,
 * does this address belong to the caller — stay in the services. This module
 * answers only "is this a value of the shape the service was written for".
 */

/** What an action says when its argument is not the shape its form sends. */
export const UNREADABLE = "That request could not be read. Reload the page and try again.";

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A string no longer than `max`. Empty is allowed; the service decides if that is valid. */
export function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

/** Absent, null, or text no longer than `max`. */
export function isOptionalText(value: unknown, max: number): value is string | undefined | null {
  return value === undefined || value === null || isText(value, max);
}

/** A number that is neither NaN nor infinite. Range and integrality are the service's rule. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Identifiers: product ids, cart line ids, address ids, design ids. */
export const MAX_ID_LENGTH = 128;
