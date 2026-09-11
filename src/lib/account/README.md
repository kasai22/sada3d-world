# The customer account

The account is a **view onto what already exists**, plus one thing nothing else
provides: ownership.

```
ACCOUNT UI                    pages under app/(site)/account
      ↓
CUSTOMER DOMAIN SEAMS         lib/account — orders · designs · saved · addresses
      ↓
AUTH ADAPTER                  lib/account/identity.ts
      ↓
SUPABASE AUTH                 lib/auth — see lib/auth/README.md
```

Orders, their four state machines and the customer-safe manufacturing
projection belong to `lib/orders` and `lib/manufacturing`. Nothing here
aggregates a status, transitions anything or re-decides what a customer may be
told about production. Two implementations of those rules would eventually
disagree, and the customer would be shown a status the items do not support.

## The authorization boundary

One rule, and everything rests on it:

> **An identity is produced by the auth adapter and by nothing else.**

No function in this module accepts a customer id from a URL, a query string, a
form field, a header or a browser-writable cookie. There is no parameter one
could be passed in. A request cannot name a customer, so there is no request
that names the wrong one.

| Read | Takes |
| --- | --- |
| `listCustomerOrders` | an identity |
| `getCustomerOrder` | an identity **and** a reference |
| `listActiveManufacturing` | an identity |
| `listCustomerDesigns` | an identity |
| `listSavedProducts` | an identity |
| `listCustomerAddresses` | an identity |

There is no exported `getOrder(reference)`. Every repository lookup that could
be scoped to a customer is scoped to one — `addressRepository.get(customerId,
addressId)` takes both, so an id belonging to someone else *misses* rather than
matching and then needing a check that a later refactor could drop.

`ownsOrder` is written so an absent owner can never match:

```ts
typeof order.customerId === "string" && order.customerId === identity.id
```

`undefined === undefined` would make every guest order belong to every
customer. That is the bug this shape exists to prevent, and there is a test for
it.

## Where the customer comes from

Since Stage 17, `resolveCustomerAuthAdapter()` returns the Supabase adapter
whenever `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
configured: the session is validated with Supabase on the server and mapped to a
`cus_…` customer id through the `customers` table. See `lib/auth/README.md`.

Without that configuration, `noCustomerAuth` returns null — in production every
account route renders its sign-in requirement and there is no fallback. A
broken configuration (one variable missing, a service-role key in the public
variable) also signs nobody in.

`developmentCustomerAuth` exists so the portal can be built, reviewed and
tested. Four properties keep it from being an authentication mechanism:

- disabled by a hard `NODE_ENV === "production"` check with **no environment
  override** — unlike the demo orders, which a preview deployment may opt into;
- it reads nothing from the request, so nothing a browser sends turns it on or
  changes who it says you are;
- it is a constant, not a session: it cannot sign in, sign out or expire;
- every surface rendered under it says it is a development identity.

`SADA_DEV_ACCOUNT=0` switches it off locally, which shows what production shows.

The Phase 12 demonstration orders are attributed to it, and only to it. In a
production build they carry no `customerId` and remain the ownerless guest
orders they always were. Nothing is seeded for the account: with the
development identity off, the portal shows empty states.

## The guest path is untouched

`/orders/[reference]` still runs on the Phase 12 grants — the receipt cookie, or
a lookup proving the reference and the email together. `/account/orders/[ref]`
does **not** accept those: an account page that honoured a receipt cookie would
show orders the account does not own. The two paths answer to two different
proofs and neither weakens the other.

Stage 17 made the account path real — `Supabase identity → customer ownership →
order access → safe tracking DTO` — and kept the grants for guest orders, which
have no owner to match. The two proofs remain separate.

## Projection

Every collection crosses the boundary as a view type built from safe fields,
never as a stored record with something deleted from it:

| Domain | View | Removed |
| --- | --- | --- |
| `CustomerDesign` | `CustomerDesignView` | `fileKey`, `previewKey`, `customerId` |
| `CustomerAddress` | `CustomerAddressView` | `customerId` |
| `Order` | `CustomerOrderSummary` | contact, address, payment session |

Built rather than trimmed, for the same reason `toCustomerTracking` is: a new
private field cannot leak by being forgotten.

The order *detail* page is the exception that proves it — it renders the Phase
12 `OrderTrackingView` on the full order, because that view is already the
reviewed boundary for exactly this, and a second order view would be a second
chance to leak something.

## What is real, and what is not

| | State |
| --- | --- |
| Orders, tracking, ownership | **Real.** Phase 12 domain, ownership added |
| Addresses | **Real behaviour, provisional storage.** In-process, like orders |
| Saved items | **Real behaviour, provisional storage.** Nothing seeded |
| Designs | **Not available.** Needs Phase 16 file storage |
| Identity | **Real.** Supabase Auth → `customers` mapping (Stage 17); development identity only without Supabase, never in production |
| Profile editing | **Not available.** The identity provider owns the record |
| Notifications | **Do not exist.** Not a toggle, not a store, not a stub |

`unavailable` and `empty` are kept distinct throughout. "You have no saved
designs" and "designs cannot be stored yet" are different sentences and only one
of them is true.

## Storage

`SavedItemRepository` and `CustomerAddressRepository` are in-process and held on
`globalThis`, the same shape and the same limits as the Phase 12 order store,
because Postgres arrives with Payload in Phase 14. Both files document the
relational model they map onto, including the partial unique index that holds
the one-default-address invariant.

`CustomerDesignRepository` has no implementation, on purpose. A design record
naming a file that cannot be retrieved is a filename, not a design.

## The default address

**A customer with any addresses has exactly one default.** The first saved
becomes it; a new default demotes the old one in the same write; deleting the
default promotes the next. `withSingleDefault` is the only place that decides
it, because a UI cannot be trusted with an invariant that two browser tabs can
break.

## Cart merge

`mergeCarts` already exists in `lib/cart/identity.ts`, defined in Phase 11 for
exactly this moment. Nothing here duplicates it. When Phase 17 lands, a guest
cart meets an account cart through that function and the existing line-identity
rule: matching configurations combine, everything else becomes its own line,
nothing is dropped and nothing merges on a partial match.

## The return path

`safeReturnPath` allows account paths and refuses everything else — absolute
URLs, protocol-relative `//host`, backslash forms, control characters, and
in-site paths outside the portal. An allowlist, so it cannot be widened by a
form of URL nobody thought of.
