import { loadEnvForCli } from "@/lib/env";

import { importContent } from "../import";

// See the note in db/cli/migrate.ts: a tsx process loads no .env of its own.
loadEnvForCli();

/**
 * `npm run content:import`
 *
 * Imports the local typed catalog into Payload. Safe to run repeatedly: every
 * write is keyed on a stable identifier, so a second run updates what the first
 * created rather than duplicating it.
 *
 * Run the migrations first — `npm run payload:migrate` — or there are no tables
 * to write into.
 */
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      "DATABASE_URL is not set. Add it to .env or .env.local, or export it " +
        "in this shell, then run this again.",
    );
    process.exitCode = 1;
    return;
  }

  const { getPayload } = await import("payload");
  const { default: config } = await import("../../../payload.config");

  const payload = await getPayload({ config });
  const summary = await importContent(payload);

  if (summary.problems.length > 0) {
    console.error("The content plan does not hold together. Nothing was written:");
    for (const problem of summary.problems) {
      console.error(`  ${problem.subject}: ${problem.reason}`);
    }
    process.exitCode = 1;
    return;
  }

  const line = (name: string, counts: { created: number; updated: number }) =>
    `  ${name.padEnd(12)} ${counts.created} created, ${counts.updated} updated`;

  console.log("Imported:");
  console.log(line("categories", summary.categories));
  console.log(line("materials", summary.materials));
  console.log(line("products", summary.products));

  if (summary.unknown.length > 0) {
    /*
     * Reported, never deleted. A product in the CMS that the local content no
     * longer describes may be one an operator added deliberately — and deleting
     * it would break every cart and saved item that refers to it.
     */
    console.log(
      `\n${summary.unknown.length} product(s) in Payload are not in the local ` +
        `catalog and were left untouched:\n  ${summary.unknown.join(", ")}`,
    );
  }

  console.log("\nNext: npm run content:verify");
}

await main();
