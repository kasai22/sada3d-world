import type { DesignStorageState } from "@/lib/account/types";
import type { OrderStatus, PaymentState } from "@/lib/orders/types";

import { ISSUE_KINDS, type IssueKind, type IssueSeverity } from "./pipeline";

/**
 * Console filters, read from the URL.
 *
 * Every list in the console is a server-rendered page whose filters live in the
 * query string, so a filtered view is a link: it survives a reload, can be
 * shared with a colleague and works without JavaScript.
 *
 * Query strings are text a stranger can write. Nothing here trusts one: enums
 * are matched against their closed set, free text is bounded, dates must be
 * real calendar dates and pages are clamped. Anything unrecognised is dropped
 * rather than refused, so a stale bookmark still opens.
 *
 * Client-safe: no server imports.
 */

export type SearchParamsRecord = Readonly<Record<string, string | string[] | undefined>>;

export const PAGE_SIZE = 25;
export const MAX_PAGE = 10_000;
export const MAX_QUERY_LENGTH = 64;

/* ------------------------------------------------------------------ *
 * Readers
 * ------------------------------------------------------------------ */

export function readParam(params: SearchParamsRecord, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Free text, cut to a bounded length. */
export function readText(
  params: SearchParamsRecord,
  key: string,
  max = MAX_QUERY_LENGTH,
): string | undefined {
  const value = readParam(params, key);
  return value === undefined ? undefined : value.slice(0, max);
}

export function readEnum<T extends string>(
  params: SearchParamsRecord,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = readParam(params, key);
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export function readPage(params: SearchParamsRecord): number {
  const value = Number.parseInt(readParam(params, "page") ?? "1", 10);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, MAX_PAGE);
}

/** A calendar date, `YYYY-MM-DD`, that round-trips — so 2026-02-30 is not one. */
export function readDate(params: SearchParamsRecord, key: string): string | undefined {
  const value = readParam(params, key);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : undefined;
}

/** Identifiers the console links by: customer ids, design ids. */
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

export function readIdentifier(params: SearchParamsRecord, key: string): string | undefined {
  const value = readParam(params, key);
  return value !== undefined && IDENTIFIER.test(value) ? value : undefined;
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

export type ParamValues = Readonly<Record<string, string | number | undefined>>;

/**
 * A link to `pathname` with these parameters, empty ones omitted.
 * `overrides` wins, and a `null` override removes the key.
 */
export function hrefWith(
  pathname: string,
  current: ParamValues,
  overrides: Readonly<Record<string, string | number | undefined | null>> = {},
): string {
  const merged: Record<string, string | number | undefined | null> = { ...current, ...overrides };
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "page" && Number(value) === 1) continue;
    search.set(key, String(value));
  }

  const text = search.toString();
  return text ? `${pathname}?${text}` : pathname;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "awaiting_payment",
  "confirmed",
  "fulfillment_in_progress",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
  "failed",
];

export const PAYMENT_STATES: readonly PaymentState[] = ["pending", "paid", "failed"];

