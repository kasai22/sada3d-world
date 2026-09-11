import { sql } from "drizzle-orm";

import { supabaseAuthConfigured } from "@/lib/auth/config";
import { databaseConfigured, getDatabase } from "@/lib/db/client";
import { EVENTS, log } from "@/lib/observability";
import { readR2Config } from "@/lib/storage/config";

/**
 * Readiness: whether this instance can serve customers.
 *
 * ── What it reports ──────────────────────────────────────────────────────
 *
 * Booleans, and nothing that describes the infrastructure behind them. No host,
 * no bucket, no variable values, no error text, no version — a readiness
 * endpoint is public, and "database: false" is all an operator's monitor needs
 * while being nothing an attacker can use.
 *
 * ── What "ready" means ───────────────────────────────────────────────────
 *
 *   database   configured, and answered `SELECT 1` within the timeout
 *   storage    R2 configuration is present and well-formed (not reachability:
 *              a probe of the bucket on every readiness check would spend
 *              Class B operations for a question the verify CLI answers)
 *   auth       Supabase Auth configuration is present and well-formed
 *
 * In production all three are required: orders, custom parts and accounts each
 * depend on one, and an instance missing any of them would accept a request it
 * cannot complete. In development only the database is, because the
 * application is meant to run on a laptop without R2 or Supabase.
 */

/** A database that has not answered `SELECT 1` in this long is not ready. */
export const READINESS_DATABASE_TIMEOUT_MS = 3_000;

export interface ReadinessReport {
  ready: boolean;
  checks: {
    database: boolean;
    storage: boolean;
    auth: boolean;
  };
}

async function databaseAnswers(timeoutMs: number): Promise<boolean> {
  if (!databaseConfigured()) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });

  const ping = (async () => {
    const db = await getDatabase();
    await db.execute(sql`select 1`);
    return true as const;
  })().catch((error: unknown) => {
    log.warn(EVENTS.readinessFailed, {
      check: "database",
      error: error instanceof Error ? error.name : "unknown",
    });
    return false as const;
  });

  try {
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness(
  options: { production?: boolean; timeoutMs?: number } = {},
): Promise<ReadinessReport> {
  const production = options.production ?? process.env.NODE_ENV === "production";

  const checks = {
    database: await databaseAnswers(options.timeoutMs ?? READINESS_DATABASE_TIMEOUT_MS),
    storage: readR2Config().status === "configured",
    auth: supabaseAuthConfigured(),
  };

  const ready = production
    ? checks.database && checks.storage && checks.auth
    : checks.database;

  if (!ready) log.warn(EVENTS.readinessFailed, { check: "summary", ...checks });

  return { ready, checks };
}
