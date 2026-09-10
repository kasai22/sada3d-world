import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit — the application's own tables only.
 *
 * Payload generates and owns its CMS tables from its collections; this config
 * never sees them and must never be pointed at them. Two generators writing one
 * schema file would fight.
 *
 * `generate` runs offline and is what produces the committed SQL in
 * `src/lib/db/migrations`. `push` is deliberately not used: a production schema
 * change is a reviewed file, not a diff applied from a laptop.
 */
export default {
  /*
   * Both files. Drizzle Kit collects entities from the modules it is pointed
   * at, and the order domain's pgEnums are declared in orders.schema.ts —
   * listing only the barrel produced a migration that created tables
   * referencing enum types it had never created.
   */
  schema: ["./src/lib/db/schema.ts", "./src/lib/db/orders.schema.ts"],
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // Payload's tables live in the same database. Restricting the generator to
  // the tables this file declares keeps it from proposing to drop them.
  tablesFilter: [
    "customer_addresses",
    "saved_items",
    "customer_designs",
    "customer_design_orders",
    "orders",
    "order_items",
    "manufacturing_jobs",
    "manufacturing_events",
    "shipments",
    "checkout_reservations",
    "counters",
  ],
} satisfies Config;
