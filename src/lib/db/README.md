# Persistence

One PostgreSQL database. Two owners.

```
                    DATABASE_URL
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
      PAYLOAD                     THE APPLICATION
   CMS tables                  transactional tables
   generated from              declared in schema.ts
   collections                 migrated by drizzle-kit
          │                             │
   products                      customer_addresses
   categories                    saved_items
   materials                     customer_designs
   media                         customer_design_orders
   homepage
   users (operators)
```

Neither generator sees the other's tables. `drizzle.config.ts` is filtered to
the four declared here, so it never proposes to drop a CMS table; Payload
generates only from its collections.

## Why the split

A Payload collection comes with a CRUD admin. That is exactly right for a
product description and exactly wrong for an address, a saved item or an order —
an admin field for `order.status` is a second way to change an order's state
that walks straight past the Phase 12 state machine.

So the rule is: **content in the CMS, transactional data in the domain.** The
account services reach these tables through their repositories and nothing else
does.

## Commands

```
npm run db:generate        regenerate SQL from schema.ts after a schema change
npm run db:migrate         apply the application's migrations
npm run payload:migrate    apply Payload's migrations
```

`drizzle-kit push` is not used and is not in any script. Push diffs a laptop's
schema against a server's and applies the difference, which is a schema change
nobody reviewed. Migrations are committed files.

## What the schema holds

| Table | Constraint that matters |
| --- | --- |
| `customer_addresses` | partial unique on `(customer_id) WHERE is_default` |
| `saved_items` | unique `(customer_id, product_id)` |
| `customer_designs` | unique `storage_key`; partial unique `(customer_id, sha256)` while pending/verified; CHECK a verified row has key, checksum and time |
| `customer_design_orders` | FK to designs, `ON DELETE CASCADE` |
| `geometry_analyses` | PK `(sha256, analysis_version)` |
| `order_items.source_*` | CHECK all-or-nothing, custom items only; insert-only in the repository |

### Stage 16 — `0002_design_storage`

Durable design storage (see `lib/storage/README.md`). Additive only; no existing
column or order semantics change.

| Change | Why |
| --- | --- |
| enum `design_storage_state` (`pending`, `verified`, `failed`, `deleted`) | the file's storage lifecycle, kept apart from manufacturing state |
| `customer_designs.storage_state`, `content_type`, `sha256`, `upload_expires_at`, `verified_at`, `analysis_identity`, `failure_code`, `failure_message`, `deleted_at`, `object_removed_at` | what verification established, why it refused, and what cleanup still owes |
| unique index `customer_designs_storage_key_idx` | one object, one design — deleting one design can never remove another's file |
| partial unique `customer_designs_customer_sha256_active_idx` | a retried or repeated upload of the same file converges on one design |
| partial index `customer_designs_cleanup_idx` | the sweep's backlog, without scanning the table |
| partial index `customer_designs_pending_idx` | finding abandoned uploads |
| CHECK `customer_designs_verified_identity_check` | no row can claim verification without a key, a checksum and a time |
| table `geometry_analyses` | measurements keyed by content hash and analyser version, reusable and durable |
| `order_items.source_design_id`, `source_storage_key`, `source_sha256`, `source_file_name`, `source_size_bytes`, `source_format`, `source_content_type`, `source_analysis_identity`, `source_configuration` | the immutable file snapshot an order is fulfilled from |
| partial index `order_items_source_storage_key_idx` | "does any order still need this object" is one index lookup |
| CHECK `order_items_source_file_check` | a snapshot is complete or absent, and only on custom items |

Every table is indexed on `customer_id`, because every read is "this customer's
rows".

### Stage 22 — `0005_stage_22_inventory_sales_dimensions`

The inventory domain and durable sales dimensions (see `lib/inventory`).
Additive only: new tables, new nullable columns, new indexes. No existing row
is rewritten and nothing is back-filled.

| Change | Why |
| --- | --- |
| tables `suppliers`, `inventory_items`, `inventory_movements`, `inventory_purchases` (+ enums) | a source of record for stock, cost and suppliers |
| `inventory_items.current_quantity` nullable, CHECK ≥ 0 | NULL is *not tracked*; zero is a count. Changed only with a movement, under `FOR UPDATE` |
| trigger `inventory_movements_append_only` (UPDATE, DELETE, TRUNCATE) | the ledger cannot be edited; a correction is a new movement |
| unique `inventory_items_definition_idx`, `_sku_idx`, `_product_idx` | idempotent definitions; one item per SKU and per catalog product |
| `order_items.product_id`, `product_sku`, `category_id`, `category_name`, `browse_category_id`, `browse_category_name`, `dimensions_recorded_at` | what the catalog said a line was at ordering; insert-only in the repository; NULL on every earlier line |
| indexes `order_items_product_idx`, `order_items_category_idx`; movement indexes on item/date, date, type, reference | aggregate analytics without scans |

### The default address

**A customer has at most one default address**, and the database is what
guarantees it. Application code can order its writes carefully and still lose:
two requests that both promote an address can interleave between a read and a
write. The partial unique index is what makes one of them fail.

The repository's write order exists so that failure is rare rather than normal:
clear every default, upsert everything as non-default, then set the one. At no
point do two rows for a customer both claim it.

### `customer_id` has no foreign key

There is no customers table, because there is no authentication until Phase 17.
That column is what gains the reference when Supabase Auth lands.

### `product_id` has no foreign key either

Deliberately. Catalog products live in the CMS tables and can be unpublished or
removed. A foreign key would either block that delete or take the saved item
with it; Phase 13's behaviour is the honest one — the entry survives, resolves
to nothing, and the account page says so.

## Not here: orders

`orderRepository` is untouched by Phase 14 and still in-process.

Orders are five tables, four state machines and a per-job exclusion contract
that has to become real row locks. Migrating them is a change to make against a
live database with the Phase 12 state-machine tests running green against it —
not one to write blind. The schema is documented in `lib/orders/repository.ts`
and Phase 15 is where it lands.

## Testing

The repository tests run against **PGlite**: PostgreSQL compiled to
WebAssembly, in-process, writing to a directory. Same engine, same DDL, same
constraint machinery — so a partial unique index either holds or it does not,
and an in-memory fake cannot quietly agree with whatever the repository did.

It also makes durability testable: close the connection, reopen the same
directory, assert the row survived. That is the actual claim this phase makes.

The migrations the tests apply are the committed ones. A test that passed
against hand-written DDL would be testing DDL nobody deploys.

> PGlite needs a large contiguous allocation for its WASM heap. If its tests
> fail with `Fatal process out of memory: Zone` while the machine has plenty of
> free RAM, something else — a stray dev server — is holding the address space.

### Why `npm test` runs two files at a time, with `--liftoff-only`

`node --test` runs one process per test file, by default as many at once as
there are cores less one. Every file that opens PGlite compiles its large WASM
module in its own process, and V8's optimising tier (TurboFan) makes that the
biggest allocation the process ever does. On the 12-thread development machine,
which has no page file (so its commit limit is its RAM) and whose other
applications hold most of that, eleven such processes at once — and even four —
exceeded the commit limit, and processes died with `Fatal process out of
memory: Zone`, a different set of files on each run.

`package.json` therefore runs the suite with:

- `--liftoff-only`: WebAssembly uses V8's baseline compiler only. A PGlite
  process peaks at about 0.77 GB instead of 1.25 GB (measured). Child test
  processes inherit the flag. It lowers memory; it does not raise any limit.
- `--test-concurrency=2`: at most two such processes at once.

The full suite takes about 50 seconds. PGlite test files also share one
database per file (emptied or isolated per test) rather than opening one per
test.
