import assert from "node:assert/strict";
import test from "node:test";

import ledgerFile from "./decisions/business-decisions.json";
import { planDecisionIntake } from "./decision-intake";
import {
  LEDGER,
  LIMITATION_TOPICS,
  approvedColours,
  approvedMaterials,
  approvedLayerHeights,
  isApproved,
  launchTargetDecision,
  platformFor,
  resolveLedger,
  type DecisionLedger,
  type DecisionRecord,
} from "./decisions";

/*
 * Stage 19.8: the business decision ledger and its bulk intake. The ledger is
 * the only way anything becomes approved capability, so these tests are about
 * what it refuses.
 */

const topics = new Set(LIMITATION_TOPICS);
const committed = ledgerFile as unknown as DecisionLedger;
const approval = { reference: "Test decision log #1", approvedBy: "Test approver", approvedOn: "2026-09-20" };

const record = (overrides: Partial<DecisionRecord>): DecisionRecord => ({
  id: "BD-2026-09-20-01",
  kind: "material",
  subject: "abs",
  decision: "APPROVED",
  approval,
  ...overrides,
});

const ledgerOf = (...decisions: DecisionRecord[]): DecisionLedger => ({ schemaVersion: 1, decisions });

/* ---- the committed ledger ---- */

test("the committed ledger is valid and states exactly the supplied Stage 19.8 decisions", () => {
  assert.deepEqual(LEDGER.issues, []);
  for (const material of ["pla", "petg", "tpu"]) assert.equal(isApproved("material", material), true, material);
  for (const material of ["abs", "resin"]) assert.equal(isApproved("material", material), false, material);
  assert.equal(isApproved("manufacturing-process", "fdm"), true);
  assert.equal(isApproved("manufacturing-process", "sla"), false);
  assert.deepEqual(approvedColours("pla"), ["black", "white"]);
  assert.deepEqual(approvedColours("abs"), [], "no colour is offered for an unapproved material");
  assert.deepEqual(approvedLayerHeights("fdm"), ["0.20 MM", "0.16 MM", "0.12 MM"]);
  assert.deepEqual(approvedLayerHeights("sla"), [], "no layer height is ever approved for resin");
  assert.deepEqual(platformFor("fdm")?.buildVolumeMm, { x: 256, y: 256, z: 256 });
  assert.equal(platformFor("fdm")?.printer, "Bambu Lab A1");
  assert.equal(platformFor("sla"), undefined);
  assert.equal(launchTargetDecision(), undefined, "the launch target of 12 is not an approved decision");
});

test("no geometry limit without a supplied value is approved", () => {
  const approvedLimitations = [...LEDGER.effective.values()]
    .filter((r) => r.kind === "manufacturing-limitation" && r.decision === "APPROVED")
    .map((r) => r.subject);
  assert.deepEqual(approvedLimitations, ["Maximum build volume"]);
});

