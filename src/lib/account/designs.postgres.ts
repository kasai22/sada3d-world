import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { customerDesignOrders, customerDesigns, orderItems } from "@/lib/db/schema";
import { storageStatus } from "@/lib/storage";

import type {
  CreatePendingResult,
  CustomerDesignRepository,
  DesignStorageAvailability,
  NewPendingDesign,
} from "./designs";
import type { CustomerDesign } from "./types";

/*
 * Declared here rather than in `designs.ts`, which imports this module: a value
 * imported back the other way would be a cycle that only works until someone
 * reads it during module evaluation.
 */
export const DESIGN_STORAGE_UNAVAILABLE_REASON =
  "Design storage is not configured yet, so uploaded models stay in your browser and cannot be kept here.";

/**
 * Design records, in PostgreSQL.
 *
 * ── Ownership ────────────────────────────────────────────────────────────
 *
 * Every query about a design is scoped by customer in its WHERE clause. There
 * is no lookup here that takes a design id alone, so there is no query to
 * accidentally call with someone else's.
 *
 * ── Transitions ──────────────────────────────────────────────────────────
 *
 * Each state change is one UPDATE guarded by the state it is allowed to leave,
 * and returns whether a row moved. That is what makes finalisation idempotent
 * under concurrency without a lock: the database lets exactly one request move
 * a pending design, and the other reads the result.
 */

type Row = typeof customerDesigns.$inferSelect;

const iso = (value: Date | null): string | undefined =>
  value ? value.toISOString() : undefined;

function toDomain(row: Row, orderReferences: readonly string[]): CustomerDesign {
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    format: row.format,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Empty rather than undefined keeps the existing contract; nothing treats
    // an empty string as a key.
    fileKey: row.storageKey ?? "",
    previewKey: row.previewKey ?? undefined,
    orderReferences,
    storageState: row.storageState,
    ...(row.contentType ? { contentType: row.contentType } : {}),
    ...(row.sha256 ? { sha256: row.sha256 } : {}),
    ...(row.uploadExpiresAt ? { uploadExpiresAt: iso(row.uploadExpiresAt) } : {}),
    ...(row.verifiedAt ? { verifiedAt: iso(row.verifiedAt) } : {}),
    ...(row.analysisIdentity ? { analysisIdentity: row.analysisIdentity } : {}),
    ...(row.failureCode
      ? { failure: { code: row.failureCode, message: row.failureMessage ?? "" } }
      : {}),
    ...(row.deletedAt ? { deletedAt: iso(row.deletedAt) } : {}),
    ...(row.objectRemovedAt ? { objectRemovedAt: iso(row.objectRemovedAt) } : {}),
  };
}

