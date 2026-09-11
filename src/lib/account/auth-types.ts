import type { CustomerIdentity, CustomerProfile } from "./types";

/**
 * The authentication contract, provider-neutral.
 *
 * Stage 13 declared the first half — `CustomerAuthAdapter`, which answers "who
 * is this request". Stage 17 adds the second — `CustomerCredentialsAdapter`,
 * which signs people in and out. Supabase implements both in `lib/auth`, and
 * nothing outside that directory knows it is Supabase.
 *
 * Every outcome is a closed set of statuses rather than a provider error. A
 * page decides what to say from `status`; it never inspects an SDK error, so it
 * can never echo one to a customer, and swapping the provider changes no page.
 */

/** A resolved sign-in. Produced only by an adapter. */
export interface CustomerSession {
  identity: CustomerIdentity;
  profile: CustomerProfile;
}

export interface CustomerAuthAdapter {
  /** Surfaced in diagnostics and in the development notice. */
  readonly name: string;
  /**
   * The customer for this request, or null when there is none.
   *
   * Server-side only. An implementation reads a session it verifies itself; it
   * never takes a customer id from anything the browser can choose.
   */
  currentCustomer(): Promise<CustomerSession | null>;
  /**
   * Whether this request carried a session that is no longer valid — expired,
   * signed out elsewhere, or belonging to a deleted user. Lets the interface
   * say "your session expired" rather than a bare "sign in".
   */
  sessionExpired?(): Promise<boolean>;
}

/** The email links Supabase-style providers send. */
export type EmailLinkType = "signup" | "email" | "recovery" | "email_change" | "invite" | "magiclink";

export const EMAIL_LINK_TYPES: readonly EmailLinkType[] = [
  "signup",
  "email",
  "recovery",
  "email_change",
  "invite",
  "magiclink",
];

export type SignInOutcome =
  | { status: "signed_in"; identity: CustomerIdentity }
  /** Wrong email or wrong password — deliberately not distinguished. */
  | { status: "invalid_credentials" }
  /** The password was right and the address has not been confirmed. */
  | { status: "email_not_confirmed" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

export type SignUpOutcome =
  /** The provider issued a session at once (email confirmation is off). */
  | { status: "signed_in"; identity: CustomerIdentity }
  /**
   * No session: the customer must follow the emailed link. Also the answer
   * when the address is already registered, so sign-up cannot be used to find
   * out whether it is.
   */
  | { status: "confirmation_required" }
  | {
      status: "rejected";
      reason: "weak_password" | "invalid_email" | "signup_disabled";
    }
  | { status: "rate_limited" }
  | { status: "unavailable" };

export type PasswordResetOutcome =
  /** Said whether or not the address has an account. */
  | { status: "requested" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

export type PasswordUpdateOutcome =
  | { status: "updated" }
  /** There is no session to change the password of — the link expired. */
  | { status: "no_session" }
  | {
      status: "rejected";
      reason: "weak_password" | "same_password" | "reauthentication_needed";
    }
  | { status: "unavailable" };

export type EmailLinkOutcome =
  | { status: "signed_in"; identity: CustomerIdentity; type: EmailLinkType | undefined }
  /** Expired, already used, altered, or opened in a different browser. */
  | { status: "invalid" }
  | { status: "unavailable" };

export type EmailLink =
  | { tokenHash: string; type: EmailLinkType }
  | { code: string; type?: EmailLinkType };

export interface CustomerCredentialsAdapter {
  readonly name: string;
  signIn(email: string, password: string): Promise<SignInOutcome>;
  signUp(
    email: string,
    password: string,
    options: { emailRedirectTo: string },
  ): Promise<SignUpOutcome>;
  /** Ends this browser's session. Never fails from the caller's point of view. */
  signOut(): Promise<void>;
  requestPasswordReset(
    email: string,
    options: { redirectTo: string },
  ): Promise<PasswordResetOutcome>;
  /** Changes the password of the session on this request. */
  updatePassword(password: string): Promise<PasswordUpdateOutcome>;
  /** Completes a confirmation or recovery link, establishing a session. */
  completeEmailLink(link: EmailLink): Promise<EmailLinkOutcome>;
}
