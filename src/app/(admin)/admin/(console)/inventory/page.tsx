import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";

import { Button } from "@/components/core/Button";
import { Icon } from "@/components/core/Icon";
import styles from "@/components/ops/command/command.module.css";
import { SourceNote } from "@/components/ops/command/SourceNote";
import { EmptyState } from "@/components/ops/EmptyState";
import { FilterForm } from "@/components/ops/FilterForm";
import { ActionForm } from "@/components/ops/inventory/ActionForm";
import { ITEM_STATUS_FILTERS, STATUS_FILTER_LABEL, formatCost, type ItemStatusFilter } from "@/components/ops/inventory/display";
import form from "@/components/ops/inventory/inventory.module.css";
import { ItemTable, type CatalogName } from "@/components/ops/inventory/ItemTable";
import { KpiCard } from "@/components/ops/KpiCard";
import { PageHeader, PanelLink } from "@/components/ops/PageHeader";
import { SectionTabs } from "@/components/ops/SectionTabs";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Panel } from "@/components/structure/Panel";
import {
  getItemLedger,
  listInventoryItems,
  listInventoryMovements,
  listOpenPurchases,
  listSuppliers,
  listUsableJobs,
  type InventoryItemView,
  type StockCounts,
} from "@/lib/inventory/read";
import { listProductsUsingItem } from "@/lib/inventory/consumption";
import { formatPerUnit } from "@/lib/inventory/consumption-rules";
import { CONSUMABLE_CATEGORIES, GROUP_DESCRIPTION, GROUP_LABEL, type InventoryGroup } from "@/lib/inventory/rules";
import { getCatalogHealth } from "@/lib/ops/analytics/catalog";
import { getInventoryStatus } from "@/lib/ops/analytics/inventory";
import { formatCount } from "@/lib/ops/format";
import { requireOperator } from "@/lib/ops/operator";
import { hrefWith, readEnum, readIdentifier, readPage, readText, type SearchParamsRecord } from "@/lib/ops/query";

import { syncDefinitionsAction } from "./actions";
import { ItemPanel, MovementsPanel, PurchasesPanel, SuppliersPanel } from "./panels";

export const metadata: Metadata = { title: "Inventory" };

const PATH = "/admin/inventory";

const TABS = ["overview", "raw", "finished", "consumables", "movements", "purchases", "suppliers"] as const;
type Tab = (typeof TABS)[number];
const ITEM_TABS: Partial<Record<Tab, InventoryGroup>> = { raw: "RAW_MATERIAL", finished: "FINISHED_PRODUCT", consumables: "CONSUMABLE" };
const TAB_OF: Record<InventoryGroup, Tab> = { RAW_MATERIAL: "raw", FINISHED_PRODUCT: "finished", CONSUMABLE: "consumables" };
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  raw: "Raw materials",
  finished: "Finished products",
  consumables: "Consumables",
  movements: "Movements",
  purchases: "Purchases",
  suppliers: "Suppliers",
};
const ADD_KIND: Partial<Record<Tab, string>> = { raw: "raw", finished: "finished", consumables: "consumable" };

const matchesStatus = (item: InventoryItemView, status: ItemStatusFilter) =>
  status === "MISSING_COST" ? item.current !== null && item.unitCost === null : item.status === status;

/** Needs an operator's hand: unknown, empty, low, no reorder level, or no cost. */
const needsAction = (item: InventoryItemView) => item.status !== "HEALTHY" || item.unitCost === null;

function GroupCard({ group, counts, href }: { group: InventoryGroup; counts: StockCounts; href: string }) {
  const empty = counts.items === 0;
  return (
    <KpiCard
      label={GROUP_LABEL[group]}
      meta="Now"
      value={empty ? "None defined" : `${formatCount(counts.tracked)} / ${formatCount(counts.items)} tracked`}
      muted={empty || counts.tracked === 0}
      detail={
        empty
          ? group === "CONSUMABLE"
            ? "Add the consumables Reality 3D uses."
            : "Create the definitions to start."
          : [
              counts.outOfStock > 0 && `${formatCount(counts.outOfStock)} out of stock`,
              counts.lowStock > 0 && `${formatCount(counts.lowStock)} to reorder`,
              counts.notTracked > 0 && `${formatCount(counts.notTracked)} not tracked`,
              counts.noReorderLevel > 0 && `${formatCount(counts.noReorderLevel)} without a reorder level`,
            ]
              .filter(Boolean)
              .join(" · ") || "Every tracked item is above its reorder level."
      }
      icon={group === "RAW_MATERIAL" ? "layers" : group === "FINISHED_PRODUCT" ? "box" : "package"}
      href={href}
      signal={counts.outOfStock > 0 ? "danger" : counts.lowStock > 0 ? "warning" : undefined}
    />
  );
}

