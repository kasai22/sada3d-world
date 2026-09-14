/**
 * Stated facts — the vocabulary of the commercial catalog definition.
 *
 * Every commercial or manufacturing input is recorded with the state it is
 * actually in, because a schema field with a value in it reads as true whether
 * or not anybody decided it:
 *
 *   KNOWN      verified from the repository: a measured model file, a constant
 *              the software enforces. True, but not a business decision.
 *   PROPOSED   written for review. PROPOSED — REQUIRES BUSINESS APPROVAL.
 *   MISSING    nobody has supplied it. Carries no value, by construction.
 *   APPROVED   decided by Reality 3D, with a reference and a date.
 *   BLOCKED    cannot be approved as things stand; the note says why.
 *
 * `validateFact` refuses an APPROVED fact without a reference and a MISSING
 * fact with a value, so the states cannot be used decoratively.
 */

export type FactState = "KNOWN" | "PROPOSED" | "MISSING" | "APPROVED" | "BLOCKED";

export interface ApprovalReference {
  /** Where the decision is recorded. */
  reference: string;
  /** ISO date, YYYY-MM-DD. */
  approvedOn: string;
  /** A role or a name. Never invented. */
  approvedBy: string;
}

export type Fact<T> =
  | { state: "KNOWN"; value: T; source: string }
  | { state: "PROPOSED"; value: T; source: string }
  | { state: "MISSING"; note: string }
  | { state: "APPROVED"; value: T; approval: ApprovalReference }
  | { state: "BLOCKED"; value?: T; note: string };

export const known = <T>(value: T, source: string): Fact<T> => ({ state: "KNOWN", value, source });
export const proposed = <T>(value: T, source: string): Fact<T> => ({ state: "PROPOSED", value, source });
export const missing = <T>(note: string): Fact<T> => ({ state: "MISSING", note });

/** The fact's value when it has one. */
export function factValue<T>(fact: Fact<T>): T | undefined {
  return "value" in fact ? fact.value : undefined;
}

/** Whether a business may act on the fact: decided, or verified from the repository. */
export function isSettled(fact: Fact<unknown>, { allowKnown }: { allowKnown: boolean }): boolean {
  return fact.state === "APPROVED" || (allowKnown && fact.state === "KNOWN");
}

/** A one-line, human rendering used by the docs and the CLI. */
export function describeFact(fact: Fact<unknown>, render: (value: never) => string = String): string {
  switch (fact.state) {
    case "MISSING":
      return `MISSING — ${fact.note}`;
    case "BLOCKED":
      return `BLOCKED — ${fact.note}`;
    case "APPROVED":
      return `APPROVED — ${render(fact.value as never)} (${fact.approval.reference}, ${fact.approval.approvedOn})`;
    case "PROPOSED":
      return `PROPOSED — ${render(fact.value as never)}`;
    case "KNOWN":
      return `KNOWN — ${render(fact.value as never)}`;
  }
}

/** Every reason a fact is not a well-formed record. Empty means it is. */
export function validateFact(fact: Fact<unknown>, subject: string): string[] {
  const problems: string[] = [];
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;

  if (fact.state === "APPROVED") {
    const { reference, approvedOn, approvedBy } = fact.approval;
    if (!reference?.trim() || !approvedBy?.trim() || !isoDate.test(approvedOn ?? "")) {
      problems.push(`${subject} is marked APPROVED without a reference, approver and ISO date.`);
    }
  }
  if ((fact.state === "KNOWN" || fact.state === "PROPOSED") && !fact.source?.trim()) {
    problems.push(`${subject} is ${fact.state} without a source.`);
  }
  if ((fact.state === "MISSING" || fact.state === "BLOCKED") && !fact.note?.trim()) {
    problems.push(`${subject} is ${fact.state} without a note saying what is needed.`);
  }
  if (fact.state === "MISSING" && "value" in fact) {
    problems.push(`${subject} is MISSING but carries a value.`);
  }
  return problems;
}
