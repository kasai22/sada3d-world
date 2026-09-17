"use client";

import { useId, useMemo, useState } from "react";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { entryUnitsFor, lineCostPaise, preferredEntryUnit, toItemUnit, type ConsumptionLineInput } from "@/lib/inventory/consumption-rules";
import { STOCK_STATUS_LABEL, parseQuantity, type StockStatus } from "@/lib/inventory/rules";
import type { OpsTone } from "@/lib/ops/labels";

import styles from "./ConsumptionEditor.module.css";

/** An inventory item a product may consume, as the editor needs it. Plain data. */
export interface ConsumptionInput {
  id: string;
  name: string;
  sku: string | null;
  group: "RAW_MATERIAL" | "FINISHED_PRODUCT" | "CONSUMABLE";
  typeLabel: string;
  material: string | null;
  colour: string | null;
  category: string | null;
  unit: string;
  status: StockStatus;
  unitCost: number | null;
  /** False for an item deactivated since it was added: shown, flagged, never offered. */
  active?: boolean;
}

export type ConsumptionRow = ConsumptionLineInput;

const STATUS_TONE: Record<StockStatus, OpsTone> = {
  NOT_TRACKED: "neutral",
  OUT_OF_STOCK: "danger",
  REORDER: "warning",
  HEALTHY: "success",
  NO_REORDER_LEVEL: "info",
};

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rupeesOf = (paise: number) => RUPEES.format(paise / 100);

const labelOf = (input: ConsumptionInput) =>
  input.group === "RAW_MATERIAL" && input.material
    ? `${input.material.toUpperCase()} · ${input.colour ? input.colour.charAt(0).toUpperCase() + input.colour.slice(1) : "—"}`
    : input.name;

const searchText = (input: ConsumptionInput) =>
  [input.name, input.sku, input.material, input.colour, input.category, input.typeLabel].filter(Boolean).join(" ").toLowerCase();

/** The line's cost in paise when it can be known from real data; null otherwise. */
function costOf(row: ConsumptionRow, input: ConsumptionInput | undefined): number | null {
  if (!input) return null;
  const entered = parseQuantity(row.quantity);
  if (entered === null || entered === 0) return null;
  const converted = toItemUnit(entered, row.unit, input.unit);
  return converted.ok ? lineCostPaise(converted.milli, input.unitCost) : null;
}

/**
 * Expected consumption per finished unit: existing raw materials and
 * consumables, with a quantity each. The lines travel as JSON in one hidden
 * field, so the same editor serves the create form and the workspace. The
 * server validates everything again; the estimate here is read-only.
 */
