import { loadEnvForCli } from "@/lib/env";

import { buildParityReport } from "../verify";

// See the note in db/cli/migrate.ts: a tsx process loads no .env of its own.
loadEnvForCli();

/**
 * `npm run content:verify`
 *
 * Compares the Payload catalog against the local one and reports every
 * difference. This is the gate: `CATALOG_SOURCE=payload` should not be set on
 * any deployment until this exits zero.
 *
 * It reads Payload **uncached and with access rules applied**, so what it
 * compares is what an anonymous visitor would be served — a draft left
 * unpublished shows up here as a missing product, which is exactly the mistake
 * worth catching before the switch.
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

  const { loadPayloadCatalogUncached } = await import("@/lib/catalog/payload-source");
  const report = buildParityReport(await loadPayloadCatalogUncached());

  console.log(`local:   ${report.localCount} products`);
  console.log(`payload: ${report.payloadCount} products`);
  console.log(`queries compared: ${report.queriesCompared}`);

  if (report.missing.length > 0) {
    console.error(`\nMissing from Payload (${report.missing.length}):`);
    console.error(`  ${report.missing.join(", ")}`);
  }

  if (report.extra.length > 0) {
    console.error(`\nIn Payload but not in the local catalog (${report.extra.length}):`);
    console.error(`  ${report.extra.join(", ")}`);
  }

  if (report.differences.length > 0) {
    console.error(`\nDifferences (${report.differences.length}):`);
    for (const difference of report.differences.slice(0, 40)) {
      console.error(
        `  ${difference.subject} · ${difference.field}\n` +
          `    local:   ${JSON.stringify(difference.local)}\n` +
          `    payload: ${JSON.stringify(difference.payload)}`,
      );
    }
    if (report.differences.length > 40) {
      console.error(`  … and ${report.differences.length - 40} more`);
    }
  }

  if (report.ok) {
    console.log("\nParity holds. CATALOG_SOURCE=payload is safe to set.");
    return;
  }

  console.error("\nParity does NOT hold. Do not switch the catalog source.");
  process.exitCode = 1;
}

await main();
