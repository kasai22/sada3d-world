import type { Metadata } from "next";

import { ItemForm, type ItemFormOptions, type ItemKind } from "@/components/ops/inventory/ItemForm";
import form from "@/components/ops/inventory/inventory.module.css";
import { PageHeader } from "@/components/ops/PageHeader";
import { Panel } from "@/components/structure/Panel";
import { MATERIAL_DEFINITIONS, capabilityStatus } from "@/content/catalog/capabilities";
import { approvedColours } from "@/content/catalog/decisions";
import { listInventoryItems, listSuppliers } from "@/lib/inventory/read";
import { CONSUMABLE_CATEGORIES, INVENTORY_UNITS } from "@/lib/inventory/rules";
import { getCatalogHealth } from "@/lib/ops/analytics/catalog";
import { requireOperator } from "@/lib/ops/operator";
import { readEnum, type SearchParamsRecord } from "@/lib/ops/query";

import { createItemAction } from "../actions";

export const metadata: Metadata = { title: "Add inventory item" };

const PATH = "/admin/inventory/new";
const KINDS = ["raw", "finished", "consumable"] as const;
const KIND_OF: Record<(typeof KINDS)[number], ItemKind> = { raw: "RAW_MATERIAL", finished: "FINISHED_PRODUCT", consumable: "CONSUMABLE" };

/**
 * Adding an inventory item: a raw material, a finished product or a consumable.
 * The form offers only real choices — approved materials and colours not yet
 * defined, catalog products without an item, the suppliers on record — and
 * never a quantity.
 */
export default async function NewInventoryItemPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const kind = KIND_OF[readEnum(await searchParams, "kind", KINDS) ?? "consumable"];

  const [items, suppliers, catalog] = await Promise.all([
    listInventoryItems(operator, { includeInactive: true }),
    listSuppliers(operator),
    getCatalogHealth(operator),
  ]);

  const linkedProducts = new Set(items.map((item) => item.productId).filter(Boolean));
  const options: ItemFormOptions = {
    materials: MATERIAL_DEFINITIONS.map((definition) => ({
      value: definition.value,
      label: definition.label,
      status: capabilityStatus("material", definition.value),
      colours: capabilityStatus("material", definition.value) === "AVAILABLE" ? approvedColours(definition.value) : [],
    })),
    products: catalog.products
      .filter((product) => product.approvalStatus !== "archived" && !linkedProducts.has(product.productId))
      .map((product) => ({ id: product.productId, name: product.name })),
    suppliers: suppliers.filter((supplier) => supplier.active).map((supplier) => ({ id: supplier.id, name: supplier.name })),
    units: INVENTORY_UNITS,
    categories: CONSUMABLE_CATEGORIES,
    definedMaterials: items.filter((item) => item.material && item.colour).map((item) => `${item.material}:${item.colour}`),
  };

  return (
    <>
      <PageHeader
        title="Add inventory item"
        crumbs={[{ label: "Inventory", href: "/admin/inventory" }, { label: "Add item" }]}
        description="Define what Reality 3D keeps in stock. Quantities are never entered here: the item is not tracked until its opening count is recorded."
      />
      <div className={form.narrow}>
        <Panel padded={false}>
          <ItemForm action={createItemAction} options={options} initialKind={kind} />
        </Panel>
        {!catalog.reachable && (
          <p className={form.notice}>The CMS catalog could not be read, so no finished products can be offered right now.</p>
        )}
      </div>
    </>
  );
}
