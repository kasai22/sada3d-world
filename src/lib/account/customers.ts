import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { customers } from "@/lib/db/schema";

import { memoize, persistenceMode } from "./persistence";

/**
 * Customer provisioning: an authentication subject becomes a customer.
 *
 * ── The mapping ──────────────────────────────────────────────────────────
 *
 *   (auth_provider, auth_subject)  →  customers.id
 *   ("supabase", "8f1c…-uuid")     →  "cus_3a9e…"
 *
 * The provider's user id is the canonical *external* identity. The customer id
 * is the application's own, and it is what every ownership column —
 * `orders.customer_id`, `customer_designs.customer_id`, addresses, saved
 * items, carts — holds. Keeping the two apart is what keeps the provider
 * replaceable: a later provider maps its subjects onto the same customer ids,
 * and not one ownership row has to change.
 *
 * ── Idempotent under concurrency ─────────────────────────────────────────
 *
 *   INSERT … ON CONFLICT (auth_provider, auth_subject) DO NOTHING
 *   SELECT id WHERE auth_provider = $1 AND auth_subject = $2
 *
 * Two first sign-ins racing for the same subject both attempt the insert; the
 * unique index lets exactly one row exist, and both then read that row. There
 * is no check-then-insert for two requests to both pass.
 *
 * ── Nothing about the person ─────────────────────────────────────────────
 *
 * No email, no name, no verification flag is copied here. The provider owns
 * those and the session carries them; a second copy would be a second answer
 * that drifts from the first.
 */

export const CUSTOMER_ID_PATTERN = /^cus_[0-9a-f]{24}$/;

const PROVIDERS = new Set(["supabase"]);

export function newCustomerId(): string {
  return `cus_${randomBytes(12).toString("hex")}`;
}

export interface CustomerDirectory {
  readonly name: string;
  /** The customer id for this subject, created the first time it is seen. */
  resolve(provider: string, subject: string): Promise<string>;
}

function assertSubject(provider: string, subject: string): void {
  if (!PROVIDERS.has(provider)) throw new Error("Unknown authentication provider.");
  if (typeof subject !== "string" || subject.length === 0 || subject.length > 255) {
    throw new Error("Malformed authentication subject.");
  }
}

export function postgresCustomerDirectory(
  connect: () => Promise<AppDatabase> = getDatabase,
): CustomerDirectory {
  return {
    name: "postgres",

    async resolve(provider: string, subject: string): Promise<string> {
      assertSubject(provider, subject);
      const db = await connect();

      await db
        .insert(customers)
        .values({ id: newCustomerId(), authProvider: provider, authSubject: subject })
        .onConflictDoNothing({ target: [customers.authProvider, customers.authSubject] });

      const rows = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.authProvider, provider), eq(customers.authSubject, subject)))
        .limit(1);

      const id = rows[0]?.id;
      // The insert either created the row or found it; not finding it now
      // means the database is not doing what it says, and that must not be
      // papered over with a fresh id.
      if (!id) throw new Error("Customer provisioning did not produce a row.");
      return id;
    },
  };
}

/** Development without a database: the same rules, held in this process. */
const memoryMap = new Map<string, string>();

export const memoryCustomerDirectory: CustomerDirectory = {
  name: "memory",

  async resolve(provider: string, subject: string): Promise<string> {
    assertSubject(provider, subject);
    const key = `${provider}\n${subject}`;
    const existing = memoryMap.get(key);
    if (existing) return existing;

    const id = newCustomerId();
    memoryMap.set(key, id);
    return id;
  },
};

const postgres = memoize(() => postgresCustomerDirectory());

/**
 * Resolved ids, cached in this process.
 *
 * Safe to cache without expiry because the mapping never changes: a subject is
 * provisioned once and its customer id is never reassigned. It saves a
 * database round trip on every request that asks who is signed in.
 */
const resolved = new Map<string, string>();
const MAX_CACHED = 5000;

export const customerDirectory: CustomerDirectory = {
  get name() {
    return persistenceMode() === "postgres" ? "postgres" : "memory";
  },

  async resolve(provider: string, subject: string): Promise<string> {
    const key = `${provider}\n${subject}`;
    const cached = resolved.get(key);
    if (cached) return cached;

    const directory = persistenceMode() === "postgres" ? postgres() : memoryCustomerDirectory;
    const id = await directory.resolve(provider, subject);

    if (resolved.size >= MAX_CACHED) resolved.clear();
    resolved.set(key, id);
    return id;
  },
};

/** For tests that swap databases between cases. */
export function clearCustomerCache(): void {
  resolved.clear();
}