export function postgresDesignRepository(
  connect: () => Promise<AppDatabase> = getDatabase,
): CustomerDesignRepository {
  async function referencesFor(
    db: AppDatabase,
    customerId: string,
    designId: string,
  ): Promise<string[]> {
    const links = await db
      .select({ orderReference: customerDesignOrders.orderReference })
      .from(customerDesignOrders)
      .where(
        and(
          eq(customerDesignOrders.customerId, customerId),
          eq(customerDesignOrders.designId, designId),
        ),
      );

    return links.map((link) => link.orderReference);
  }

  async function read(
    db: AppDatabase,
    customerId: string,
    designId: string,
  ): Promise<CustomerDesign | null> {
    const rows = await db
      .select()
      .from(customerDesigns)
      .where(and(eq(customerDesigns.customerId, customerId), eq(customerDesigns.id, designId)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return toDomain(row, await referencesFor(db, customerId, designId));
  }

  return {
    name: "postgres",

    availability(): DesignStorageAvailability {
      /*
       * Storage decides. A table full of rows with nowhere to keep the files is
       * not available, and a deployment with storage and an empty table is.
       */
      return storageStatus().configured
        ? { available: true }
        : { available: false, reason: DESIGN_STORAGE_UNAVAILABLE_REASON };
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
      return read(await connect(), customerId, designId);
    },

    async findActiveBySha256(
      customerId: string,
      sha256: string,
    ): Promise<CustomerDesign | null> {
      const db = await connect();

      const rows = await db
        .select()
        .from(customerDesigns)
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.sha256, sha256),
            inArray(customerDesigns.storageState, ["pending", "verified"]),
          ),
        )
        .limit(1);

      const row = rows[0];
      return row ? toDomain(row, await referencesFor(db, customerId, row.id)) : null;
    },

    async createPending(input: NewPendingDesign): Promise<CreatePendingResult> {
      const db = await connect();
      const now = new Date();

      /*
       * DO NOTHING on any conflict. The only unique constraint a fresh random
       * id and key can meet is (customer, sha256) while pending or verified —
       * a concurrent intent for the same file — and the caller converges on
       * that design rather than creating a second.
       */
      const inserted = await db
        .insert(customerDesigns)
        .values({
          id: input.id,
          customerId: input.customerId,
          name: input.name,
          format: input.format,
          sizeBytes: input.sizeBytes,
          storageKey: input.storageKey,
          storageState: "pending",
          contentType: input.contentType,
          sha256: input.sha256,
          uploadExpiresAt: input.uploadExpiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();

      const row = inserted[0];
      return row ? { created: true, design: toDomain(row, []) } : { created: false };
    },

    async renewUpload(
      customerId: string,
      designId: string,
      expiresAt: Date,
    ): Promise<CustomerDesign | null> {
      const db = await connect();

      const updated = await db
        .update(customerDesigns)
        .set({ uploadExpiresAt: expiresAt, updatedAt: new Date() })
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.id, designId),
            eq(customerDesigns.storageState, "pending"),
          ),
        )
        .returning();

      const row = updated[0];
      return row ? toDomain(row, []) : null;
    },

    async markVerified(customerId, designId, input): Promise<boolean> {
      const db = await connect();

      const moved = await db
        .update(customerDesigns)
        .set({
          storageState: "verified",
          verifiedAt: input.at,
          analysisIdentity: input.analysisIdentity ?? null,
          failureCode: null,
          failureMessage: null,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.id, designId),
            eq(customerDesigns.storageState, "pending"),
          ),
        )
        .returning({ id: customerDesigns.id });

      return moved.length > 0;
    },

    async markFailed(customerId, designId, input): Promise<boolean> {
      const db = await connect();

      const moved = await db
        .update(customerDesigns)
        .set({
          storageState: "failed",
          failureCode: input.code,
          failureMessage: input.message,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.id, designId),
            inArray(customerDesigns.storageState, [...input.from]),
          ),
        )
        .returning({ id: customerDesigns.id });

      return moved.length > 0;
    },

    async markDeleted(customerId, designId, at): Promise<boolean> {
      const db = await connect();

      const moved = await db
        .update(customerDesigns)
        .set({ storageState: "deleted", deletedAt: at, updatedAt: at })
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.id, designId),
            inArray(customerDesigns.storageState, ["pending", "verified", "failed"]),
          ),
        )
        .returning({ id: customerDesigns.id });

      return moved.length > 0;
    },

    async markObjectRemoved(customerId, designId, at): Promise<void> {
      const db = await connect();

      await db
        .update(customerDesigns)
        .set({ objectRemovedAt: at })
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.id, designId),
            isNull(customerDesigns.objectRemovedAt),
          ),
        );
    },

    async countActiveUploads(customerId: string, now: Date): Promise<number> {
      const db = await connect();

      const rows = await db
        .select({ value: count() })
        .from(customerDesigns)
        .where(
          and(
            eq(customerDesigns.customerId, customerId),
            eq(customerDesigns.storageState, "pending"),
            gt(customerDesigns.uploadExpiresAt, now),
          ),
        );

      return Number(rows[0]?.value ?? 0);
    },

    async listExpiredUploads(before: Date, limit: number): Promise<CustomerDesign[]> {
      const db = await connect();

      const rows = await db
        .select()
        .from(customerDesigns)
        .where(
          and(
            eq(customerDesigns.storageState, "pending"),
            lt(customerDesigns.uploadExpiresAt, before),
          ),
        )
        .orderBy(asc(customerDesigns.uploadExpiresAt))
        .limit(limit);

      return rows.map((row) => toDomain(row, []));
    },

    async listCleanupCandidates({ now, deletedBefore, limit }): Promise<CustomerDesign[]> {
      const db = await connect();

      /*
       * Due for removal means: the object should not exist, is not yet confirmed
       * gone, and no upload URL for it can still be used — otherwise a browser
       * finishing a slow upload could put the object back after it was removed.
       * A deleted design additionally waits out its grace period, so a checkout
       * already in flight when the customer deleted it still finds the file.
       */
      const uploadClosed = or(
        isNull(customerDesigns.uploadExpiresAt),
        lte(customerDesigns.uploadExpiresAt, now),
      );

      /*
       * An object an order still names is not a candidate at all — excluded in
       * SQL, so a retained object is not re-listed on every sweep and does not
       * crowd out the ones that are due. The sweep asks again per candidate
       * before deleting anyway, because an order can be placed in between.
       */
      const rows = await db
        .select()
        .from(customerDesigns)
        .where(
          and(
            isNull(customerDesigns.objectRemovedAt),
            uploadClosed,
            or(
              eq(customerDesigns.storageState, "failed"),
              and(
                eq(customerDesigns.storageState, "deleted"),
                lte(customerDesigns.deletedAt, deletedBefore),
              ),
            ),
            notExists(
              db
                .select({ one: sql`1` })
                .from(orderItems)
                .where(eq(orderItems.sourceStorageKey, customerDesigns.storageKey)),
            ),
            notExists(
              db
                .select({ one: sql`1` })
                .from(customerDesignOrders)
                .where(
                  and(
                    eq(customerDesignOrders.designId, customerDesigns.id),
                    eq(customerDesignOrders.customerId, customerDesigns.customerId),
                  ),
                ),
            ),
          ),
        )
        .orderBy(asc(customerDesigns.updatedAt))
        .limit(limit);

      return rows.map((row) => toDomain(row, []));
    },

    async isReferencedByOrder(design: CustomerDesign): Promise<boolean> {
      const db = await connect();

      /*
       * Two questions, either of which retains the object. The order snapshot
       * is the authority — it names the exact key — and the link table is
       * asked as well so a design associated with an order by any path is
       * never the one whose file disappears.
       */
      if (design.fileKey) {
        const snapshot = await db
          .select({ id: orderItems.id })
          .from(orderItems)
          .where(eq(orderItems.sourceStorageKey, design.fileKey))
          .limit(1);

        if (snapshot.length > 0) return true;
      }

      const links = await db
        .select({ orderReference: customerDesignOrders.orderReference })
        .from(customerDesignOrders)
        .where(
          and(
            eq(customerDesignOrders.customerId, design.customerId),
            eq(customerDesignOrders.designId, design.id),
          ),
        )
        .limit(1);

      return links.length > 0;
    },

    async linkOrder(customerId, designId, orderReference): Promise<void> {
      const db = await connect();

      await db
        .insert(customerDesignOrders)
        .values({ customerId, designId, orderReference })
        .onConflictDoNothing();
    },
  };
}
