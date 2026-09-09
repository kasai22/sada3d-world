# Orders, manufacturing and shipment

Four independent state machines. They describe related things and they are not
the same thing, so none of them is allowed to stand in for another.

```
ORDER
│
├── order status ............ commercial lifecycle       derived
├── payment ................. a separate fact
│
├── ORDER ITEMS
│    ├── catalog ............ fulfilment status
│    └── custom ............. fulfilment status
│           └── MANUFACTURING JOB
│                 ├── state
│                 ├── events
│                 ├── holds
│                 └── quality
│
└── SHIPMENTS ............... shipment status
```

The customer sees four values, not one:

```
ORDER STATUS + ITEM STATUS + MANUFACTURING STAGE + SHIPMENT STATUS
```

## Why four

An order can hold a stocked gear that ships tomorrow and a custom part that
takes a week. One status could not describe both without lying about one of
them. `partially_fulfilled` is only sayable because neither item was forced to
adopt the other's status.

Likewise, a payment failing is not a manufacturing failure, and a part failing
inspection is not a payment failure. Keeping them apart is what lets each say
something true.

| Machine | Owns | File |
| --- | --- | --- |
| Order status | The commercial lifecycle | `aggregate.ts` |
| Item fulfilment | Where one purchased thing has got to | `types.ts` |
| Manufacturing | How a custom part is being made | `../manufacturing/machine.ts` |
| Shipment | Where a parcel is | `shipment.ts` |

## Order status

`pending · awaiting_payment · confirmed · fulfillment_in_progress ·
partially_fulfilled · fulfilled · cancelled · failed`

**Derived, never assigned.** `aggregateOrderStatus` is the only place these
rules exist; no page, component, route or repository sets `order.status` by any
other means. Two copies of the rules would disagree, and the customer would be
shown a status the items do not support.

Precedence, in order:

1. cancelled — explicitly, or every item cancelled
2. payment incomplete — `pending`, or `awaiting_payment` if it failed
3. every item failed — `failed`
4. anything active — `fulfillment_in_progress`, or `partially_fulfilled` if
   something has already been dispatched
5. nothing active, something dispatched, something still to come —
   `partially_fulfilled`
6. everything dispatched — `fulfilled`
7. otherwise — `confirmed`

A failed payment is `awaiting_payment`, not `failed`: it is recoverable, and
calling it a failed order would close something still open.

## Manufacturing

```
queued → design_review → file_preparation → material_preparation → scheduled
      → printing → post_processing → quality_check → approved → packaging
      → ready_for_dispatch → completed
```

Terminal: `completed`, `cancelled`, `failed`.

`completed` means **manufacturing is finished and the part has been handed to
fulfilment**. It does not mean the customer has it. Delivery belongs to the
shipment.

### Rework

An operational recovery state, not a parallel lifecycle:

```
quality_check → rework → post_processing → quality_check
```

A part that failed inspection is finished again before being inspected again.
The cycle may repeat; each pass increments `reworkCount`.

An unrecoverable rejection is `JOB_FAILED`, not rework. `failed` is for
unrecoverable failure only — a temporary interruption is a hold.

### Holds

A hold is **orthogonal to the state**. "Printing, held for a machine issue" says
two true things; `printing_paused_machine_issue` says one vague one and needs a
twin for every state it could happen in.

```ts
hold?: { reason, startedAt, resolvedAt?, note? }
```

### Quality

`qualityResult` sits beside the state, not inside it. `quality_check` says where
the part is; the result says what was found. A part sitting in inspection has no
result yet, and that is a real and distinct condition.

### Cancellation and failure

`CANCELLABLE_STATES` is **provisional**. SADA 3D has no published cancellation
policy, so it encodes the only defensible default — cancel before the part is on
a machine — and is a constant so the real policy replaces one value rather than
a scattering of conditionals. It is not a statement of commercial terms.

Failure is permitted from every active state and from none of the terminals. A
completed job that turns out wrong is a correction, and corrections are a
separate model this phase does not have.

### Two events, one transition

