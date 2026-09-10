import {
  DEVELOPMENT_CUSTOMER_EMAIL,
  DEVELOPMENT_CUSTOMER_ID,
  DEVELOPMENT_CUSTOMER_NAME,
  developmentIdentityEnabled,
} from "./development";
import type {
  AuthenticatedCustomerContext,
  CustomerContext,
  CustomerIdentity,
  CustomerProfile,
} from "./types";

/**
 * The authorization boundary.
 *
 * Everything the account portal reads is private to one customer, so the
 * question "who is asking" has exactly one answer and exactly one place that
 * produces it. This is that place.
 *
 *   ACCOUNT UI
 *        ↓        pages call requireCustomerContext()
 *   CUSTOMER DOMAIN SEAMS
 *        ↓        services take an identity, never an id from a request
 *   AUTH ADAPTER
 *        ↓
 *   REAL SUPABASE AUTH — PHASE 17
 *
 * The rule the whole portal rests on: **an identity is produced here and
 * nowhere else**. No account service accepts a customer id that came from a
 * URL, a form field, a header or a cookie the browser can write. There is
 * therefore no request a browser can compose that names a different customer,
 * because naming a customer is not something a request can do.
 *
 * Today the production adapter returns null. That is not a placeholder to be
 * filled with something weaker — it is the truth: without Supabase Auth there
 * is no trusted identity, and claiming one would be the fake authentication
 * this phase must not build.
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
   * Server-side only. An implementation may read an HttpOnly session cookie or
   * a bearer token it verifies itself; it must never take a customer id from
   * anything the browser can choose.
   */
  currentCustomer(): Promise<CustomerSession | null>;
}

/* ------------------------------------------------------------------ *
 * Adapters
 * ------------------------------------------------------------------ */

/**
 * No authentication.
 *
 * The production adapter until Phase 17. It answers the only honest answer
 * available: nobody is signed in.
 */
export const noCustomerAuth: CustomerAuthAdapter = {
  name: "none",
  async currentCustomer(): Promise<CustomerSession | null> {
    return null;
  },
};

/**
 * A fixed local identity so the portal can be built and reviewed.
 *
 * See `development.ts` for why this exists and the four properties that keep it
 * from being an authentication mechanism. In short: it is a constant, it is
 * unreachable in a production build, and nothing a browser sends affects it.
 */
export const developmentCustomerAuth: CustomerAuthAdapter = {
  name: "development",
  async currentCustomer(): Promise<CustomerSession | null> {
    if (!developmentIdentityEnabled()) return null;

    return {
      identity: { id: DEVELOPMENT_CUSTOMER_ID },
      profile: {
        id: DEVELOPMENT_CUSTOMER_ID,
        name: DEVELOPMENT_CUSTOMER_NAME,
        email: DEVELOPMENT_CUSTOMER_EMAIL,
      },
    };
  },
};

/** The adapter this process uses. Phase 17 points this at Supabase Auth. */
export function resolveCustomerAuthAdapter(): CustomerAuthAdapter {
  return developmentIdentityEnabled() ? developmentCustomerAuth : noCustomerAuth;
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

const SIGNED_OUT: CustomerContext = {
  identity: null,
  profile: null,
  development: false,
};

/**
 * The account context for this request.
 *
 * Safe to call from anywhere on the server, including a layout: it resolves an
 * identity and reads no customer data.
 */
export async function getCustomerContext(): Promise<CustomerContext> {
  const adapter = resolveCustomerAuthAdapter();
  const session = await adapter.currentCustomer();

  if (!session) return SIGNED_OUT;

  return {
    identity: session.identity,
    profile: session.profile,
    development: adapter.name === "development",
  };
}

/**
 * The result of demanding an identity.
 *
 * A result rather than a thrown error: "not signed in" is an ordinary state
 * with a designed screen, not a failure. Throwing would send a visitor to an
 * error boundary that says something went wrong, when nothing did.
 */
export type CustomerGate =
  | { authenticated: true; context: AuthenticatedCustomerContext }
  | { authenticated: false };

/**
 * Requires a signed-in customer.
 *
 * Every account page calls this before it reads anything. The check lives in
 * the page rather than only in the layout, because a layout does not re-run on
 * every navigation and authorization that can be skipped is not authorization.
 */
export async function requireCustomerContext(): Promise<CustomerGate> {
  const context = await getCustomerContext();

  if (!context.identity || !context.profile) return { authenticated: false };

  return {
    authenticated: true,
    context: {
      identity: context.identity,
      profile: context.profile,
      development: context.development,
    },
  };
}
