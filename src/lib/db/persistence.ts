import { DatabaseUnavailableError, databaseConfigured } from "./client";

/**
 * Which store answers.
 *
 * One decision, made once, so addresses and saved items can never disagree
 * about where a customer's records live.
 *
 *   DATABASE_URL set        PostgreSQL. The durable store, everywhere.
 *   not set, development    the Phase 13 in-process store, so the application
 *                           runs on a laptop with no database.
 *   not set, production     a hard failure.
 *
 * The production case is the one that matters. An in-process fallback there
 * would mean a customer saves an address, the next request reaches a different
 * instance, and the address is gone — with nothing in any log to say so. A
 * deployment that cannot reach its database should fail while someone is
 * watching, which is the same rule the payment adapter already holds about
 * substituting a mock provider for a real one.
 */

export type PersistenceMode = "postgres" | "memory";

export function persistenceMode(): PersistenceMode {
  if (databaseConfigured()) return "postgres";

  if (process.env.NODE_ENV === "production") {
    throw new DatabaseUnavailableError(
      "DATABASE_URL is not set. Customer records have nowhere durable to live, " +
        "and an in-process store is not a substitute in production.",
    );
  }

  return "memory";
}

/**
 * Warns once per process that customer data is not durable.
 *
 * Once, because this is read on every account request and a line per request
 * would bury everything else. It is a development-only path, and the message
 * says what it costs rather than merely that it happened.
 */
let warned = false;

export function warnMemoryPersistence(): void {
  if (warned) return;
  warned = true;

  console.warn(
    "[sada3d] DATABASE_URL is not set. Addresses and saved items are being " +
      "kept in this process only and will be lost when it restarts. " +
      "Set DATABASE_URL to use PostgreSQL.",
  );
}

/**
 * Resolves a repository once and reuses it.
 *
 * The repositories are stateless — they resolve a connection per call — so one
 * instance per process is correct and avoids re-deciding on every request.
 */
export function memoize<T>(create: () => T): () => T {
  let value: T | undefined;

  return () => {
    if (value === undefined) value = create();
    return value;
  };
}
