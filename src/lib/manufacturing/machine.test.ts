import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANCELLABLE_STATES,
  FAILABLE_STATES,
  availableEvents,
  transitionManufacturingState,
} from "./machine";
import { CUSTOMER_STAGES, TERMINAL_STATES, type ManufacturingEventType, type ManufacturingState } from "./types";
import {
  customerStage,
  furthestStageReached,
  orderEvents,
  stageIndex,
  toCustomerTracking,
} from "./customer";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const ALL_STATES: ManufacturingState[] = [
  "queued",
  "design_review",
  "file_preparation",
  "material_preparation",
  "scheduled",
  "printing",
  "post_processing",
  "quality_check",
  "rework",
  "approved",
  "packaging",
  "ready_for_dispatch",
  "completed",
  "cancelled",
  "failed",
];

const ALL_EVENTS: ManufacturingEventType[] = [
  "JOB_QUEUED",
  "DESIGN_REVIEW_STARTED",
  "DESIGN_APPROVED",
  "FILE_PREPARED",
  "MATERIAL_PREPARED",
  "JOB_SCHEDULED",
  "PRINT_STARTED",
  "PRINT_COMPLETED",
  "POST_PROCESSING_COMPLETED",
  "QUALITY_STARTED",
  "QUALITY_APPROVED",
  "QUALITY_REJECTED",
  "REWORK_STARTED",
  "REWORK_COMPLETED",
  "PACKAGING_STARTED",
  "PACKAGING_COMPLETED",
  "READY_FOR_DISPATCH",
  "JOB_COMPLETED",
  "JOB_FAILED",
  "JOB_CANCELLED",
];

/** Walks a sequence, asserting each step is accepted. */
function walk(
  from: ManufacturingState,
  events: readonly ManufacturingEventType[],
): ManufacturingState {
  let state = from;

  for (const event of events) {
    const result = transitionManufacturingState(state, event);
    assert.ok(result.ok, `${event} was refused while ${state}: ${result.ok ? "" : result.reason}`);
    state = result.state;
  }

  return state;
}

const NORMAL: ManufacturingEventType[] = [
  "DESIGN_REVIEW_STARTED",
  "DESIGN_APPROVED",
  "FILE_PREPARED",
  "MATERIAL_PREPARED",
  "PRINT_STARTED",
  "PRINT_COMPLETED",
  "POST_PROCESSING_COMPLETED",
  "QUALITY_APPROVED",
  "PACKAGING_STARTED",
  "PACKAGING_COMPLETED",
  "JOB_COMPLETED",
];

/* ------------------------------------------------------------------ *
 * The normal path
 * ------------------------------------------------------------------ */

test("the normal path runs from queued to completed", () => {
  assert.equal(walk("queued", NORMAL), "completed");
});

test("the normal path visits every production state in order", () => {
  const seen: ManufacturingState[] = ["queued"];
  let state: ManufacturingState = "queued";

  for (const event of NORMAL) {
    const result = transitionManufacturingState(state, event);
    assert.ok(result.ok);
    state = result.state;
    seen.push(state);
  }

  assert.deepEqual(seen, [
    "queued",
    "design_review",
    "file_preparation",
    "material_preparation",
    "scheduled",
    "printing",
    "post_processing",
    "quality_check",
    "approved",
    "packaging",
    "ready_for_dispatch",
    "completed",
  ]);
});

test("the scheduler and the materials desk report the same transition", () => {
  assert.equal(
    walk("material_preparation", ["JOB_SCHEDULED"]),
    walk("material_preparation", ["MATERIAL_PREPARED"]),
  );
});

test("inspection can be entered by either event", () => {
  assert.equal(
    walk("post_processing", ["QUALITY_STARTED"]),
    walk("post_processing", ["POST_PROCESSING_COMPLETED"]),
  );
});

/* ------------------------------------------------------------------ *
 * Rework
 * ------------------------------------------------------------------ */

test("a rejected part returns through post-processing to inspection", () => {
  const state = walk("quality_check", [
    "QUALITY_REJECTED",
    "REWORK_COMPLETED",
    "POST_PROCESSING_COMPLETED",
  ]);

  assert.equal(state, "quality_check");
});

test("a reworked part can then be approved and completed", () => {
  const state = walk("quality_check", [
    "QUALITY_REJECTED",
    "REWORK_COMPLETED",
    "POST_PROCESSING_COMPLETED",
    "QUALITY_APPROVED",
    "PACKAGING_STARTED",
    "PACKAGING_COMPLETED",
    "JOB_COMPLETED",
  ]);

  assert.equal(state, "completed");
});

