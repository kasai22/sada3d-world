import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import type {
  CustomerAuthAdapter,
  CustomerCredentialsAdapter,
} from "@/lib/account/auth-types";
import { customerDirectory } from "@/lib/account/customers";

import {
  SESSION_HINT_COOKIE,
  SESSION_HINT_OPTIONS,
  authFetch,
  hardenSessionCookie,
  isAuthCookieName,
  isSessionCookieName,
  readSupabaseAuthConfig,
} from "./config";
import {
  SUPABASE_PROVIDER,
  completeEmailLinkWithSupabase,
  requestPasswordResetWithSupabase,
  resolveSupabaseSession,
  signInWithSupabase,
  signOutWithSupabase,
  signUpWithSupabase,
  updatePasswordWithSupabase,
  type AuthClientLike,
} from "./supabase";

/**
 * Supabase Auth, bound to a Next.js request.
 *
 * ── Where the session lives ──────────────────────────────────────────────
 *
 * In cookies the server writes, with HttpOnly forced on (`hardenSessionCookie`).
 * The browser never holds an access or refresh token in script-readable
 * storage, so an injected script cannot lift a session. The consequence is
 * that the browser Supabase client is not used for authentication at all:
 * every sign-in, sign-out and password operation is a server action or route
 * handler, and `proxy.ts` refreshes tokens on navigation.
 *
 * ── Where cookies can be written ─────────────────────────────────────────
 *
 * Server actions, route handlers and the proxy can set cookies; a Server
 * Component render cannot. `setAll` therefore swallows the write when it is
 * called during render — the proxy has already refreshed the token for that
 * request, so there is nothing to lose.
 *
 * ── A client per request ─────────────────────────────────────────────────
 *
 * Created fresh for every request and never shared, as `@supabase/ssr`
 * requires: a client holds one request's cookies, and reusing it would hand one
 * customer's session to the next request.
 */

async function requestAuthClient(): Promise<AuthClientLike> {
  const result = readSupabaseAuthConfig();
  if (result.status !== "configured") {
    throw new Error("Supabase Auth is not configured.");
  }

  const store = await cookies();

  const client = createServerClient(result.config.url, result.config.anonKey, {
    // Every call bounded; see AUTH_REQUEST_TIMEOUT_MS.
    global: { fetch: authFetch },
    cookies: {
      getAll() {
        return store.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, hardenSessionCookie(options));
          }
        } catch {
          // Rendering a Server Component: cookies are read-only here, and the
          // proxy has already written this request's refreshed session.
        }
      },
    },
  });

  return client.auth;
}

async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return store.getAll().some((cookie) => isSessionCookieName(cookie.name));
}

const resolveCustomerId = (subject: string) =>
  customerDirectory.resolve(SUPABASE_PROVIDER, subject);

/**
 * One validation per request.
 *
 * The account layout, the page and the header can all ask who is signed in
 * while rendering one request; React's `cache` makes that one call to Supabase
 * rather than three.
 */
const resolveRequestSession = cache(() =>
  resolveSupabaseSession({
    hasSessionCookie,
    client: requestAuthClient,
    resolveCustomerId,
  }),
);

/** Records, for the header only, that a session now exists. */
async function markSignedIn(): Promise<void> {
  try {
    (await cookies()).set(SESSION_HINT_COOKIE, "1", SESSION_HINT_OPTIONS);
  } catch {
    // Not writable in this context; the proxy sets it on the next request.
  }
}

/**
 * Removes every auth cookie from this browser.
 *
 * Called after the provider has been asked to revoke the session, and in a
 * `finally`, so a provider outage during sign-out still leaves the browser
 * signed out.
 */
async function clearSessionCookies(): Promise<void> {
  try {
    const store = await cookies();
    for (const cookie of store.getAll()) {
      if (isAuthCookieName(cookie.name)) store.delete(cookie.name);
    }
    store.delete(SESSION_HINT_COOKIE);
  } catch {
    // Not writable in this context.
  }
}

export const supabaseCustomerAuth: CustomerAuthAdapter = {
  name: "supabase",

  async currentCustomer() {
    return (await resolveRequestSession()).session;
  },

  async sessionExpired() {
    return (await resolveRequestSession()).expired;
  },
};

export const supabaseCredentials: CustomerCredentialsAdapter = {
  name: "supabase",

  async signIn(email, password) {
    const outcome = await signInWithSupabase(
      await requestAuthClient(),
      resolveCustomerId,
      email,
      password,
    );
    if (outcome.status === "signed_in") await markSignedIn();
    return outcome;
  },

  async signUp(email, password, { emailRedirectTo }) {
    const outcome = await signUpWithSupabase(
      await requestAuthClient(),
      resolveCustomerId,
      email,
      password,
      emailRedirectTo,
    );
    if (outcome.status === "signed_in") await markSignedIn();
    return outcome;
  },

  async signOut() {
    try {
      await signOutWithSupabase(await requestAuthClient());
    } finally {
      await clearSessionCookies();
    }
  },

  async requestPasswordReset(email, { redirectTo }) {
    return requestPasswordResetWithSupabase(await requestAuthClient(), email, redirectTo);
  },

  async updatePassword(password) {
    return updatePasswordWithSupabase(await requestAuthClient(), password);
  },

  async completeEmailLink(link) {
    const outcome = await completeEmailLinkWithSupabase(
      await requestAuthClient(),
      resolveCustomerId,
      link,
    );
    if (outcome.status === "signed_in") await markSignedIn();
    return outcome;
  },
};
