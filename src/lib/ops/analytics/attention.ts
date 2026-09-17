import { getInventorySummary, type InventorySummary } from "@/lib/inventory/read";

import { listOpsIssues } from "../issues";
import type { OperatorSession } from "../operator";
import type { IssueKind, OpsIssue } from "../pipeline";
import { hrefWith } from "../query";
import { getCatalogHealth, type CatalogHealth } from "./catalog";
import { getHeldForMaterial } from "./manufacturing";
import type { AttentionItem, AttentionSeverity } from "./types";

/**
 * The action centre — "Needs your attention".
 *
 * A grouping, not a new rule set. Order, payment and production conditions are
 * the exception centre's issues (`pipeline.ts`), counted by kind; catalog
 * conditions are the launch assessment's answers (`catalog.ts`). Each line is a
 * count of records that are in that condition right now, and links to the page
 * where they are listed and can be acted on — a console page, or the CMS.
 *
 * Derived on every read and stored nowhere, so it cannot disagree with the
 * records it describes.
 */

export const CATALOG_PATH = "/admin/catalog";
export const INVENTORY_PATH = "/admin/inventory";

const issuesHref = (kind: IssueKind) => hrefWith("/admin/issues", { kind });

/** How each issue kind reads in the action centre. Ready-to-ship opens the dispatch queue. */
const ISSUE_ATTENTION: Record<
  IssueKind,
  { area: AttentionItem["area"]; title: string; detail: string; href: string; severity?: AttentionSeverity }
