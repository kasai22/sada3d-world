import assert from "node:assert/strict";
import test from "node:test";

import type { ManufacturingState } from "@/lib/manufacturing/types";
import type { AdminLaunchStatus } from "@/lib/content/launch-admin";
import type { LaunchStage } from "@/payload/workflow";
import type { Product as PayloadProduct } from "@/payload-types";

import { ENUM_VALUES } from "@/lib/db/schema";
import type { OpsIssue } from "../pipeline";
import { TERMINAL_STATES } from "../pipeline";
import type { InventorySummary, StockCounts } from "@/lib/inventory/read";

import { deriveAttention } from "./attention";
import { summariseCatalog, unreachableCatalog, type CapabilityOverview } from "./catalog";
import {
  MAX_RANGE_DAYS,
  bucketKeys,
  businessDay,
  parseRange,
  rangeFromDays,
  rangeParams,
  standingPeriods,
  startOfBusinessDay,
} from "./range";
import { averageOf } from "./revenue";
import { ACTIVE_STAGES, activeStageOf } from "./stages";

/**
 * The analytics layer's pure rules: date ranges in the business timezone, the
 * manufacturing stage grouping, catalog counting and the action centre.
 * `persistence.test.ts` runs the SQL.
 */

/** 16 Sep 2026, 12:00 IST. */
const NOW = new Date("2026-09-16T06:30:00.000Z");

/* ------------------------------------------------------------------ *
 * Date ranges
 * ------------------------------------------------------------------ */

test("the default range is the current month, in IST, up to the end of today", () => {
  const range = parseRange({}, NOW);
  assert.equal(range.preset, "mtd");
  assert.equal(range.fromDay, "2026-09-01");
  assert.equal(range.toDay, "2026-09-16");
  assert.equal(range.days, 16);
  assert.equal(range.start.toISOString(), "2026-08-31T18:30:00.000Z", "1 Sep begins at 00:00 IST");
  assert.equal(range.end.toISOString(), "2026-09-16T18:30:00.000Z", "the range ends at midnight after today, IST");
  assert.equal(range.bucket, "day");
  assert.match(range.label, /^1 Sept? – 16 Sept? 2026 · IST$/);
  assert.equal(range.notice, undefined);
});

test("the business day is the Indian calendar day, not the UTC one", () => {
  // 20:00 UTC on the 15th is 01:30 IST on the 16th.
  assert.equal(businessDay(new Date("2026-09-15T20:00:00.000Z")), "2026-09-16");
  assert.equal(businessDay(new Date("2026-09-15T18:29:59.999Z")), "2026-09-15");
  assert.equal(startOfBusinessDay("2026-09-16").toISOString(), "2026-09-15T18:30:00.000Z");

  const today = parseRange({ range: "today" }, new Date("2026-09-15T20:00:00.000Z"));
  assert.equal(today.fromDay, "2026-09-16");
  assert.equal(today.days, 1);
});

test("every preset covers the days it names, ending today", () => {
  const expectations: Record<string, [string, number]> = {
    today: ["2026-09-16", 1],
    "7d": ["2026-09-10", 7],
    "30d": ["2026-08-18", 30],
    "90d": ["2026-06-19", 90],
    mtd: ["2026-09-01", 16],
    ytd: ["2026-01-01", 259],
  };
  for (const [preset, [fromDay, days]] of Object.entries(expectations)) {
    const range = parseRange({ range: preset }, NOW);
    assert.equal(range.preset, preset);
    assert.equal(range.fromDay, fromDay, preset);
    assert.equal(range.toDay, "2026-09-16", preset);
    assert.equal(range.days, days, preset);
    assert.equal(bucketKeys(range).length, range.bucket === "day" ? days : 9, preset);
  }
  assert.equal(parseRange({ range: "ytd" }, NOW).bucket, "month", "long ranges are bucketed by month");
});