test("every committed record carries a reference, an approver and a date", () => {
  for (const r of committed.decisions) {
    assert.ok(r.approval.reference.trim() && r.approval.approvedBy.trim(), r.id);
    assert.match(r.approval.approvedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
});

/* ---- validation and resolution ---- */

test("a malformed decision is rejected with every reason and approves nothing", () => {
  const resolved = resolveLedger(
    ledgerOf(
      record({ approval: { reference: "", approvedBy: "", approvedOn: "20/09/2026" } }),
      record({ id: "BD-2026-09-20-02", subject: "nylon" }),
      { ...record({ id: "BD-2026-09-20-03" }), decision: "MAYBE" as never },
    ),
    topics,
  );
  assert.equal(resolved.effective.size, 0);
  assert.ok(resolved.issues.some((i) => /approval requires/.test(i.message)));
  assert.ok(resolved.issues.some((i) => /not a material/.test(i.message)));
  assert.ok(resolved.issues.some((i) => /nothing is approved by omission/.test(i.message)));
  assert.equal(isApproved("material", "abs", resolved), false);
});

test("colours and limitations outside the vocabulary are rejected, never invented", () => {
  const resolved = resolveLedger(
    ledgerOf(
      record({ kind: "material-colours", subject: "x", values: { materials: ["pla"], colours: ["neon-pink"] } }),
      record({ id: "BD-2026-09-20-02", kind: "manufacturing-limitation", subject: "Warp-free guarantee", values: { policy: "x" } }),
      record({ id: "BD-2026-09-20-03", kind: "manufacturing-limitation", subject: "Minimum wall thickness" }),
    ),
    topics,
  );
  assert.equal(resolved.effective.size, 0);
  assert.equal(resolved.issues.length, 3);
});

test("an identical duplicate is idempotent; a different record reusing an id is withheld", () => {
  const a = record({});
  assert.equal(resolveLedger(ledgerOf(a, { ...a }), topics).issues.length, 0);
  assert.equal(isApproved("material", "abs", resolveLedger(ledgerOf(a, { ...a }), topics)), true);

  const changed = resolveLedger(ledgerOf(a, { ...a, decision: "NOT_APPROVED" }), topics);
  assert.ok(changed.issues.some((i) => /share this id/.test(i.message)));
  assert.equal(isApproved("material", "abs", changed), false);
});

test("conflicting decisions on the same date are both withheld; a later decision supersedes", () => {
  const approve = record({});
  const refuse = record({ id: "BD-2026-09-20-02", decision: "NOT_APPROVED" });
  const conflicted = resolveLedger(ledgerOf(approve, refuse), topics);
  assert.equal(conflicted.effective.has("material::abs"), false);
  assert.ok(conflicted.issues.some((i) => /neither is applied/.test(i.message)));

  const later = record({ id: "BD-2026-09-21-01", decision: "NOT_APPROVED", approval: { ...approval, approvedOn: "2026-09-21" } });
  const superseded = resolveLedger(ledgerOf(approve, later), topics);
  assert.equal(isApproved("material", "abs", superseded), false);
  assert.equal(superseded.accepted.length, 2, "the superseded record stays in the audit trail");
});

test("NOT_APPROVED blocks: an unapproved process removes its materials", () => {
  const resolved = resolveLedger(
    ledgerOf(
      record({ subject: "resin" }),
      record({ id: "BD-2026-09-20-02", kind: "manufacturing-process", subject: "sla", decision: "NOT_APPROVED" }),
    ),
    topics,
  );
  const processOf = (material: string) => (material === "resin" ? "sla" : "fdm");
  assert.deepEqual(approvedMaterials(resolved, processOf), []);
});

/* ---- bulk intake ---- */

test("intake dry run: accepted, duplicate and rejected records are each reported", () => {
  const plan = planDecisionIntake(
    committed,
    {
      schemaVersion: 1,
      decisions: [
        committed.decisions[0],
        record({ id: "BD-2026-09-20-07", subject: "abs", approval: { ...approval, reference: "" } }),
        { ...committed.decisions[1], decision: "NOT_APPROVED" },
        record({ id: "BD-2026-09-20-08", kind: "launch-target", subject: "catalog", values: { minimumLaunchReadyProducts: 3 } }),
      ],
    },
    topics,
  );
  assert.deepEqual(
    plan.results.map((r) => [r.recordId, r.outcome]),
    [
      [committed.decisions[0]!.id, "duplicate"],
      ["BD-2026-09-20-07", "rejected"],
      [committed.decisions[1]!.id, "rejected"],
      ["BD-2026-09-20-08", "accepted"],
    ],
  );
  assert.equal(plan.applicable, false, "one rejection and nothing is applied");
  assert.equal(plan.ledger, committed);
});

test("intake refuses a same-date conflict with the ledger rather than withholding the existing decision", () => {
  const pla = committed.decisions.find((r) => r.kind === "material" && r.subject === "pla")!;
  const plan = planDecisionIntake(committed, [{ ...pla, id: "BD-2026-09-14-90", decision: "NOT_APPROVED" }], topics);
  assert.equal(plan.results[0]!.outcome, "rejected");
  assert.equal(plan.applicable, false);
});

test("intake applies a clean batch once; applying it again changes nothing", () => {
  const batch = [record({ id: "BD-2026-09-20-09", kind: "launch-target", subject: "catalog", values: { minimumLaunchReadyProducts: 3 } })];
  const first = planDecisionIntake(committed, batch, topics);
  assert.equal(first.applicable, true);
  assert.equal(first.results[0]!.effect?.before, "NO DECISION");
  assert.match(first.results[0]!.effect?.after ?? "", /^APPROVED/);
  assert.equal(first.ledger.decisions.length, committed.decisions.length + 1);

  const second = planDecisionIntake(first.ledger, batch, topics);
  assert.equal(second.applicable, false);
  assert.deepEqual(second.counts, { accepted: 0, duplicate: 1, rejected: 0 });
  assert.equal(second.ledger, first.ledger);
});

test("intake rejects input that is not a decision batch", () => {
  const plan = planDecisionIntake(committed, { decisions: "everything approved" }, topics);
  assert.equal(plan.counts.rejected, 1);
  assert.equal(plan.applicable, false);
});
