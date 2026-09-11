import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";

import {
  confirmationUrl,
  normaliseEmail,
  parseEmailLink,
  passwordProblem,
} from "@/lib/account/authentication";
import type { EmailLinkType } from "@/lib/account/auth-types";
import { memoryCustomerDirectory } from "@/lib/account/customers";
import { developmentIdentityEnabled } from "@/lib/account/development";
import { resolveCredentialsAdapter, resolveCustomerAuthAdapter } from "@/lib/account/identity";
import {
  parseLoginMode,
  parseLoginStatus,
  safeReturnPath,
  signInHref,
} from "@/lib/account/routes";
import { anonymousSubject, enforceRateLimit, resetRateLimits } from "@/lib/api/rate-limit";
import { assertSameOrigin } from "@/lib/api/respond";
import { ForbiddenError, RateLimitedError } from "@/lib/errors";
import { setLogSink, type LogRecord } from "@/lib/observability";

import { isAuthCookieName, isSessionCookieName, readSupabaseAuthConfig } from "./config";
import {
  completeEmailLinkWithSupabase,
  isSessionError,
  requestPasswordResetWithSupabase,
  resolveSupabaseSession,
  signInWithSupabase,
  signOutWithSupabase,
  signUpWithSupabase,
  updatePasswordWithSupabase,
  type AuthClientLike,
  type AuthErrorLike,
  type AuthResultLike,
} from "./supabase";

/**
 * Authentication.
 *
 * The translation from Supabase Auth to the application's contract is tested
 * against a stateful stand-in for the provider: users, sessions, confirmation
 * links and recovery links that behave the way Supabase's documented responses
 * do, including its enumeration-resistant answers. That proves what this code
 * does with each response. It does not prove Supabase sends those responses —
 * `npm run auth:verify` and a real browser against the real project do that.
 */

const logs: LogRecord[] = [];

afterEach(() => {
  setLogSink(null);
  logs.length = 0;
  resetRateLimits();
});

function captureLogs(): void {
  setLogSink({ name: "capture", write: (record) => logs.push(record) });
}

const resolve = (subject: string) => memoryCustomerDirectory.resolve("supabase", subject);

/* ------------------------------------------------------------------ *
 * A stand-in for Supabase Auth
 * ------------------------------------------------------------------ */

interface ProviderUser {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
}

interface SentEmail {
  type: EmailLinkType;
  tokenHash: string;
  redirectTo?: string;
  email: string;
}