test("a custom range is honoured, swapped when reversed, and refused — visibly — when it cannot be", () => {
  const custom = parseRange({ range: "custom", from: "2026-03-10", to: "2026-03-01" }, NOW);
  assert.equal(custom.preset, "custom");
  assert.equal(custom.fromDay, "2026-03-01");
  assert.equal(custom.toDay, "2026-03-10");
  assert.deepEqual(rangeParams(custom), { range: "custom", from: "2026-03-01", to: "2026-03-10" });

  const incomplete = parseRange({ range: "custom", from: "2026-03-10" }, NOW);
  assert.equal(incomplete.preset, "mtd");
  assert.match(incomplete.notice ?? "", /both a start and an end/);

  const impossible = parseRange({ range: "custom", from: "2026-02-30", to: "2026-03-10" }, NOW);
  assert.equal(impossible.preset, "mtd", "2026-02-30 is not a date");
  assert.ok(impossible.notice);

  const huge = parseRange({ range: "custom", from: "1990-01-01", to: "2026-01-01" }, NOW);
  assert.equal(huge.preset, "mtd");
  assert.match(huge.notice ?? "", new RegExp(String(MAX_RANGE_DAYS)));

  assert.equal(parseRange({ range: "forever" }, NOW).preset, "mtd", "an unknown preset is the default");
  assert.deepEqual(rangeParams(parseRange({}, NOW)), { range: undefined }, "the default is not written into links");
});