export function ConsumptionEditor({
  inputs,
  initial,
  errors = {},
  name = "consumption",
  onChange,
}: {
  inputs: readonly ConsumptionInput[];
  initial: readonly ConsumptionRow[];
  errors?: Record<number, string>;
  name?: string;
  onChange?: () => void;
}) {
  const [rows, setRows] = useState<ConsumptionRow[]>(() => initial.map((row) => ({ ...row })));
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "RAW_MATERIAL" | "CONSUMABLE">("all");
  const [picked, setPicked] = useState("");
  const pickerId = useId();

  const byId = useMemo(() => new Map(inputs.map((input) => [input.id, input])), [inputs]);
  const used = new Set(rows.map((row) => row.inventoryItemId));
  const needle = search.trim().toLowerCase();
  const available = inputs.filter(
    (input) =>
      input.group !== "FINISHED_PRODUCT" &&
      input.active !== false &&
      !used.has(input.id) &&
      (kind === "all" || input.group === kind) &&
      (!needle || searchText(input).includes(needle)),
  );

  const update = (index: number, patch: Partial<ConsumptionRow>) => {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
    onChange?.();
  };

  const remove = (index: number) => {
    setRows((current) => current.filter((_, position) => position !== index));
    onChange?.();
  };

  const add = () => {
    const input = byId.get(picked);
    if (!input || used.has(input.id)) return;
    setRows((current) => [...current, { inventoryItemId: input.id, quantity: "", unit: preferredEntryUnit(input.unit), notes: "" }]);
    setPicked("");
    setSearch("");
    onChange?.();
  };

  const costs = rows.map((row) => costOf(row, byId.get(row.inventoryItemId)));
  const known = costs.filter((cost): cost is number => cost !== null);
  const missing = costs.length - known.length;
  const groups = [
    ["RAW_MATERIAL", "Raw materials"],
    ["CONSUMABLE", "Consumables"],
  ] as const;

  return (
    <div className={styles.editor}>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />

      <div className={styles.intro}>
        <p className={styles.lead}>Define the materials and consumables used to manufacture one finished unit.</p>
        <p className={styles.basis}>
          <Icon name="info" size={14} />
          Expected consumption per unit. Nothing here changes stock — actual usage is recorded during production.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="layers" size={18} />
          <div>
            <p className={styles.emptyTitle}>No manufacturing inputs defined yet.</p>
            <p className={styles.emptyBody}>An empty list means the consumption is not defined — not that the product uses nothing.</p>
          </div>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="u-visually-hidden">Expected consumption per finished unit</caption>
            <thead>
              <tr>
                <th scope="col">Inventory item</th>
                <th scope="col" className={styles.num}>
                  Quantity per unit
                </th>
                <th scope="col">Unit</th>
                <th scope="col">Notes</th>
                <th scope="col" className={styles.num}>
                  Estimated cost
                </th>
                <th scope="col">
                  <span className="u-visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const input = byId.get(row.inventoryItemId);
                const error = errors[index];
                const quantityId = `${pickerId}-q-${index}`;
                const cost = costs[index] ?? null;
                return (
                  <tr key={row.inventoryItemId} className={clsx(error && styles.rowError)}>
                    <td>
                      {input ? (
                        <span className={styles.item}>
                          <span className={styles.itemName}>{labelOf(input)}</span>
                          <span className={styles.itemMeta}>
                            {input.typeLabel} · stocked in {input.unit}
                            {input.sku ? ` · ${input.sku}` : ""}
                          </span>
                          {input.active === false ? (
                            <StatusBadge tone="danger">Inactive — remove this line</StatusBadge>
                          ) : (
                            <StatusBadge tone={STATUS_TONE[input.status]}>{STOCK_STATUS_LABEL[input.status]}</StatusBadge>
                          )}
                        </span>
                      ) : (
                        <span className={styles.itemMeta}>This item is no longer available. Remove it.</span>
                      )}
                      {error && (
                        <p className={styles.error} role="alert" id={`${quantityId}-error`}>
                          <Icon name="error" size={14} />
                          {error}
                        </p>
                      )}
                    </td>
                    <td className={styles.num}>
                      <label className="u-visually-hidden" htmlFor={quantityId}>
                        Quantity per unit of {input ? labelOf(input) : "this item"}
                      </label>
                      <input
                        id={quantityId}
                        className={styles.control}
                        inputMode="decimal"
                        value={row.quantity}
                        placeholder="0"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${quantityId}-error` : undefined}
                        onChange={(event) => update(index, { quantity: event.currentTarget.value })}
                      />
                    </td>
                    <td>
                      <label className="u-visually-hidden" htmlFor={`${quantityId}-unit`}>
                        Unit
                      </label>
                      <select
                        id={`${quantityId}-unit`}
                        className={styles.control}
                        value={row.unit}
                        onChange={(event) => update(index, { unit: event.currentTarget.value })}
                      >
                        {(input ? entryUnitsFor(input.unit) : [row.unit]).map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="u-visually-hidden" htmlFor={`${quantityId}-notes`}>
                        Notes
                      </label>
                      <input
                        id={`${quantityId}-notes`}
                        className={styles.control}
                        value={row.notes}
                        maxLength={200}
                        placeholder="Optional"
                        onChange={(event) => update(index, { notes: event.currentTarget.value })}
                      />
                    </td>
                    <td className={clsx(styles.num, styles.mono, cost === null && styles.muted)}>
                      {cost !== null ? rupeesOf(cost) : input?.unitCost === null ? "Cost unavailable" : "—"}
                    </td>
                    <td className={styles.actions}>
                      <button
                        type="button"
                        className={styles.remove}
                        onClick={() => remove(index)}
                        aria-label={`Remove ${input ? labelOf(input) : "this line"}`}
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <fieldset className={styles.adder}>
        <legend className={styles.adderTitle}>Add material or consumable</legend>
        {inputs.length === 0 ? (
          <p className={styles.emptyBody}>
            No raw materials or consumables are defined yet. Add them under Inventory first; they then appear here.
          </p>
        ) : (
          <div className={styles.adderRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Search</span>
              <input
                className={styles.control}
                type="search"
                value={search}
                placeholder="Name, SKU, material or colour"
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Kind</span>
              <select className={styles.control} value={kind} onChange={(event) => setKind(event.currentTarget.value as typeof kind)}>
                <option value="all">Raw materials and consumables</option>
                <option value="RAW_MATERIAL">Raw materials</option>
                <option value="CONSUMABLE">Consumables</option>
              </select>
            </label>
            <label className={clsx(styles.field, styles.grow)}>
              <span className={styles.fieldLabel}>Inventory item</span>
              <select className={styles.control} value={picked} onChange={(event) => setPicked(event.currentTarget.value)}>
                <option value="">{available.length === 0 ? "No matching items" : `Choose… (${available.length})`}</option>
                {groups.map(([group, label]) => {
                  const options = available.filter((input) => input.group === group);
                  return options.length === 0 ? null : (
                    <optgroup key={group} label={label}>
                      {options.map((input) => (
                        <option key={input.id} value={input.id}>
                          {labelOf(input)} · {input.typeLabel} · {input.unit} · {STOCK_STATUS_LABEL[input.status]}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
            <Button type="button" size="sm" variant="secondary" iconLeft="plus" onClick={add} disabled={!picked}>
              Add
            </Button>
          </div>
        )}
      </fieldset>

      <dl className={styles.summary}>
        <div>
          <dt>Total consumption lines</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>Estimated input cost per unit</dt>
          <dd>
            {rows.length === 0
              ? "—"
              : missing === 0
                ? rupeesOf(known.reduce((sum, cost) => sum + cost, 0))
                : known.length === 0
                  ? "Cost unavailable"
                  : `${rupeesOf(known.reduce((sum, cost) => sum + cost, 0))} for ${known.length} of ${rows.length} lines`}
          </dd>
        </div>
      </dl>
      <p className={styles.footnote}>
        Estimated from each item&apos;s latest recorded unit cost. It is not a price and never changes the product&apos;s price.
      </p>
    </div>
  );
}