function fakeSupabase(options: { confirmEmail: boolean }) {
  const users = new Map<string, ProviderUser>();
  const sessions = new Map<string, string>();
  const links = new Map<string, { userId: string; type: EmailLinkType }>();
  const outbox: SentEmail[] = [];
  const calls: string[] = [];
  let outage: AuthErrorLike | null = null;

  const apiError = (code: string, status: number): AuthErrorLike => ({
    code,
    status,
    name: "AuthApiError",
    // Providers can echo input in messages; the adapter must never pass these on.
    message: `provider says ${code}`,
  });

  const noSession = (error: AuthErrorLike): AuthResultLike => ({
    data: { user: null, session: null },
    error,
  });

  const byId = (id: string | undefined) => [...users.values()].find((user) => user.id === id);

  const userOf = (user: ProviderUser) => ({
    id: user.id,
    email: user.email,
    email_confirmed_at: user.confirmed ? "2026-09-01T00:00:00.000Z" : null,
  });

  function send(user: ProviderUser, type: EmailLinkType, redirectTo?: string) {
    const tokenHash = randomUUID().replace(/-/g, "");
    links.set(tokenHash, { userId: user.id, type });
    outbox.push({ type, tokenHash, email: user.email, ...(redirectTo ? { redirectTo } : {}) });
  }

  /** One browser: a cookie jar holding at most one session token. */
  function browser() {
    const jar: { token?: string } = {};

    const signInAs = (user: ProviderUser): AuthResultLike => {
      const token = randomUUID();
      sessions.set(token, user.id);
      jar.token = token;
      return { data: { user: userOf(user), session: { access_token: token } }, error: null };
    };

    const auth: AuthClientLike = {
      async getUser() {
        calls.push("getUser");
        if (outage) return { data: { user: null }, error: outage };
        if (!jar.token) {
          return {
            data: { user: null },
            error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
          };
        }
        const userId = sessions.get(jar.token);
        if (!userId) return { data: { user: null }, error: apiError("session_not_found", 403) };
        const user = byId(userId);
        if (!user) return { data: { user: null }, error: apiError("user_not_found", 403) };
        return { data: { user: userOf(user) }, error: null };
      },

      async signInWithPassword({ email, password }) {
        calls.push("signIn");
        if (outage) return noSession(outage);
        const user = users.get(email);
        if (!user || user.password !== password) return noSession(apiError("invalid_credentials", 400));
        if (!user.confirmed) return noSession(apiError("email_not_confirmed", 400));
        return signInAs(user);
      },

      async signUp({ email, password, options: signUpOptions }) {
        calls.push("signUp");
        if (password.length < 8) return noSession(apiError("weak_password", 422));

        const existing = users.get(email);
        if (existing) {
          // Supabase with confirmation on: an obfuscated user and no session.
          if (options.confirmEmail) {
            return { data: { user: { id: randomUUID(), email }, session: null }, error: null };
          }
          return noSession(apiError("user_already_exists", 422));
        }

        const user: ProviderUser = { id: randomUUID(), email, password, confirmed: !options.confirmEmail };
        users.set(email, user);

        if (options.confirmEmail) {
          send(user, "signup", signUpOptions?.emailRedirectTo);
          return { data: { user: userOf(user), session: null }, error: null };
        }
        return signInAs(user);
      },

      async signOut() {
        calls.push("signOut");
        if (jar.token) sessions.delete(jar.token);
        delete jar.token;
        return { error: null };
      },

      async resetPasswordForEmail(email, resetOptions) {
        calls.push("reset");
        const user = users.get(email);
        // The same answer for an unknown address.
        if (user) send(user, "recovery", resetOptions?.redirectTo);
        return { error: null };
      },

      async updateUser({ password }) {
        calls.push("updateUser");
        const user = byId(jar.token ? sessions.get(jar.token) : undefined);
        if (!user) return { data: { user: null }, error: apiError("session_not_found", 403) };
        if (!password || password.length < 8) {
          return { data: { user: null }, error: apiError("weak_password", 422) };
        }
        if (password === user.password) {
          return { data: { user: null }, error: apiError("same_password", 422) };
        }
        user.password = password;
        return { data: { user: userOf(user) }, error: null };
      },

      async verifyOtp({ token_hash, type }) {
        calls.push("verifyOtp");
        const link = links.get(token_hash);
        if (!link || link.type !== type) return noSession(apiError("otp_expired", 403));
        links.delete(token_hash);
        const user = byId(link.userId);
        if (!user) return noSession(apiError("user_not_found", 403));
        user.confirmed = true;
        return signInAs(user);
      },

      async exchangeCodeForSession() {
        calls.push("exchangeCode");
        return noSession(apiError("flow_state_not_found", 404));
      },
    };

    const session = () =>
      resolveSupabaseSession({
        hasSessionCookie: async () => Boolean(jar.token),
        client: async () => auth,
        resolveCustomerId: resolve,
      });

    return { jar, auth, session };
  }

  return {
    users,
    outbox,
    calls,
    browser,
    setOutage(error: AuthErrorLike | null) {
      outage = error;
    },
  };
}

/* ------------------------------------------------------------------ *
 * The full lifecycle
 * ------------------------------------------------------------------ */

test("sign-up with confirmation required issues no session and provisions nobody", async () => {
  const provider = fakeSupabase({ confirmEmail: true });
  const { auth, session } = provider.browser();
  let provisioned = 0;

  const outcome = await signUpWithSupabase(
    auth,
    async (subject) => {
      provisioned += 1;
      return resolve(subject);
    },
    "new@example.com",
    "correct horse battery",
    "https://sada3d.example/auth/confirm?type=signup",
  );

  assert.equal(outcome.status, "confirmation_required");
  assert.equal(provisioned, 0, "a customer was created before the address was proved");
  assert.equal((await session()).session, null, "a session exists without confirmation");
  assert.equal(provider.outbox[0]?.redirectTo, "https://sada3d.example/auth/confirm?type=signup");

  const early = await signInWithSupabase(auth, resolve, "new@example.com", "correct horse battery");
  assert.equal(early.status, "email_not_confirmed");
});

