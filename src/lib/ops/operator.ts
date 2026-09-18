import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { operatorLoginHref } from "./routes";

/**
 * The operations console's authorization boundary.
 *
 * ── Who an operator is ───────────────────────────────────────────────────
 *
 * A signed-in Payload user: the same people, the same session and the same rule
 * (`canUseAdmin` — any authenticated Payload user) that already open `/admin`.
 * The console adds no second identity system, no role and no new way to sign
 * in. Signing in happens on Payload's own login page, with its lockout, and
 * signing out there signs out of both.
 *
 * Customers can never be operators. A Supabase session is a different cookie
 * read by a different adapter, and nothing here looks at it.
 *
 * ── Why transactional data is here and not in Payload ────────────────────
 *
 * `payload.config.ts` keeps orders, jobs and designs out of the CMS so that no
 * CRUD form can set a status and walk past the state machines. The console
 * honours that: it reads through its own projections and changes state only by
 * reporting events to the order service, which decides whether they apply.
 *
 * ── Every entry point checks ─────────────────────────────────────────────
 *
 * The layout checks, and so does every page and every server action, because a
 * layout does not re-render on navigation and an action is a public POST
 * endpoint regardless of which page rendered its form. `console-guard.test.ts`
 * fails if a page or action under `app/(ops)` skips it.
 *
 * ── Proof of the check ───────────────────────────────────────────────────
 *
 * Every cross-customer read in `lib/ops` takes an `OperatorSession` as its first
 * argument. The type is branded and minted only here, so there is no call to
 * those functions that compiles without having been through this gate — the
 * same shape the account domain uses with `CustomerIdentity`.
 */

declare const OPERATOR_BRAND: unique symbol;

export interface OperatorSession {
  readonly [OPERATOR_BRAND]: true;
  /** The Payload user id, as text. An identifier, loggable. */
  readonly id: string;
  readonly name: string;
  readonly email: string;
}


/**
 * The operator for this request, or null.
 *
 * Resolved once per request (React `cache`): the layout, the page and the
 * notification count all ask, and Payload is asked once. `payload.auth` verifies
 * the token and reads the user, so a deleted or locked operator stops working
 * immediately rather than when a cookie expires.
 *
 * An unreachable CMS throws. That is an outage, not a signed-out visitor, and it
 * is reported by the console's error boundary rather than answered with a login
 * page that could not work either.
 */
export const currentOperator = cache(async (): Promise<OperatorSession | null> => {
  const [{ getPayload }, { default: config }] = await Promise.all([
    import("payload"),
    import("@payload-config"),
  ]);

  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });

  return operatorFromUser(user);
});

/**
 * The decision itself: an authenticated user of Payload's `users` collection is
 * an operator; nothing else is. No session, a user of another auth collection,
 * or anything that is not a Payload user — a Supabase customer included — is
 * not. Pure, so the rule is tested without a request.
 */
export function operatorFromUser(user: unknown): OperatorSession | null {
  if (typeof user !== "object" || user === null) return null;
  const candidate = user as { collection?: unknown; id?: unknown; email?: unknown; name?: unknown };
  if (candidate.collection !== "users") return null;
  if (typeof candidate.email !== "string" || !candidate.email) return null;
  if (typeof candidate.id !== "number" && typeof candidate.id !== "string") return null;

  return {
    id: String(candidate.id),
    name: typeof candidate.name === "string" && candidate.name ? candidate.name : candidate.email,
    email: candidate.email,
  } as OperatorSession;
}

/**
 * Requires an operator, or sends the browser to sign in and come back here.
 *
 * For pages and layouts. Server actions use `currentOperator` and return a
 * refusal instead, because a redirect is not an answer a form can show.
 */
export async function requireOperator(returnTo: string): Promise<OperatorSession> {
  const operator = await currentOperator();
  if (!operator) redirect(operatorLoginHref(returnTo));
  return operator;
}
