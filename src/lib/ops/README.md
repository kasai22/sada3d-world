# Reality 3D Admin — the business console

`/admin` — where Reality 3D is run (Stage 22.5; formerly `/ops`, the Stage 21
Command Center). It opens on the Command Center: revenue, orders, what is
selling, manufacturing, inventory, catalog health and "Needs your attention",
over an explicit date range. Behind it: sales, orders, products and the product
workspace, customers, payments, manufacturing, inventory, issues, customer
files, analytics (revenue, product sales, material usage), the catalog (health,
categories, materials, pricing, media) and settings.

## Stage 22.5 — one admin application

| Address | What it is |
| --- | --- |
| `/admin` | Reality 3D Admin — `app/(admin)/admin`. Sign-in at `/admin/login`; every other page is in the gated `(console)` group. |
| `/cms` | Payload's own panel, **Advanced CMS** (`routes.admin` in `payload.config.ts`). Same users, same session. Branded through Payload's graphics, nav, dashboard and login slots, `admin.meta`, and `app/(payload)/custom.css` (theme variables only). |
| `/ops/*` | Redirects to `/admin/*` (`/ops/production` → `/admin/manufacturing`). |
| `/admin/collections/*`, `/admin/globals/*`, `/admin/account`, … | Payload's old deep links; redirect to `/cms/…`. See `LEGACY_REDIRECTS` in `routes.ts`. |

- **Sign-in** is Payload's `login` operation (`@payloadcms/next/auth`) behind a
  Reality 3D form — Payload's lockout and cookie; nothing is reimplemented.
  Sign-out is Payload's `logout`.
- **Catalog writes**: the product workspace saves name, summary, description,
  SKU and use case as a **draft**, through Payload's local API as the signed-in
  Payload user with `overrideAccess: false`, so every product hook and the
  approval guard run. Approvals, price-approval records, uploads and publishing
  open the exact document in Advanced CMS (`catalog-admin.ts`).
- **Search** covers orders, customers, products (name, product id, SKU),
  inventory items, customer files, production jobs and payments.
- **Material usage** (`analytics/materials.ts`) reports custom-print lines by
  their recorded quote material, and raw-material usage and waste from the
  inventory ledger. Catalog lines record no material; that is shown, not guessed.
- The Payload import map is generated: `npm run generate:importmap`.

## The Stage 21 console, as it was built

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

## Analytics (Stage 21)

`analytics/` is the command centre's server-side data layer. Pages never
aggregate; they call one of these, and every result carries its source, its
definition, its range and when it was read (`Traced`).

| Service | File | Answers |
| --- | --- | --- |
| RevenueService | `revenue.ts` | revenue, paid orders, AOV for a range; today / week / month / year |
| OrderAnalyticsService | `orders.ts` | orders by status and payment, quick-filter counts, customer counts |
| ProductAnalyticsService | `products.ts` | units, orders and line revenue per product sold; revenue by category (Stage 22) |
| InventoryAnalyticsService | `inventory.ts` | stock summary and valuation from `lib/inventory` (Stage 22) |
| ManufacturingAnalyticsService | `manufacturing.ts` | active jobs by stage, holds, milestones, dispatches, machine assignments |
| Catalog health | `catalog.ts` | launch stage and readiness of every product (the launch assessment, batched) |
| Action centre | `attention.ts` | "Needs your attention": issue kinds and catalog conditions, counted and linked |
| Date ranges | `range.ts` | presets, custom ranges, IST business days, buckets (pure) |

Definitions, shared in `analytics/sql.ts`:

- **Revenue** is the recorded total of orders whose payment is `paid`, excluding
  demonstration, cancelled and failed orders, dated by `placed_at` (there is no
  payment timestamp). Paid orders later cancelled are reported beside revenue.
  Mock-provider payments and provisional pricing are counted and stated.
- **Business days** are India Standard Time (fixed UTC+05:30); the default range
  is the current month.
- **No margin, profit, estimate, projection or utilisation** is computed — the
  system records no cost of goods sold and no machine time.
- **Inventory** (Stage 22) comes from `lib/inventory`: ledger-backed balances.
  An item with no opening balance is *not tracked* — never zero, never out of
  stock. Inventory value is quantity × latest unit cost, and is shown only when
  every tracked item has a cost; otherwise "unavailable".
- **Revenue by category** (Stage 22) uses the category snapshotted on each
  catalog line when it was ordered, over the same lines as product performance.
  Lines placed before Stage 22 carry no category and are reported as
  "historical category data unavailable", never assigned by name. Custom prints
  have no category and are reported beside the categories.

Cost: each figure is one aggregate query (`FILTER` clauses, `GROUP BY`), never a
loop over rows; the analytics tests aggregate 5,000 orders. Catalog health reads
the CMS four times whatever the catalog size and is cached for 60 seconds under
the `catalog` content tag, so a publish refreshes it. React `cache` dedupes
reads shared by the page and the action centre within a request.

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
| `analytics/*` | the command centre's analytics services (above) |

## What the console deliberately does not have

- **Quotes.** They are calculated and never stored, so there is nothing to list.
- **Printers.** A job records the machine it was assigned to; there is no machine
  registry, no utilisation and no maintenance state. Analytics counts active
  jobs per assigned machine id and says why it shows no utilisation.
- **Procurement beyond one step.** A purchase is ordered and received (or
  cancelled); there are no purchase-order approvals, partial receipts, invoices
  or GST. Inventory movements are append-only; a correction is an adjustment.
- **Automatic material deduction.** Usage is recorded by an operator against a
  job that has started printing; nothing estimates filament from geometry.
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
still wired to every page, action and read — including every analytics module —
and that nothing outside the console imports its read models.

`analytics/analytics.test.ts` covers ranges, stage grouping, catalog counting and
the action centre's links; `analytics/persistence.test.ts` runs every service
against PGlite (empty data, IST boundaries, exclusions, chip/list parity, a
5,000-order table); `analytics/access.test.ts` covers who is an operator.
