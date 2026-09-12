# The operations console

`/ops` — where SADA 3D is run. Orders, production, designs, customers, payments
and the exceptions that need someone.

```
                    OPERATOR (a Payload user)
                            │  payload-token cookie, Payload's own login
                            ▼
                   lib/ops/operator.ts          requireOperator() / currentOperator()
                            │  OperatorSession (branded, minted only here)
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
   lib/ops read models   lib/ops/mutations   app/(ops)/ops pages
   (SQL, paginated)      (events only)       (server-rendered)
          │                 │
          ▼                 ▼
   the application's tables        lib/orders/service → the state machines
```

## Why this is not in Payload

`payload.config.ts` states the rule: content in the CMS, transactional data in
the domain. A Payload collection comes with a CRUD admin, and an admin with a
field for `order.status` is a second way to change an order's state that walks
straight past the Phase 12 state machine.

So the console is a first-party application. It **reads** through its own
projections and **changes** state only by reporting events to
`lib/orders/service`, which asks the machine whether each one applies. There is
no path here that assigns a state.

Catalog and content stay in Payload — drafts, versions and publishing already
work there — and the console links to them.

## Authorization

An operator is a signed-in Payload user: the same people, the same session and
the same rule (`canUseAdmin` — any authenticated Payload user) that already open
`/admin`. No second identity system, no role, no new sign-in. Signing out of the
CMS signs out of the console.

Three checks, each in `console-guard.test.ts`:

| Where | What |
| --- | --- |
| `app/(ops)/ops/layout.tsx` and every `page.tsx` | `requireOperator(path)` — a layout does not re-render on navigation, so it cannot check for the page |
| every server action | `currentOperator()` — an action is a public POST whoever rendered the form |
| every function in this folder that reads across customers | takes an `OperatorSession`, which only `operator.ts` mints |

A signed-out visitor is sent to Payload's login with a `redirect` back into the
console, and `safeOpsPath` keeps that redirect inside `/ops`.

## What a projection never carries

Storage keys (`customer_designs.storage_key`, `order_items.source_storage_key`),
the cart id, and the authentication subject in `customers.auth_subject`. File
checksums are shortened, because their job here is telling two uploads of
`bracket.stl` apart.

Operators do see what customers do not, and should: internal manufacturing
states, operator notes, actor names, machine ids, hold reasons and the payment
provider's session reference. That is the difference between this console and
`toCustomerTracking`.

**There is no operator download of a customer's design file.** The storage
design has no operator access path, and adding one is a security decision rather
than an interface one.

## Cost

Every list is one page of SQL: `LIMIT`/`OFFSET` with a count, over an index. The
per-row detail behind a page — items, jobs, order references — is read for that
page's keys only, never by looping. `orderRepository.listOrders()` reads the
whole table and is **not** used here.

Migration `0004_ops_console_indexes` adds the two indexes these reads need:
`orders(placed_at)` for "every order, newest first" and
`customer_designs(created_at)` for the same question about designs.

The production board is bounded by what is actually in production plus a week of
finished jobs; the issue queries each ask only for records already in a
condition worth attention.

## Modules

| File | What |
| --- | --- |
| `operator.ts` | the gate: who is an operator, and the branded session |
| `routes.ts` | CMS and login URLs, and the safe return path |
| `labels.ts` | operator vocabulary and tones (client-safe) |
| `pipeline.ts` | board columns, console event choices, issue rules (pure) |
| `query.ts` | filters read from the URL (pure) |
| `format.ts` | money, sizes, ages, dimensions (pure) |
| `sql.ts` | SQL fragments the read models share |
| `orders.ts` · `designs.ts` · `customers.ts` · `payments.ts` · `production.ts` · `issues.ts` · `dashboard.ts` · `search.ts` · `system.ts` | read models |
| `mutations.ts` | the four things an operator can change |

## What the console deliberately does not have

- **Quotes.** They are calculated and never stored, so there is nothing to list.
- **Printers.** A job records the machine it was assigned to; there is no machine
  registry, no utilisation and no maintenance state.
- **Material inventory, cost or reorder levels.** Materials are editorial content
  in the CMS; price multipliers live in `lib/pricing`, in code.
- **Refunds or partial refunds.** The payment domain has three states, and the
  console shows three.
- **Catalog item fulfilment.** The order service has no event that moves a
  stocked item to ready, so the console cannot ship one. The order detail says
  so rather than offering a button that would fail.
- **Bulk actions.** Every state change is one event against one job, and a bulk
  button would either be a loop with no atomicity or a second way to move state.

## Testing

`pipeline.test.ts` covers the pure rules: column mapping, the console's event
choices against the real machine, issue severity and ordering, filter parsing
and the login redirect.

`persistence.test.ts` runs the read models and the mutations against PGlite with
the committed migrations: pagination, filters, LIKE escaping, projections
without storage keys, per-customer scoping, operator attribution, stale-page
refusal, and money figures that exclude demonstration orders.

`console-guard.test.ts` is the static check that the authorization above is
still wired to every page, action and read.