> = {
  payment_failed: {
    area: "payments",
    title: "Failed payments",
    detail: "Orders whose payment did not complete. Nothing is manufactured until it does.",
    href: issuesHref("payment_failed"),
  },
  payment_pending: {
    area: "payments",
    title: "Payments outstanding",
    detail: "Orders placed more than a day ago and still unpaid.",
    href: issuesHref("payment_pending"),
  },
  job_failed: {
    area: "manufacturing",
    title: "Failed production jobs",
    detail: "Parts that cannot be delivered as ordered: remake, or contact the customer.",
    href: issuesHref("job_failed"),
  },
  job_overdue: {
    area: "manufacturing",
    title: "Jobs past their estimate",
    detail: "Still in production after the recorded completion estimate.",
    href: issuesHref("job_overdue"),
  },
  job_on_hold: {
    area: "manufacturing",
    title: "Jobs on hold",
    detail: "Paused production that needs a decision to resume.",
    href: issuesHref("job_on_hold"),
  },
  job_rework: {
    area: "manufacturing",
    title: "Jobs in rework",
    detail: "Rejected at inspection and being corrected.",
    href: issuesHref("job_rework"),
  },
  job_stalled: {
    area: "manufacturing",
    title: "Jobs without a recent update",
    detail: "No milestone reported for three days or more.",
    href: issuesHref("job_stalled"),
  },
  shipment_failed: {
    area: "orders",
    title: "Failed shipments",
    detail: "Parcels the carrier reported as undeliverable.",
    href: issuesHref("shipment_failed"),
  },
  ready_unshipped: {
    area: "orders",
    title: "Orders needing dispatch",
    detail: "Items ready to ship that are not in a parcel yet.",
    href: hrefWith("/admin/orders", { stage: "ready" }),
    severity: "medium",
  },
  design_rejected: {
    area: "orders",
    title: "Rejected design uploads",
    detail: "Customer files that failed verification this week.",
    href: issuesHref("design_rejected"),
  },
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

export interface AttentionInput {
  issues: readonly OpsIssue[];
  catalog: CatalogHealth;
  heldForMaterial: number;
  inventory: InventorySummary;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Pure: the action centre's lines, most severe first, then largest. */
export function deriveAttention({ issues, catalog, heldForMaterial, inventory }: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  const byKind = new Map<IssueKind, { count: number; severity: AttentionSeverity }>();
  for (const issue of issues) {
    const entry = byKind.get(issue.kind);
    if (entry) {
      entry.count += 1;
      if (SEVERITY_RANK[issue.severity] < SEVERITY_RANK[entry.severity]) entry.severity = issue.severity;
    } else {
      byKind.set(issue.kind, { count: 1, severity: issue.severity });
    }
  }

  for (const [kind, { count, severity }] of byKind) {
    const copy = ISSUE_ATTENTION[kind];
    items.push({
      id: `issue:${kind}`,
      area: copy.area,
      severity: copy.severity ?? severity,
      title: copy.title,
      detail: copy.detail,
      count,
      href: copy.href,
      cms: false,
    });
  }

  if (heldForMaterial > 0) {
    items.push({
      id: "inventory:material-hold",
      area: "inventory",
      severity: "high",
      title: "Production waiting for material",
      detail: `${plural(heldForMaterial, "job is", "jobs are")} held because material is unavailable.`,
      count: heldForMaterial,
      href: issuesHref("job_on_hold"),
      cms: false,
    });
  }

  /*
   * Inventory (Stage 22). Out of stock is a known zero; an item with no opening
   * balance is unknown and is reported as missing its count — never as empty.
   */
  const stockLine = (id: string, severity: AttentionSeverity, title: string, detail: string, count: number, params: Record<string, string>) => {
    if (count > 0) {
      items.push({ id, area: "inventory", severity, title, detail, count, href: hrefWith(INVENTORY_PATH, params), cms: false });
    }
  };
  /*
   * Stage 22.6: stock lines per kind. Material that runs out stops production;
   * a consumable that runs out slows packing or maintenance; finished stock is
   * made to order anyway. Each line opens its own tab, filtered.
   */
  const GROUP_LINES = [
    ["raw", "RAW_MATERIAL", "Raw material", "high", "medium"],
    ["consumables", "CONSUMABLE", "Consumable", "medium", "low"],
    ["finished", "FINISHED_PRODUCT", "Finished product", "low", "low"],
  ] as const;
  if (inventory.items === 0) {
    items.push({
      id: "inventory:uninitialized",
      area: "inventory",
      severity: "low",
      title: "Inventory not initialized",
      detail: "No inventory items are defined. Create the definitions, then enter opening stock or receive a purchase.",
      count: 1,
      href: INVENTORY_PATH,
      cms: false,
    });
  } else {
    for (const [tab, group, noun, outSeverity, lowSeverity] of GROUP_LINES) {
      const counts = inventory.byGroup[group];
      stockLine(`inventory:${tab}:out`, outSeverity, `${noun} out of stock`, "Counted and at zero.", counts.outOfStock, { tab, status: "OUT_OF_STOCK" });
      stockLine(
        `inventory:${tab}:reorder`,
        lowSeverity,
        `${noun} to reorder`,
        "Above zero, at or below the reorder level.",
        counts.lowStock,
        { tab, status: "REORDER" },
      );
    }
    stockLine(
      "inventory:untracked",
      "low",
      "Missing opening quantity",
      "Stock is unknown until an opening balance is entered. Unknown is not zero.",
      inventory.notTracked,
      { status: "NOT_TRACKED" },
    );
    stockLine(
      "inventory:cost",
      "low",
      "Missing unit cost",
      "Tracked items without a cost, so inventory value is unavailable.",
      inventory.missingCost,
      { status: "MISSING_COST" },
    );
  }
  if (inventory.openPurchases > 0) {
    items.push({
      id: "inventory:purchases",
      area: "inventory",
      severity: "low",
      title: "Purchases awaiting receipt",
      detail: "Ordered stock that has not been received. Stock moves only when receipt is confirmed.",
      count: inventory.openPurchases,
      href: hrefWith(INVENTORY_PATH, { tab: "purchases" }),
      cms: false,
    });
  }

  if (!catalog.reachable) {
    items.push({
      id: "catalog:unreachable",
      area: "catalog",
      severity: "high",
      title: "Catalog could not be read",
      detail: catalog.problem ?? "The CMS did not answer, so catalog approvals cannot be checked.",
      count: 1,
      href: "/admin/settings",
      cms: false,
    });
  } else {
    const review = catalog.stages["READY FOR REVIEW"];
    if (review > 0) {
      const only = review === 1 ? catalog.products.find((row) => row.stage === "READY FOR REVIEW") : undefined;
      items.push({
        id: "catalog:review",
        area: "catalog",
        severity: "medium",
        title: "Products awaiting approval",
        detail: "Every prerequisite passes; the product approval has not been recorded.",
        count: review,
        href: only ? only.href : hrefWith(CATALOG_PATH, { view: "review" }),
        cms: false,
      });
    }

    const approvedUnpublished = catalog.stages.APPROVED;
    if (approvedUnpublished > 0) {
      items.push({
        id: "catalog:publish",
        area: "catalog",
        severity: "low",
        title: "Approved products not published",
        detail: "Approved for sale and not yet visible on the storefront.",
        count: approvedUnpublished,
        href: hrefWith(CATALOG_PATH, { view: "approved" }),
        cms: false,
      });
    }

    if (catalog.pricesAwaitingApproval > 0) {
      items.push({
        id: "catalog:prices",
        area: "catalog",
        severity: "medium",
        title: "Prices awaiting approval",
        detail: "A price is entered but no price approval in effect matches it, so it cannot be charged in launch mode.",
        count: catalog.pricesAwaitingApproval,
        href: hrefWith(CATALOG_PATH, { view: "price" }),
        cms: false,
      });
    }

    const media = catalog.media.MISSING + catalog.media.PROPOSED;
    if (media > 0) {
      items.push({
        id: "catalog:media",
        area: "catalog",
        severity: "medium",
        title: "Products missing approved media",
        detail: [
          catalog.media.MISSING > 0 && `${plural(catalog.media.MISSING, "product has", "products have")} no image`,
          catalog.media.PROPOSED > 0 &&
            `${plural(catalog.media.PROPOSED, "product has", "products have")} an image without a recorded media approval`,
        ]
          .filter(Boolean)
          .join("; ")
          .concat("."),
        count: media,
        href: hrefWith(CATALOG_PATH, { view: "media" }),
        cms: false,
      });
    }

  }

  const limitations = catalog.capability.missingLimitations;
  if (limitations.length > 0) {
    items.push({
      id: "capability:limitations",
      area: "capability",
      severity: "high",
      title: "Manufacturing capability blockers",
      detail: `No product can be approved as manufacturable until these are validated: ${limitations.join(", ")}.`,
      count: limitations.length,
      href: `${CATALOG_PATH}#capability`,
      cms: false,
    });
  }

  return items.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count || a.id.localeCompare(b.id),
  );
}

export async function getAttention(operator: OperatorSession): Promise<AttentionItem[]> {
  const [issues, catalog, heldForMaterial, inventory] = await Promise.all([
    listOpsIssues(operator),
    getCatalogHealth(operator),
    getHeldForMaterial(operator),
    getInventorySummary(operator),
  ]);
  return deriveAttention({ issues, catalog, heldForMaterial, inventory });
}
