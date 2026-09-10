import { loadEnvForCli } from "@/lib/env";
import { sweepDesignStorage } from "@/lib/account/design-files";
import { closeDatabase, databaseConfigured } from "@/lib/db/client";

import { storageStatus } from "../index";

loadEnvForCli();

/**
 * `npm run storage:sweep [limit]`
 *
 * Reconciles design storage with the database: closes uploads nobody finished,
 * and removes objects for refused and deleted designs once they are due and no
 * order references them. Safe to run at any time and any number of times — it
 * is what a scheduled job would call.
 *
 * Prints counts only.
 */
async function main(): Promise<void> {
  if (!databaseConfigured()) {
    console.error("BLOCKED  DATABASE_URL is not set.");
    process.exitCode = 2;
    return;
  }

  const status = storageStatus();
  if (!status.configured) {
    console.error("BLOCKED  Cloudflare R2 is not configured:");
    for (const problem of status.problems) console.error(`  · ${problem}`);
    process.exitCode = 2;
    return;
  }

  const limit = Number(process.argv[2] ?? "200");
  const report = await sweepDesignStorage({
    limit: Number.isInteger(limit) && limit > 0 ? limit : 200,
  });

  console.log(
    `Abandoned uploads closed: ${report.abandoned}\n` +
      `Objects removed:          ${report.removed}\n` +
      `Retained for orders:      ${report.retained}\n` +
      `Removals to retry:        ${report.failed}`,
  );

  if (report.failed > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error("Sweep failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