test("confirming, signing in, restoring and signing out work end to end", async () => {
  const provider = fakeSupabase({ confirmEmail: true });
  const tab = provider.browser();

  await signUpWithSupabase(tab.auth, resolve, "flow@example.com", "correct horse battery", "https://x/confirm");
  const email = provider.outbox.find((sent) => sent.email === "flow@example.com");
  assert.ok(email);

  // The confirmation link establishes the session.
  const confirmed = await completeEmailLinkWithSupabase(tab.auth, resolve, {
    tokenHash: email.tokenHash,
    type: "signup",
  });
  assert.equal(confirmed.status, "signed_in");
  assert.ok(confirmed.status === "signed_in");

  // Restored on the next request, as the same customer, with the provider's verification state.
  const restored = await tab.session();
  assert.equal(restored.session?.identity.id, confirmed.identity.id);
  assert.equal(restored.session?.profile.emailVerified, true);

  // A link works once.
  const reused = await completeEmailLinkWithSupabase(tab.auth, resolve, {
    tokenHash: email.tokenHash,
    type: "signup",
  });
  assert.equal(reused.status, "invalid");

  // A second browser signing in is the same customer, not a second one.
  const other = provider.browser();
  const signedIn = await signInWithSupabase(other.auth, resolve, "flow@example.com", "correct horse battery");
  assert.ok(signedIn.status === "signed_in");
  assert.equal(signedIn.identity.id, confirmed.identity.id);

  // Signing out revokes the session at the provider: the old token is dead.
  const token = other.jar.token;
  await signOutWithSupabase(other.auth);
  other.jar.token = token;
  const afterSignOut = await other.session();
  assert.equal(afterSignOut.session, null);
  assert.equal(afterSignOut.expired, true);

  // The first browser is unaffected.
  assert.equal((await tab.session()).session?.identity.id, confirmed.identity.id);
});

test("with confirmation off, sign-up signs in at once", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const { auth, session } = provider.browser();

  const outcome = await signUpWithSupabase(auth, resolve, "instant@example.com", "correct horse battery", "https://x");
  assert.equal(outcome.status, "signed_in");
  assert.ok((await session()).session);
});

test("signing up with a registered address looks like signing up", async () => {
  for (const confirmEmail of [true, false]) {
    const provider = fakeSupabase({ confirmEmail });
    const { auth } = provider.browser();

    await signUpWithSupabase(auth, resolve, "taken@example.com", "correct horse battery", "https://x");
    const again = await signUpWithSupabase(auth, resolve, "taken@example.com", "another long password", "https://x");

    assert.equal(again.status, "confirmation_required", `confirmEmail=${confirmEmail}`);
  }
});

test("a wrong password and an unknown address are the same answer", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const { auth } = provider.browser();
  await signUpWithSupabase(auth, resolve, "known@example.com", "correct horse battery", "https://x");

  const wrong = await signInWithSupabase(auth, resolve, "known@example.com", "not the password");
  const unknown = await signInWithSupabase(auth, resolve, "nobody@example.com", "not the password");

  assert.deepEqual(wrong, { status: "invalid_credentials" });
  assert.deepEqual(unknown, wrong);
});

test("a weak password is refused by name, and a rate limit is reported as one", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const { auth } = provider.browser();

  const weak = await signUpWithSupabase(auth, resolve, "weak@example.com", "short", "https://x");
  assert.deepEqual(weak, { status: "rejected", reason: "weak_password" });

  provider.setOutage({ code: "over_request_rate_limit", status: 429, message: "slow down" });
  assert.deepEqual(await signInWithSupabase(auth, resolve, "weak@example.com", "whatever"), {
    status: "rate_limited",
  });
});

