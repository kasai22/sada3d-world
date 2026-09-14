import { resolve } from "node:path";

import { loadEnvForCli } from "@/lib/env";

import { exitWhenFlushed } from "./exit";

import {
  collectContentBackup,
  writeContentBackup,
  type BackupSource,
} from "../backup";
import { importContent, payloadTransactionalReferences } from "../import";
import { assessResetEnvironment } from "../reset-guard";
import { printVerification, verifyContent } from "../verification";

import { printImportSummary } from "./summary";

// See the note in db/cli/migrate.ts: a tsx process loads no .env of its own.
loadEnvForCli();

/**
 * `CONTENT_RESET_CONFIRM=YES npm run content:reset`
 *
 * DEVELOPMENT ONLY. Replaces the CMS catalog with the canonical catalog.
 *
 *   1. confirm the environment        refuses production, deployments, a
 *                                     non-local site URL, and a missing
 *                                     CONTENT_RESET_CONFIRM=YES — hard fail
 *   2. confirm the schema             every committed Payload migration applied
 *   3. back up content                every content table row and document,
 *                                     written to backups/ and read back
 *   4. audit media                    reported; nothing referenced is deleted
 *   5. reconcile in reset mode        stale products, categories and materials
 *                                     deleted, or archived when referenced
 *   6. seed the canonical catalog     drafts first-class; published only when valid
 *   7. validate and verify            the same checks as content:verify
 *   8. report
 *
 * Touches only products, categories, materials (and reads media). Customers,
 * carts, saved items, designs, orders, manufacturing, shipments, checkout,
 * auth, operators and R2 are outside it — the transactional tables are only
 * *read*, to find references.
 */
async function main(): Promise<void> {
  const decision = assessResetEnvironment(process.env);

  if (!decision.allowed) {
    console.error("content:reset REFUSED. Nothing was read or written.\n");
    for (const reason of decision.reasons) console.error(`  · ${reason}`);
    process.exitCode = 1;
    return;
  }

  console.log(`content:reset — target database ${decision.database}`);

  const { getPayload } = await import("payload");
  const { default: config } = await import("../../../payload.config");
  const { migrations } = await import("../../../payload/migrations");
  const { loadPayloadCatalogUncached } = await import("@/lib/catalog/payload-source");

  const payload = await getPayload({ config });
  const pool = (payload.db as unknown as {
    pool: { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
  }).pool;

  try {
    /* ---- 2. schema ---- */

    const applied = new Set(
      (await pool.query("select name from payload_migrations")).rows.map((row) => String(row.name)),
    );
    const pending = migrations.map((migration) => migration.name).filter((name) => !applied.has(name));
    if (pending.length > 0) {
      console.error(
        `\nREFUSED: ${pending.length} Payload migration(s) are not applied (${pending.join(", ")}).\n` +
          "Run `npm run payload:migrate` first. Nothing was written.",
      );
      process.exitCode = 1;
      return;
    }
    console.log("schema: all Payload migrations applied");

    /* ---- 3. backup ---- */

    const now = new Date();
    const source: BackupSource = {
      async listTables() {
        return (
          await pool.query(
            "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
          )
        ).rows.map((row) => String(row.table_name));
      },
      async readTable(name) {
        // `name` comes from information_schema and passed isContentTable.
        return (await pool.query(`select * from public."${name.replace(/"/g, '""')}" order by 1`)).rows;
      },
      async readDocuments() {
        const read = async (collection: "products" | "categories" | "materials" | "media") =>
          (
            await payload.find({ collection, depth: 0, pagination: false, overrideAccess: true, draft: true })
          ).docs;
        return {
          products: await read("products"),
          categories: await read("categories"),
          materials: await read("materials"),
          media: await read("media"),
          homepage: [await payload.findGlobal({ slug: "homepage", depth: 0, overrideAccess: true, draft: true })],
        };
      },
    };

    const backup = writeContentBackup(
      resolve(process.cwd(), "backups"),
      await collectContentBackup(source, decision.database, now),
      now,
    );

    console.log(`\nbackup: ${backup.file}`);
    console.log(`  sha256 ${backup.sha256}`);
    console.log(
      `  ${Object.entries(backup.counts)
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${name}=${count}`)
        .join(" · ")}`,
    );

    /* ---- 4. media ---- */

    const media = await payload.find({ collection: "media", depth: 0, pagination: false, overrideAccess: true });
    console.log(
      `\nmedia: ${media.totalDocs} document(s). ` +
        (media.totalDocs === 0
          ? "Nothing to remove. Customer design files are in R2 under customer_designs and are not part of this reset."
          : "Left in place: media is only removed once nothing references it and a replacement exists."),
    );

    /* ---- 5–6. reconcile and seed ---- */

    const summary = await importContent(payload, {
      mode: "reset",
      references: payloadTransactionalReferences(payload),
    });

    console.log("");
    if (!printImportSummary(summary)) {
      console.error(`\nThe reset stopped before writing. The backup above is intact.`);
      process.exitCode = 1;
      return;
    }

    /* ---- 7–8. verify and report ---- */

    const report = await verifyContent(payload, loadPayloadCatalogUncached);
    printVerification(report);

    if (!report.ok) {
      console.error(`\ncontent:reset finished, but verification did not pass. Backup: ${backup.file}`);
      process.exitCode = 1;
      return;
    }

    console.log(`\ncontent:reset complete. Backup: ${backup.file}`);
  } finally {
    await payload.destroy();
  }
}

await main();
exitWhenFlushed();
