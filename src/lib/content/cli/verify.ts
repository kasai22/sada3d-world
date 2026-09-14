import { loadEnvForCli } from "@/lib/env";

import { exitWhenFlushed } from "./exit";

import { printVerification, verifyContent } from "../verification";

// See the note in db/cli/migrate.ts: a tsx process loads no .env of its own.
loadEnvForCli();

/**
 * `npm run content:verify`
 *
 * Proves Payload matches the canonical catalog and that nothing published is
 * BLOCKING. Exits non-zero unless it prints both "0 blocking" and
 * "PARITY PASS". `CATALOG_SOURCE=payload` should not be set on a deployment
 * whose database does not pass this.
 *
 * Read-only. It never writes to Payload.
 *
 * Also prints the launch verdicts — technical, commercial, media, manufacturing,
 * launch. A catalog that is not launch-ready still exits zero, because that is
 * the expected state before launch; pass `--require-launch` (a release gate)
 * to make NOT READY exit non-zero as well.
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
  const { loadPayloadCatalogUncached } = await import("@/lib/catalog/payload-source");

  const payload = await getPayload({ config });
  const report = await verifyContent(payload, loadPayloadCatalogUncached);

  printVerification(report);

  if (!report.ok) process.exitCode = 1;
  if (process.argv.includes("--require-launch") && !report.readiness.launch.ready) {
    console.error("\n--require-launch: the catalog is not launch-ready.");
    process.exitCode = 1;
  }
  await payload.destroy();
}

await main();
exitWhenFlushed();
