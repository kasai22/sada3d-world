import { and, eq, inArray, notInArray } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { customerAddresses } from "@/lib/db/schema";

import type { CustomerAddressRepository } from "./addresses";
import type { CustomerAddress } from "./types";

/**
 * Addresses, in PostgreSQL.
 *
 * The same `CustomerAddressRepository` the in-process store implemented, so the
 * service above it, the server actions above that and the account UI above
 * those are all unchanged. Swapping durability is not supposed to be visible
 * from a component, and it is not.
 *
 * ── Why `replace` writes the whole set ───────────────────────────────────
 *
 * The interface Phase 13 defined is whole-set replacement, and it is kept
 * rather than widened into per-row methods. The reason is the invariant: with
 * one write path there is one place the default rule is applied, and the
 * ordering below is the only ordering that has to be correct.
 *
 * An address book is capped at twenty entries, so rewriting it costs nothing
 * worth optimising. If that cap ever rose this would become a diff — and the
 * ordering rule would still be the thing to preserve.
 *
 * ── The ordering that matters ────────────────────────────────────────────
 *
 * A unique index is checked per statement, not at commit, so a transaction that
 * marks the new default before clearing the old one fails against its own
 * intermediate state. Every write therefore goes:
 *
 *   1. delete what is gone
 *   2. clear every default this customer has
 *   3. upsert every row, all with is_default = false
 *   4. set the single default, if there is one
 *
 * At no point do two rows for one customer claim to be the default, so the
 * index never has to reject a write this code made. It is still there to reject
 * one that two concurrent requests made between them — which is the case
 * application code cannot exclude on its own.
 */

type Row = typeof customerAddresses.$inferSelect;

/** Null is how a database says "absent"; the domain says it with undefined. */
function toDomain(row: Row): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customerId,
    label: row.label ?? undefined,
    fullName: row.fullName,
    phone: row.phone,
    address: {
      line1: row.line1,
      line2: row.line2 ?? undefined,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
    },
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRow(address: CustomerAddress): Row {
  return {
    id: address.id,
    customerId: address.customerId,
    label: address.label ?? null,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.address.line1,
    line2: address.address.line2 ?? null,
    city: address.address.city,
    state: address.address.state,
    postalCode: address.address.postalCode,
    country: address.address.country,
    // Written false here and set afterwards; see the ordering note above.
    isDefault: false,
    createdAt: new Date(address.createdAt),
    updatedAt: new Date(address.updatedAt),
  };
}

export function postgresAddressRepository(
  connect: () => Promise<AppDatabase> = getDatabase,
): CustomerAddressRepository {
  return {
    name: "postgres",

    async list(customerId: string): Promise<CustomerAddress[]> {
      const db = await connect();
      const rows = await db
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, customerId));

      return rows.map(toDomain);
    },

    async get(customerId: string, addressId: string): Promise<CustomerAddress | null> {
      const db = await connect();
      /*
       * Scoped by both, as a single condition. An implementation that selected
       * by id and compared the owner afterwards would be one careless edit away
       * from returning another customer's address, and the query planner has no
       * opinion about which of those two we wrote.
       */
      const rows = await db
        .select()
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.customerId, customerId),
            eq(customerAddresses.id, addressId),
          ),
        )
        .limit(1);

      const row = rows[0];
      return row ? toDomain(row) : null;
    },

    async replace(
      customerId: string,
      addresses: readonly CustomerAddress[],
    ): Promise<void> {
      const db = await connect();

      /*
       * Every address is forced to this customer regardless of what the caller
       * put in the row. A service that mixed up whose set it was building
       * cannot write across the boundary through here.
       */
      const rows = addresses.map((address) =>
        toRow({ ...address, customerId }),
      );
      const keep = rows.map((row) => row.id);
      const defaultId = addresses.find((address) => address.isDefault)?.id;

      await db.transaction(async (tx) => {
        // 1. Gone.
        await tx
          .delete(customerAddresses)
          .where(
            keep.length === 0
              ? eq(customerAddresses.customerId, customerId)
              : and(
                  eq(customerAddresses.customerId, customerId),
                  notInArray(customerAddresses.id, keep),
                ),
          );

        if (rows.length === 0) return;

        // 2. No default, briefly. This also takes the row lock that makes two
        //    concurrent promotions queue rather than race.
        await tx
          .update(customerAddresses)
          .set({ isDefault: false })
          .where(
            and(
              eq(customerAddresses.customerId, customerId),
              eq(customerAddresses.isDefault, true),
            ),
          );

        // 3. Upsert, all non-default.
        for (const row of rows) {
          await tx
            .insert(customerAddresses)
            .values(row)
            .onConflictDoUpdate({
              target: customerAddresses.id,
              set: {
                label: row.label,
                fullName: row.fullName,
                phone: row.phone,
                line1: row.line1,
                line2: row.line2,
                city: row.city,
                state: row.state,
                postalCode: row.postalCode,
                country: row.country,
                isDefault: false,
                updatedAt: row.updatedAt,
              },
            });
        }

        // 4. Exactly one, scoped so a stray id cannot promote someone else's.
        if (defaultId) {
          await tx
            .update(customerAddresses)
            .set({ isDefault: true })
            .where(
              and(
                eq(customerAddresses.customerId, customerId),
                inArray(customerAddresses.id, [defaultId]),
              ),
            );
        }
      });
    },
  };
}
