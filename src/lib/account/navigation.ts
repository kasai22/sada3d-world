import type { IconName } from "@/components/core/Icon";

/**
 * The account information architecture.
 *
 * One list, used by the sidebar, by the mobile rail and by the breadcrumb
 * trail. Three copies of "which section am I in" would be three chances to
 * disagree about it.
 */

export interface AccountSection {
  href: string;
  label: string;
  icon: IconName;
  /** One line under the heading. Says what the section is for, plainly. */
  description: string;
}

export const ACCOUNT_ROOT = "/account";

export const ACCOUNT_SECTIONS: readonly AccountSection[] = [
  {
    href: "/account",
    label: "Overview",
    icon: "gauge",
    description: "Your orders and anything currently being made.",
  },
  {
    href: "/account/orders",
    label: "Orders",
    icon: "package",
    description: "Every order you have placed.",
  },
  {
    href: "/account/designs",
    label: "Designs",
    icon: "box",
    description: "Manufacturing files you have saved.",
  },
  {
    href: "/account/saved",
    label: "Saved",
    icon: "heart",
    description: "Parts you have kept to come back to.",
  },
  {
    href: "/account/addresses",
    label: "Addresses",
    icon: "map-pin",
    description: "Where your orders are delivered.",
  },
  {
    href: "/account/settings",
    label: "Settings",
    icon: "settings-2",
    description: "Your profile and account preferences.",
  },
];

/**
 * The section a path is in.
 *
 * Longest match wins, so `/account/orders/S3D-000184` is in Orders rather than
 * in Overview — a plain `startsWith` against `/account` would put every page in
 * the first section and mark two links current at once.
 */
export function activeSection(pathname: string): AccountSection | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";

  return ACCOUNT_SECTIONS.filter(
    (section) => path === section.href || path.startsWith(`${section.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

/** True when this link should carry aria-current. */
export function isSectionActive(pathname: string, section: AccountSection): boolean {
  return activeSection(pathname)?.href === section.href;
}
