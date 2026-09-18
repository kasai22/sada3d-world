/**
 * Shapes shared across the console. Client-safe: types only.
 */

/** One page of a server-paginated list. */
export interface OpsPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type ActivityKind = "order" | "production" | "design" | "shipment";

/** One line in an activity feed. Built from a record's own timestamps, never inferred. */
export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** UTC ISO 8601. */
  at: string;
  title: string;
  detail: string;
  href: string;
  demo: boolean;
}

/** What a server action tells the form that submitted it. */
export type OpsActionResult =
  | { ok: true; message: string; /** The record a create made, when it made one. */ id?: string }
  | { ok: false; message: string };
