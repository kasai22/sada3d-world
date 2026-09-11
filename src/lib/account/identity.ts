import { readSupabaseAuthConfig } from "@/lib/auth/config";
import { supabaseCredentials, supabaseCustomerAuth } from "@/lib/auth/server";
import { EVENTS, log } from "@/lib/observability";

import type {
  CustomerAuthAdapter,
  CustomerCredentialsAdapter,
  CustomerSession,
} from "./auth-types";
import {
  DEVELOPMENT_CUSTOMER_EMAIL,
  DEVELOPMENT_CUSTOMER_ID,
  DEVELOPMENT_CUSTOMER_NAME,
  developmentIdentityEnabled,
} from "./development";
import type { AuthenticatedCustomerContext, CustomerContext } from "./types";

export type { CustomerAuthAdapter, CustomerCredentialsAdapter, CustomerSession };

/**
 * The authorization boundary.
 *
 * Everything the account portal reads is private to one customer, so the
 * question "who is asking" has exactly one answer and exactly one place that
 * produces it. This is that place.
 *
 *   BROWSER
 *        ↓        HttpOnly session cookies, written only by the server
 *   SUPABASE AUTH  validates the session (lib/auth)
 *        ↓
 *   AUTH ADAPTER   → customer id, via the customers table
 *        ↓        pages and routes call requireCustomerContext()
 *   CUSTOMER DOMAIN SERVICES — ownership decided here, not by the provider
 *
 * The rule the whole portal rests on: **an identity is produced here and
 * nowhere else**. No account service accepts a customer id that came from a
 * URL, a form field, a header or a cookie the browser can write. There is
 * therefore no request a browser can compose that names a different customer,
 * because naming a customer is not something a request can do.
 *
 * Supabase Auth says who someone is. Whether they may read an order is still
 * the order service's decision, exactly as it was before there was a provider.
 */

/* ------------------------------------------------------------------ *
 * Adapters
 * ------------------------------------------------------------------ */

/**
 * No authentication.
 *
 * What a deployment without Supabase Auth configured answers: nobody is signed
 * in. It is not a placeholder for something weaker.
 */
export const noCustomerAuth: CustomerAuthAdapter = {
  name: "none",
  async currentCustomer(): Promise<CustomerSession | null> {
    return null;
  },
};

/**
 * A fixed local identity so the portal can be built and reviewed without a
 * Supabase project.
 *
 * See `development.ts` for the properties that keep it from being an
 * authentication mechanism: unreachable in a production build, switched off
 * the moment Supabase variables are present, and unaffected by anything a
 * browser sends.
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

let reportedMisconfiguration = false;

/**
 * Supabase when it is configured; otherwise nobody (production) or the
 * development identity (local, and only with no Supabase variables at all).
 *
 * A *misconfigured* Supabase — one variable missing, or a service-role key in
 * the public variable — is not "absent": it signs nobody in, and says why in
 * the server log, rather than quietly falling back to the development identity.
 */
export function resolveCustomerAuthAdapter(): CustomerAuthAdapter {
  const config = readSupabaseAuthConfig();

  if (config.status === "configured") return supabaseCustomerAuth;

  if (config.status === "invalid") {
    if (!reportedMisconfiguration) {
      reportedMisconfiguration = true;
      log.error(EVENTS.authNotConfigured, { problems: config.problems.join(" ") });
    }
    return noCustomerAuth;
  }

  return developmentIdentityEnabled() ? developmentCustomerAuth : noCustomerAuth;
}

/**
 * The adapter that can sign people in, or null where nothing can.
 *
 * The development identity has no credentials — it cannot sign in or out — so
 * a deployment without Supabase has no credentials adapter, and the sign-in
 * page says accounts are not available rather than showing a form.
 */
export function resolveCredentialsAdapter(): CustomerCredentialsAdapter | null {
  return readSupabaseAuthConfig().status === "configured" ? supabaseCredentials : null;
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

const SIGNED_OUT: CustomerContext = {
  identity: null,
  profile: null,
  development: false,
  sessionExpired: false,
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

  if (!session) {
    const expired = adapter.sessionExpired ? await adapter.sessionExpired() : false;
    return expired ? { ...SIGNED_OUT, sessionExpired: true } : SIGNED_OUT;
  }

  return {
    identity: session.identity,
    profile: session.profile,
    development: adapter.name === "development",
    sessionExpired: false,
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
  | { authenticated: false; sessionExpired: boolean };

/**
 * Requires a signed-in customer.
 *
 * Every account page, server action and customer API route calls this before
 * it reads anything. The check lives in each of them rather than only in a
 * layout or the proxy, because authorization that can be skipped is not
 * authorization.
 */
export async function requireCustomerContext(): Promise<CustomerGate> {
  const context = await getCustomerContext();

  if (!context.identity || !context.profile) {
    return { authenticated: false, sessionExpired: context.sessionExpired };
  }

  return {
    authenticated: true,
    context: {
      identity: context.identity,
      profile: context.profile,
      development: context.development,
    },
  };
}
