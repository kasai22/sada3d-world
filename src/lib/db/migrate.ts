import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Schema migration.
 *
 * The committed SQL in `migrations/` is the only way the application's tables
 * change. `drizzle-kit push` is deliberately not part of any workflow: pushing
 * compares a laptop's schema against a server's and applies the difference,
 * which is a code review nobody performed.
 *
 * Payload migrates its own CMS tables separately, with its own migration
 * command. Two owners, one database, and neither generator ever sees the
 * other's tables.
 *
 * Run with `npm run db:migrate`, which is a deploy step and not something a
 * request can trigger.
 */

/** Absolute path to the committed migrations, resolved from this file. */
export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

/**
 * Applies every migration that has not been applied yet.
 *
 * Idempotent: Drizzle records what it has run in its own journal table, so
 * running this against an up-to-date database does nothing. Safe on a fresh
 * database and safe on an existing one, which is the whole requirement.
 */
export async function migrateDatabase(): Promise<void> {
  const { getDatabase } = await import("./client");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  const database = await getDatabase();
  await migrate(database as never, { migrationsFolder: MIGRATIONS_DIR });
}
