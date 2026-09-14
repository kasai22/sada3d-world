import { readSupabaseAuthConfig } from "@/lib/auth/config";

/**
 * The development identity.
 *
 * Since Stage 17 this exists only for local work without a Supabase project:
 * the moment `NEXT_PUBLIC_SUPABASE_*` is set, real authentication replaces it.
 *
 * Reality 3D has no authentication. Phase 17 brings Supabase Auth, and until it
 * does there is no trusted way to know who is reading a page — so in a
 * production build there is no signed-in customer, ever, and the portal says
 * so rather than pretending otherwise.
 *
 * That leaves a real problem: an account interface that can never be reached
 * cannot be built, reviewed or tested. This module is the answer to that and
 * nothing else.
 *
 *   · it is disabled by a hard `NODE_ENV === "production"` check with **no
 *     environment override**. Unlike the demo orders, which a preview
 *     deployment may opt into, there is no variable that switches an identity
 *     on in production. An escape hatch here would be fake authentication.
 *
 *   · it reads nothing from the request. Not a cookie, not a header, not a
 *     query parameter, not a form field. There is nothing a browser can send
 *     that turns this on or changes who it says you are, so it cannot be
 *     escalated into an impersonation mechanism.
 *
 *   · it is a constant, not a session. It cannot sign in, sign out, expire or
 *     be presented as proof of anything.
 *
 *   · every surface that renders under it says plainly that the identity is a
 *     development one.
 *
 * Set `SADA_DEV_ACCOUNT=0` to switch it off locally and review the signed-out
 * portal, which is what production shows.
 */

/** Stable so records created in one dev session are found in the next. */
export const DEVELOPMENT_CUSTOMER_ID = "dev-customer-local";

export const DEVELOPMENT_CUSTOMER_NAME = "Development Customer";

/**
 * The demonstration orders' email, so the development customer and the Phase 12
 * fixtures describe the same person rather than two unrelated inventions.
 */
export const DEVELOPMENT_CUSTOMER_EMAIL = "demo@sada3d.example";

/**
 * Whether this process has a development identity.
 *
 * The production check is first and unconditional. Nothing below it can be
 * reached by a deployed build.
 */
export function developmentIdentityEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  /*
   * Real authentication, or an attempt at it, takes over completely. With any
   * Supabase variable present the development identity is off — including when
   * the configuration is broken, so a typo cannot silently sign everyone in as
   * the development customer.
   */
  if (readSupabaseAuthConfig().status !== "absent") return false;
  return process.env.SADA_DEV_ACCOUNT !== "0";
}
