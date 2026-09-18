import assert from "node:assert/strict";
import test from "node:test";

import { availableEvents, transitionManufacturingState } from "@/lib/manufacturing/machine";
import type { ManufacturingState } from "@/lib/manufacturing/types";

import { MANUFACTURING_STATE_LABEL } from "./labels";
import {
  PRODUCTION_COLUMNS,
  STALLED_AFTER_HOURS,
  columnForState,
  consoleJobEvents,
  deriveIssues,
  type IssueSignals,
  type JobSignal,
} from "./pipeline";
import {
  hrefWith,
  likePattern,
  parseDesignListQuery,
  parseOrderListQuery,
  readPage,
} from "./query";
import { operatorLoginHref, opsPathOf, safeOpsPath } from "./routes";

/**
 * The console's pure rules: how states are grouped, which buttons are offered,
 * which records count as exceptions, and how URLs are read. None of these reads
 * a database or decides a transition.
 */

const STATES = Object.keys(MANUFACTURING_STATE_LABEL) as ManufacturingState[];
const NOW = new Date("2026-09-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString();

const NO_SIGNALS: IssueSignals = {
  failedPayments: [],
  pendingPayments: [],
  jobs: [],
  failedShipments: [],
  unshippedReady: [],
  rejectedDesigns: [],
};

function job(overrides: Partial<JobSignal> = {}): JobSignal {
  return {
    jobId: "job_S3D-000001_it-1",
    orderReference: "S3D-000001",
    itemName: "bracket.stl",
    state: "printing",
    updatedAt: hoursAgo(1),
    reworkCount: 0,
    demo: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Columns and events
 * ------------------------------------------------------------------ */

test("every manufacturing state belongs to exactly one board column", () => {
  for (const state of STATES) {
    const holders = PRODUCTION_COLUMNS.filter((column) => column.states.includes(state));
    assert.equal(holders.length, 1, `${state} is in ${holders.length} columns`);
    assert.equal(columnForState(state), holders[0]?.id);
  }
});

test("the console offers one button per transition and loses none", () => {
  for (const state of STATES) {
    const offered = consoleJobEvents(state);
    const targets = (events: readonly string[]) =>
      new Set(
        events.map((event) => {
          const result = transitionManufacturingState(state, event as never);
          assert.ok(result.ok, `${event} offered from ${state} is refused by the machine`);
          return result.ok ? result.state : state;
        }),
      );

    assert.deepEqual(targets(offered), targets(availableEvents(state)), `transitions lost from ${state}`);
    assert.equal(targets(offered).size, offered.length, `${state} offers two buttons for one transition`);
  }
});

test("terminal jobs offer nothing", () => {
  for (const state of ["completed", "cancelled", "failed"] as const) {
    assert.deepEqual(consoleJobEvents(state), []);
  }
});

/* ------------------------------------------------------------------ *
 * Issues
 * ------------------------------------------------------------------ */

test("a failed payment is a high-severity issue linked to the payment section", () => {
  const [issue] = deriveIssues(
    {
      ...NO_SIGNALS,
      failedPayments: [{ reference: "S3D-000009", customerName: "Asha", since: hoursAgo(2), demo: false }],
    },
    NOW,
  );

  assert.equal(issue?.kind, "payment_failed");
  assert.equal(issue?.severity, "high");
  assert.equal(issue?.href, "/admin/orders/S3D-000009#payment");
});

test("an unpaid order is chased only after the grace period", () => {
  const issues = deriveIssues(
    {
      ...NO_SIGNALS,
      pendingPayments: [
        { reference: "S3D-000010", customerName: "New", since: hoursAgo(2), demo: false },
        { reference: "S3D-000011", customerName: "Old", since: hoursAgo(30), demo: false },
      ],
    },
    NOW,
  );

  assert.deepEqual(issues.map((issue) => issue.subject), ["S3D-000011"]);
});

test("a held job is an issue, and its silence is not reported a second time", () => {
  const issues = deriveIssues(
    {
      ...NO_SIGNALS,
      jobs: [
        job({
          hold: { reason: "material_unavailable", startedAt: hoursAgo(100) },
          updatedAt: hoursAgo(100),
        }),
      ],
    },
    NOW,
  );

  assert.deepEqual(issues.map((issue) => issue.kind), ["job_on_hold"]);
  assert.match(issues[0]?.title ?? "", /Material unavailable/);
});

test("a job past its recorded estimate is overdue, not merely quiet", () => {
  const issues = deriveIssues(
    {
      ...NO_SIGNALS,
      jobs: [job({ estimatedCompletionAt: hoursAgo(5), updatedAt: hoursAgo(STALLED_AFTER_HOURS + 10) })],
    },
    NOW,
  );

  assert.deepEqual(issues.map((issue) => issue.kind), ["job_overdue"]);
});

test("a job becomes quiet only after the stalled threshold", () => {
  const fresh = deriveIssues({ ...NO_SIGNALS, jobs: [job({ updatedAt: hoursAgo(STALLED_AFTER_HOURS - 1) })] }, NOW);
  const quiet = deriveIssues({ ...NO_SIGNALS, jobs: [job({ updatedAt: hoursAgo(STALLED_AFTER_HOURS + 1) })] }, NOW);

  assert.equal(fresh.length, 0);
  assert.deepEqual(quiet.map((issue) => [issue.kind, issue.severity]), [["job_stalled", "low"]]);
});

test("finished jobs raise nothing, and a failed one raises a high issue", () => {
  const issues = deriveIssues(
    {
      ...NO_SIGNALS,
      jobs: [
        job({ jobId: "a", state: "completed", updatedAt: hoursAgo(500) }),
        job({ jobId: "b", state: "cancelled", updatedAt: hoursAgo(500) }),
        job({ jobId: "c", state: "failed" }),
      ],
    },
    NOW,
  );

  assert.deepEqual(issues.map((issue) => issue.kind), ["job_failed"]);
});

test("issues are ordered by severity, then oldest first", () => {
  const issues = deriveIssues(
    {
      ...NO_SIGNALS,
      jobs: [
        job({ jobId: "quiet", updatedAt: hoursAgo(200) }),
        job({ jobId: "rework", state: "rework", reworkCount: 2, updatedAt: hoursAgo(3) }),
      ],
      failedPayments: [
        { reference: "S3D-000002", customerName: "B", since: hoursAgo(1), demo: false },
        { reference: "S3D-000001", customerName: "A", since: hoursAgo(9), demo: false },
      ],
    },
    NOW,
  );

  assert.deepEqual(
    issues.map((issue) => issue.id),
    ["payment_failed:S3D-000001", "payment_failed:S3D-000002", "job_rework:rework", "job_stalled:quiet"],
  );
  assert.match(issues[2]?.title ?? "", /2nd pass/);
});

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

test("order filters drop what they do not recognise and repair what they can", () => {
  const query = parseOrderListQuery({
    q: `  ${"x".repeat(100)}  `,
    status: "printing",
    payment: "paid",
    production: "held",
    from: "2026-09-10",
    to: "2026-09-01",
    customer: "cus_<script>",
    sort: "nonsense",
    page: "-4",
  });

  assert.equal(query.q?.length, 64);
  assert.equal(query.status, undefined);
  assert.equal(query.payment, "paid");
  assert.equal(query.production, "held");
  assert.deepEqual([query.from, query.to], ["2026-09-01", "2026-09-10"]);
  assert.equal(query.customer, undefined);
  assert.equal(query.sort, "placed_desc");
  assert.equal(query.page, 1);
});

test("an impossible calendar date is not a filter", () => {
  assert.equal(parseOrderListQuery({ from: "2026-02-30" }).from, undefined);
});

test("pages are clamped and format filters are normalised", () => {
  assert.equal(readPage({ page: "999999999" }), 10_000);
  assert.equal(parseDesignListQuery({ format: "stl" }).format, "STL");
  assert.equal(parseDesignListQuery({ format: "../../" }).format, undefined);
});

test("links omit empty filters and the first page", () => {
  assert.equal(hrefWith("/admin/orders", { q: "", status: "failed", page: 1 }), "/admin/orders?status=failed");
  assert.equal(hrefWith("/admin/orders", { status: "failed" }, { status: null, page: 3 }), "/admin/orders?page=3");
});

test("a search for LIKE metacharacters searches for the characters", () => {
  assert.equal(likePattern("50%_off\\"), "%50\\%\\_off\\\\%");
});

test("sign-in only ever returns to Reality 3D Admin", () => {
  assert.equal(safeOpsPath("/admin/orders?status=failed"), "/admin/orders?status=failed");
  assert.equal(safeOpsPath("/admin"), "/admin");

  for (const hostile of [
    "//evil.example",
    "/adminx",
    "/ops/orders",
    "/cms/collections/users",
    "/admin/login",
    "/admin/login?redirect=/admin",
    "https://evil.example/admin",
    "/admin/../admin",
    "/admin/%2e%2e/admin",
    "/admin\\evil",
    "/admin//evil.example",
    42,
  ]) {
    assert.equal(safeOpsPath(hostile), "/admin", String(hostile));
  }

  assert.equal(operatorLoginHref("/admin/manufacturing"), "/admin/login?redirect=%2Fadmin%2Fmanufacturing");
});

test("only admin requests carry a return path, and a hostile one is discarded", () => {
  assert.equal(opsPathOf("/admin"), "/admin");
  assert.equal(opsPathOf("/admin/orders/S3D-000184", "?status=failed"), "/admin/orders/S3D-000184?status=failed");

  // Not the admin: no header, nothing to come back to.
  assert.equal(opsPathOf("/shop"), null);
  assert.equal(opsPathOf("/adminx"), null);
  assert.equal(opsPathOf("/ops"), null, "the old console address is a redirect, not an admin page");
  assert.equal(opsPathOf("/cms"), null, "Payload's panel is not Reality 3D Admin");

  // A console path that is not safe falls back to the console home.
  assert.equal(opsPathOf("/admin/../admin"), "/admin");
  assert.equal(opsPathOf("/admin//evil.example"), "/admin");
});
