import { StatusBadge } from "@/components/ops/StatusBadge";
import { RowLink, Stack, TableFrame, Td, Th, Tr } from "@/components/ops/Table";
import type { InventoryItemView } from "@/lib/inventory/read";
import { GROUP_LABEL, STOCK_STATUS_LABEL, type InventoryGroup } from "@/lib/inventory/rules";

import { STATUS_TONE, capitalise, costPerUnit, formatCost, levelText, nextStep, stockText } from "./display";

export { nextStep };

export interface CatalogName {
  name: string;
  sku: string | null;
}

/**
 * Items of one kind, with the columns that kind needs. Every row opens the
 * item's ledger. Unknown stock reads "Not tracked"; a missing cost reads
 * "Missing"; neither is ever a zero.
 */
export function ItemTable({
  items,
  kind,
  hrefFor,
  catalog,
  caption,
}: {
  items: readonly InventoryItemView[];
  kind: InventoryGroup | "needs-action";
  hrefFor: (item: InventoryItemView) => string;
  catalog?: ReadonlyMap<string, CatalogName>;
  caption: string;
}) {
  const needsAction = kind === "needs-action";
  const showCost = kind === "RAW_MATERIAL" || kind === "CONSUMABLE";
  const showSupplier = kind === "RAW_MATERIAL" || kind === "CONSUMABLE";

  return (
    <TableFrame label={caption} caption={caption}>
      <thead>
        <tr>
          <Th>Item</Th>
          {needsAction && <Th hide="sm">Kind</Th>}
          <Th align="right">Stock</Th>
          {!needsAction && (
            <>
              <Th align="right" hide="md">
                Reorder at
              </Th>
              <Th align="right" hide="md">
                Target
              </Th>
            </>
          )}
          <Th>Status</Th>
          {showCost && (
            <Th align="right" hide="lg">
              Unit cost
            </Th>
          )}
          {!needsAction && (
            <Th align="right" hide="md">
              Value
            </Th>
          )}
          {showSupplier && <Th hide="lg">Supplier</Th>}
          <Th hide="sm">Next step</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const product = item.productId ? catalog?.get(item.productId) : undefined;
          const title =
            item.group === "RAW_MATERIAL" && item.material
              ? `${item.material.toUpperCase()} — ${capitalise(item.colour)}`
              : (product?.name ?? item.name);
          const detail =
            item.group === "RAW_MATERIAL"
              ? [item.sku, item.category].filter(Boolean).join(" · ") || "No SKU"
              : item.group === "FINISHED_PRODUCT"
                ? [item.productId?.toUpperCase(), product?.sku ?? item.sku, item.productId && !product ? "not in the CMS catalog" : null]
                    .filter(Boolean)
                    .join(" · ") || "Not linked to a catalog product"
                : [item.category, item.sku, item.itemType === "CONSUMABLE" ? null : item.itemType.replace("_", " ").toLowerCase()]
                    .filter(Boolean)
                    .join(" · ") || "No category";
          return (
            <Tr key={item.id}>
              <Td>
                <Stack
                  primary={
                    <RowLink href={hrefFor(item)}>
                      {title}
                      {!item.active && " (inactive)"}
                    </RowLink>
                  }
                  secondary={detail}
                />
              </Td>
              {needsAction && <Td hide="sm">{GROUP_LABEL[item.group].replace(/s$/, "")}</Td>}
              <Td align="right" mono nowrap muted={item.current === null}>
                {stockText(item.current, item.unit)}
              </Td>
              {!needsAction && (
                <>
                  <Td align="right" mono nowrap hide="md">
                    {levelText(item.reorderLevel, item.unit)}
                  </Td>
                  <Td align="right" mono nowrap hide="md">
                    {levelText(item.targetStock, item.unit)}
                  </Td>
                </>
              )}
              <Td nowrap>
                <StatusBadge tone={STATUS_TONE[item.status]}>{STOCK_STATUS_LABEL[item.status]}</StatusBadge>
              </Td>
              {showCost && (
                <Td align="right" mono nowrap hide="lg" muted={item.unitCost === null}>
                  {costPerUnit(item.unitCost, item.unit)}
                </Td>
              )}
              {!needsAction && (
                <Td align="right" mono nowrap hide="md" muted={item.value === null}>
                  {item.value === null ? "—" : formatCost(item.value)}
                </Td>
              )}
              {showSupplier && (
                <Td hide="lg" muted={!item.supplierName}>
                  {item.supplierName ?? "—"}
                </Td>
              )}
              <Td hide="sm" nowrap muted={nextStep(item) === "No action"}>
                {nextStep(item)}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </TableFrame>
  );
}