test("rework does not skip straight back to inspection", () => {
  const result = transitionManufacturingState("rework", "POST_PROCESSING_COMPLETED");
  assert.equal(result.ok, false);
});

test("the rework cycle can repeat", () => {
  let state: ManufacturingState = "quality_check";

  for (let i = 0; i < 3; i += 1) {
    state = walk(state, [
      "QUALITY_REJECTED",
      "REWORK_COMPLETED",
      "POST_PROCESSING_COMPLETED",
    ]);
    assert.equal(state, "quality_check");
  }
});

/* ------------------------------------------------------------------ *
 * Invalid transitions
 * ------------------------------------------------------------------ */

test("a queued job cannot start printing", () => {
  assert.equal(transitionManufacturingState("queued", "PRINT_STARTED").ok, false);
});

test("packaging cannot go back to design review", () => {
  assert.equal(
    transitionManufacturingState("packaging", "DESIGN_REVIEW_STARTED").ok,
    false,
  );
});

test("a completed job cannot be reopened", () => {
  for (const event of ALL_EVENTS) {
    const result = transitionManufacturingState("completed", event);
    if (result.ok) {
      assert.equal(result.changed, false, `${event} reopened a completed job`);
    }
  }
});

test("a cancelled job cannot be reopened", () => {
  for (const event of ALL_EVENTS) {
    const result = transitionManufacturingState("cancelled", event);
    if (result.ok) assert.equal(result.changed, false, `${event} reopened it`);
  }
});

test("a failed job cannot be reopened", () => {
  for (const event of ALL_EVENTS) {
    const result = transitionManufacturingState("failed", event);
    if (result.ok) assert.equal(result.changed, false, `${event} reopened it`);
  }
});

test("a refusal explains itself", () => {
  const result = transitionManufacturingState("queued", "PRINT_STARTED");
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.reason.length > 10);
});

/* ------------------------------------------------------------------ *
 * Idempotency
 * ------------------------------------------------------------------ */

test("a milestone reported twice moves the job once", () => {
  const first = transitionManufacturingState("printing", "PRINT_COMPLETED");
  assert.ok(first.ok && first.changed);

  const second = transitionManufacturingState(first.state, "PRINT_COMPLETED");
  assert.ok(second.ok);
  assert.equal(second.ok && second.changed, false);
  assert.equal(second.ok && second.state, "post_processing");
});

test("queueing an already queued job changes nothing", () => {
  const result = transitionManufacturingState("queued", "JOB_QUEUED");
  assert.ok(result.ok);
  assert.equal(result.changed, false);
});

/* ------------------------------------------------------------------ *
 * Cancellation
 * ------------------------------------------------------------------ */

test("cancellation is allowed exactly where the policy says", () => {
  for (const state of CANCELLABLE_STATES) {
    const result = transitionManufacturingState(state, "JOB_CANCELLED");
    assert.ok(result.ok, `${state} should be cancellable`);
    assert.equal(result.state, "cancelled");
  }
});