test("month buckets cross a year boundary and list empty months", () => {
  const range = rangeFromDays("custom", "2025-11-20", "2026-02-03");
  assert.equal(range.bucket, "day", "76 days is still daily");
  const long = rangeFromDays("custom", "2025-10-01", "2026-02-03");
  assert.equal(long.bucket, "month");
  assert.deepEqual(bucketKeys(long), ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("the standing periods are today, the ISO week from Monday, the month and the year", () => {
  const periods = standingPeriods(NOW);
  assert.equal(periods.today.fromDay, "2026-09-16");
  assert.equal(periods.week.fromDay, "2026-09-14", "16 Sep 2026 is a Wednesday");
  assert.equal(periods.month.fromDay, "2026-09-01");
  assert.equal(periods.year.fromDay, "2026-01-01");
  for (const period of Object.values(periods)) assert.equal(period.toDay, "2026-09-16");

  // 1 Jan 2027 is a Friday: its week began in 2026.
  const newYear = standingPeriods(new Date("2027-01-01T06:30:00.000Z"));
  assert.equal(newYear.week.fromDay, "2026-12-28");
  assert.ok(newYear.week.start < newYear.year.start, "the week reaches back before the year");
});

test("an average needs orders: none is null, never zero", () => {
  assert.equal(averageOf(0, 0), null);
  assert.equal(averageOf(1000, 3), 333);
  assert.equal(averageOf(1001, 2), 501);
});

/* ------------------------------------------------------------------ *
 * Manufacturing stages
 * ------------------------------------------------------------------ */

test("every active manufacturing state belongs to exactly one summary stage, and terminal states to none", () => {
  const states = ENUM_VALUES.manufacturingState as readonly ManufacturingState[];
  for (const state of states) {
    const stage = activeStageOf(state);
    if (TERMINAL_STATES.includes(state)) assert.equal(stage, null, state);
    else assert.ok(stage, `${state} has no summary stage`);
  }
  const listed = ACTIVE_STAGES.flatMap((stage) => stage.states);
  assert.equal(new Set(listed).size, listed.length, "a state is listed twice");
  assert.deepEqual(
    ACTIVE_STAGES.map((stage) => stage.label),
    ["Queued", "Printing", "Post-processing", "Quality", "Ready"],
  );
});

/* ------------------------------------------------------------------ *
 * Catalog health
 * ------------------------------------------------------------------ */

const NO_BLOCKERS: CapabilityOverview = { available: [], comingSoon: [], missingLimitations: [] };

function product(id: number, overrides: Partial<PayloadProduct> = {}): PayloadProduct {
  return {
    id,
    productId: `p-${100 + id}`,
    name: `Part ${id}`,
    price: 0,
    priceStatus: "quote-only",
    availability: "made-to-order",
    approvalStatus: "draft",
    _status: "draft",
    ...overrides,
  } as unknown as PayloadProduct;
}

function status(stage: LaunchStage, overrides: Partial<AdminLaunchStatus> = {}): AdminLaunchStatus {
  return {
    launch: stage === "LAUNCH READY" ? "READY" : "NOT READY — 1 reason",
    technical: "PASS",
    price: "QUOTE_ONLY",
    media: "APPROVED",
    manufacturing: "APPROVED",
    commercial: "COMPLETE",
    reasons: stage === "LAUNCH READY" ? "" : "• Something",
    stage,
    panel: "",
    readiness: "TECH ✓",
    ...overrides,
  };
}

test("catalog health counts the launch assessment's answers and invents none", () => {
  const health = summariseCatalog({
    products: [
      { doc: product(1, { approvalStatus: "approved", _status: "published" }), status: status("LAUNCH READY") },
      { doc: product(2, { approvalStatus: "approved" }), status: status("APPROVED", { reasons: "• Not published" }) },
      { doc: product(3, { approvalStatus: "proposed" }), status: status("READY FOR REVIEW", { media: "PROPOSED" }) },
      {
        doc: product(4, { price: 450, priceStatus: "provisional", availability: "in-stock" }),
        status: status("NOT READY", { price: "PROVISIONAL", media: "MISSING", manufacturing: "NOT_APPROVED" }),
      },
      {
        doc: product(5),
        status: status("NOT READY", { price: "—", media: "—", manufacturing: "COMING SOON — NOT APPROVED" }),
      },
    ],
    mediaLibrary: 2,
    priceApprovals: 0,
    capability: NO_BLOCKERS,
    now: NOW,
  });

  assert.equal(health.reachable, true);
  assert.equal(health.total, 5);
  assert.equal(health.published, 1);
  assert.deepEqual(health.stages, { "NOT READY": 2, "READY FOR REVIEW": 1, APPROVED: 1, "LAUNCH READY": 1 });
  assert.deepEqual(health.approval, { draft: 2, proposed: 1, provisional: 0, approved: 2, archived: 0 });
  assert.deepEqual(health.price, { APPROVED: 0, PROVISIONAL: 1, QUOTE_ONLY: 3, MISSING: 0, UNKNOWN: 1 });
  assert.deepEqual(health.media, { APPROVED: 2, PROPOSED: 1, MISSING: 1, UNKNOWN: 1 });
  assert.deepEqual(health.manufacturing, { APPROVED: 3, NOT_APPROVED: 1, COMING_SOON: 1, UNKNOWN: 0 });
  assert.equal(health.pricesAwaitingApproval, 1, "a figure with no approval is awaiting one; quote-only is not");
  assert.equal(health.declaredInStock, 1);
  assert.equal(health.products[0]?.stage, "LAUNCH READY", "most advanced first");
  assert.equal(health.products[0]?.href, "/admin/products/1", "a product opens its Reality 3D workspace");
  assert.equal(health.products[0]?.cmsHref, "/cms/collections/products/1");
  assert.equal(health.products.find((row) => row.id === 1)?.blockers, 0);
});

test("an unreachable CMS is reported as unreachable, never as an empty catalog", () => {
  const health = unreachableCatalog("down", NOW);
  assert.equal(health.reachable, false);
  assert.equal(health.problem, "down");
  const items = deriveAttention({ issues: [], catalog: health, heldForMaterial: 0, inventory: QUIET_INVENTORY });
  const unreachable = items.find((item) => item.id === "catalog:unreachable");
  assert.equal(unreachable?.severity, "high");
  assert.ok(!items.some((item) => item.id.startsWith("catalog:") && item !== unreachable), "no catalog counts from an unread CMS");
  // Capability blockers come from the decision ledger, not the CMS, so they still show.
  assert.equal(
    items.some((item) => item.id === "capability:limitations"),
    health.capability.missingLimitations.length > 0,
  );
});

/* ------------------------------------------------------------------ *
 * Action centre
 * ------------------------------------------------------------------ */

/** Stock counts, all quiet unless overridden. */
const counts = (overrides: Partial<StockCounts> = {}): StockCounts => ({
  items: 0,
  tracked: 0,
  notTracked: 0,
  outOfStock: 0,
  lowStock: 0,
  reorderRequired: 0,
  noReorderLevel: 0,
  missingCost: 0,
  valueOfCosted: 0,
  valuationComplete: false,
  ...overrides,
});

/** An inventory with definitions and nothing wrong. */
const QUIET_INVENTORY: InventorySummary = {
  ...counts({ items: 4, tracked: 4, valueOfCosted: 5000, valuationComplete: true }),
  openPurchases: 0,
  suppliers: 1,
  byGroup: {
    RAW_MATERIAL: counts({ items: 2, tracked: 2, valueOfCosted: 3000, valuationComplete: true }),
    FINISHED_PRODUCT: counts({ items: 1, tracked: 1, valueOfCosted: 1500, valuationComplete: true }),
    CONSUMABLE: counts({ items: 1, tracked: 1, valueOfCosted: 500, valuationComplete: true }),
  },
};
const NO_INVENTORY: InventorySummary = {
  ...counts(),
  openPurchases: 0,
  suppliers: 0,
  byGroup: { RAW_MATERIAL: counts(), FINISHED_PRODUCT: counts(), CONSUMABLE: counts() },
};

const emptyCatalog = summariseCatalog({ products: [], mediaLibrary: 0, priceApprovals: 0, capability: NO_BLOCKERS, now: NOW });

function issue(kind: OpsIssue["kind"], severity: OpsIssue["severity"], id: string): OpsIssue {
  return {
    id: `${kind}:${id}`,
    kind,
    severity,
    title: kind,
    detail: "",
    href: `/admin/orders/${id}`,
    subject: id,
    since: NOW.toISOString(),
    demo: false,
  };
}

test("with nothing in any condition, the action centre is empty", () => {
  assert.deepEqual(deriveAttention({ issues: [], catalog: emptyCatalog, heldForMaterial: 0, inventory: QUIET_INVENTORY }), []);
});

test("an uninitialized inventory is one honest line, not a list of empty shelves", () => {
  const items = deriveAttention({ issues: [], catalog: emptyCatalog, heldForMaterial: 0, inventory: NO_INVENTORY });
  assert.deepEqual(items.map((item) => item.id), ["inventory:uninitialized"]);
  assert.equal(items[0]?.href, "/admin/inventory");
});

test("inventory conditions: per kind, material outages are urgent; untracked is a missing count, never out of stock", () => {
  const items = deriveAttention({
    issues: [],
    catalog: emptyCatalog,
    heldForMaterial: 0,
    inventory: {
      ...QUIET_INVENTORY,
      ...counts({ items: 12, tracked: 8, notTracked: 4, outOfStock: 2, lowStock: 3, missingCost: 3 }),
      openPurchases: 2,
      byGroup: {
        RAW_MATERIAL: counts({ items: 6, tracked: 4, notTracked: 2, outOfStock: 1, lowStock: 1 }),
        FINISHED_PRODUCT: counts({ items: 2, tracked: 1, notTracked: 1 }),
        CONSUMABLE: counts({ items: 4, tracked: 3, notTracked: 1, outOfStock: 1, lowStock: 2, missingCost: 3 }),
      },
    },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  assert.equal(byId.get("inventory:raw:out")?.severity, "high");
  assert.equal(byId.get("inventory:raw:out")?.title, "Raw material out of stock");
  assert.equal(byId.get("inventory:raw:out")?.href, "/admin/inventory?tab=raw&status=OUT_OF_STOCK");
  assert.equal(byId.get("inventory:raw:reorder")?.count, 1);
  assert.equal(byId.get("inventory:consumables:out")?.severity, "medium");
  assert.equal(byId.get("inventory:consumables:reorder")?.count, 2);
  assert.equal(byId.get("inventory:consumables:reorder")?.href, "/admin/inventory?tab=consumables&status=REORDER");
  assert.equal(byId.has("inventory:finished:out"), false, "no line for a condition with no records");
  assert.equal(byId.get("inventory:untracked")?.title, "Missing opening quantity");
  assert.equal(byId.get("inventory:untracked")?.count, 4);
  assert.equal(byId.get("inventory:untracked")?.severity, "low");
  assert.equal(byId.get("inventory:untracked")?.href, "/admin/inventory?status=NOT_TRACKED");
  assert.equal(byId.get("inventory:cost")?.count, 3);
  assert.equal(byId.get("inventory:purchases")?.href, "/admin/inventory?tab=purchases");
  assert.equal(items[0]?.id, "inventory:raw:out");
});

test("the action centre counts issues by kind, ranks by severity, and links only to real destinations", () => {
  const catalog = summariseCatalog({
    products: [
      { doc: product(3, { approvalStatus: "proposed" }), status: status("READY FOR REVIEW") },
      { doc: product(4, { price: 450, priceStatus: "provisional", availability: "in-stock" }), status: status("NOT READY", { media: "MISSING" }) },
      { doc: product(6, { price: 90, priceStatus: "provisional" }), status: status("NOT READY", { media: "PROPOSED" }) },
    ],
    mediaLibrary: 0,
    priceApprovals: 0,
    capability: { ...NO_BLOCKERS, missingLimitations: ["minimum wall thickness"] },
    now: NOW,
  });

  const items = deriveAttention({
    issues: [
      issue("ready_unshipped", "low", "S3D-1"),
      issue("ready_unshipped", "low", "S3D-2"),
      issue("payment_failed", "high", "S3D-3"),
      issue("job_on_hold", "medium", "S3D-4"),
    ],
    catalog,
    heldForMaterial: 1,
    inventory: QUIET_INVENTORY,
  });

  const byId = new Map(items.map((item) => [item.id, item]));
  assert.equal(byId.get("issue:ready_unshipped")?.count, 2);
  assert.equal(byId.get("issue:ready_unshipped")?.title, "Orders needing dispatch");
  assert.equal(byId.get("issue:ready_unshipped")?.href, "/admin/orders?stage=ready");
  assert.equal(byId.get("issue:payment_failed")?.href, "/admin/issues?kind=payment_failed");
  assert.equal(byId.get("catalog:review")?.href, "/admin/products/3", "one product opens that product's workspace");
  assert.equal(byId.get("catalog:review")?.cms, false);
  assert.equal(byId.get("catalog:prices")?.count, 2);
  assert.equal(byId.get("catalog:media")?.count, 2);
  assert.match(byId.get("catalog:media")?.detail ?? "", /1 product has no image; 1 product has an image without/);
  assert.equal(byId.get("inventory:material-hold")?.severity, "high");
  assert.equal(byId.get("capability:limitations")?.href, "/admin/catalog#capability");

  const ranks = items.map((item) => ({ high: 0, medium: 1, low: 2 })[item.severity]);
  assert.deepEqual([...ranks].sort(), ranks, "most severe first");

  // Every destination is a Reality 3D Admin page that exists.
  const ROUTES = [
    /^\/admin\/issues\?kind=[a-z_]+$/,
    /^\/admin\/orders\?stage=[a-z]+$/,
    /^\/admin\/catalog(\?view=[a-z]+|#capability)?$/,
    /^\/admin\/inventory(\?(tab=[a-z]+&)?status=[A-Z_]+|\?tab=purchases)?$/,
    /^\/admin\/settings$/,
    /^\/admin\/products\/\d+$/,
  ];
  for (const item of items) {
    assert.ok(ROUTES.some((route) => route.test(item.href)), `${item.id} links to ${item.href}`);
  }
});

test("several products awaiting approval open the filtered catalog, not one of them", () => {
  const catalog = summariseCatalog({
    products: [
      { doc: product(3), status: status("READY FOR REVIEW") },
      { doc: product(7), status: status("READY FOR REVIEW") },
    ],
    mediaLibrary: 0,
    priceApprovals: 0,
    capability: NO_BLOCKERS,
    now: NOW,
  });
  const review = deriveAttention({ issues: [], catalog, heldForMaterial: 0, inventory: QUIET_INVENTORY }).find((item) => item.id === "catalog:review");
  assert.equal(review?.count, 2);
  assert.equal(review?.href, "/admin/catalog?view=review");
  assert.equal(review?.cms, false);
});
