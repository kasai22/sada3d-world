# Inventory (Stage 22)

The source of record for what Reality 3D holds: raw materials, finished
products, consumables. Read and written only through the operations console
(`/ops/inventory`); customers have no path to any of it.

```
operator form ─▶ app/(ops)/ops/inventory/actions.ts   currentOperator()
                     │
                     ▼
               lib/inventory/service.ts   validate → BEGIN → SELECT item FOR UPDATE
                     │                     → append movement → move balance → COMMIT
                     ▼
   inventory_items (balance)  +  inventory_movements (append-only ledger)
                     ▲
               lib/inventory/read.ts      aggregate summary, item list, paged movements,
                                           per-item reconciliation
```

## Rules

| Rule | Where |
| --- | --- |
| A balance changes only with a movement, in one transaction, with the item row locked | `service.ts#writeMovement` |
| `current_quantity` NULL = **not tracked**; zero is a count | schema, `rules.ts#stockStatus` |
| Stock never goes below zero | `rules.ts#applyDelta`, CHECK constraints |
| The ledger cannot be edited or deleted | trigger in migration `0005` |
| An opening balance is recorded once; corrections are adjustments with a reason | `applyDelta`, `REASON_REQUIRED` |
| A purchase moves stock only when its receipt is confirmed | `receivePurchase` |
| Receiving into an untracked item needs the operator to confirm there was no stock before; that zero is recorded as the opening balance | `receive` |
| Material usage names a production job that has started printing (from the event log) | `recordStockMovement` |
| Status: OUT_OF_STOCK (0), REORDER (≤ reorder level), HEALTHY (above it), NO_REORDER_LEVEL, NOT_TRACKED | `rules.ts` |
| Reorder quantity = max(target − current, 0), unknown when either is | `rules.ts` |
| Value = quantity × latest unit cost; unavailable unless every tracked item has a cost | `read.ts`, analytics |
| Quantities are exact thousandths (integers in code, `numeric(14,3)` in SQL); costs are whole rupees per unit | `rules.ts` |

## Definitions

"Create inventory definitions" (idempotent) adds, with no quantity and no cost:

- every material the decision ledger makes AVAILABLE, in each approved colour
  (today PLA, PETG, TPU × black, white) — never a roadmap material;
- every non-archived CMS product, linked by its catalog id. The catalog stays
  authoritative for the product's name and SKU.

Nothing seeds stock. The Excel inventory tracker is not read; it can stay a
planning sheet, but `/ops` reads only this database.

## Not here

Procurement workflows, invoices, GST, automatic filament estimation,
forecasting, and any customer-facing stock count.