test("password recovery says the same thing for every address and changes the password", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const tab = provider.browser();
  await signUpWithSupabase(tab.auth, resolve, "reset@example.com", "original password", "https://x");
  await signOutWithSupabase(tab.auth);

  const known = await requestPasswordResetWithSupabase(tab.auth, "reset@example.com", "https://x/confirm?type=recovery");
  const unknown = await requestPasswordResetWithSupabase(tab.auth, "stranger@example.com", "https://x/confirm?type=recovery");
  assert.deepEqual(known, { status: "requested" });
  assert.deepEqual(unknown, known);
  assert.equal(provider.outbox.filter((sent) => sent.type === "recovery").length, 1);

  // No session: the password cannot be changed.
  assert.deepEqual(await updatePasswordWithSupabase(tab.auth, "brand new password"), { status: "no_session" });

  const recovery = provider.outbox.find((sent) => sent.type === "recovery");
  assert.ok(recovery);
  const link = await completeEmailLinkWithSupabase(tab.auth, resolve, {
    tokenHash: recovery.tokenHash,
    type: "recovery",
  });
  assert.ok(link.status === "signed_in");
  assert.equal(link.type, "recovery");

  assert.deepEqual(await updatePasswordWithSupabase(tab.auth, "original password"), {
    status: "rejected",
    reason: "same_password",
  });
  assert.deepEqual(await updatePasswordWithSupabase(tab.auth, "brand new password"), { status: "updated" });

  const fresh = provider.browser();
  assert.equal((await signInWithSupabase(fresh.auth, resolve, "reset@example.com", "original password")).status, "invalid_credentials");
  assert.equal((await signInWithSupabase(fresh.auth, resolve, "reset@example.com", "brand new password")).status, "signed_in");
});

test("a link of the wrong type, an unknown link and a failed code exchange are refused", async () => {
  const provider = fakeSupabase({ confirmEmail: true });
  const { auth } = provider.browser();
  await signUpWithSupabase(auth, resolve, "links@example.com", "correct horse battery", "https://x");
  const sent = provider.outbox[0];
  assert.ok(sent);

  assert.equal((await completeEmailLinkWithSupabase(auth, resolve, { tokenHash: sent.tokenHash, type: "recovery" })).status, "invalid");
  assert.equal((await completeEmailLinkWithSupabase(auth, resolve, { tokenHash: "forged", type: "signup" })).status, "invalid");
  assert.equal((await completeEmailLinkWithSupabase(auth, resolve, { code: "not-a-real-code" })).status, "invalid");
});

/* ------------------------------------------------------------------ *
 * Session resolution
 * ------------------------------------------------------------------ */

test("a request without a session cookie asks the provider nothing", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const { session } = provider.browser();

  const result = await session();
  assert.deepEqual(result, { session: null, expired: false });
  assert.ok(!provider.calls.includes("getUser"));
});

test("a session for a deleted user is refused as expired", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const tab = provider.browser();
  await signUpWithSupabase(tab.auth, resolve, "gone@example.com", "correct horse battery", "https://x");
  assert.ok((await tab.session()).session);

  provider.users.delete("gone@example.com");

  assert.deepEqual(await tab.session(), { session: null, expired: true });
});

test("a garbage session cookie is refused, not trusted", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const tab = provider.browser();
  tab.jar.token = "forged-token";

  assert.deepEqual(await tab.session(), { session: null, expired: true });
});

test("a provider outage signs nobody in and is not mistaken for an expired session", async () => {
  const provider = fakeSupabase({ confirmEmail: false });
  const tab = provider.browser();
  await signUpWithSupabase(tab.auth, resolve, "outage@example.com", "correct horse battery", "https://x");

  provider.setOutage({ code: "unexpected_failure", status: 500, message: "boom" });
  assert.deepEqual(await tab.session(), { session: null, expired: false });
});

test("an anonymous provider user is not a customer", async () => {
  const auth = {
    async getUser() {
      return { data: { user: { id: "anon-1", is_anonymous: true } }, error: null };
    },
  } as unknown as AuthClientLike;

  const result = await resolveSupabaseSession({
    hasSessionCookie: async () => true,
    client: async () => auth,
    resolveCustomerId: resolve,
  });

  assert.equal(result.session, null);
});

test("session errors are recognised by code and by the SDK's missing-session error", () => {
  assert.equal(isSessionError({ code: "refresh_token_not_found", message: "x" }), true);
  assert.equal(isSessionError({ name: "AuthSessionMissingError", message: "x" }), true);
  assert.equal(isSessionError({ code: "invalid_credentials", message: "x" }), false);
  assert.equal(isSessionError(null), false);
});

