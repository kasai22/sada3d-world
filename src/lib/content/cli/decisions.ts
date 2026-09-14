import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { planDecisionIntake } from "@/content/catalog/decision-intake";
import { LIMITATION_TOPICS, resolveLedger, type DecisionLedger } from "@/content/catalog/decisions";

/**
 * `npm run content:decisions`                                  validate the committed ledger
 * `npm run content:decisions -- --input <file>`                dry run (the default)
 * `npm run content:decisions -- --input <file> --apply`        append the batch to the ledger
 * `npm run content:decisions -- --input <file> --report <out>` also write the result as JSON
 *
 * A batch is applied only when no record is rejected. The ledger is rewritten
 * atomically (temporary file, then rename), and nothing else is touched: no
 * database, no environment. Re-run `content:docs`, `content:verify` and a build
 * after applying — the storefront reads the ledger at build time.
 */

const LEDGER_PATH = resolve(process.cwd(), "src/content/catalog/decisions/business-decisions.json");
const topics = new Set(LIMITATION_TOPICS);

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const current = readJson(LEDGER_PATH) as DecisionLedger;
const input = arg("--input");

if (!input) {
  const resolved = resolveLedger(current, topics);
  console.log(`ledger: ${current.decisions?.length ?? 0} record(s), ${resolved.effective.size} effective decision(s)`);
  for (const record of resolved.effective.values()) {
    console.log(`  ${record.decision.padEnd(12)} ${record.kind} ${record.subject}  — ${record.approval.reference}`);
  }
  for (const issue of resolved.issues) console.error(`  INVALID ${issue.recordId}: ${issue.message}`);
  process.exitCode = resolved.issues.length > 0 ? 1 : 0;
} else {
  // --dry-run always wins, so a mistyped command cannot write.
  const apply = process.argv.includes("--apply") && !process.argv.includes("--dry-run");
  let submitted: unknown;
  try {
    submitted = readJson(resolve(process.cwd(), input));
  } catch (error) {
    console.error(`Cannot read ${input}: ${(error as Error).message}`);
    process.exit(1);
  }

  const plan = planDecisionIntake(current, submitted, topics);
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${input}`);
  for (const result of plan.results) {
    const effect = result.effect ? `  ${result.effect.key}: ${result.effect.before} → ${result.effect.after}` : "";
    console.log(`  ${result.outcome.toUpperCase().padEnd(9)} ${result.recordId}${effect}`);
    for (const reason of result.reasons) console.error(`            ${reason}`);
  }
  console.log(`accepted ${plan.counts.accepted}, duplicate ${plan.counts.duplicate}, rejected ${plan.counts.rejected}`);

  const report = arg("--report");
  if (report) writeFileSync(resolve(process.cwd(), report), `${JSON.stringify({ input, apply, ...plan, ledger: undefined }, null, 2)}\n`);

  if (plan.counts.rejected > 0) {
    console.error("Not applied: fix or remove every rejected record and submit the batch again.");
    process.exitCode = 1;
  } else if (!plan.applicable) {
    console.log("Nothing to apply: every record is already in the ledger.");
  } else if (apply) {
    const temporary = `${LEDGER_PATH}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(plan.ledger, null, 2)}\n`, "utf8");
    renameSync(temporary, LEDGER_PATH);
    console.log(`Applied ${plan.counts.accepted} record(s). Run content:docs, content:verify and a build.`);
  } else {
    console.log("Dry run: nothing written. Re-run with --apply to append these records.");
  }
}
