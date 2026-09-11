import { createClient } from "@supabase/supabase-js";

import { postgresCustomerDirectory } from "@/lib/account/customers";
import { closeDatabase, databaseConfigured } from "@/lib/db/client";
import { loadEnvForCli } from "@/lib/env";

import { readSupabaseAuthConfig } from "../config";

loadEnvForCli();

/**
 * `npm run auth:verify` — checks the real Supabase Auth project.
 *
 * The test suite runs the adapter against a stand-in for the provider. This
 * talks to the project itself:
 *
 *   always           the project answers, with this anon key, and reports
 *                    whether email sign-up is enabled and whether it requires
 *                    confirmation
 *   with test users  for each of two existing, confirmed accounts: sign in,
 *                    validate the session, refresh it, map it to a customer
 *                    twice (the same id), sign out, and confirm the old access
 *                    token is refused afterwards. Then that the two accounts are
 *                    two different customers.
 *
 * Test users are supplied, never created here:
 *
 *   AUTH_VERIFY_A_EMAIL, AUTH_VERIFY_A_PASSWORD
 *   AUTH_VERIFY_B_EMAIL, AUTH_VERIFY_B_PASSWORD
 *
 * Set them in the shell for one run rather than in a committed file. Output
 * carries PASS / FAIL / SKIP, provider error codes and masked addresses — never
 * a password, a token or a full email. Exit code: 0 passed, 1 a check failed,
 * 2 not configured (BLOCKED).
 *
 * This does not replace a real browser: it cannot follow an emailed link, and
 * it does not exercise cookies, the proxy or the pages. See `lib/auth/README.md`.
 */

let failures = 0;

function pass(name: string, detail?: string): void {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail: string): void {
  failures += 1;
  console.log(`FAIL  ${name} — ${detail}`);
}

function skip(name: string, detail: string): void {
  console.log(`SKIP  ${name} — ${detail}`);
}

function mask(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

async function verifyAccount(
  label: string,
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<string | null> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session || !signIn.data.user) {
    fail(`${label}: sign in (${mask(email)})`, signIn.error?.code ?? "no session returned");
    return null;
  }
  pass(`${label}: sign in (${mask(email)})`, signIn.data.user.email_confirmed_at ? "email confirmed" : "email NOT confirmed");

  const accessToken = signIn.data.session.access_token;
  const subject = signIn.data.user.id;

  const user = await client.auth.getUser(accessToken);
  if (user.error || user.data.user?.id !== subject) {
    fail(`${label}: session validates with the provider`, user.error?.code ?? "different user");
  } else {
    pass(`${label}: session validates with the provider`);
  }

  const refreshed = await client.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) {
    fail(`${label}: session refresh`, refreshed.error?.code ?? "no session");
  } else {
    pass(`${label}: session refresh`);
  }

  let customerId: string | null = null;
  if (databaseConfigured()) {
    const directory = postgresCustomerDirectory();
    const first = await directory.resolve("supabase", subject);
    const second = await directory.resolve("supabase", subject);
    if (first === second) {
      customerId = first;
      pass(`${label}: maps to one customer`, "repeated resolution returned the same id");
    } else {
      fail(`${label}: maps to one customer`, "two different ids for one user");
    }
  } else {
    skip(`${label}: customer mapping`, "DATABASE_URL is not set");
  }

  const currentToken = refreshed.data.session?.access_token ?? accessToken;
  const signOut = await client.auth.signOut({ scope: "local" });
  if (signOut.error) {
    fail(`${label}: sign out`, signOut.error.code ?? "error");
  } else {
    pass(`${label}: sign out`);
  }

  const afterSignOut = await client.auth.getUser(currentToken);
  if (afterSignOut.error) {
    pass(`${label}: signed-out session is refused`, afterSignOut.error.code ?? "refused");
  } else {
    fail(`${label}: signed-out session is refused`, "the provider still accepted the access token");
  }

  return customerId;
}

async function main(): Promise<void> {
  const config = readSupabaseAuthConfig();

  if (config.status !== "configured") {
    console.error("BLOCKED  Supabase Auth is not configured for this process:");
    const problems =
      config.status === "absent" ? config.missing.map((name) => `${name} is not set.`) : config.problems;
    for (const problem of problems) console.error(`  · ${problem}`);
    process.exitCode = 2;
    return;
  }

  const { url, anonKey } = config.config;

  const settingsResponse = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anonKey },
  }).catch(() => null);

  if (!settingsResponse?.ok) {
    fail("project reachable with the anon key", `HTTP ${settingsResponse?.status ?? "no response"}`);
  } else {
    const settings = (await settingsResponse.json()) as {
      external?: { email?: boolean };
      disable_signup?: boolean;
      mailer_autoconfirm?: boolean;
    };
    pass("project reachable with the anon key");
    console.log(
      `      email provider: ${settings.external?.email ? "enabled" : "DISABLED"} · ` +
        `sign-up: ${settings.disable_signup ? "DISABLED" : "open"} · ` +
        `email confirmation: ${settings.mailer_autoconfirm ? "NOT required" : "required"}`,
    );
    if (!settings.external?.email) fail("email/password sign-in is enabled", "enable the Email provider");
  }

  const a = { email: process.env.AUTH_VERIFY_A_EMAIL, password: process.env.AUTH_VERIFY_A_PASSWORD };
  const b = { email: process.env.AUTH_VERIFY_B_EMAIL, password: process.env.AUTH_VERIFY_B_PASSWORD };

  if (!a.email || !a.password || !b.email || !b.password) {
    skip(
      "two-account session checks",
      "set AUTH_VERIFY_A_EMAIL/PASSWORD and AUTH_VERIFY_B_EMAIL/PASSWORD for two confirmed test accounts",
    );
  } else {
    const idA = await verifyAccount("account A", url, anonKey, a.email, a.password);
    const idB = await verifyAccount("account B", url, anonKey, b.email, b.password);

    if (idA && idB) {
      if (idA !== idB) pass("A and B are different customers");
      else fail("A and B are different customers", "both mapped to one customer id");
    }
  }

  console.log(failures === 0 ? "\nAll auth checks that ran passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`Auth verification could not run — ${error instanceof Error ? error.name : "unknown"}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
