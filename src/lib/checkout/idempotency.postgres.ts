import { and, eq, isNull, lt, or } from "drizzle-orm";

import { getDatabase } from "@/lib/db/client";
import { checkoutReservations } from "@/lib/db/schema";

import type { IdempotencyStore, Reserved } from "./idempotency";

/**
 * Checkout idempotency, enforced by the database.
 *
 * ── Why the in-memory store was not enough ───────────────────────────────
 *
 * Two identical submissions must produce one order. A `Map` guarantees that
 * within one process; two serverless instances each have their own, so the same
 * cart submitted twice can be accepted twice and charged twice. That is the
 * failure this replaces.
 *
 * ── The mechanism ────────────────────────────────────────────────────────
 *
 * A primary key. `INSERT … ON CONFLICT DO NOTHING` returns a row when the
 * insert won and nothing when it lost, and that is the whole decision:
 *
 *   inserted            → reserved. This caller proceeds.
 *   lost, order present → duplicate. Return the order the first one made.
 *   lost, no order yet  → in flight. The first caller is still working.
 *
 * There is no read-then-write anywhere in that, so there is no window for two
 * callers to both decide they are first.
 *
 * ── Expiry ───────────────────────────────────────────────────────────────
 *
 * A reservation whose request crashed must not block its own retry forever, so
 * a stale one is claimable: the conflict update takes the row only when it has
 * expired and produced no order. A completed reservation is never taken over —
 * the second submission of a real order gets the first order's reference,
 * however long afterwards, until the row is swept.
 */

/** Long enough to cover a payment round trip and a retry, short enough to forget. */
const TTL_MS = 15 * 60 * 1000;

export function postgresIdempotencyStore(): IdempotencyStore {
  return {
    name: "postgres",

    async reserve(key: string): Promise<Reserved> {
      const db = await getDatabase();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TTL_MS);

      /*
       * One statement. The conflict clause claims the row only if the existing
       * reservation has expired *and* never produced an order; anything else
       * leaves the row alone and returns nothing, which the read below reads.
       */
      const claimed = await db
        .insert(checkoutReservations)
        .values({ key, createdAt: now, expiresAt })
        .onConflictDoUpdate({
          target: checkoutReservations.key,
          set: { createdAt: now, expiresAt },
          where: and(
            isNull(checkoutReservations.orderReference),
            lt(checkoutReservations.expiresAt, now),
          ),
        })
        .returning({ orderReference: checkoutReservations.orderReference });

      if (claimed.length > 0) return { status: "reserved" };

      // Lost the race, or the row is live. Whichever it is, the existing row
      // says what to tell this caller.
      const existing = await db
        .select({ orderReference: checkoutReservations.orderReference })
        .from(checkoutReservations)
        .where(eq(checkoutReservations.key, key))
        .limit(1);

      const reference = existing[0]?.orderReference;
      return reference
        ? { status: "duplicate", orderReference: reference }
        : { status: "in_flight" };
    },

    async complete(key: string, orderReference: string): Promise<void> {
      const db = await getDatabase();
      const expiresAt = new Date(Date.now() + TTL_MS);

      await db
        .insert(checkoutReservations)
        .values({ key, orderReference, expiresAt })
        .onConflictDoUpdate({
          target: checkoutReservations.key,
          set: { orderReference, expiresAt },
        });
    },

    /**
     * Releases a reservation whose request failed, so a retry is allowed.
     *
     * Only an unfinished one. A reservation that produced an order is a record
     * of that order and deleting it would let the same cart be ordered twice.
     */
    async release(key: string): Promise<void> {
      const db = await getDatabase();

      await db
        .delete(checkoutReservations)
        .where(
          and(
            eq(checkoutReservations.key, key),
            isNull(checkoutReservations.orderReference),
          ),
        );
    },
  };
}

/**
 * Removes reservations that can no longer affect anything.
 *
 * Expired and unfinished, or long past their expiry either way. Not called on
 * the request path — this is for a scheduled task, and the table stays correct
 * without it because expiry is checked on read.
 */
export async function sweepReservations(before = new Date()): Promise<number> {
  const db = await getDatabase();

  const removed = await db
    .delete(checkoutReservations)
    .where(
      or(
        and(
          isNull(checkoutReservations.orderReference),
          lt(checkoutReservations.expiresAt, before),
        ),
        lt(checkoutReservations.expiresAt, new Date(before.getTime() - TTL_MS)),
      ),
    )
    .returning({ key: checkoutReservations.key });

  return removed.length;
}
