import { headers } from "next/headers";

import {
  RATE_LIMITS,
  anonymousSubject,
  enforceRateLimit,
  sourceSubject as sourceSubjectOf,
} from "@/lib/api/rate-limit";
import { mergeGuestCartIntoAccount } from "@/lib/cart/repository";
import { RateLimitedError } from "@/lib/errors";
import { EVENTS, log } from "@/lib/observability";
import { siteUrl } from "@/lib/site";

import { EMAIL_LINK_TYPES, type EmailLink, type EmailLinkType } from "./auth-types";
import { requireCustomerContext, resolveCredentialsAdapter } from "./identity";
import {
  AUTH_CONFIRM_PATH,
  RESET_PASSWORD_PATH,
  RETURN_PARAM,
  safeReturnPath,
  signInHref,
} from "./routes";
import type { CustomerIdentity } from "./types";

/**
 * Signing in, out and back in again — the service behind the sign-in page.
 *
 * The order of every operation is the same, and each step exists for a reason:
 *
 *   configured?      no credentials adapter means no accounts in this
 *                    deployment, said plainly, never a form that does nothing
 *   validate         shape only; the provider is the judge of the credentials
 *   rate limit       per address being tried and per network source
 *   provider         through the credentials adapter — no Supabase here
 *   after sign-in    the guest cart is folded into the customer's cart
 *   answer           one of a closed set of statuses, with a sentence written
 *                    here, never a provider message
 *
 * ── Enumeration ──────────────────────────────────────────────────────────
 *
 * Wrong email and wrong password are one answer. A password reset request says
 * the same thing whether or not the address has an account. Signing up with an
 * address that already has an account looks exactly like signing up.
 *
 * ── Redirects ────────────────────────────────────────────────────────────
 *
 * Every destination is either a constant or passed through `safeReturnPath`.
 * Email links are built from the configured site URL, never from the request's
 * Host header, so a forged Host cannot make a reset email point elsewhere.
 */

export type AuthField = "email" | "password" | "confirmPassword";

export type AuthFormResult =
  | { ok: true; status: "signed_in"; next: string }
  | {
      ok: true;
      status: "confirmation_required" | "reset_requested" | "password_updated" | "signed_out";
      message: string;
    }
  | {
      ok: false;
      status:
        | "invalid"
        | "email_not_confirmed"
        | "rate_limited"
        | "unavailable"
        | "no_session"
        | "not_configured";
      message: string;
      fields?: Partial<Record<AuthField, string>>;
    };

export const AUTH_MESSAGES = {
  notConfigured: "Customer accounts are not available in this environment.",
  invalidCredentials: "That email and password don't match an account.",
  emailNotConfirmed:
    "Confirm your email address first, using the link we sent when you created the account.",
  rateLimited: "Too many attempts. Wait a few minutes, then try again.",
  unavailable: "Sign-in is not available right now. Try again shortly.",
  confirmationRequired:
    "Check your email for a link to confirm your address. If you already have an account, sign in instead.",
  weakPassword: "Choose a stronger password: at least 8 characters, and not a common one.",
  invalidEmail: "Enter a valid email address.",
  signupDisabled: "New accounts cannot be created right now.",
  resetRequested:
    "If an account exists for that email, a link to reset the password is on its way.",
  noSession: "This reset link has expired or was already used. Request a new one.",
  samePassword: "Choose a password you have not used for this account.",
  reauthenticate: "For security, sign in again before changing your password.",
  passwordUpdated: "Your password has been changed.",
  signedOut: "You have been signed out.",
  passwordsDiffer: "The passwords do not match.",
} as const;

const NOT_CONFIGURED: AuthFormResult = {
  ok: false,
  status: "not_configured",
  message: AUTH_MESSAGES.notConfigured,
};

const RATE_LIMITED: AuthFormResult = {
  ok: false,
  status: "rate_limited",
  message: AUTH_MESSAGES.rateLimited,
};

