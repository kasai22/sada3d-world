import type { IconName } from "@/components/core/Icon";
import { CMS_HOME } from "@/lib/ops/routes";

/**
 * The console's information architecture.
 *
 * Only destinations that exist. There is no Quotes page (quotes are calculated
 * and never stored), no Printers page (a job carries a machine id but there is
 * no machine registry) and no Analytics page (the dashboard's trend is the data
 * that supports one). Catalog and content editing stay in Payload, where the
 * editorial workflow — drafts, versions, publishing — already lives, and those
 * links say they open the CMS.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Opens the Payload CMS rather than a console page. */
  external?: boolean;
  /** Shows the open issue count. */
  badge?: "issues";
  /** Active only on this exact path, not its children. */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", href: "/ops", icon: "dashboard", exact: true },
      { label: "Orders", href: "/ops/orders", icon: "clipboard" },
      { label: "Production", href: "/ops/production", icon: "factory" },
      { label: "Designs", href: "/ops/designs", icon: "file-box" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Customers", href: "/ops/customers", icon: "users" },
      { label: "Payments", href: "/ops/payments", icon: "wallet" },
    ],
  },
  {
    label: "Manufacturing",
    items: [
      { label: "Issues", href: "/ops/issues", icon: "alert", badge: "issues" },
      { label: "Materials", href: `${CMS_HOME}/collections/materials`, icon: "layers", external: true },
    ],
  },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: `${CMS_HOME}/collections/products`, icon: "box", external: true },
      { label: "Content", href: CMS_HOME, icon: "library", external: true },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", href: "/ops/settings", icon: "settings" }],
  },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.external) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