/**
 * Inventory (Stage 22; one workspace for raw materials, finished products and
 * consumables since Stage 22.6).
 *
 * Every quantity comes from the ledger-backed balance; an item with no opening
 * count is NOT TRACKED, and a value is shown only when every tracked item has a
 * cost. Tabs are URLs, so a filtered list is a link a colleague can open.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const operator = await requireOperator(PATH);
  const params = await searchParams;
  const status = readEnum(params, "status", ITEM_STATUS_FILTERS);
  const requestedTab = readEnum(params, "tab", TABS);
  // A status filter without a tab lists matching items of every kind on the overview.
  const tab: Tab = requestedTab ?? "overview";
  const group = ITEM_TABS[tab];
  const selectedId = readIdentifier(params, "item");
  const page = readPage(params);
  const query = {
    q: readText(params, "q"),
    material: readText(params, "material", 32),
    colour: readText(params, "colour", 32),
    supplier: readIdentifier(params, "supplier"),
    category: readText(params, "category", 64),
  };

  const [inventory, allItems, suppliers, catalog, ledger, jobs] = await Promise.all([
    getInventoryStatus(operator),
    listInventoryItems(operator, { includeInactive: true }),
    listSuppliers(operator),
    getCatalogHealth(operator),
    selectedId ? getItemLedger(operator, selectedId) : Promise.resolve(undefined),
    selectedId ? listUsableJobs(operator) : Promise.resolve([]),
  ]);
  const usage = ledger && ledger.item.group !== "FINISHED_PRODUCT" ? await listProductsUsingItem(operator, ledger.item.id) : [];
  const [groupItems, movements, purchases] = await Promise.all([
    group
      ? listInventoryItems(operator, {
          group,
          includeInactive: true,
          ...(query.q ? { q: query.q } : {}),
          ...(query.material ? { material: query.material } : {}),
          ...(query.colour ? { colour: query.colour } : {}),
          ...(query.supplier ? { supplierId: query.supplier } : {}),
          ...(query.category ? { category: query.category } : {}),
        })
      : Promise.resolve([]),
    tab === "movements" || tab === "overview"
      ? listInventoryMovements(operator, tab === "movements" ? { page, ...(selectedId ? { itemId: selectedId } : {}) } : { page: 1 })
      : Promise.resolve(null),
    tab === "purchases" || tab === "overview" ? listOpenPurchases(operator) : Promise.resolve([]),
  ]);

  const { summary } = inventory;
  const active = allItems.filter((item) => item.active);
  const catalogById = new Map<string, CatalogName>(catalog.products.map((product) => [product.productId, { name: product.name, sku: product.sku }]));
  const keep = { tab: tab === "overview" ? undefined : tab, status, ...query };
  const itemHref = (item: { id: string; group: InventoryGroup }) =>
    `${hrefWith(PATH, { tab: TAB_OF[item.group], item: item.id })}#item`;
  const closeHref = hrefWith(PATH, { ...keep, item: undefined });
  const shown = group ? groupItems.filter((item) => (status ? matchesStatus(item, status) : item.active || query.q)) : [];
  const actionable = active.filter((item) => (status ? matchesStatus(item, status) : needsAction(item)));
  const filtered = Boolean(status || query.q || query.material || query.colour || query.supplier || query.category);
  const addKind = ADD_KIND[tab] ?? "consumable";

  const groupFor = (value: InventoryGroup) => active.filter((item) => item.group === value);
  const materials = [...new Set(groupFor("RAW_MATERIAL").map((item) => item.material).filter((value): value is string => Boolean(value)))];
  const colours = [...new Set(groupFor("RAW_MATERIAL").map((item) => item.colour).filter((value): value is string => Boolean(value)))];
  const linkedSuppliers = suppliers.filter((supplier) => allItems.some((item) => item.supplierId === supplier.id && (!group || item.group === group)));

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Raw material, finished stock and consumables, from one ledger. Unknown stock is shown as not tracked — never as zero."
        actions={
          <>
            {tab !== "purchases" && (
              <Button href={hrefWith(PATH, { tab: "purchases" })} size="sm" variant="secondary" iconLeft="truck">
                Record purchase
              </Button>
            )}
            <Button href={hrefWith(`${PATH}/new`, { kind: addKind })} size="sm" variant="primary" iconLeft="plus">
              {tab === "raw" ? "Add raw material" : tab === "finished" ? "Add finished product" : "Add consumable"}
            </Button>
          </>
        }
      />

      <SectionTabs
        label="Inventory sections"
        tabs={TABS.map((option) => {
          const optionGroup = ITEM_TABS[option];
          return {
            label: TAB_LABEL[option],
            href: hrefWith(PATH, { tab: option === "overview" ? undefined : option }),
            current: option === tab,
            ...(optionGroup
              ? { count: formatCount(summary.byGroup[optionGroup].items) }
              : option === "purchases" && summary.openPurchases > 0
                ? { count: formatCount(summary.openPurchases) }
                : {}),
          };
        })}
      />

      {selectedId && !ledger && (
        <Panel padded={false}>
          <EmptyState compact tone="problem" icon="error" title="That item does not exist" action={<Link href={closeHref}>Back to the list</Link>}>
            <p>It may have been opened from an old link.</p>
          </EmptyState>
        </Panel>
      )}
      {ledger && (
        <ItemPanel
          ledger={ledger}
          closeHref={closeHref}
          suppliers={suppliers}
          jobs={jobs}
          usedBy={usage.map((entry) => {
            const product = catalog.products.find((row) => row.productId === entry.productId);
            return {
              productId: entry.productId,
              name: product?.name ?? null,
              href: product?.href ?? null,
              perUnit: formatPerUnit(entry.quantity, ledger.item.unit),
              notes: entry.notes,
            };
          })}
        />
      )}

      {/* ---------------- Overview ---------------- */}
      {tab === "overview" && (
        <>
          <section className={`${styles.kpis} ${form.overviewFigures}`} aria-label="Inventory figures">
            <KpiCard
              label="Inventory value"
              meta="Now · at latest cost"
              value={inventory.value !== null ? formatCost(inventory.value) : "Unavailable"}
              muted={inventory.value === null}
              detail={
                inventory.value !== null
                  ? `Quantity × latest unit cost over ${formatCount(summary.tracked)} tracked items.`
                  : summary.tracked === 0
                    ? "No item is tracked yet."
                    : `${formatCount(summary.missingCost)} tracked ${summary.missingCost === 1 ? "item has" : "items have"} no cost · costed part ${formatCost(summary.valueOfCosted)}`
              }
              icon="wallet"
              href={summary.missingCost > 0 ? hrefWith(PATH, { status: "MISSING_COST" }) : undefined}
            />
            <GroupCard group="RAW_MATERIAL" counts={summary.byGroup.RAW_MATERIAL} href={hrefWith(PATH, { tab: "raw" })} />
            <GroupCard group="FINISHED_PRODUCT" counts={summary.byGroup.FINISHED_PRODUCT} href={hrefWith(PATH, { tab: "finished" })} />
            <GroupCard group="CONSUMABLE" counts={summary.byGroup.CONSUMABLE} href={hrefWith(PATH, { tab: "consumables" })} />
          </section>

          {summary.items === 0 ? (
            <Panel padded={false}>
              <EmptyState icon="boxes" title="Inventory not initialized">
                <p>
                  Start with the definitions Reality 3D has decided on — every approved material in each approved colour,
                  and each catalog product — with no quantities and no costs. Then add the consumables you use.
                </p>
              </EmptyState>
              <ActionForm action={syncDefinitionsAction} submitLabel="Create inventory definitions" variant="primary" />
            </Panel>
          ) : (
            <Panel
              title={status ? `Items · ${STATUS_FILTER_LABEL[status]}` : "Needs action"}
              titleAs="h2"
              meta={`${formatCount(actionable.length)} ${actionable.length === 1 ? "item" : "items"} · now`}
              actions={status ? <PanelLink href={PATH}>All that need action</PanelLink> : undefined}
              padded={false}
            >
              <nav className={form.statusFilters} aria-label="Filter by stock status">
                {ITEM_STATUS_FILTERS.map((option) => {
                  const count = active.filter((item) => matchesStatus(item, option)).length;
                  return (
                    <Link
                      key={option}
                      href={hrefWith(PATH, { status: status === option ? undefined : option })}
                      className={clsx(styles.chip, status === option && styles.chipActive)}
                      aria-current={status === option ? "true" : undefined}
                    >
                      {STATUS_FILTER_LABEL[option]}
                      <span className={styles.chipCount}>{formatCount(count)}</span>
                    </Link>
                  );
                })}
              </nav>
              {actionable.length === 0 ? (
                <EmptyState compact icon="check-circle" title={status ? "No items in this condition" : "Nothing needs action"}>
                  <p>Every active item is tracked, costed and above its reorder level.</p>
                </EmptyState>
              ) : (
                <ItemTable items={actionable} kind="needs-action" hrefFor={itemHref} catalog={catalogById} caption="Items that need action" />
              )}
            </Panel>
          )}

          <div className={`${styles.columns} ${styles.columnsEven} ${styles.flush}`}>
            {movements && (
              <MovementsPanel
                movements={{ ...movements, rows: movements.rows.slice(0, 6) }}
                title="Recent movements"
                limitNote={movements.total > 0 ? `Latest ${Math.min(6, movements.total)} of ${formatCount(movements.total)}` : undefined}
                itemHref={(id) => {
                  const item = allItems.find((entry) => entry.id === id);
                  return item ? itemHref(item) : PATH;
                }}
              />
            )}
            <Panel
              title="Pending receipts"
              titleAs="h2"
              meta={`${formatCount(purchases.length)} open`}
              actions={<PanelLink href={hrefWith(PATH, { tab: "purchases" })}>Purchases</PanelLink>}
              padded={false}
            >
              {purchases.length === 0 ? (
                <EmptyState compact icon="package" title="Nothing awaiting receipt">
                  <p>Ordered stock appears here until its receipt is confirmed.</p>
                </EmptyState>
              ) : (
                <ul className={form.receipts}>
                  {purchases.slice(0, 6).map((purchase) => (
                    <li key={purchase.id}>
                      <span>{purchase.itemName}</span>
                      <span className={form.receiptMeta}>
                        {purchase.supplierName ?? "No supplier"} · since <time dateTime={purchase.createdAt}>{purchase.createdAt.slice(0, 10)}</time>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {summary.items > 0 && (
            <details className={form.maintenance}>
              <summary>Definitions</summary>
              <p className={styles.lead}>
                Raw materials and finished products can be created from approved capability (materials × approved colours)
                and the CMS catalog. Creating them again changes nothing that exists, and never sets a quantity or a cost.
              </p>
              <ActionForm action={syncDefinitionsAction} submitLabel="Create missing definitions" />
            </details>
          )}
        </>
      )}

      {/* ---------------- Raw materials · finished products · consumables ---------------- */}
      {group && (
        <>
          <p className={form.groupLead}>{GROUP_DESCRIPTION[group]}</p>

          <FilterForm action={PATH} label={`Filter ${GROUP_LABEL[group].toLowerCase()}`} clearHref={hrefWith(PATH, { tab })} active={filtered}>
            <Input
              name="q"
              type="search"
              size="sm"
              label="Search"
              placeholder={group === "CONSUMABLE" ? "Name, SKU or category" : group === "RAW_MATERIAL" ? "Material, colour or SKU" : "Product or SKU"}
              defaultValue={query.q ?? ""}
              icon="search"
            />
            <Select
              name="status"
              size="sm"
              label="Status"
              defaultValue={status ?? ""}
              options={[{ value: "", label: "Active, any status" }, ...ITEM_STATUS_FILTERS.map((value) => ({ value, label: STATUS_FILTER_LABEL[value] }))]}
            />
            {group === "RAW_MATERIAL" && materials.length > 1 && (
              <Select
                name="material"
                size="sm"
                label="Material"
                defaultValue={query.material ?? ""}
                options={[{ value: "", label: "Any material" }, ...materials.map((value) => ({ value, label: value.toUpperCase() }))]}
              />
            )}
            {group === "RAW_MATERIAL" && colours.length > 1 && (
              <Select
                name="colour"
                size="sm"
                label="Colour"
                defaultValue={query.colour ?? ""}
                options={[{ value: "", label: "Any colour" }, ...colours.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))]}
              />
            )}
            {group === "CONSUMABLE" && (
              <Select
                name="category"
                size="sm"
                label="Category"
                defaultValue={query.category ?? ""}
                options={[{ value: "", label: "Any category" }, ...CONSUMABLE_CATEGORIES.map((value) => ({ value, label: value }))]}
              />
            )}
            {group !== "FINISHED_PRODUCT" && linkedSuppliers.length > 0 && (
              <Select
                name="supplier"
                size="sm"
                label="Supplier"
                defaultValue={query.supplier ?? ""}
                options={[{ value: "", label: "Any supplier" }, ...linkedSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]}
              />
            )}
            <input type="hidden" name="tab" value={tab} />
          </FilterForm>

          {shown.length === 0 ? (
            <Panel padded={false}>
              <EmptyState
                icon={group === "RAW_MATERIAL" ? "layers" : group === "FINISHED_PRODUCT" ? "box" : "package"}
                title={
                  filtered
                    ? "No items match these filters"
                    : group === "CONSUMABLE"
                      ? "No consumables yet"
                      : `No ${GROUP_LABEL[group].toLowerCase()} defined`
                }
                action={
                  filtered ? (
                    <Link href={hrefWith(PATH, { tab })}>Clear filters</Link>
                  ) : (
                    <Button href={hrefWith(`${PATH}/new`, { kind: addKind })} size="sm" variant="primary" iconLeft="plus">
                      {group === "RAW_MATERIAL" ? "Add raw material" : group === "FINISHED_PRODUCT" ? "Add finished product" : "Add consumable"}
                    </Button>
                  )
                }
              >
                <p>
                  {filtered
                    ? "Try a wider search, or clear the filters."
                    : group === "CONSUMABLE"
                      ? "Add the consumables Reality 3D actually uses — for example nozzles, adhesive, cleaning material, packaging or labels. Each starts not tracked until its stock is counted."
                      : group === "RAW_MATERIAL"
                        ? "Approved materials in approved colours can be defined here or all at once from the Overview tab. None starts with stock."
                        : "Catalog products you hold as stock can be defined here or all at once from the Overview tab."}
                </p>
              </EmptyState>
            </Panel>
          ) : (
            <ItemTable
              items={shown}
              kind={group}
              hrefFor={(item) => `${hrefWith(PATH, { ...keep, item: item.id })}#item`}
              catalog={catalogById}
              caption={`${GROUP_LABEL[group]}: stock, thresholds, cost and next step`}
            />
          )}
          {!status && groupItems.some((item) => !item.active) && (
            <p className={styles.gap}>
              <Icon name="info" size={14} />
              {formatCount(groupItems.filter((item) => !item.active).length)} inactive {groupItems.filter((item) => !item.active).length === 1 ? "item is" : "items are"} hidden. Search to find them.
            </p>
          )}
        </>
      )}

      {tab === "movements" && movements && (
        <MovementsPanel
          movements={movements}
          title={ledger ? `Movements · ${ledger.item.name}` : "All movements"}
          itemHref={(id) => {
            const item = allItems.find((entry) => entry.id === id);
            return item ? itemHref(item) : PATH;
          }}
          pageHref={(target) => hrefWith(PATH, { tab: "movements", item: selectedId, page: target })}
        />
      )}

      {tab === "purchases" && (
        <PurchasesPanel
          purchases={purchases}
          items={active.map((item) => ({ id: item.id, name: item.name, unit: item.unit, current: item.current, group: item.group }))}
          suppliers={suppliers}
          {...(selectedId ? { selectedItemId: selectedId } : {})}
        />
      )}

      {tab === "suppliers" && (
        <SuppliersPanel
          suppliers={suppliers}
          supplierHref={(id) => {
            const linked = allItems.find((item) => item.supplierId === id);
            return hrefWith(PATH, { tab: linked ? TAB_OF[linked.group] : "consumables", supplier: id });
          }}
        />
      )}

      <SourceNote trace={inventory} />
    </>
  );
}