const UNAVAILABLE: AuthFormResult = {
  ok: false,
  status: "unavailable",
  message: AUTH_MESSAGES.unavailable,
};

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A plausible email, lowercased, or null. The provider is the real judge. */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** Passwords are hashed with bcrypt, which reads at most 72 bytes. */
const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(value: unknown, purpose: "sign_in" | "new"): string | null {
  if (typeof value !== "string" || value.length === 0) return "Enter a password.";
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    return "Use a password of 72 characters or fewer.";
  }
  if (purpose === "new" && value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Request context
 * ------------------------------------------------------------------ */

/**
 * The network source, for rate limiting only.
 *
 * On Vercel, `x-forwarded-for` is set by the platform. Elsewhere it is a claim
 * and could be varied by a client — which would only let that client spread
 * its attempts across limiter buckets, and the per-address limit still holds.
 */
async function sourceSubject(): Promise<string> {
  try {
    return sourceSubjectOf(await headers());
  } catch {
    return anonymousSubject("source", "unknown");
  }
}

function limited(check: () => void): boolean {
  try {
    check();
    return false;
  } catch (error) {
    if (error instanceof RateLimitedError) return true;
    throw error;
  }
}

/** An absolute link to the confirmation route, from the configured site URL. */
export function confirmationUrl(type: EmailLinkType, next?: string | null): string {
  const url = new URL(AUTH_CONFIRM_PATH, siteUrl());
  url.searchParams.set("type", type);
  const safe = safeReturnPath(next);
  if (safe) url.searchParams.set(RETURN_PARAM, safe);
  return url.toString();
}

/**
 * What happens once a session exists: the guest cart joins the account.
 *
 * Allowed to fail without failing the sign-in — the customer is signed in
 * either way, and the guest cart is still in its cookie for the next attempt.
 */
async function afterAuthenticated(identity: CustomerIdentity): Promise<void> {
  try {
    await mergeGuestCartIntoAccount(identity.id);
  } catch (error) {
    log.warn(EVENTS.cartMerged, {
      customerId: identity.id,
      outcome: "failed",
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

export async function signInCustomer(input: {
  email: unknown;
  password: unknown;
  next?: unknown;
}): Promise<AuthFormResult> {
  const credentials = resolveCredentialsAdapter();
  if (!credentials) return NOT_CONFIGURED;

  const email = normaliseEmail(input.email);
  const problem = typeof input.password === "string" && input.password ? null : "Enter your password.";

  if (!email || problem) {
    return {
      ok: false,
      status: "invalid",
      message: "Check the highlighted fields.",
      fields: {
        ...(email ? {} : { email: AUTH_MESSAGES.invalidEmail }),
        ...(problem ? { password: problem } : {}),
      },
    };
  }

  const source = await sourceSubject();
  if (
    limited(() => enforceRateLimit(RATE_LIMITS.signInSource, source)) ||
    limited(() => enforceRateLimit(RATE_LIMITS.signInAccount, anonymousSubject("email", email)))
  ) {
    return RATE_LIMITED;
  }

  const outcome = await credentials.signIn(email, input.password as string);

  switch (outcome.status) {
    case "signed_in":
      await afterAuthenticated(outcome.identity);
      return {
        ok: true,
        status: "signed_in",
        next: safeReturnPath(typeof input.next === "string" ? input.next : undefined) ?? "/account",
      };
    case "invalid_credentials":
      log.info(EVENTS.authSignInRefused, { reason: "invalid_credentials" });
      return { ok: false, status: "invalid", message: AUTH_MESSAGES.invalidCredentials };
    case "email_not_confirmed":
      log.info(EVENTS.authSignInRefused, { reason: "email_not_confirmed" });
      return { ok: false, status: "email_not_confirmed", message: AUTH_MESSAGES.emailNotConfirmed };
    case "rate_limited":
      return RATE_LIMITED;
    case "unavailable":
      return UNAVAILABLE;
  }
}

export async function signUpCustomer(input: {
  email: unknown;
  password: unknown;
  confirmPassword: unknown;
  next?: unknown;
}): Promise<AuthFormResult> {
  const credentials = resolveCredentialsAdapter();
  if (!credentials) return NOT_CONFIGURED;

  const email = normaliseEmail(input.email);
  const problem = passwordProblem(input.password, "new");
  const differs = !problem && input.password !== input.confirmPassword;

  if (!email || problem || differs) {
    return {
      ok: false,
      status: "invalid",
      message: "Check the highlighted fields.",
      fields: {
        ...(email ? {} : { email: AUTH_MESSAGES.invalidEmail }),
        ...(problem ? { password: problem } : {}),
        ...(differs ? { confirmPassword: AUTH_MESSAGES.passwordsDiffer } : {}),
      },
    };
  }

  const source = await sourceSubject();
  if (limited(() => enforceRateLimit(RATE_LIMITS.signUpSource, source))) return RATE_LIMITED;

  const next = typeof input.next === "string" ? input.next : undefined;
  const outcome = await credentials.signUp(email, input.password as string, {
    emailRedirectTo: confirmationUrl("signup", next),
  });

  switch (outcome.status) {
    case "signed_in":
      await afterAuthenticated(outcome.identity);
      return { ok: true, status: "signed_in", next: safeReturnPath(next) ?? "/account" };
    case "confirmation_required":
      return { ok: true, status: "confirmation_required", message: AUTH_MESSAGES.confirmationRequired };
    case "rejected":
      return {
        ok: false,
        status: "invalid",
        message:
          outcome.reason === "weak_password"
            ? AUTH_MESSAGES.weakPassword
            : outcome.reason === "invalid_email"
              ? AUTH_MESSAGES.invalidEmail
              : AUTH_MESSAGES.signupDisabled,
        ...(outcome.reason === "weak_password"
          ? { fields: { password: AUTH_MESSAGES.weakPassword } }
          : outcome.reason === "invalid_email"
            ? { fields: { email: AUTH_MESSAGES.invalidEmail } }
            : {}),
      };
    case "rate_limited":
      return RATE_LIMITED;
    case "unavailable":
      return UNAVAILABLE;
  }
}

export async function requestCustomerPasswordReset(input: {
  email: unknown;
}): Promise<AuthFormResult> {
  const credentials = resolveCredentialsAdapter();
  if (!credentials) return NOT_CONFIGURED;

  const email = normaliseEmail(input.email);
  if (!email) {
    return {
      ok: false,
      status: "invalid",
      message: AUTH_MESSAGES.invalidEmail,
      fields: { email: AUTH_MESSAGES.invalidEmail },
    };
  }

  const source = await sourceSubject();
  if (
    limited(() => enforceRateLimit(RATE_LIMITS.passwordResetSource, source)) ||
    limited(() =>
      enforceRateLimit(RATE_LIMITS.passwordResetAccount, anonymousSubject("email", email)),
    )
  ) {
    return RATE_LIMITED;
  }

  const outcome = await credentials.requestPasswordReset(email, {
    redirectTo: confirmationUrl("recovery"),
  });

  switch (outcome.status) {
    case "requested":
      return { ok: true, status: "reset_requested", message: AUTH_MESSAGES.resetRequested };
    case "rate_limited":
      return RATE_LIMITED;
    case "unavailable":
      return UNAVAILABLE;
  }
}

export async function updateCustomerPassword(input: {
  password: unknown;
  confirmPassword: unknown;
}): Promise<AuthFormResult> {
  const credentials = resolveCredentialsAdapter();
  if (!credentials) return NOT_CONFIGURED;

  const gate = await requireCustomerContext();
  if (!gate.authenticated) {
    return { ok: false, status: "no_session", message: AUTH_MESSAGES.noSession };
  }

  const problem = passwordProblem(input.password, "new");
  const differs = !problem && input.password !== input.confirmPassword;
  if (problem || differs) {
    return {
      ok: false,
      status: "invalid",
      message: "Check the highlighted fields.",
      fields: {
        ...(problem ? { password: problem } : {}),
        ...(differs ? { confirmPassword: AUTH_MESSAGES.passwordsDiffer } : {}),
      },
    };
  }

  if (
    limited(() => enforceRateLimit(RATE_LIMITS.passwordUpdate, gate.context.identity.id))
  ) {
    return RATE_LIMITED;
  }

  const outcome = await credentials.updatePassword(input.password as string);

  switch (outcome.status) {
    case "updated":
      return { ok: true, status: "password_updated", message: AUTH_MESSAGES.passwordUpdated };
    case "no_session":
      return { ok: false, status: "no_session", message: AUTH_MESSAGES.noSession };
    case "rejected":
      return {
        ok: false,
        status: "invalid",
        message:
          outcome.reason === "same_password"
            ? AUTH_MESSAGES.samePassword
            : outcome.reason === "weak_password"
              ? AUTH_MESSAGES.weakPassword
              : AUTH_MESSAGES.reauthenticate,
        ...(outcome.reason === "reauthentication_needed"
          ? {}
          : {
              fields: {
                password:
                  outcome.reason === "same_password"
                    ? AUTH_MESSAGES.samePassword
                    : AUTH_MESSAGES.weakPassword,
              },
            }),
      };
    case "unavailable":
      return UNAVAILABLE;
  }
}

export async function signOutCustomer(): Promise<AuthFormResult> {
  const credentials = resolveCredentialsAdapter();
  if (!credentials) return NOT_CONFIGURED;

  await credentials.signOut();
  return { ok: true, status: "signed_out", message: AUTH_MESSAGES.signedOut };
}

/* ------------------------------------------------------------------ *
 * Email links
 * ------------------------------------------------------------------ */

/** Link parameters are opaque tokens: bounded, and from a small alphabet. */
function token(value: string | null): string | undefined {
  return value && value.length <= 1024 && /^[A-Za-z0-9._~-]+$/.test(value) ? value : undefined;
}

export function parseEmailLink(params: URLSearchParams): EmailLink | null {
  const typeParam = params.get("type");
  const type = EMAIL_LINK_TYPES.includes(typeParam as EmailLinkType)
    ? (typeParam as EmailLinkType)
    : undefined;

  const tokenHash = token(params.get("token_hash"));
  if (tokenHash && type) return { tokenHash, type };

  const code = token(params.get("code"));
  if (code) return type ? { code, type } : { code };

  return null;
}

/**
 * Completes a confirmation or recovery link and says where to go next.
 *
 * Returns a path, never a URL: the route handler resolves it against its own
 * origin, and every path here is a constant or an allowlisted return path.
 */
export async function completeCustomerEmailLink(params: URLSearchParams): Promise<string> {
  const invalid = signInHref(undefined, { status: "link_invalid" });

  const credentials = resolveCredentialsAdapter();
  if (!credentials) return invalid;

  const link = parseEmailLink(params);
  if (!link) return invalid;

  const outcome = await credentials.completeEmailLink(link);
  if (outcome.status !== "signed_in") return invalid;

  await afterAuthenticated(outcome.identity);

  if (outcome.type === "recovery") return RESET_PASSWORD_PATH;
  return safeReturnPath(params.get(RETURN_PARAM)) ?? "/account";
}
