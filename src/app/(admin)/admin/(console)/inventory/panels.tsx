import Link from "next/link";

import { Icon } from "@/components/core/Icon";
import styles from "@/components/ops/command/command.module.css";
import { EmptyState } from "@/components/ops/EmptyState";
import { ActionForm, Field } from "@/components/ops/inventory/ActionForm";
import {
  STATUS_TONE,
  capitalise,
  costPerUnit,
  formatCost,
  levelText,
  nextStep,
  signedQuantity,
  stockText,
  todayInIndia,
} from "@/components/ops/inventory/display";
import form from "@/components/ops/inventory/inventory.module.css";
import { Pagination } from "@/components/ops/Pagination";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import { Panel } from "@/components/structure/Panel";
import { LocalTime } from "@/components/tracking/LocalTime";
import type { ItemLedger, MovementView, PurchaseView, SupplierView, UsableJob } from "@/lib/inventory/read";
import {
  CONSUMABLE_CATEGORIES,
  GROUP_LABEL,
  ITEM_TYPE_LABEL,
  MANUAL_MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABEL,
  STOCK_STATUS_LABEL,
  formatQuantity,
  type InventoryMovementType,
} from "@/lib/inventory/rules";
import { formatCount } from "@/lib/ops/format";

import {
  cancelPurchaseAction,
  createPurchaseAction,
  createSupplierAction,
  movementAction,
  openingBalanceAction,
  receivePurchaseAction,
  updateItemAction,
} from "./actions";

const QUANTITY_PATTERN = String.raw`\d{1,11}(\.\d{1,3})?`;
const COST_PATTERN = String.raw`\d{1,8}(\.\d{1,2})?`;

const LEDGER_ORDER: readonly InventoryMovementType[] = [
  "OPENING_BALANCE",
  "PURCHASE",
  "USAGE",
  "SALE",
  "RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "WASTE",
];

/* ------------------------------------------------------------------ *
 * One item: stock, why, and the controlled ways it changes
 * ------------------------------------------------------------------ */

export interface ItemUsedBy {
  productId: string;
  name: string | null;
  href: string | null;
  perUnit: string;
  notes: string | null;
}

