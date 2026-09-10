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
| `customer_designs` | `storage_key` nullable — Phase 16 fills it |
| `customer_design_orders` | FK to designs, `ON DELETE CASCADE` |

Every table is indexed on `customer_id`, because every read is "this customer's
rows".

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
