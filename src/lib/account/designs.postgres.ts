import { and, desc, eq } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { customerDesignOrders, customerDesigns } from "@/lib/db/schema";

import type { CustomerDesignRepository, DesignStorageAvailability } from "./designs";
import type { CustomerDesign } from "./types";

/**
 * Design metadata, in PostgreSQL.
 *
 * ── Why this still reports unavailable ───────────────────────────────────
 *
 * The table exists, the queries are real and the ownership scoping is real and
 * tested. What does not exist is a file: `lib/custom-print/storage.ts` still
 * keeps an uploaded model in the browser and sends it nowhere, and Phase 16 is
 * what changes that.
 *
 * A design is a file plus what is known about it. Persisting only the second
 * half and calling the feature available would offer a customer a list of
 * things they cannot open. So `availability()` keeps saying no, the page keeps
 * saying why, and the reads below are ready for the phase that gives them
 * something to read.
 *
 * That is not dead code: it is the half of the boundary that can be built
 * honestly now, and it is where the ownership rule lives. Phase 16 adds a
 * writer and flips one method.
 *
 * ── Ownership ────────────────────────────────────────────────────────────
 *
 * Every query is scoped by customer in its WHERE clause. There is no lookup
 * here that takes a design id alone, so there is no query to accidentally call
 * with someone else's.
 */

type Row = typeof customerDesigns.$inferSelect;

function toDomain(row: Row, orderReferences: readonly string[]): CustomerDesign {
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    format: row.format,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Null until Phase 16 stores an object. Empty string would read as a key.
    fileKey: row.storageKey ?? "",
    previewKey: row.previewKey ?? undefined,
    orderReferences,
  };
}

export function postgresDesignRepository(
  connect: () => Promise<AppDatabase> = getDatabase,
): CustomerDesignRepository {
  return {
    name: "postgres",

    availability(): DesignStorageAvailability {
      /*
       * Unchanged from Phase 13, and deliberately not derived from whether the
       * table has rows. Storage is what makes designs available, and Phase 16
       * owns storage.
       */
      return {
        available: false,
        reason:
          "Design storage is not configured yet, so uploaded models stay in your browser and cannot be kept here.",
      };
    },

    async list(customerId: string): Promise<CustomerDesign[]> {
      const db = await connect();

      const rows = await db
        .select()
        .from(customerDesigns)
        .where(eq(customerDesigns.customerId, customerId))
        .orderBy(desc(customerDesigns.createdAt));

      if (rows.length === 0) return [];

      /*
       * One query for the references rather than one per design. The join table
       * carries customer_id so this is scoped without reaching through the
       * design rows it is about to be matched against.
       */
      const links = await db
        .select()
        .from(customerDesignOrders)
        .where(eq(customerDesignOrders.customerId, customerId));

      const byDesign = new Map<string, string[]>();
      for (const link of links) {
        const list = byDesign.get(link.designId);
        if (list) list.push(link.orderReference);
        else byDesign.set(link.designId, [link.orderReference]);
      }

      return rows.map((row) => toDomain(row, byDesign.get(row.id) ?? []));
    },

    async get(customerId: string, designId: string): Promise<CustomerDesign | null> {
      const db = await connect();

      const rows = await db
        .select()
        .from(customerDesigns)
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.id, designId),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      const links = await db
        .select({ orderReference: customerDesignOrders.orderReference })
        .from(customerDesignOrders)
        .where(
          and(
            eq(customerDesignOrders.customerId, customerId),
            eq(customerDesignOrders.designId, designId),
          ),
        );

      return toDomain(
        row,
        links.map((link) => link.orderReference),
      );
    },
  };
}