export function ItemPanel({
  ledger,
  closeHref,
  suppliers,
  jobs,
  usedBy = [],
}: {
  ledger: ItemLedger;
  closeHref: string;
  suppliers: readonly SupplierView[];
  jobs: readonly UsableJob[];
  /** Stage 22.7: products whose expected consumption names this item. */
  usedBy?: readonly ItemUsedBy[];
}) {
  const { item, reconciliation } = ledger;
  const isMaterial = item.group === "RAW_MATERIAL";
  const isConsumable = item.itemType === "CONSUMABLE";
  const activeSuppliers = suppliers.filter((supplier) => supplier.active || supplier.id === item.supplierId);

  return (
    <Panel
      title={item.group === "RAW_MATERIAL" && item.material ? `${item.material.toUpperCase()} — ${capitalise(item.colour)}` : item.name}
      titleAs="h2"
      meta={`${ITEM_TYPE_LABEL[item.itemType]} · per ${item.unit}`}
      actions={
        <Link href={closeHref} className={form.close}>
          <Icon name="x" size={14} />
          Close
        </Link>
      }
      padded={false}
      id="item"
    >
      <div className={form.summary}>
        <div className={form.figure}>
          <span className={form.figureLabel}>Stock</span>
          <span className={form.figureValue}>{stockText(item.current, item.unit)}</span>
          <StatusBadge tone={STATUS_TONE[item.status]}>{STOCK_STATUS_LABEL[item.status]}</StatusBadge>
        </div>
        <div className={form.figure}>
          <span className={form.figureLabel}>Reorder at · target</span>
          <span className={form.figureValue}>
            {levelText(item.reorderLevel, item.unit)} · {levelText(item.targetStock, item.unit)}
          </span>
          <span className={form.figureNote}>
            {item.reorderQuantity === null ? "Reorder quantity needs stock and a target" : `Reorder ${formatQuantity(item.reorderQuantity, item.unit)}`}
          </span>
        </div>
        <div className={form.figure}>
          <span className={form.figureLabel}>Unit cost · value</span>
          <span className={form.figureValue}>
            {costPerUnit(item.unitCost, item.unit)} · {item.value === null ? "Unavailable" : formatCost(item.value)}
          </span>
          <span className={form.figureNote}>{item.unitCostSource ? `From ${item.unitCostSource}` : "No cost recorded"}</span>
        </div>
        <div className={form.figure}>
          <span className={form.figureLabel}>Next step</span>
          <span className={form.figureValue}>{nextStep(item)}</span>
          <span className={form.figureNote}>
            {[item.supplierName ? `Usually from ${item.supplierName}` : "No usual supplier", item.category].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
      {item.notes && <p className={form.notes}>{item.notes}</p>}

      <div className={form.grid}>
        <section aria-labelledby="ledger-title">
          <h3 id="ledger-title" className={form.subheading}>
            Why it has what it has
          </h3>
          {item.current === null ? (
            <EmptyState compact icon="info" title="Not tracked">
              <p>No opening count has been entered, so the stock is unknown. Unknown is not zero.</p>
            </EmptyState>
          ) : (
            <table className={form.ledger}>
              <caption className="u-visually-hidden">Ledger reconciliation</caption>
              <tbody>
                {LEDGER_ORDER.filter((type) => type === "OPENING_BALANCE" || reconciliation.byType[type] !== 0).map((type) => (
                  <tr key={type}>
                    <th scope="row">{MOVEMENT_TYPE_LABEL[type]}</th>
                    <td>{signedQuantity(reconciliation.byType[type], item.unit)}</td>
                  </tr>
                ))}
                <tr className={form.ledgerTotal}>
                  <th scope="row">Ledger balance</th>
                  <td>{formatQuantity(reconciliation.ledgerBalance, item.unit)}</td>
                </tr>
                <tr>
                  <th scope="row">Current stock</th>
                  <td>
                    {stockText(item.current, item.unit)}{" "}
                    {reconciliation.balanced ? (
                      <StatusBadge tone="success">Reconciled</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">Does not reconcile</StatusBadge>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="record-title">
          {item.current === null ? (
            <>
              <h3 id="record-title" className={form.subheading}>
                Enter opening stock
              </h3>
              <ActionForm action={openingBalanceAction} submitLabel="Record opening count" variant="primary" hidden={{ itemId: item.id }}>
                <Field label={`Counted quantity (${item.unit})`} hint="Zero if the shelf is empty.">
                  <input name="quantity" inputMode="decimal" required pattern={QUANTITY_PATTERN} />
                </Field>
                <Field label={`Unit cost (₹ per ${item.unit})`} hint="Optional. What Reality 3D paid, e.g. 0.50.">
                  <input name="unitCost" inputMode="decimal" pattern={COST_PATTERN} />
                </Field>
                <Field label="Count date">
                  <input name="occurredAt" type="date" max={todayInIndia()} defaultValue={todayInIndia()} required />
                </Field>
                <Field label="Reference" hint="Where the count is recorded, e.g. stock-take sheet 16 Sep.">
                  <input name="reference" required maxLength={200} />
                </Field>
              </ActionForm>
            </>
          ) : (
            <>
              <h3 id="record-title" className={form.subheading}>
                Record a movement
              </h3>
              <ActionForm action={movementAction} submitLabel="Record movement" variant="primary" hidden={{ itemId: item.id }}>
                <Field label="Movement">
                  <select name="type" required defaultValue="">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {MANUAL_MOVEMENT_TYPES.filter((type) => item.group === "FINISHED_PRODUCT" || type !== "SALE").map((type) => (
                      <option key={type} value={type}>
                        {type === "USAGE" && !isMaterial ? "Used" : MOVEMENT_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Quantity (${item.unit})`}>
                  <input name="quantity" inputMode="decimal" required pattern={QUANTITY_PATTERN} />
                </Field>
                <Field label="Date">
                  <input name="occurredAt" type="date" max={todayInIndia()} defaultValue={todayInIndia()} />
                </Field>
                {item.group !== "FINISHED_PRODUCT" && (
                  <Field
                    label={isMaterial ? "Production job (required for usage)" : "Production job (optional)"}
                    hint={jobs.length === 0 ? "No job has started printing yet." : "Only jobs that have started printing."}
                  >
                    <select name="jobId" defaultValue="">
                      <option value="">{isMaterial ? "Choose a job…" : "Not for a job"}</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.orderReference} · {job.itemName}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {item.group === "FINISHED_PRODUCT" && (
                  <Field label="Order reference" hint="For a sale or a return, e.g. S3D-000184.">
                    <input name="orderReference" maxLength={64} />
                  </Field>
                )}
                <Field label="Reference" hint="Optional, e.g. a maintenance log entry.">
                  <input name="reference" maxLength={200} />
                </Field>
                <Field
                  label="Reason"
                  hint={
                    isMaterial
                      ? "Required for adjustments and waste."
                      : "Required for adjustments, waste, and usage that is not for a production job."
                  }
                  wide
                >
                  <textarea name="notes" maxLength={500} />
                </Field>
              </ActionForm>
            </>
          )}
        </section>
      </div>

      {item.group !== "FINISHED_PRODUCT" && (
        <section className={form.usedBy} aria-labelledby="used-by-title">
          <h3 id="used-by-title" className={form.subheading}>
            Used by products · expected per unit
          </h3>
          {usedBy.length === 0 ? (
            <p className={form.usedByEmpty}>No product lists this item in its Production &amp; Consumption yet.</p>
          ) : (
            <ul className={form.usedByList}>
              {usedBy.map((entry) => (
                <li key={entry.productId}>
                  <span>
                    {entry.href ? (
                      <Link href={`${entry.href}?tab=production`} className={form.cellLink}>
                        {entry.name ?? entry.productId.toUpperCase()}
                      </Link>
                    ) : (
                      `${entry.productId.toUpperCase()} (not in the CMS catalog)`
                    )}
                    {entry.notes && <span className={form.usedByNote}> · {entry.notes}</span>}
                  </span>
                  <span className={form.usedByQty}>{entry.perUnit} / unit</span>
                </li>
              ))}
            </ul>
          )}
          <p className={form.usedByEmpty}>A reference only: listing an item on a product never changes its stock.</p>
        </section>
      )}

      <details className={form.details}>
        <summary>Thresholds, cost, supplier{isConsumable ? ", category" : ""} and notes</summary>
        <ActionForm action={updateItemAction} submitLabel="Save settings" hidden={{ itemId: item.id }}>
          <Field label={`Reorder level (${item.unit})`} hint={item.reorderLevel === null ? "Not set" : `Now ${levelText(item.reorderLevel, item.unit)}`}>
            <input name="reorderLevel" inputMode="decimal" pattern={QUANTITY_PATTERN} />
          </Field>
          <Field label={`Target stock (${item.unit})`} hint={item.targetStock === null ? "Not set" : `Now ${levelText(item.targetStock, item.unit)}`}>
            <input name="targetStock" inputMode="decimal" pattern={QUANTITY_PATTERN} />
          </Field>
          <Field label={`Unit cost (₹ per ${item.unit})`} hint={item.unitCost === null ? "Missing" : `Now ${costPerUnit(item.unitCost, item.unit)}`}>
            <input name="unitCost" inputMode="decimal" pattern={COST_PATTERN} />
          </Field>
          <Field label="SKU" hint={item.sku ?? "Not assigned"}>
            <input name="sku" maxLength={64} />
          </Field>
          <Field label="Usual supplier" hint={item.supplierName ?? "None"}>
            <select name="supplierId" defaultValue="">
              <option value="">Unchanged</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </Field>
          {isConsumable && (
            <Field label="Category" hint={item.category ?? "None"}>
              <select name="category" defaultValue="">
                <option value="">Unchanged</option>
                {CONSUMABLE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="In use">
            <select name="active" defaultValue="">
              <option value="">Unchanged</option>
              <option value="true">Active</option>
              <option value="false">Inactive — hide from lists</option>
            </select>
          </Field>
          <Field label="Notes" hint={item.notes ? "Replaces the current note." : "Optional."} wide>
            <textarea name="notes" maxLength={500} />
          </Field>
          <Field label="Clear" wide>
            <span className={form.checks}>
              {[
                ["reorderLevel", "reorder level"],
                ["targetStock", "target"],
                ["unitCost", "cost"],
                ["supplierId", "supplier"],
                ["notes", "notes"],
              ].map(([value, label]) => (
                <label key={value} className={form.check}>
                  <input type="checkbox" name="clear" value={value} /> {label}
                </label>
              ))}
            </span>
          </Field>
        </ActionForm>
      </details>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Movements
 * ------------------------------------------------------------------ */

export function MovementsPanel({
  movements,
  title,
  itemHref,
  pageHref,
  limitNote,
}: {
  movements: { rows: MovementView[]; total: number; page: number; pageCount: number };
  title: string;
  itemHref: (itemId: string) => string;
  pageHref?: (page: number) => string;
  limitNote?: string;
}) {
  return (
    <Panel title={title} titleAs="h2" meta={limitNote ?? `${formatCount(movements.total)} recorded · append-only`} padded={false}>
      {movements.total === 0 ? (
        <EmptyState compact icon="activity" title="No inventory movement yet">
          <p>Opening counts, purchases received, usage, sales, returns, adjustments and waste appear here, newest first.</p>
        </EmptyState>
      ) : (
        <TableFrame label={title} caption="Inventory movements, newest first">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Item</Th>
              <Th>Movement</Th>
              <Th align="right">Quantity</Th>
              <Th align="right" hide="md">
                Balance after
              </Th>
              <Th hide="sm">Reference</Th>
              <Th hide="lg">Operator</Th>
            </tr>
          </thead>
          <tbody>
            {movements.rows.map((movement) => (
              <Tr key={movement.id}>
                <Td nowrap mono>
                  <LocalTime value={movement.occurredAt} dateOnly />
                </Td>
                <Td>
                  <Stack
                    primary={
                      <Link href={itemHref(movement.itemId)} className={form.cellLink}>
                        {movement.itemName}
                      </Link>
                    }
                    secondary={GROUP_LABEL[movement.itemType === "RAW_MATERIAL" || movement.itemType === "FINISHED_PRODUCT" ? movement.itemType : "CONSUMABLE"]}
                  />
                </Td>
                <Td>
                  <Stack primary={MOVEMENT_TYPE_LABEL[movement.type]} secondary={movement.notes ?? undefined} />
                </Td>
                <Td align="right" mono nowrap>
                  <span className={movement.delta < 0 ? form.out : form.in}>{signedQuantity(movement.delta, movement.unit)}</span>
                </Td>
                <Td align="right" mono nowrap hide="md">
                  {formatQuantity(movement.balanceAfter, movement.unit)}
                </Td>
                <Td hide="sm">
                  <Stack
                    primary={movement.referenceId ?? movement.referenceType}
                    secondary={[movement.referenceType, movement.supplierName, movement.unitCost !== null ? costPerUnit(movement.unitCost, movement.unit) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                </Td>
                <Td hide="lg" muted>
                  {movement.createdBy}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableFrame>
      )}
      {pageHref && movements.pageCount > 1 && (
        <Pagination
          label="Inventory movements"
          page={movements.page}
          pageCount={movements.pageCount}
          total={movements.total}
          pageSize={20}
          hrefFor={pageHref}
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Purchases
 * ------------------------------------------------------------------ */

export function PurchasesPanel({
  purchases,
  items,
  suppliers,
  selectedItemId,
}: {
  purchases: readonly PurchaseView[];
  items: readonly { id: string; name: string; unit: string; current: number | null; group: string }[];
  suppliers: readonly SupplierView[];
  selectedItemId?: string;
}) {
  const untracked = new Set(items.filter((item) => item.current === null).map((item) => item.id));
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const groups = ["RAW_MATERIAL", "CONSUMABLE", "FINISHED_PRODUCT"] as const;

  return (
    <>
      <Panel title="Awaiting receipt" titleAs="h2" meta={`${formatCount(purchases.length)} open`} padded={false}>
        {purchases.length === 0 ? (
          <EmptyState compact icon="package" title="No purchases awaiting receipt">
            <p>Record a purchase below when stock is ordered. Stock moves only when receipt is confirmed.</p>
          </EmptyState>
        ) : (
          <TableFrame label="Open purchases" caption="Purchases ordered and not yet received">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th hide="sm">Supplier</Th>
                <Th align="right">Quantity</Th>
                <Th align="right" hide="md">
                  Unit cost
                </Th>
                <Th hide="md">Reference</Th>
                <Th align="right">Receipt</Th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <Tr key={purchase.id}>
                  <Td>
                    <Stack primary={purchase.itemName} secondary={`${ITEM_TYPE_LABEL[purchase.itemType]} · ordered by ${purchase.createdBy}`} />
                  </Td>
                  <Td hide="sm" muted={!purchase.supplierName}>
                    {purchase.supplierName ?? "—"}
                  </Td>
                  <Td align="right" mono nowrap>
                    {formatQuantity(purchase.quantity, purchase.unit)}
                  </Td>
                  <Td align="right" mono nowrap hide="md" muted={purchase.unitCost === null}>
                    {purchase.unitCost === null ? "Not given" : costPerUnit(purchase.unitCost, purchase.unit)}
                  </Td>
                  <Td hide="md">{purchase.reference ?? "—"}</Td>
                  <Td align="right">
                    <div className={form.actions}>
                      <ActionForm action={receivePurchaseAction} submitLabel="Confirm receipt" variant="primary" compact hidden={{ purchaseId: purchase.id }}>
                        {untracked.has(purchase.itemId) && (
                          <label className={form.check}>
                            <input type="checkbox" name="startsFromZero" required /> No stock before this
                          </label>
                        )}
                      </ActionForm>
                      <ActionForm action={cancelPurchaseAction} submitLabel="Cancel" variant="destructive" compact hidden={{ purchaseId: purchase.id }} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Panel>

      <Panel title="Record a purchase" titleAs="h2" meta="Raw material, consumable or finished product" padded={false}>
        {items.length === 0 ? (
          <EmptyState compact icon="boxes" title="Nothing to buy yet">
            <p>Define an item first. A purchase is always for a defined item, so its unit and cost stay consistent.</p>
          </EmptyState>
        ) : (
          <ActionForm action={createPurchaseAction} submitLabel="Record purchase" variant="primary">
            <Field label="Item">
              <select name="itemId" required defaultValue={selectedItemId ?? ""}>
                <option value="" disabled>
                  Choose…
                </option>
                {groups.map((group) => {
                  const options = items.filter((item) => item.group === group);
                  return options.length === 0 ? null : (
                    <optgroup key={group} label={GROUP_LABEL[group]}>
                      {options.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </Field>
            <Field label="Supplier" hint={activeSuppliers.length === 0 ? "Add suppliers on the Suppliers tab." : "Optional."}>
              <select name="supplierId" defaultValue="">
                <option value="">None</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity" hint="In the item's unit.">
              <input name="quantity" inputMode="decimal" required pattern={QUANTITY_PATTERN} />
            </Field>
            <Field label="Unit cost (₹ per unit)" hint="From the invoice, e.g. 250 per pack or 0.50 per label.">
              <input name="unitCost" inputMode="decimal" pattern={COST_PATTERN} />
            </Field>
            <Field label="Supplier reference" hint="Invoice or order number.">
              <input name="reference" maxLength={200} />
            </Field>
            <Field label="Received on" hint="Used only when received now.">
              <input name="receivedAt" type="date" max={todayInIndia()} defaultValue={todayInIndia()} />
            </Field>
            <Field label="Receipt" wide>
              <span className={form.checks}>
                <label className={form.check}>
                  <input type="checkbox" name="receivedNow" /> Received now — add it to stock
                </label>
                <label className={form.check}>
                  <input type="checkbox" name="startsFromZero" /> The item had no stock before this (untracked items only)
                </label>
              </span>
            </Field>
          </ActionForm>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

export function SuppliersPanel({ suppliers, supplierHref }: { suppliers: readonly SupplierView[]; supplierHref: (id: string) => string }) {
  return (
    <>
      <Panel title="Suppliers" titleAs="h2" meta={`${formatCount(suppliers.filter((supplier) => supplier.active).length)} active`} padded={false}>
        {suppliers.length === 0 ? (
          <EmptyState compact icon="truck" title="No suppliers yet">
            <p>Add the suppliers Reality 3D buys from. They can then be named on items and purchases.</p>
          </EmptyState>
        ) : (
          <TableFrame label="Suppliers" caption="Suppliers">
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th hide="sm">Contact</Th>
                <Th align="right" hide="md">
                  Lead time
                </Th>
                <Th align="right">Items</Th>
                <Th hide="lg">Terms</Th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <Tr key={supplier.id}>
                  <Td>
                    <Stack
                      primary={supplier.name}
                      secondary={[supplier.supplierType, supplier.active ? null : "inactive"].filter(Boolean).join(" · ") || undefined}
                    />
                  </Td>
                  <Td hide="sm">
                    <Stack primary={supplier.contactPerson ?? "—"} secondary={[supplier.phone, supplier.email].filter(Boolean).join(" · ") || undefined} />
                  </Td>
                  <Td align="right" mono hide="md">
                    {supplier.leadTimeDays === null ? "—" : `${supplier.leadTimeDays} d`}
                  </Td>
                  <Td align="right" mono>
                    {supplier.items > 0 ? (
                      <Link href={supplierHref(supplier.id)} className={form.cellLink}>
                        {formatCount(supplier.items)}
                      </Link>
                    ) : (
                      "0"
                    )}
                  </Td>
                  <Td hide="lg" muted={!supplier.paymentTerms}>
                    {supplier.paymentTerms ?? "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Panel>

      <Panel title="Add a supplier" titleAs="h2" padded={false}>
        <ActionForm action={createSupplierAction} submitLabel="Add supplier" variant="primary">
          <Field label="Name">
            <input name="name" required maxLength={200} />
          </Field>
          <Field label="Type" hint="e.g. Filament, Packaging">
            <input name="supplierType" maxLength={64} />
          </Field>
          <Field label="Contact person">
            <input name="contactPerson" maxLength={200} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" maxLength={32} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" maxLength={254} />
          </Field>
          <Field label="Lead time (days)">
            <input name="leadTimeDays" inputMode="numeric" pattern={String.raw`\d{1,3}`} />
          </Field>
          <Field label="Payment terms">
            <input name="paymentTerms" maxLength={200} />
          </Field>
          <Field label="Notes" wide>
            <textarea name="notes" maxLength={500} />
          </Field>
        </ActionForm>
      </Panel>
      <p className={styles.gap}>
        <Icon name="info" size={14} />
        Supplier details and costs are operator data and never leave the admin.
      </p>
    </>
  );
}
