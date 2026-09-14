import {
  recordsEqual,
  resolveLedger,
  validateDecisionRecord,
  type DecisionLedger,
  type DecisionRecord,
} from "./decisions";

/**
 * Bulk intake of business decisions — `npm run content:decisions`.
 *
 * Pure: given the committed ledger and a submitted batch, it says exactly what
 * would happen. The CLI writes only what this returns, and only when nothing
 * was rejected.
 *
 * ── Rules ────────────────────────────────────────────────────────────────
 *
 *   · Every record is validated against the ledger schema. A malformed record
 *     is rejected with every reason, never repaired.
 *   · A record identical to one already in the ledger is a duplicate: skipped,
 *     so submitting the same batch twice changes nothing.
 *   · A record reusing an existing id with different content is rejected. The
 *     ledger is append-only; a changed decision is a new record, later date.
 *   · A record that would conflict with another on the same date (same kind and
 *     subject, different outcome) is rejected rather than withholding both.
 *   · Nothing is inferred. A batch cannot approve anything it does not state as
 *     an APPROVED record with a reference, an approver and a date.
 *   · All or nothing: one rejection and the batch is not applied.
 */

export type IntakeOutcome = "accepted" | "duplicate" | "rejected";

export interface IntakeRecordResult {
  recordId: string;
  outcome: IntakeOutcome;
  /** Present when rejected. */
  reasons: string[];
  /** For accepted records: the effective decision for its kind and subject, before and after. */
  effect?: { key: string; before: string; after: string };
}

export interface IntakePlan {
  results: IntakeRecordResult[];
  counts: Record<IntakeOutcome, number>;
  /** True only when at least one record is accepted and none is rejected. */
  applicable: boolean;
  /** The ledger to write when applicable; the current ledger otherwise. */
  ledger: DecisionLedger;
}

const describe = (record: DecisionRecord | undefined) =>
  record ? `${record.decision} (${record.id}, ${record.approval.approvedOn})` : "NO DECISION";

/** Accepts `{ schemaVersion: 1, decisions: [...] }` or a bare array of records. */
export function planDecisionIntake(
  current: DecisionLedger,
  submitted: unknown,
  limitationTopics: ReadonlySet<string>,
): IntakePlan {
  const results: IntakeRecordResult[] = [];
  const batch = Array.isArray(submitted)
    ? submitted
    : typeof submitted === "object" && submitted !== null && (submitted as DecisionLedger).schemaVersion === 1 &&
        Array.isArray((submitted as DecisionLedger).decisions)
      ? (submitted as DecisionLedger).decisions
      : undefined;

  if (!batch) {
    return finish(current, [
      { recordId: "(input)", outcome: "rejected", reasons: ["Input must be a decisions array or a ledger with schemaVersion 1."] },
    ], []);
  }

  const existing = new Map(current.decisions.map((record) => [record.id, record]));
  const candidates: DecisionRecord[] = [];

  for (const raw of batch) {
    const issues = validateDecisionRecord(raw, limitationTopics);
    const recordId = issues[0]?.recordId ?? (raw as DecisionRecord).id;

    if (issues.length > 0) {
      results.push({ recordId, outcome: "rejected", reasons: issues.map((issue) => issue.message) });
      continue;
    }

    const record = raw as DecisionRecord;
    const stored = existing.get(record.id);
    if (stored) {
      results.push(
        recordsEqual(stored, record)
          ? { recordId, outcome: "duplicate", reasons: [] }
          : {
              recordId,
              outcome: "rejected",
              reasons: ["This id is already in the ledger with different content. Decisions are append-only: submit a new record with a later date."],
            },
      );
      continue;
    }

    const earlier = candidates.find((candidate) => candidate.id === record.id);
    if (earlier) {
      results.push(
        recordsEqual(earlier, record)
          ? { recordId, outcome: "duplicate", reasons: [] }
          : { recordId, outcome: "rejected", reasons: ["The batch contains two different records with this id."] },
      );
      continue;
    }

    candidates.push(record);
    results.push({ recordId, outcome: "accepted", reasons: [] });
  }

  // Conflicts only show once the batch is combined with the ledger.
  const before = resolveLedger(current, limitationTopics);
  const after = resolveLedger({ ...current, decisions: [...current.decisions, ...candidates] }, limitationTopics);
  const known = new Set(before.issues.map((issue) => `${issue.recordId}|${issue.message}`));
  const introduced = after.issues.filter((issue) => !known.has(`${issue.recordId}|${issue.message}`));

  for (const result of results) {
    if (result.outcome !== "accepted") continue;
    const record = candidates.find((candidate) => candidate.id === result.recordId)!;
    const key = `${record.kind}::${record.subject}`;
    const conflict = introduced.find((issue) => issue.message.includes(`${record.kind} ${record.subject} on ${record.approval.approvedOn}`));
    if (conflict) {
      result.outcome = "rejected";
      result.reasons = [conflict.message];
      continue;
    }
    result.effect = {
      key: `${record.kind} ${record.subject}`,
      before: describe(before.effective.get(key)),
      after: describe(after.effective.get(key)),
    };
  }

  return finish(current, results, candidates);
}

function finish(current: DecisionLedger, results: IntakeRecordResult[], candidates: DecisionRecord[]): IntakePlan {
  const counts = { accepted: 0, duplicate: 0, rejected: 0 };
  for (const result of results) counts[result.outcome] += 1;
  const applicable = counts.rejected === 0 && counts.accepted > 0;
  return {
    results,
    counts,
    applicable,
    ledger: applicable ? { ...current, decisions: [...current.decisions, ...candidates] } : current,
  };
}