Some events name the same transition because different operator surfaces report
the same milestone — the materials desk reports `MATERIAL_PREPARED`, the
scheduler reports `JOB_SCHEDULED`, and both mean the job is scheduled. The
machine accepts either and the history records which actually happened.

## Customer projection

Six stages, from fifteen states:

```
DESIGN VERIFIED → PREPARING → PRINTING → QUALITY CHECK → PACKAGING → READY TO SHIP
```

then shipment: `SHIPPED → DELIVERED`.

Every internal state maps to exactly one stage, so the timeline can never show
two at once. `cancelled` and `failed` map to none — a failed job is not at a
stage, and showing it as one would misrepresent it.

**One consequence worth knowing:** `post_processing` maps to `preparing`, so a
part that has printed steps *back* along the six while it is being finished.
`furthestStageReached` exists for that: the timeline marks what a part has
actually been through, so nothing the customer was told un-happens, while the
current stage still says where it is now.

### What never crosses the boundary

Operator notes, actor names, machine identifiers, internal event types, internal
failure codes, unclassified holds. `toCustomerTracking` builds its result from
safe fields rather than copying the job and trimming, so a new internal field
cannot leak by being forgotten.

`machine_issue` reaches the customer as `production_issue`: they are owed the
fact that production stopped, not the identity of the machine that stopped it.

### No invention

- **No progress percentage.** Nothing measures how far through a print a part
  is, so no figure is shown. Progress is stage-based.
- **No estimated completion** unless `estimatedCompletionAt` was set from a real
  estimate. It is never derived from the state: "it is printing" is not an
  arrival date.
- **No carrier or tracking number** unless the shipment carries one.

## Shipment

```
pending → ready → shipped → in_transit → delivered
```

`pending → delivered` is not a transition, and there is no edge from any
manufacturing state into this graph. An item joins a parcel only once it is
`ready`, which is the handoff. Delivery is accepted from `shipped` as well as
`in_transit`, because not every carrier reports the intermediate scan.

## Events, not states

```
POST → { event: "PRINT_COMPLETED" }      the service validates the transition
```

Never a target state. A caller that could say "set this job to completed" would
be a caller that could skip printing. `applyManufacturingEvent` asks the machine
and refuses anything it does not allow, with a reason.

**Idempotency** is by event id: the same report delivered twice is one event, and
the second application appends nothing. A valid repeat of a milestone already
reached is accepted and changes nothing.

**Concurrency** is handled by serialising updates per job, so two operators
reporting the same milestone are decided against the state that is genuinely
current. In Postgres this is a row lock or an optimistic `version` check — which
is why the documented schema carries one.

We keep `currentState + eventHistory`. This is not event sourcing: the state is
stored, not replayed.

## Authorization

Reading an order requires a server-issued grant:

- the **receipt cookie** written when the order was placed, or
- a **lookup** proving the reference and the email together.

Both cookies are HttpOnly. The reference alone is never enough — references are
sequential, so one is a guess anyone can make. A wrong email and an unknown
reference give the identical answer, and repeated failures against one reference
are throttled.

The browser is never the authority. Nothing it sends changes any state.

Phase 17 replaces all of this with account ownership.

## Persistence

`OrderRepository` is the seam; storage is in-process and provisional.
`repository.ts` documents the `orders` / `order_items` / `shipments` /
`manufacturing_jobs` / `manufacturing_events` schema it maps onto. Money is
integer whole rupees, as everywhere else. Timestamps are stored UTC and rendered
in the reader's timezone by `LocalTime`.

## Fixtures

Seven scenarios — queued, printing, quality check, rework, packed, shipped,
mixed — seeded by `fixtures.ts`.

Every one is built by applying **real events through the real state machine**, so
none of them can describe a situation the machine would refuse; a fixture that
stopped being reachable would stop building. Every one is referenced `DEMO-…`,
marked `demo: true`, and labelled as a demonstration wherever it appears.

They are seeded outside production, and in a production build only when
`SADA_DEMO_ORDERS=1`. A real deployment carries none of them.
