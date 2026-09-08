# Cart, checkout and payment

Five domain concepts, kept separate on purpose:

| Concept | Means | Lives in |
| --- | --- | --- |
| **Product** | Something SADA 3D sells | `lib/catalog` |
| **Quote** | A price for a customer's own geometry | `lib/pricing` |
| **Cart** | What a customer intends to buy | `lib/cart` |
| **Order** | What SADA 3D has accepted to fulfil | `lib/checkout` |
| **Manufacturing job** | What a machine will make | Phase 12 |

Collapsing any two of them would make the system lie somewhere. A cart line is
not an order; an order is not a job; "paid" is not a point on the same scale as
"printing".

```
Product ──┐
          ├─► Cart intent ─► Cart service ─► Cart ─┐
Quote ────┘                                        │
                                                   ▼
                                    Checkout validation
                                    (revalidate · price · policies)
                                                   │
                                                   ▼
                                    Idempotency reservation
                                                   │
                                                   ▼
                                    Payment adapter
                                                   │
                                                   ▼
                                              Order
```

## Money

**Integer whole rupees, everywhere.** No paise, no minor units, no floats
carrying fractions of a rupee. `formatINR` renders with zero decimals and is the
only formatter in the system. A stored money value is a whole number of rupees;
if that ever needs to change it changes in one place, and the column type
changes with it.

## What the cart stores, and what it does not

A stored line carries **identity, configuration and quantity**. It does not
carry a price the system will honour.

Every price is resolved on read:

- a catalog line is priced from the catalog as it is now;
- a custom line is priced by running the quote engine again over the stored
  configuration.

`priceAtAdd` and `quote.total` are recorded by the *server* and exist for one
purpose: noticing that the figure has moved so the customer can be told. They
are never the number charged. A tampered store cannot change a total — the worst
it can do is ask for a different product, at that product's real price.

## Line identity

| Type | Key |
| --- | --- |
| catalog | product + material + colour + quality |
| custom | model + material + quality + finish |

Adding something whose key already exists increases that line's quantity.
Anything else becomes its own line. PLA/black and PETG/black are different parts
to make, so they are different lines.

Custom lines merge only on a **complete** match — the same model made the same
way, which is one job done twice. They are never merged on a partial match: a
manufacturing job is defined by all of its inputs. In practice each upload gets
its own model id, so merging is rare by construction.

`mergeCarts` applies the same rule when a guest cart meets an account cart. It
is defined now so the behaviour is a decision rather than an accident when
authentication arrives in Phase 17.

## Persistence

`CartRepository` is the seam. The current implementation keeps the cart in an
**HttpOnly cookie**:

- it survives navigation and a browser restart, which `sessionStorage` does not;
- it is read and written only on the server, so no mutation can bypass the
  service's validation;
- it needs no infrastructure that is not provisioned.

Its limits are real: one browser, no cross-device cart, a few kilobytes of room.
Acceptable for a guest cart, not for an account cart — which is why the
interface exists. `repository.ts` documents the `carts` / `cart_items` schema it
maps onto.

A second cookie holds only the **unit count** and is readable by the browser, so
the header badge can render without making every page in the site dynamic. It is
written by the same code that writes the cart, so the two cannot disagree.

## Totals

`calculateCartTotals` is the only arithmetic layer. The cart page, the checkout
page, the order summary and the header count all read what it produces.

Shipping and tax are **unknown, not zero**. Zero is a claim — that delivery is
free, that no tax applies — and neither is something this system knows. An
unknown component is named to the customer and excluded from the total, so the
figure shown is one that can be stood behind. `lib/checkout/policies.ts` holds
both seams; no rate appears anywhere in the codebase.

## What blocks checkout

| Issue | Why |
| --- | --- |
| `product_unavailable` | It left the catalog |
| `product_not_purchasable` | Quote-only: it is bought through custom print |
| `price_changed` | The customer agreed to a different figure |
| `quote_stale` | The configuration no longer produces the quoted total |
| `quote_unavailable` | The configuration cannot be quoted |
| `model_file_pending` | The manufacturing file cannot be reached |

A price change is **blocking**, not a notice. The customer is shown both figures
and accepts the new one explicitly; accepting re-reads the price from the
catalog, so agreeing to a change cannot be turned into setting a price.

## The custom-part invariant

> A custom part does not become an order unless its manufacturing file can be
> durably referenced for fulfilment.

Today it cannot: the file is still in the browser, exactly as Phase 7 left it.
So a custom line can be added to the cart, priced and edited — and checkout
refuses to turn it into an order, saying why. An order whose file cannot be
retrieved is an order that cannot be made, and creating one would be a promise
the system has no way to keep.

`modelFileAvailability` in `lib/custom-print/storage.ts` is the seam. Phase 16
replaces the local adapter with a presigned R2 upload and this stops returning
false — nothing else changes.

## Checkout

One page, two columns, one submit. The sequence in `checkout/service.ts` is
fixed, and each step exists because skipping it would let something untrue reach
an order:

1. load the cart from the server's own store
2. revalidate every line against the catalog and the pricing rules
3. validate the customer's details
4. compute the total from the revalidated lines and the policies
5. reserve an idempotency key
6. create the payment session **for the server's figure**
7. record the order
8. clear the cart

The browser sends a name, an email, a phone number and an address. Every rupee
comes from the server.

## Idempotency

Two identical checkout requests must produce one order and one payment attempt.
Disabling the submit button is not a mechanism — a refresh, a retry on a flaky
connection or a second tab all defeat it.

The key is derived server-side from the cart's identity, its contents and the
destination, so a caller cannot choose it and cannot avoid it. The reservation
is taken **before** the payment session is created, because the window that
matters is between starting a payment and recording the order.

The store is in-process today; Upstash Redis is what the interface is shaped
for, and is the right home for short-lived state shared between instances —
which a cart is not.

## Payments

Provider-agnostic. Nothing outside `lib/payment` names a provider or uses a
provider's field names.

The current adapter is **mock**: it contacts nothing, holds no credentials and
moves no money, and the checkout says so where the customer would otherwise be
asked to believe a payment happened. Razorpay is the intended provider and is
deliberately not implemented — an integration written against documentation,
with no credentials to test it, would be a claim rather than an integration.

A build that names a provider it cannot implement **fails loudly** rather than
falling back to the mock. Silently substituting a fake payment for a real one is
the worst outcome available here.

Card numbers, CVVs and provider credentials never cross the payment boundary.
The system holds a session reference and a status.

## Orders

`OrderRepository` is the seam; storage is in-process and provisional, and
`orders.ts` documents the `orders` / `order_items` schema it maps onto. Creating
an order and its items is one write here and must be one transaction in
Postgres: an order without its items is not a partial order, it is a corrupt
one.

Order status is commercial only — `pending`, `awaiting_payment`, `paid`,
`payment_failed`, `cancelled`. Nothing here describes a machine or a queue.

The confirmation says the order has been received and nothing more. It does not
say a part has been queued, scheduled or started, because none of that exists
yet.
