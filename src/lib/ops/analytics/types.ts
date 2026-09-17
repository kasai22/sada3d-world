import type { DateRange } from "./range";

/**
 * Shapes shared by the analytics services. Client-safe: types only.
 */

/** Every figure carries where it came from, what it means and when it was read. */
export interface Traced {
  range?: DateRange;
  source: string;
  definition: string;
  /** UTC ISO 8601. */
  generatedAt: string;
}

export type AttentionSeverity = "high" | "medium" | "low";

export type AttentionArea = "orders" | "payments" | "manufacturing" | "inventory" | "catalog" | "capability";

/** One line in "Needs your attention": a count of records in a condition, and where to act on them. */
export interface AttentionItem {
  id: string;
  area: AttentionArea;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  count: number;
  /** A real destination: a console page or a Payload admin route. */
  href: string;
  /** True when `href` opens the Payload CMS. */
  cms: boolean;
}
