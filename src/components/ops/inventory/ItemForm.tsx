"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import type { OpsActionResult } from "@/lib/ops/types";

import styles from "./inventory.module.css";

export interface ItemFormOptions {
  materials: { value: string; label: string; status: "AVAILABLE" | "COMING_SOON" | "UNAVAILABLE"; colours: string[] }[];
  /** Finished products that are not yet defined. */
  products: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  units: readonly string[];
  categories: readonly string[];
  /** Material:colour pairs that already exist, so they are not offered twice. */
  definedMaterials: string[];
}

export type ItemKind = "RAW_MATERIAL" | "FINISHED_PRODUCT" | "CONSUMABLE";

const KIND_LABEL: Record<ItemKind, string> = {
  RAW_MATERIAL: "Raw material",
  FINISHED_PRODUCT: "Finished product",
  CONSUMABLE: "Consumable",
};

const KIND_HINT: Record<ItemKind, string> = {
  RAW_MATERIAL: "Filament products are made from. One item per material and colour.",
  FINISHED_PRODUCT: "A catalog product made ahead and held as stock. Its name and SKU come from the catalog.",
  CONSUMABLE: "Something used up in production or dispatch — packaging, adhesive, a nozzle, cleaning or workshop supplies.",
};

const KIND_TAB: Record<ItemKind, string> = { RAW_MATERIAL: "raw", FINISHED_PRODUCT: "finished", CONSUMABLE: "consumables" };
const itemHref = (id: string, kind: ItemKind) => `/admin/inventory?tab=${KIND_TAB[kind]}&item=${encodeURIComponent(id)}#item`;

const QUANTITY_PATTERN = String.raw`\d{1,11}(\.\d{1,3})?`;
const COST_PATTERN = String.raw`\d{1,8}(\.\d{1,2})?`;

/**
 * Adding an inventory item. Asks only what the chosen kind needs, and never a
 * quantity: a new item is NOT TRACKED until its opening stock is counted. On
 * success the browser opens the item, where opening stock is entered.
 */
export function ItemForm({
  action,
  options,
  initialKind,
}: {
  action: (previous: OpsActionResult | null, form: FormData) => Promise<OpsActionResult>;
  options: ItemFormOptions;
  initialKind: ItemKind;
}) {
  const [kind, setKind] = useState<ItemKind>(initialKind);
  const [material, setMaterial] = useState("");
  const [result, submit, pending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (result?.ok && result.id) router.push(itemHref(result.id, kind));
  }, [result, kind, router]);

  const chosen = options.materials.find((entry) => entry.value === material);
  const colours = (chosen?.colours ?? []).filter((colour) => !options.definedMaterials.includes(`${material}:${colour}`));
  const unitDefault = kind === "RAW_MATERIAL" ? "kg" : "pcs";

  // Submitted by hand rather than through `action`, so a refused form keeps what was typed.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => submit(data));
  }

  return (
    <form onSubmit={onSubmit} className={styles.itemForm}>
      <fieldset className={styles.kinds}>
        <legend className={styles.label}>What is it?</legend>
        {(Object.keys(KIND_LABEL) as ItemKind[]).map((option) => (
          <label key={option} className={styles.kind} data-selected={kind === option || undefined}>
            <input type="radio" name="itemType" value={option} checked={kind === option} onChange={() => setKind(option)} />
            <span className={styles.kindText}>
              <span className={styles.kindName}>{KIND_LABEL[option]}</span>
              <span className={styles.kindHint}>{KIND_HINT[option]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div key={kind} className={styles.fields}>
        {kind === "RAW_MATERIAL" && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Material</span>
              <select name="material" required value={material} onChange={(event) => setMaterial(event.currentTarget.value)}>
                <option value="" disabled>
                  Choose…
                </option>
                {options.materials.map((entry) => (
                  <option key={entry.value} value={entry.value} disabled={entry.status !== "AVAILABLE"}>
                    {entry.label}
                    {entry.status === "COMING_SOON" ? " — Coming Soon" : entry.status === "UNAVAILABLE" ? " — Not available" : ""}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>Coming Soon materials have no stock to track until they are approved.</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Colour</span>
              <select name="colour" required defaultValue="" disabled={!chosen}>
                <option value="" disabled>
                  {chosen ? (colours.length === 0 ? "Every approved colour is defined" : "Choose…") : "Choose a material first"}
                </option>
                {colours.map((colour) => (
                  <option key={colour} value={colour}>
                    {colour.charAt(0).toUpperCase() + colour.slice(1)}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>Approved production colours only.</span>
            </label>
          </>
        )}

        {kind === "FINISHED_PRODUCT" && (
          <label className={`${styles.field} ${styles.wide}`}>
            <span className={styles.label}>Product</span>
            <select name="productId" required defaultValue="">
              <option value="" disabled>
                {options.products.length === 0 ? "Every catalog product already has an item" : "Choose…"}
              </option>
              {options.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.id.toUpperCase()})
                </option>
              ))}
            </select>
          </label>
        )}

        {kind === "CONSUMABLE" && (
          <>
            <label className={`${styles.field} ${styles.wide}`}>
              <span className={styles.label}>Name</span>
              <input name="name" required maxLength={200} placeholder="e.g. 0.4 mm brass nozzle, bubble mailer 15×20 cm" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Category</span>
              <select name="category" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {options.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>SKU</span>
              <input name="sku" maxLength={64} placeholder="Optional" />
              <span className={styles.hint}>Your own code, if the business uses one.</span>
            </label>
          </>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Unit</span>
          <select name="unit" required defaultValue={unitDefault}>
            {options.units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <span className={styles.hint}>Stock and cost are counted in this unit.</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Reorder level</span>
          <input name="reorderLevel" inputMode="decimal" pattern={QUANTITY_PATTERN} placeholder="Optional" />
          <span className={styles.hint}>At or below this, the item needs reordering.</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Target stock</span>
          <input name="targetStock" inputMode="decimal" pattern={QUANTITY_PATTERN} placeholder="Optional" />
          <span className={styles.hint}>Reorder quantity is target minus stock.</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Unit cost (₹)</span>
          <input name="unitCost" inputMode="decimal" pattern={COST_PATTERN} placeholder="Optional, e.g. 0.50" />
          <span className={styles.hint}>What Reality 3D pays per unit. Never a selling price.</span>
        </label>
        {kind !== "FINISHED_PRODUCT" && (
          <label className={styles.field}>
            <span className={styles.label}>Usual supplier</span>
            <select name="supplierId" defaultValue="">
              <option value="">{options.suppliers.length === 0 ? "No suppliers yet" : "None"}</option>
              {options.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={`${styles.field} ${styles.wide}`}>
          <span className={styles.label}>Notes</span>
          <textarea name="notes" maxLength={500} placeholder="Optional — what it is used for, where it is kept" />
        </label>
      </div>

      <p className={styles.notice}>
        <Icon name="info" size={14} />
        No stock is created. The item is <strong>Not tracked</strong> until you enter its opening count or receive a purchase.
      </p>

      <div className={styles.footer}>
        <p className={result && !result.ok ? styles.failure : styles.message} role="status" aria-live="polite">
          {result?.message}
        </p>
        <div className={styles.footerActions}>
          <Link href="/admin/inventory" className={styles.cancel}>
            Cancel
          </Link>
          <Button type="submit" variant="primary" size="sm" loading={pending} disabled={pending} iconLeft="plus">
            {pending ? "Adding…" : `Add ${KIND_LABEL[kind].toLowerCase()}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
