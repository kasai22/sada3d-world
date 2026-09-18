import type { IconName } from "@/components/core/Icon";
import { ADMIN_HOME, CMS_HOME } from "@/lib/ops/routes";

/**
 * Reality 3D Admin's information architecture (Stage 22.5).
 *
 * Business, Operations, Analytics, Catalog, System — business concepts, not
 * CMS collections. Only destinations that exist. Raw Payload collections are
 * one explicit entry, Advanced CMS, at the bottom.
 *
 * Labels are unique across the whole sidebar, because the collapsed rail and a
 * screen reader's link list show them without their group: product management
 * is "Products", its sales figures are "Product sales", and material usage is
 * "Material usage" beside the catalog's "Materials".
 */

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Opens the Payload CMS rather than an admin page. */
  external?: boolean;
  /** Shows the open issue count. */
  badge?: "issues";
  /** Active only on this exact path, not its children. */
  exact?: boolean;
}

export interface NavGroup {
  /** Null for the ungrouped Overview. */
  label: string | null;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    items: [{ label: "Overview", href: ADMIN_HOME, icon: "dashboard", exact: true }],
  },
  {
    label: "Business",
    items: [
      { label: "Sales", href: "/admin/sales", icon: "wallet" },
      { label: "Orders", href: "/admin/orders", icon: "clipboard" },
      { label: "Products", href: "/admin/products", icon: "box" },
      { label: "Customers", href: "/admin/customers", icon: "users" },
      { label: "Payments", href: "/admin/payments", icon: "credit-card" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Manufacturing", href: "/admin/manufacturing", icon: "factory" },
      { label: "Inventory", href: "/admin/inventory", icon: "boxes" },
      { label: "Issues", href: "/admin/issues", icon: "alert", badge: "issues" },
      { label: "Customer files", href: "/admin/designs", icon: "file-box" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Revenue", href: "/admin/analytics", icon: "activity", exact: true },
      { label: "Product sales", href: "/admin/analytics/products", icon: "gauge" },
      { label: "Material usage", href: "/admin/analytics/materials", icon: "layers" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { label: "Catalog health", href: "/admin/catalog", icon: "check-circle", exact: true },
      { label: "Categories", href: "/admin/catalog/categories", icon: "library" },
      { label: "Materials", href: "/admin/catalog/materials", icon: "palette" },
      { label: "Pricing", href: "/admin/catalog/pricing", icon: "wallet" },
      { label: "Media", href: "/admin/catalog/media", icon: "scan" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/admin/settings", icon: "settings" },
      { label: "Advanced CMS", href: CMS_HOME, icon: "settings-2", external: true },
    ],
  },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.external) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Every internal destination, flattened. */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * The page's place in the admin, for the top bar: its group and its nav label.
 * The most specific matching item wins, so `/admin/analytics/products` is
 * "Analytics › Product sales", not "Analytics › Revenue".
 */
export function locate(pathname: string): { group: string | null; item: NavItem } | null {
  let best: { group: string | null; item: NavItem } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.external) continue;
      const matches = pathname === item.href || (item.href !== ADMIN_HOME && pathname.startsWith(`${item.href}/`));
      if (matches && (!best || item.href.length > best.item.href.length)) best = { group: group.label, item };
    }
  }
  return best;
}