test("a job on a machine or past it cannot be cancelled", () => {
  const late: ManufacturingState[] = [
    "printing",
    "post_processing",
    "quality_check",
    "rework",
    "approved",
    "packaging",
    "ready_for_dispatch",
  ];

  for (const state of late) {
    assert.equal(
      transitionManufacturingState(state, "JOB_CANCELLED").ok,
      false,
      `${state} was cancellable`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Failure
 * ------------------------------------------------------------------ */

test("every active state can fail", () => {
  for (const state of FAILABLE_STATES) {
    const result = transitionManufacturingState(state, "JOB_FAILED");
    assert.ok(result.ok, `${state} could not fail`);
    assert.equal(result.state, "failed");
  }
});

test("a terminal state cannot fail", () => {
  for (const state of TERMINAL_STATES) {
    const result = transitionManufacturingState(state, "JOB_FAILED");
    if (state === "failed") {
      assert.ok(result.ok && !result.changed);
    } else {
      assert.equal(result.ok, false, `${state} was allowed to fail`);
    }
  }
});

test("an unrecoverable rejection fails rather than reworking", () => {
  const result = transitionManufacturingState("quality_check", "JOB_FAILED");
  assert.ok(result.ok);
  assert.equal(result.state, "failed");
});

/* ------------------------------------------------------------------ *
 * Properties
 * ------------------------------------------------------------------ */

test("no terminal state has a path back to an active state", () => {
  for (const state of TERMINAL_STATES) {
    assert.deepEqual(
      availableEvents(state),
      [],
      `${state} offered a way forward`,
    );
  }
});

test("every non-terminal state has at least one path forward", () => {
  for (const state of ALL_STATES) {
    if (TERMINAL_STATES.includes(state)) continue;
    assert.ok(
      availableEvents(state).length > 0,
      `${state} is a dead end`,
    );
  }
});

test("every non-terminal state can reach completion", () => {
  // Breadth-first over the graph the machine actually allows.
  const reaches = (start: ManufacturingState): boolean => {
    const seen = new Set<ManufacturingState>([start]);
    const queue: ManufacturingState[] = [start];

    while (queue.length > 0) {
      const state = queue.shift();
      if (!state) break;
      if (state === "completed") return true;

      for (const event of availableEvents(state)) {
        if (event === "JOB_FAILED" || event === "JOB_CANCELLED") continue;
        const result = transitionManufacturingState(state, event);
        if (result.ok && !seen.has(result.state)) {
          seen.add(result.state);
          queue.push(result.state);
        }
      }
    }

    return false;
  };

  for (const state of ALL_STATES) {
    if (TERMINAL_STATES.includes(state)) continue;
    assert.ok(reaches(state), `${state} cannot reach completion`);
  }
});

test("every state maps to exactly one customer stage", () => {
  for (const state of ALL_STATES) {
    const stage = customerStage(state);
    if (state === "cancelled" || state === "failed") {
      assert.equal(stage, null, `${state} should have no stage`);
      continue;
    }
    assert.ok(stage, `${state} has no customer stage`);
    assert.ok(CUSTOMER_STAGES.includes(stage), `${state} mapped outside the six`);
  }
});

test("finishing maps back to preparing, as the canonical mapping specifies", () => {
  // Documented rather than asserted away: post-processing is preparing work,
  // so the *current* stage steps back after printing. The timeline is driven by
  // furthestStageReached so nothing the customer was told un-happens.
  assert.equal(customerStage("printing"), "printing");
  assert.equal(customerStage("post_processing"), "preparing");
});

test("the furthest stage reached never moves backwards along the normal path", () => {
  const events: { to: ManufacturingState }[] = [];
  let state: ManufacturingState = "queued";
  let previous = -1;

  for (const event of NORMAL) {
    const result = transitionManufacturingState(state, event);
    assert.ok(result.ok);
    state = result.state;
    events.push({ to: state });

    const next = stageIndex(furthestStageReached(events as never));
    assert.ok(next >= previous, `${state} moved the timeline backwards`);
    previous = next;
  }

  assert.equal(furthestStageReached(events as never), "ready_to_ship");
});

test("a part in rework keeps the stages it has already been through", () => {
  const events = [
    { to: "printing" },
    { to: "post_processing" },
    { to: "quality_check" },
    { to: "rework" },
  ] as never;

  assert.equal(furthestStageReached(events), "quality_check");
  assert.equal(customerStage("rework"), "quality_check");
});

/* ------------------------------------------------------------------ *
 * Customer projection
 * ------------------------------------------------------------------ */

const job = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "job_1",
    orderItemId: "item_1",
    orderReference: "S3D-000001",
    state: "printing" as ManufacturingState,
    events: [
      {
        id: "e1",
        type: "PRINT_STARTED" as ManufacturingEventType,
        occurredAt: "2026-09-01T10:00:00.000Z",
        actor: "operator-7",
        note: "Machine 3, chamber at 60C",
        from: "scheduled" as ManufacturingState,
        to: "printing" as ManufacturingState,
      },
    ],
    qualityResult: "pending" as const,
    reworkCount: 0,
    machineId: "M-03",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  }) as never;

test("the customer projection carries no operator note, actor or machine", () => {
  const tracking = toCustomerTracking(job());
  const serialised = JSON.stringify(tracking);

  assert.ok(!serialised.includes("operator-7"), "an actor leaked");
  assert.ok(!serialised.includes("chamber"), "an operator note leaked");
  assert.ok(!serialised.includes("M-03"), "a machine identifier leaked");
  assert.ok(!serialised.includes("PRINT_STARTED"), "an internal event type leaked");
});

test("the customer projection invents no estimate", () => {
  assert.equal(toCustomerTracking(job()).estimatedCompletionAt, undefined);
});

test("an estimate is carried through when one genuinely exists", () => {
  const tracking = toCustomerTracking(
    job({ estimatedCompletionAt: "2026-09-05T00:00:00.000Z" }),
  );
  assert.equal(tracking.estimatedCompletionAt, "2026-09-05T00:00:00.000Z");
});

test("an unclassified hold is not shown to the customer", () => {
  const tracking = toCustomerTracking(
    job({ hold: { reason: "other", startedAt: "2026-09-01T11:00:00.000Z" } }),
  );
  assert.equal(tracking.hold, undefined);
});

test("a machine issue reaches the customer as a production issue", () => {
  const tracking = toCustomerTracking(
    job({ hold: { reason: "machine_issue", startedAt: "2026-09-01T11:00:00.000Z" } }),
  );
  assert.equal(tracking.hold?.reason, "production_issue");
});

test("a resolved hold is not shown", () => {
  const tracking = toCustomerTracking(
    job({
      hold: {
        reason: "machine_issue",
        startedAt: "2026-09-01T11:00:00.000Z",
        resolvedAt: "2026-09-01T12:00:00.000Z",
      },
    }),
  );
  assert.equal(tracking.hold, undefined);
});

test("a cancelled job has no customer stage", () => {
  assert.equal(toCustomerTracking(job({ state: "cancelled" })).stage, null);
});

test("events are ordered by time, then by the order they were recorded", () => {
  const events = [
    { id: "b", occurredAt: "2026-09-01T10:00:00.000Z" },
    { id: "a", occurredAt: "2026-09-01T09:00:00.000Z" },
    { id: "c", occurredAt: "2026-09-01T10:00:00.000Z" },
  ] as never;

  assert.deepEqual(
    orderEvents(events).map((event) => event.id),
    ["a", "b", "c"],
  );
});

test("scheduling is recorded internally and not shown to the customer", () => {
  const tracking = toCustomerTracking(
    job({
      events: [
        {
          id: "e1",
          type: "JOB_SCHEDULED",
          occurredAt: "2026-09-01T10:00:00.000Z",
          from: "material_preparation",
          to: "scheduled",
        },
      ],
    }),
  );

  assert.equal(tracking.history.length, 0);
});

test("a customer event carries no internal id", () => {
  /*
   * Internal event ids are built as `${jobId}_${index}_${type}`, so passing one
   * through would put QUALITY_REJECTED into the page as a React key — the exact
   * vocabulary the customer message is worded to avoid.
   */
  const tracking = toCustomerTracking(
    job({
      state: "rework",
      events: [
        {
          id: "job_S3D-000001_i1_3_QUALITY_REJECTED",
          type: "QUALITY_REJECTED",
          occurredAt: "2026-09-01T10:00:00.000Z",
          actor: "operations",
          note: "Layer shift on the left flange.",
          from: "quality_check",
          to: "rework",
        },
      ],
    }),
  );

  const [event] = tracking.history;
  assert.ok(event);

  const serialised = JSON.stringify(tracking);
  for (const internal of [
    "QUALITY_REJECTED",
    "job_S3D-000001",
    "operations",
    "Layer shift",
  ]) {
    assert.ok(
      !serialised.includes(internal),
      `${internal} crossed the customer boundary`,
    );
  }
});

test("customer event ids are stable and unique across a history", () => {
  const tracking = toCustomerTracking(
    job({
      events: [
        {
          id: "x_0_DESIGN_APPROVED",
          type: "DESIGN_APPROVED",
          occurredAt: "2026-09-01T10:00:00.000Z",
          from: "design_review",
          to: "file_preparation",
        },
        // Discarded: it tells the customer nothing. The numbering must not skip.
        {
          id: "x_1_JOB_SCHEDULED",
          type: "JOB_SCHEDULED",
          occurredAt: "2026-09-01T11:00:00.000Z",
          from: "material_preparation",
          to: "scheduled",
        },
        {
          id: "x_2_PRINT_STARTED",
          type: "PRINT_STARTED",
          occurredAt: "2026-09-01T12:00:00.000Z",
          from: "scheduled",
          to: "printing",
        },
      ],
    }),
  );

  const ids = tracking.history.map((event) => event.id);
  assert.deepEqual(ids, ["ev_1", "ev_2"]);
  assert.equal(new Set(ids).size, ids.length);
});
