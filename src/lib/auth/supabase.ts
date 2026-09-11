import type {
  CustomerSession,
  EmailLink,
  EmailLinkOutcome,
  EmailLinkType,
  PasswordResetOutcome,
  PasswordUpdateOutcome,
  SignInOutcome,
  SignUpOutcome,
} from "@/lib/account/auth-types";
import { EVENTS, log } from "@/lib/observability";

/**
 * Supabase Auth, translated into the application's contract.
 *
 * The only module that knows what a Supabase auth response looks like. It is
 * written against `AuthClientLike` — the handful of `supabase.auth` methods it
 * uses — rather than importing the SDK client, so the translation is testable
 * with a stand-in and the request wiring (cookies, React cache) lives apart in
 * `server.ts`.
 *
 * ── Authentication, not authorization ────────────────────────────────────
 *
 * What comes out of here is an identity: "this request is customer cus_…".
 * Whether that customer may read an order, a design or a file is decided by the
 * account, order and design services, exactly as before. Nothing here grants
 * access to anything.
 *
 * ── Failing closed ───────────────────────────────────────────────────────
 *
 * Every path that is not an unambiguous success from the provider — an error,
 * a response without a session, an anonymous user — resolves to "no customer".
 * There is no branch that returns an identity the provider did not confirm.
 *
 * ── What is never logged ─────────────────────────────────────────────────
 *
 * Emails, passwords, tokens, token hashes, codes and provider messages. Log
 * lines carry the provider's error *code* and, on success, the customer id.
 */

export interface AuthUserLike {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
}

export interface AuthErrorLike {
  message: string;
  code?: string;
  status?: number;
  name?: string;
}

export interface AuthResultLike {
  data: { user: AuthUserLike | null; session: object | null };
  error: AuthErrorLike | null;
}

export interface AuthClientLike {
  getUser(): Promise<{ data: { user: AuthUserLike | null }; error: AuthErrorLike | null }>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResultLike>;
  signUp(credentials: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string };
  }): Promise<AuthResultLike>;
  signOut(options?: { scope?: "global" | "local" | "others" }): Promise<{
    error: AuthErrorLike | null;
  }>;
  resetPasswordForEmail(
    email: string,
    options?: { redirectTo?: string },
  ): Promise<{ error: AuthErrorLike | null }>;
  updateUser(attributes: { password?: string }): Promise<{
    data: { user: AuthUserLike | null };
    error: AuthErrorLike | null;
  }>;
  verifyOtp(params: { token_hash: string; type: EmailLinkType }): Promise<AuthResultLike>;
  exchangeCodeForSession(code: string): Promise<AuthResultLike>;
}

/** Maps a provider user id onto the application's customer id. Idempotent. */
export type ResolveCustomerId = (subject: string) => Promise<string>;

export const SUPABASE_PROVIDER = "supabase";

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

/**
 * Codes meaning "the session this request carried is no longer valid". Anything
 * else is either a credential problem or the provider failing.
 */
const SESSION_CODES = new Set([
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
  "user_not_found",
  "no_authorization",
]);

export function isSessionError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code && SESSION_CODES.has(error.code)) return true;
  // The SDK's own error when a cookie is present but holds no usable session.
  return error.name === "AuthSessionMissingError" || error.name === "AuthInvalidJwtError";
}

function isRateLimit(error: AuthErrorLike): boolean {
  return error.status === 429 || (error.code?.startsWith("over_") ?? false);
}

/** The provider failing, recorded by code. Never the message: it can echo input. */
function providerFailure(operation: string, error: AuthErrorLike | null): void {
  log.warn(EVENTS.authProviderUnavailable, {
    operation,
    code: error?.code ?? "no_code",
    status: error?.status,
  });
}

function profileOf(customerId: string, user: AuthUserLike): CustomerSession["profile"] {
  return {
    id: customerId,
    ...(user.email ? { email: user.email } : {}),
    // The provider's own record. Never set, inferred or defaulted here.
    emailVerified: Boolean(user.email_confirmed_at),
  };
}

/* ------------------------------------------------------------------ *
 * The current session
 * ------------------------------------------------------------------ */

export interface SessionResolution {
  session: CustomerSession | null;
  /** A session was presented and the provider refused it. */
  expired: boolean;
}

/**
 * Who this request is.
 *
 * `getUser`, not `getSession`: `getSession` returns whatever the cookie says,
 * and a cookie is something the browser holds. `getUser` asks Supabase Auth to
 * validate the token, which is what makes a signed-out, revoked or deleted
 * session stop working.
 */
export async function resolveSupabaseSession(deps: {
  hasSessionCookie: () => Promise<boolean>;
  client: () => Promise<AuthClientLike>;
  resolveCustomerId: ResolveCustomerId;
}): Promise<SessionResolution> {
  // No session cookie means no session, and no network call to learn that.
  if (!(await deps.hasSessionCookie())) return { session: null, expired: false };

  const auth = await deps.client();
  const { data, error } = await auth.getUser();

  if (error || !data.user) {
    if (isSessionError(error)) {
      log.info(EVENTS.authSessionExpired, { code: error?.code ?? "session_missing" });
      return { session: null, expired: true };
    }
    providerFailure("get_user", error);
    return { session: null, expired: false };
  }

  if (data.user.is_anonymous) return { session: null, expired: false };

  const customerId = await deps.resolveCustomerId(data.user.id);

  return {
    session: {
      identity: { id: customerId },
      profile: profileOf(customerId, data.user),
    },
    expired: false,
  };
}

