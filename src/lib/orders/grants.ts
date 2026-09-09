import { cookies } from "next/headers";

import { ORDER_COOKIE } from "@/lib/checkout/cookies";

/**
 * Who may read which order.
 *
 * Two ways to hold a grant, both server-issued and neither forgeable from the
 * browser:
 *
 *   · the receipt cookie set when the order was placed, which only the browser
 *     that placed it has;
 *   · a lookup grant, written after someone proved the reference and the email
 *     together.
 *
 * Both cookies are HttpOnly, so a page cannot read them and a script cannot
 * write them. The reference inside is still checked against the store on every
 * read — a grant naming an order that does not exist opens nothing.
 *
 * Phase 17 replaces all of this with account ownership: the grant becomes
 * "this order belongs to the signed-in user", and this module goes away.
 */

export const ORDER_ACCESS_COOKIE = "sada3d_order_access";

/** A day is long enough to follow up on an order, short enough to expire. */
const MAX_AGE = 60 * 60 * 24;

/** Bounded so a long-lived browser cannot accumulate an unbounded list. */
const MAX_GRANTS = 20;

function parse(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

/** Every order reference this browser has proved it may read. */
export async function grantedReferences(): Promise<string[]> {
  const store = await cookies();
  const granted = parse(store.get(ORDER_ACCESS_COOKIE)?.value);
  const receipt = store.get(ORDER_COOKIE)?.value;

  return receipt ? [...new Set([receipt, ...granted])] : granted;
}

export async function hasGrant(reference: string): Promise<boolean> {
  return (await grantedReferences()).includes(reference);
}

/** Records a grant after the server has verified the claim. */
export async function grantAccess(reference: string): Promise<void> {
  const store = await cookies();
  const existing = parse(store.get(ORDER_ACCESS_COOKIE)?.value);
  const next = [reference, ...existing.filter((entry) => entry !== reference)].slice(
    0,
    MAX_GRANTS,
  );

  store.set(ORDER_ACCESS_COOKIE, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}