export const ORDER_SORTS = ["placed_desc", "placed_asc", "total_desc", "total_asc"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export const PRODUCTION_FILTERS = ["active", "held", "failed", "none"] as const;
export type ProductionFilter = (typeof PRODUCTION_FILTERS)[number];

/**
 * The command centre's quick filters: where an order stands, in the owner's
 * words. Each is a reading of the existing state machines (see
 * `stageCondition` in `orders.ts`), not a new state, and an order can be in
 * two at once — a part in production beside a part ready to dispatch.
 */
export const ORDER_STAGES = ["new", "paid", "production", "ready", "shipped", "completed", "cancelled"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  new: "New",
  paid: "Paid",
  production: "Production",
  ready: "Ready",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ORDER_STAGE_HINT: Record<OrderStage, string> = {
  new: "Placed, payment not completed",
  paid: "Paid and confirmed, nothing started",
  production: "Has a part in manufacturing",
  ready: "Has an item ready to dispatch",
  shipped: "Has an item in transit",
  completed: "Every item dispatched",
  cancelled: "Cancelled",
};

export const DEMO_FILTERS = ["exclude", "only"] as const;
export type DemoFilter = (typeof DEMO_FILTERS)[number];

export interface OrderListQuery {
  q?: string;
  stage?: OrderStage;
  status?: OrderStatus;
  payment?: PaymentState;
  production?: ProductionFilter;
  /** A customer id, or "guest" for orders placed without an account. */
  customer?: string;
  /** Inclusive, UTC calendar days. */
  from?: string;
  to?: string;
  demo?: DemoFilter;
  sort: OrderSort;
  page: number;
}

export function parseOrderListQuery(params: SearchParamsRecord): OrderListQuery {
  let from = readDate(params, "from");
  let to = readDate(params, "to");
  // A reversed range is almost always the two fields swapped.
  if (from && to && from > to) [from, to] = [to, from];

  return {
    q: readText(params, "q"),
    stage: readEnum(params, "stage", ORDER_STAGES),
    status: readEnum(params, "status", ORDER_STATUSES),
    payment: readEnum(params, "payment", PAYMENT_STATES),
    production: readEnum(params, "production", PRODUCTION_FILTERS),
    customer: readIdentifier(params, "customer"),
    from,
    to,
    demo: readEnum(params, "demo", DEMO_FILTERS),
    sort: readEnum(params, "sort", ORDER_SORTS) ?? "placed_desc",
    page: readPage(params),
  };
}

export function orderQueryParams(query: OrderListQuery): ParamValues {
  return {
    q: query.q,
    stage: query.stage,
    status: query.status,
    payment: query.payment,
    production: query.production,
    customer: query.customer,
    from: query.from,
    to: query.to,
    demo: query.demo,
    sort: query.sort === "placed_desc" ? undefined : query.sort,
    page: query.page,
  };
}

export function hasOrderFilters(query: OrderListQuery): boolean {
  return Boolean(
    query.q ||
      query.status ||
      query.payment ||
      query.production ||
      query.customer ||
      query.from ||
      query.to ||
      query.demo,
  );
}

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

export interface PaymentListQuery {
  q?: string;
  status?: PaymentState;
  demo?: DemoFilter;
  page: number;
}

export function parsePaymentListQuery(params: SearchParamsRecord): PaymentListQuery {
  return {
    q: readText(params, "q"),
    status: readEnum(params, "status", PAYMENT_STATES),
    demo: readEnum(params, "demo", DEMO_FILTERS),
    page: readPage(params),
  };
}

export function paymentQueryParams(query: PaymentListQuery): ParamValues {
  return { q: query.q, status: query.status, demo: query.demo, page: query.page };
}

/* ------------------------------------------------------------------ *
 * Designs
 * ------------------------------------------------------------------ */

export const DESIGN_PAGE_SIZE = 24;

export const DESIGN_STATES: readonly DesignStorageState[] = ["pending", "verified", "failed", "deleted"];
export const DESIGN_ANALYSIS_FILTERS = ["analysed", "not_analysed"] as const;
export const DESIGN_VIEWS = ["grid", "list"] as const;
export type DesignView = (typeof DESIGN_VIEWS)[number];

export interface DesignListQuery {
  q?: string;
  /** Absent means every state but deleted. */
  state?: DesignStorageState;
  format?: string;
  analysis?: (typeof DESIGN_ANALYSIS_FILTERS)[number];
  customer?: string;
  view: DesignView;
  page: number;
}

export function parseDesignListQuery(params: SearchParamsRecord): DesignListQuery {
  const format = readParam(params, "format")?.toUpperCase();

  return {
    q: readText(params, "q"),
    state: readEnum(params, "state", DESIGN_STATES),
    format: format && /^[A-Z0-9]{2,8}$/.test(format) ? format : undefined,
    analysis: readEnum(params, "analysis", DESIGN_ANALYSIS_FILTERS),
    customer: readIdentifier(params, "customer"),
    view: readEnum(params, "view", DESIGN_VIEWS) ?? "list",
    page: readPage(params),
  };
}

export function designQueryParams(query: DesignListQuery): ParamValues {
  return {
    q: query.q,
    state: query.state,
    format: query.format,
    analysis: query.analysis,
    customer: query.customer,
    view: query.view === "list" ? undefined : query.view,
    page: query.page,
  };
}

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export interface CustomerListQuery {
  q?: string;
  page: number;
}

export function parseCustomerListQuery(params: SearchParamsRecord): CustomerListQuery {
  return { q: readText(params, "q"), page: readPage(params) };
}

/* ------------------------------------------------------------------ *
 * Production
 * ------------------------------------------------------------------ */

export interface ProductionQuery {
  q?: string;
  exceptions: boolean;
}

export function parseProductionQuery(params: SearchParamsRecord): ProductionQuery {
  return { q: readText(params, "q"), exceptions: readParam(params, "exceptions") === "1" };
}

/* ------------------------------------------------------------------ *
 * Issues
 * ------------------------------------------------------------------ */

export const ISSUE_SEVERITIES: readonly IssueSeverity[] = ["high", "medium", "low"];

export interface IssueListQuery {
  severity?: IssueSeverity;
  kind?: IssueKind;
  demo?: DemoFilter;
}

export function parseIssueListQuery(params: SearchParamsRecord): IssueListQuery {
  return {
    severity: readEnum(params, "severity", ISSUE_SEVERITIES),
    kind: readEnum(params, "kind", ISSUE_KINDS),
    demo: readEnum(params, "demo", DEMO_FILTERS),
  };
}

/** `%`, `_` and `\` are LIKE metacharacters; a search for "50%" means the text. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