/* ------------------------------------------------------------------ *
 * Credentials
 * ------------------------------------------------------------------ */

export async function signInWithSupabase(
  auth: AuthClientLike,
  resolveCustomerId: ResolveCustomerId,
  email: string,
  password: string,
): Promise<SignInOutcome> {
  const { data, error } = await auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") return { status: "email_not_confirmed" };
    if (isRateLimit(error)) return { status: "rate_limited" };
    if (error.code === "invalid_credentials" || error.status === 400) {
      return { status: "invalid_credentials" };
    }
    providerFailure("sign_in", error);
    return { status: "unavailable" };
  }

  // A response without both a user and a session is not a sign-in.
  if (!data.user || !data.session || data.user.is_anonymous) {
    providerFailure("sign_in", null);
    return { status: "unavailable" };
  }

  const customerId = await resolveCustomerId(data.user.id);
  log.info(EVENTS.authSignedIn, { customerId });
  return { status: "signed_in", identity: { id: customerId } };
}

export async function signUpWithSupabase(
  auth: AuthClientLike,
  resolveCustomerId: ResolveCustomerId,
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<SignUpOutcome> {
  const { data, error } = await auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) {
    if (error.code === "weak_password") return { status: "rejected", reason: "weak_password" };
    if (error.code === "email_address_invalid" || error.code === "validation_failed") {
      return { status: "rejected", reason: "invalid_email" };
    }
    if (error.code === "signup_disabled" || error.code === "email_provider_disabled") {
      return { status: "rejected", reason: "signup_disabled" };
    }
    /*
     * Already registered. Answered exactly like a fresh sign-up, so the form
     * cannot be used to learn which addresses have accounts.
     */
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { status: "confirmation_required" };
    }
    if (isRateLimit(error)) return { status: "rate_limited" };
    providerFailure("sign_up", error);
    return { status: "unavailable" };
  }

  if (data.user && data.session && !data.user.is_anonymous) {
    const customerId = await resolveCustomerId(data.user.id);
    log.info(EVENTS.authSignedUp, { customerId, confirmation: "not_required" });
    return { status: "signed_in", identity: { id: customerId } };
  }

  if (data.user) {
    // No session: the provider requires the emailed link first. Nothing is
    // provisioned until that link proves the address.
    log.info(EVENTS.authSignedUp, { confirmation: "required" });
    return { status: "confirmation_required" };
  }

  providerFailure("sign_up", null);
  return { status: "unavailable" };
}

export async function signOutWithSupabase(auth: AuthClientLike): Promise<void> {
  /*
   * `local`: this browser's session. The refresh token is revoked at the
   * provider, so the cookie is dead even if something kept a copy of it.
   */
  const { error } = await auth.signOut({ scope: "local" });
  if (error && !isSessionError(error)) providerFailure("sign_out", error);
  log.info(EVENTS.authSignedOut, {});
}

export async function requestPasswordResetWithSupabase(
  auth: AuthClientLike,
  email: string,
  redirectTo: string,
): Promise<PasswordResetOutcome> {
  const { error } = await auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    if (isRateLimit(error)) return { status: "rate_limited" };
    providerFailure("password_reset", error);
    return { status: "unavailable" };
  }

  log.info(EVENTS.authPasswordResetRequested, {});
  return { status: "requested" };
}

export async function updatePasswordWithSupabase(
  auth: AuthClientLike,
  password: string,
): Promise<PasswordUpdateOutcome> {
  const current = await auth.getUser();
  if (current.error || !current.data.user) {
    if (current.error && !isSessionError(current.error)) {
      providerFailure("update_password", current.error);
      return { status: "unavailable" };
    }
    return { status: "no_session" };
  }

  const { error } = await auth.updateUser({ password });

  if (error) {
    if (error.code === "same_password") return { status: "rejected", reason: "same_password" };
    if (error.code === "weak_password") return { status: "rejected", reason: "weak_password" };
    if (error.code === "reauthentication_needed" || error.code === "reauthentication_not_valid") {
      return { status: "rejected", reason: "reauthentication_needed" };
    }
    if (isSessionError(error)) return { status: "no_session" };
    providerFailure("update_password", error);
    return { status: "unavailable" };
  }

  log.info(EVENTS.authPasswordUpdated, {});
  return { status: "updated" };
}

export async function completeEmailLinkWithSupabase(
  auth: AuthClientLike,
  resolveCustomerId: ResolveCustomerId,
  link: EmailLink,
): Promise<EmailLinkOutcome> {
  const { data, error } =
    "tokenHash" in link
      ? await auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
      : await auth.exchangeCodeForSession(link.code);

  if (error) {
    if (error.status !== undefined && error.status >= 500) {
      providerFailure("email_link", error);
      return { status: "unavailable" };
    }
    log.info(EVENTS.authLinkRejected, { code: error.code ?? "no_code" });
    return { status: "invalid" };
  }

  if (!data.user || !data.session || data.user.is_anonymous) {
    log.info(EVENTS.authLinkRejected, { code: "no_session" });
    return { status: "invalid" };
  }

  const customerId = await resolveCustomerId(data.user.id);
  log.info(EVENTS.authLinkConfirmed, { customerId, type: link.type ?? "code" });

  return { status: "signed_in", identity: { id: customerId }, type: link.type };
}
