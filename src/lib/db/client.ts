import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { appSchema } from "./schema";

/**
 * The database connection.
 *
 * ── The seam ─────────────────────────────────────────────────────────────
 *
 * A provider, in the same shape as this codebase's other infrastructure
 * boundaries — the payment adapter, the model storage adapter, the auth
 * adapter. Production resolves node-postgres against `DATABASE_URL`; the tests
 * install a provider backed by PGlite, which is PostgreSQL itself compiled to
 * WebAssembly, so the constraints, transactions and migrations they exercise
 * are the real ones rather than an emulation of them.
 *
 * There is one database and one dialect. The provider decides how it is
 * reached, never what it is.
 *
 * ── Not configured ───────────────────────────────────────────────────────
 *
 * Reaching the database is *lazy*. Importing this module connects to nothing,
 * so a build with no `DATABASE_URL` succeeds and a page that never touches
 * customer data never opens a connection.
 *
 * When it is asked for and cannot be reached, what happens depends on where:
 *
 *   production   a hard failure, loudly. Falling back to an in-process store
 *                would mean a customer saving an address into memory that the
 *                next request, on the next instance, cannot see. Silent data
 *                loss is worse than a failed deploy.
 *   development  the caller is told it is unavailable and the Phase 13
 *                in-process stores answer instead, so the application runs
 *                without a database on a laptop.
 *
 * This is the same rule the payment adapter already holds: a build that names
 * infrastructure it cannot reach fails rather than quietly substituting a fake.
 */

/**
 * Every table this application owns.
 *
 * Typed as the driver-agnostic supertype so node-postgres and PGlite both
 * satisfy it — a repository is written once and runs against whichever is
 * connected.
 */
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof appSchema>;

export interface DatabaseProvider {
  /** Surfaced in diagnostics and in the unavailable message. */
  readonly name: string;
  database(): Promise<AppDatabase>;
  close(): Promise<void>;
}

export class DatabaseUnavailableError extends Error {}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

export function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}

/** Whether this process has somewhere durable to write. */
export function databaseConfigured(): boolean {
  return override !== null || databaseUrl() !== undefined;
}

/* ------------------------------------------------------------------ *
 * The node-postgres provider
 * ------------------------------------------------------------------ */

interface PostgresState {
  pool: unknown;
  database: AppDatabase;
}

const GLOBAL_KEY = "__sada3d_database__";

/**
 * Held on globalThis so a development reload reuses one pool.
 *
 * Without this, every hot reload opens another pool and the connection limit is
 * reached long before anything else goes wrong.
 */
function cached(): { current?: PostgresState } {
  const globals = globalThis as unknown as Record<
    string,
    { current?: PostgresState } | undefined
  >;
  const existing = globals[GLOBAL_KEY];
  if (existing) return existing;

  const created: { current?: PostgresState } = {};
  globals[GLOBAL_KEY] = created;
  return created;
}

export const postgresProvider: DatabaseProvider = {
  name: "postgres",

  async database(): Promise<AppDatabase> {
    const store = cached();
    if (store.current) return store.current.database;

    const url = databaseUrl();
    if (!url) {
      throw new DatabaseUnavailableError(
        "DATABASE_URL is not set, so there is nowhere durable to read or write.",
      );
    }

    /*
     * Imported here rather than at module scope. `pg` opens sockets and has no
     * business being pulled into a bundle that may never touch the database —
     * and a page that does not read customer data should not carry the driver.
     */
    const [{ Pool }, { drizzle }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
    ]);

    const pool = new Pool({
      connectionString: url,
      /*
       * Serverless invocations are many and short. A large per-instance pool
       * multiplies across instances and exhausts the server's connection limit;
       * the pooled connection string is what does the real pooling.
       */
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    const database = drizzle(pool, { schema: appSchema }) as unknown as AppDatabase;
    store.current = { pool, database };
    return database;
  },

  async close(): Promise<void> {
    const store = cached();
    const pool = store.current?.pool;
    store.current = undefined;

    if (pool && typeof pool === "object" && "end" in pool) {
      await (pool as { end: () => Promise<void> }).end();
    }
  },
};

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

let override: DatabaseProvider | null = null;

/**
 * Installs a provider, replacing the default.
 *
 * For tests, which run against PGlite. Production never calls it — there is no
 * request that can reach it and no environment variable that selects one.
 */
export function setDatabaseProvider(provider: DatabaseProvider | null): void {
  override = provider;
}

export function resolveDatabaseProvider(): DatabaseProvider {
  return override ?? postgresProvider;
}

/**
 * The database, or a refusal.
 *
 * Callers that can degrade use `databaseConfigured()` first. Callers that
 * cannot let this throw: an unreachable database is not a condition to paper
 * over with an empty list, because an empty list looks exactly like a customer
 * whose records have been lost.
 */
export async function getDatabase(): Promise<AppDatabase> {
  return resolveDatabaseProvider().database();
}

export async function closeDatabase(): Promise<void> {
  await resolveDatabaseProvider().close();
}