test("the auth lifecycle is logged by customer id and code only", async () => {
  captureLogs();
  const provider = fakeSupabase({ confirmEmail: true });
  const tab = provider.browser();

  await signUpWithSupabase(tab.auth, resolve, "private.person@example.com", "hunter2 but longer", "https://x");
  const sent = provider.outbox[0];
  assert.ok(sent);
  await completeEmailLinkWithSupabase(tab.auth, resolve, { tokenHash: sent.tokenHash, type: "signup" });
  await signInWithSupabase(tab.auth, resolve, "private.person@example.com", "wrong password here");
  await signOutWithSupabase(tab.auth);
  await requestPasswordResetWithSupabase(tab.auth, "private.person@example.com", "https://x");
  provider.setOutage({ code: "unexpected_failure", status: 500, message: "private.person@example.com failed" });
  await signInWithSupabase(tab.auth, resolve, "private.person@example.com", "hunter2 but longer");

  const serialised = JSON.stringify(logs);
  assert.ok(logs.length > 0);
  for (const secret of ["private.person", "hunter2", "wrong password", sent.tokenHash, "provider says"]) {
    assert.ok(!serialised.includes(secret), `a log line contained ${secret}`);
  }
});

/* ------------------------------------------------------------------ *
 * Configuration and adapter selection
 * ------------------------------------------------------------------ */

const jwt = (payload: object) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");

const ANON_KEY = jwt({ role: "anon", ref: "abcdefghijklmnopqrst" });
const SERVICE_KEY = jwt({ role: "service_role", ref: "abcdefghijklmnopqrst" });
const PROJECT_URL = "https://abcdefghijklmnopqrst.supabase.co";

test("Supabase configuration is validated, and a service-role key is refused", () => {
  assert.equal(readSupabaseAuthConfig({}).status, "absent");

  const good = readSupabaseAuthConfig({
    NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  });
  assert.equal(good.status, "configured");

  for (const env of [
    { NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL },
    { NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE_KEY },
    { NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abcdef" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY },
    { NEXT_PUBLIC_SUPABASE_URL: `${PROJECT_URL}/rest/v1`, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY },
    { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY, NODE_ENV: "production" },
  ]) {
    const result = readSupabaseAuthConfig(env);
    assert.equal(result.status, "invalid", JSON.stringify(Object.keys(env)));
    assert.ok(!JSON.stringify(result).includes(SERVICE_KEY), "a key reached a message");
  }

  assert.equal(
    readSupabaseAuthConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY }).status,
    "configured",
    "the local Supabase CLI was refused",
  );
});

test("session cookies are recognised by name", () => {
  assert.ok(isSessionCookieName("sb-abcdefghijklmnopqrst-auth-token"));
  assert.ok(isSessionCookieName("sb-abcdefghijklmnopqrst-auth-token.0"));
  assert.ok(!isSessionCookieName("sb-abcdefghijklmnopqrst-auth-token-code-verifier"));
  assert.ok(isAuthCookieName("sb-abcdefghijklmnopqrst-auth-token-code-verifier"));
  assert.ok(!isSessionCookieName("sada3d_session"));
  assert.ok(!isSessionCookieName("sada3d_cart"));
});

function withEnv(vars: Record<string, string | undefined>, work: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(vars)) {
    saved[name] = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    work();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("configured Supabase replaces the development identity completely", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY }, () => {
    assert.equal(resolveCustomerAuthAdapter().name, "supabase");
    assert.equal(resolveCredentialsAdapter()?.name, "supabase");
    assert.equal(developmentIdentityEnabled(), false);
  });
});

test("a broken Supabase configuration signs nobody in and does not fall back", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE_KEY }, () => {
    assert.equal(resolveCustomerAuthAdapter().name, "none");
    assert.equal(resolveCredentialsAdapter(), null);
    assert.equal(developmentIdentityEnabled(), false);
  });
});

test("without Supabase, a development build keeps the labelled development identity and no credentials", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined, SADA_DEV_ACCOUNT: undefined }, () => {
    assert.equal(resolveCustomerAuthAdapter().name, "development");
    assert.equal(resolveCredentialsAdapter(), null);
  });

  withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined, NODE_ENV: "production" }, () => {
    assert.equal(resolveCustomerAuthAdapter().name, "none");
  });
});

/* ------------------------------------------------------------------ *
 * Input, links and redirects
 * ------------------------------------------------------------------ */

