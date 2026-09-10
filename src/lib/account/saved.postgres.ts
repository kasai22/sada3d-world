import { and, desc, eq } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { savedItems } from "@/lib/db/schema";

import type { SavedItemRepository } from "./saved";
import type { SavedItem } from "./types";

/**
 * Saved items, in PostgreSQL.
 *
 * The Phase 13 interface, unchanged. What changes is that a saved part now
 * survives a restart and is visible from every instance rather than from the
 * one that happened to serve the click.
 *
 * `save` is idempotent by constraint rather than by check: `ON CONFLICT DO
 * NOTHING` against the unique `(customer_id, product_id)` index. Reading first
 * and inserting if absent would be a race — two clicks on the same part, two
 * requests, both reading nothing — and the second insert is exactly what the
 * index is there to absorb.
 */

type Row = typeof savedItems.$inferSelect;

function toDomain(row: Row): SavedItem {
  return {
    id: row.id,
    customerId: row.customerId,
    productId: row.productId,
    savedAt: row.createdAt.toISOString(),
  };
}

/** Deterministic, so saving the same part twice collides rather than doubling. */
function savedItemId(customerId: string, productId: string): string {
  return `sav_${customerId}_${productId}`;
}

export function postgresSavedItemRepository(
  connect: () => Promise<AppDatabase> = getDatabase,
): SavedItemRepository {
  return {
    name: "postgres",

    async list(customerId: string): Promise<SavedItem[]> {
      const db = await connect();
      const rows = await db
        .select()
        .from(savedItems)
        .where(eq(savedItems.customerId, customerId))
        // Newest first, matching what the in-process store returned.
        .orderBy(desc(savedItems.createdAt));

      return rows.map(toDomain);
    },

    async isSaved(customerId: string, productId: string): Promise<boolean> {
      const db = await connect();
      const rows = await db
        .select({ id: savedItems.id })
        .from(savedItems)
        .where(
          and(
            eq(savedItems.customerId, customerId),
            eq(savedItems.productId, productId),
          ),
        )
        .limit(1);

      return rows.length > 0;
    },

    async save(customerId: string, productId: string): Promise<SavedItem> {
      const db = await connect();

      const inserted = await db
        .insert(savedItems)
        .values({ id: savedItemId(customerId, productId), customerId, productId })
        // Already saved: the existing row stands, with its original timestamp.
        // Re-saving is not a reason to move a part to the top of the list.
        .onConflictDoNothing()
        .returning();

      const row = inserted[0];
      if (row) return toDomain(row);

      const existing = await db
        .select()
        .from(savedItems)
        .where(
          and(
            eq(savedItems.customerId, customerId),
            eq(savedItems.productId, productId),
          ),
        )
        .limit(1);

      const found = existing[0];
      if (!found) {
        // The insert was absorbed by the constraint and the row is not there:
        // it was removed between the two statements. Report the state the
        // caller asked for rather than inventing a row.
        throw new Error("That saved item could not be read back.");
      }

      return toDomain(found);
    },

    async remove(customerId: string, productId: string): Promise<void> {
      const db = await connect();
      await db
        .delete(savedItems)
        .where(
          and(
            eq(savedItems.customerId, customerId),
            eq(savedItems.productId, productId),
          ),
        );
    },
  };
}
