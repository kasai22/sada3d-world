import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { AppDatabase, DatabaseProvider } from "./client";
import { MIGRATIONS_DIR } from "./migrate";
import { appSchema } from "./schema";

/**
 * A real PostgreSQL for the tests.
 *
 * PGlite is PostgreSQL itself compiled to WebAssembly — the same engine, the
 * same planner, the same constraint machinery — running in-process and writing
 * to a directory. It is not a mock and not an emulation, which is what makes it
 * worth using here: a partial unique index either holds or it does not, and an
 * in-memory fake would answer that question by agreeing with whatever the
 * repository did.
 *
 * It also makes durability testable. The database is a directory, so a test can
 * close the connection, open the same directory again and assert that the row
 * is still there — which is the actual claim Phase 14 is making.
 *
 * **Test support only.** This file is imported by tests and by nothing else:
 * `@electric-sql/pglite` is a devDependency and would not exist in a production
 * install. Nothing under `src/app` or `src/components` may import it.
 */

export interface TestDatabase extends DatabaseProvider {
  /** The directory the database lives in, so a test can reopen it. */
  readonly directory: string;
  /** Closes the connection and deletes the directory. */
  destroy(): Promise<void>;
}

interface Open {
  client: PGlite;
  database: AppDatabase;
}

/**
 * Opens a PGlite database and applies the committed migrations.
 *
 * The same migration files the production runner applies. A test that passed
 * against hand-written DDL would be testing DDL nobody deploys.
 */
export async function createTestDatabase(
  directory?: string,
): Promise<TestDatabase> {
  const dir = directory ?? mkdtempSync(join(tmpdir(), "sada3d-db-"));

  let open: Open | null = null;

  async function ensure(): Promise<Open> {
    if (open) return open;

    const client = new PGlite(dir);
    const database = drizzle(client, {
      schema: appSchema,
    }) as unknown as AppDatabase;

    await migrate(database as never, { migrationsFolder: MIGRATIONS_DIR });

    open = { client, database };
    return open;
  }

  return {
    name: "pglite",
    directory: dir,

    async database(): Promise<AppDatabase> {
      return (await ensure()).database;
    },

    async close(): Promise<void> {
      const current = open;
      open = null;
      await current?.client.close();
    },

    async destroy(): Promise<void> {
      const current = open;
      open = null;
      await current?.client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
