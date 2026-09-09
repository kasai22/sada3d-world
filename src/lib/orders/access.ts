import { orderRepository } from "./repository";
import type { Order } from "./types";

/**
 * Order authorization.
 *
 * Reading an order requires proving you are the person who placed it. Until
 * Supabase Auth arrives in Phase 17 there is no account to check against, so
 * the proof is the pair a customer has and a stranger does not:
 *
 *   the order reference  +  the email the order was placed with
 *
 * The reference alone is not enough, and deliberately so — references are
 * sequential, so S3D-000042 is a guess anyone can make. The email is what
 * actually protects the record, which is why a failed lookup says nothing about
 * whether the reference exists.
 *
 * The browser never becomes the authority. Every function here runs on the
 * server, and none of them accepts a customer identity from a request — only a
 * claim to be checked.
 */

/** Failed attempts before lookups for a reference are refused for a while. */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

interface Attempts {
  count: number;
  firstAt: number;
}

const GLOBAL_KEY = "__sada3d_order_lookups__";

function attempts(): Map<string, Attempts> {
  const globals = globalThis as unknown as Record<
    string,
    Map<string, Attempts> | undefined
  >;
  const existing = globals[GLOBAL_KEY];
  if (existing) return existing;

  const created = new Map<string, Attempts>();
  globals[GLOBAL_KEY] = created;
  return created;
}

function throttled(reference: string): boolean {
  const record = attempts().get(reference);
  if (!record) return false;

  if (Date.now() - record.firstAt > WINDOW_MS) {
    attempts().delete(reference);
    return false;
  }

  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(reference: string): void {
  const map = attempts();
  const record = map.get(reference);

  if (!record || Date.now() - record.firstAt > WINDOW_MS) {
    map.set(reference, { count: 1, firstAt: Date.now() });
    return;
  }

  record.count += 1;
}

function clearFailures(reference: string): void {
  attempts().delete(reference);
}

/** Case and whitespace do not make two email addresses different. */
function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type OrderAccess =
  | { ok: true; order: Order }
  /**
   * One message for "no such order" and "wrong email" alike. Distinguishing
   * them would turn the lookup into a way of discovering which references
   * exist.
   */
  | { ok: false; reason: "not_found" | "throttled" };

/**
 * Finds an order for someone who can prove it is theirs.
 *
 * A wrong email and a nonexistent reference are the same answer, and a run of
 * wrong answers for one reference stops being answered at all.
 */
export async function authorizeOrderByEmail(
  reference: string,
  email: string,
): Promise<OrderAccess> {
  const normalised = reference.trim().toUpperCase();

  if (throttled(normalised)) return { ok: false, reason: "throttled" };

  const order = await orderRepository.findOrder(normalised);

  if (!order || !sameEmail(order.contact.email, email)) {
    recordFailure(normalised);
    return { ok: false, reason: "not_found" };
  }

  clearFailures(normalised);
  return { ok: true, order };
}

/**
 * Finds an order the browser has already proved it placed.
 *
 * The reference comes from the HttpOnly cookie set when the order was created,
 * which this browser could only have if it placed the order. The value is still
 * checked against the store — a cookie naming an order that does not exist gets
 * nothing.
 */
export async function authorizeOrderByReceipt(
  reference: string | undefined,
): Promise<Order | undefined> {
  if (!reference) return undefined;
  return orderRepository.findOrder(reference.trim().toUpperCase());
}
