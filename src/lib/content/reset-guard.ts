/**
 * Whether `npm run content:reset` may run in this environment.
 *
 * ── Why a guard, and why it is pure ──────────────────────────────────────
 *
 * The reset deletes catalog content. It is a development tool, and the one
 * outcome that must be impossible is running it against a production database
 * by accident — a stale shell variable, a copied command, a CI step. So the
 * decision is a pure function of the environment, tested on its own, and the
 * CLI does nothing destructive until it has returned `allowed: true`.
 *
 * Every refusal is a hard failure with its reasons listed. There is no flag
 * that overrides a production signal: a production reset is not a thing this
 * command does.
 */

export interface ResetEnvironment {
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  SADA_ENV?: string;
  APP_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  DATABASE_URL?: string;
  CONTENT_RESET_CONFIRM?: string;
}

export type ResetDecision =
  | { allowed: true; database: string }
  | { allowed: false; reasons: string[] };

/** The exact value that confirms intent. Not "yes", not "1". */
export const RESET_CONFIRMATION = "YES";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Host and database name only — never the user or password. */
export function describeDatabase(url: string | undefined): string {
  if (!url) return "(none)";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export function assessResetEnvironment(env: ResetEnvironment): ResetDecision {
  const reasons: string[] = [];

  const production = (value: string | undefined) => value?.trim().toLowerCase() === "production";

  if (production(env.NODE_ENV)) reasons.push("NODE_ENV is production.");
  if (production(env.VERCEL_ENV)) reasons.push("VERCEL_ENV is production.");
  if (env.VERCEL?.trim() === "1") {
    reasons.push("This is running inside a Vercel deployment; resets run from a developer machine only.");
  }
  if (production(env.SADA_ENV)) reasons.push("SADA_ENV is production.");
  if (production(env.APP_ENV)) reasons.push("APP_ENV is production.");

  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      const host = new URL(site).hostname;
      if (!LOCAL_HOSTS.has(host)) {
        reasons.push(
          `NEXT_PUBLIC_SITE_URL points at ${host}, a deployed origin. A development environment serves localhost.`,
        );
      }
    } catch {
      reasons.push("NEXT_PUBLIC_SITE_URL is not a valid URL, so the environment cannot be identified.");
    }
  }

  if (!env.DATABASE_URL?.trim()) reasons.push("DATABASE_URL is not set.");

  if (env.CONTENT_RESET_CONFIRM !== RESET_CONFIRMATION) {
    reasons.push(
      `CONTENT_RESET_CONFIRM is not ${RESET_CONFIRMATION}. Set it for this one command to confirm the reset.`,
    );
  }

  return reasons.length > 0
    ? { allowed: false, reasons }
    : { allowed: true, database: describeDatabase(env.DATABASE_URL) };
}
