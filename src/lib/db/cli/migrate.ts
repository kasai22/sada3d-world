import { loadEnvForCli } from "@/lib/env";

import { closeDatabase, databaseConfigured, databaseUrl } from "../client";
import { migrateDatabase } from "../migrate";

/*
 * First, before anything asks for a variable. Next loads `.env` for the
 * application; a plain `tsx` process does not, which is why this command used
 * to report DATABASE_URL missing on a machine where `npm run dev` connected
 * fine.
 */
loadEnvForCli();

/**
 * `npm run db:migrate`
 *
 * Applies the committed migrations for the application's own tables. Payload
 * migrates its CMS tables separately with `npm run payload:migrate`; both run
 * against the same database and neither touches the other's tables.
 *
 * A deploy step. Nothing a request can reach.
 */
async function main(): Promise<void> {
  if (!databaseConfigured()) {
    console.error(
      "DATABASE_URL is not set. Add it to .env or .env.local, or export it " +
        "in this shell, then run this again.",
    );
    process.exitCode = 1;
    return;
  }

  /*
   * Whether the target is a transaction pooler, judged by the connection itself
   * rather than by the name of the variable holding it. Supabase's Supavisor
   * runs transaction pooling on 6543, which cannot reliably run DDL: statements
   * land on different backend sessions and a migration is not a set of
   * independent statements.
   *
   * The same pooler host on 5432 is session mode — one backend for the life of
   * the connection — which runs DDL like a direct connection. It is also the
   * only way in from an IPv4-only network, because the direct host
   * (db.<project>.supabase.co) publishes an IPv6 address alone.
   *
   * Checked here rather than assumed from `DATABASE_URL_UNPOOLED`, because a
   * variable's name is a claim about its contents and this needs the contents.
   */
  const url = databaseUrl();
  if (url) {
    try {
      const target = new URL(url);
      if (target.port === "6543") {
        console.error(
          "This connection is a transaction pooler (port 6543). DDL cannot be " +
            "applied reliably through one. Point DATABASE_URL at the session " +
            "pooler (same host, port 5432) or the direct connection " +
            "(db.<project>.supabase.co:5432) for migrations.",
        );
        process.exitCode = 1;
        return;
      }
    } catch {
      // Unparseable: let the driver produce the real error rather than guessing.
    }
  }

  console.log("Applying application migrations…");
  await migrateDatabase();
  console.log("Done. Payload's own tables migrate with: npm run payload:migrate");
}

try {
  await main();
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
