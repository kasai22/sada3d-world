import { loadEnvForCli } from "@/lib/env";

import { exitWhenFlushed } from "./exit";

import { importContent } from "../import";

import { printImportSummary } from "./summary";

// See the note in db/cli/migrate.ts: a tsx process loads no .env of its own.
loadEnvForCli();

/**
 * `npm run content:import`
 *
 * Reconciles Payload to the canonical catalog in `src/content/catalog`, in sync
 * mode: canonical documents are created or updated (and left alone when
 * already identical), each with the publication status validation gave it, and
 * any product, category or material the canonical catalog does not describe is
 * unpublished. Nothing is deleted — that is `content:reset`.
 *
 * Safe to run repeatedly; a second run reports everything unchanged.
 * Run the migrations first — `npm run payload:migrate`.
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
  const summary = await importContent(payload, { mode: "sync" });

  if (!printImportSummary(summary)) process.exitCode = 1;
  else console.log("\nNext: npm run content:verify");

  await payload.destroy();
}

await main();
exitWhenFlushed();