test("emails and passwords are validated for shape only", () => {
  assert.equal(normaliseEmail("  Person@Example.COM "), "person@example.com");
  for (const bad of ["", "no-at", "a@b", "a b@example.com", 42, null, `${"x".repeat(250)}@example.com`]) {
    assert.equal(normaliseEmail(bad), null, String(bad));
  }

  assert.equal(passwordProblem("short", "sign_in"), null, "sign-in must not impose the new-password rule");
  assert.ok(passwordProblem("short", "new"));
  assert.equal(passwordProblem("long enough", "new"), null);
  // bcrypt reads 72 bytes; a longer password would be silently truncated.
  assert.ok(passwordProblem("é".repeat(37), "new"));
  assert.ok(passwordProblem(undefined, "sign_in"));
});

test("email links accept provider tokens and nothing else", () => {
  assert.deepEqual(parseEmailLink(new URLSearchParams("token_hash=abc123&type=recovery")), {
    tokenHash: "abc123",
    type: "recovery",
  });
  assert.deepEqual(parseEmailLink(new URLSearchParams("code=abc-123")), { code: "abc-123" });

  for (const hostile of [
    "token_hash=abc123",
    "token_hash=abc123&type=admin",
    "code=<script>",
    "code=a%20b",
    "type=signup",
    "",
  ]) {
    assert.equal(parseEmailLink(new URLSearchParams(hostile)), null, hostile);
  }
});

test("email links point at the configured site, never at the request's host", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://sada3d.example" }, () => {
    const url = new URL(confirmationUrl("recovery", "https://evil.example"));
    assert.equal(url.origin, "https://sada3d.example");
    assert.equal(url.pathname, "/auth/confirm");
    assert.equal(url.searchParams.get("type"), "recovery");
    assert.equal(url.searchParams.get("next"), null, "an unsafe return path was carried");

    const withNext = new URL(confirmationUrl("signup", "/custom-print"));
    assert.equal(withNext.searchParams.get("next"), "/custom-print");
  });
});

test("return paths are an allowlist, and open redirects are refused", () => {
  for (const safe of ["/account", "/account/orders/S3D-000001", "/custom-print", "/cart", "/checkout"]) {
    assert.equal(safeReturnPath(safe), safe);
  }

  for (const hostile of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/custom-printer",
    "/cart?next=//evil.example",
    "/checkout/../../evil",
    "/login",
    "/auth/confirm",
    "javascript:alert(1)",
    "/account\r\nLocation: https://evil.example",
  ]) {
    assert.equal(safeReturnPath(hostile), undefined, hostile);
  }

  assert.equal(signInHref("https://evil.example", { status: "expired" }), "/login?status=expired");
  assert.equal(signInHref("/cart", { mode: "signup" }), "/login?mode=signup&next=%2Fcart");
  assert.equal(parseLoginMode("admin"), "signin");
  assert.equal(parseLoginStatus("<b>hacked</b>"), undefined);
});

/* ------------------------------------------------------------------ *
 * Request protections
 * ------------------------------------------------------------------ */

const request = (headers: Record<string, string>) =>
  new Request("https://sada3d.example/api/checkout", { method: "POST", headers });

test("a state-changing API request from another site is refused", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(request({ host: "sada3d.example", origin: "https://sada3d.example" })),
  );
  assert.doesNotThrow(() => assertSameOrigin(request({ host: "sada3d.example" })));

  const refused: Record<string, string>[] = [
    { host: "sada3d.example", origin: "https://evil.example" },
    { host: "sada3d.example", origin: "null" },
    { host: "sada3d.example", "sec-fetch-site": "cross-site" },
    { host: "sada3d.example", origin: "https://sada3d.example.evil.example" },
  ];

  for (const headers of refused) {
    assert.throws(() => assertSameOrigin(request(headers)), ForbiddenError, JSON.stringify(headers));
  }
});

test("sign-in attempts are limited per address and never log the address", () => {
  captureLogs();
  const rule = { name: "auth.test", limit: 2, windowMs: 60_000 };
  const subject = anonymousSubject("email", "Target@Example.com");

  assert.equal(subject, anonymousSubject("email", "target@example.com"), "case changed the bucket");
  assert.ok(!subject.includes("target"));

  enforceRateLimit(rule, subject, 0);
  enforceRateLimit(rule, subject, 1);
  assert.throws(() => enforceRateLimit(rule, subject, 2), RateLimitedError);

  const serialised = JSON.stringify(logs);
  assert.ok(logs.some((record) => record.event === "api.rate_limited"));
  assert.ok(!serialised.includes("target"));
  assert.ok(!serialised.includes(subject), "the hashed subject was logged");
});
