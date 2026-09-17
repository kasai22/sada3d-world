import { hrefWith, type ParamValues } from "@/lib/ops/query";

import type { SectionTab } from "./SectionTabs";

/** The Analytics area. Tabs keep the selected date range. */
export const ANALYTICS_PAGES = [
  { id: "revenue", label: "Revenue", href: "/admin/analytics" },
  { id: "products", label: "Product sales", href: "/admin/analytics/products" },
  { id: "materials", label: "Material usage", href: "/admin/analytics/materials" },
] as const;

export type AnalyticsPage = (typeof ANALYTICS_PAGES)[number]["id"];

export function analyticsTabs(current: AnalyticsPage, keep: ParamValues): SectionTab[] {
  return ANALYTICS_PAGES.map((page) => ({ label: page.label, href: hrefWith(page.href, keep), current: page.id === current }));
}

/** The Catalog area. */
export const CATALOG_PAGES = [
  { id: "health", label: "Health", href: "/admin/catalog" },
  { id: "categories", label: "Categories", href: "/admin/catalog/categories" },
  { id: "materials", label: "Materials", href: "/admin/catalog/materials" },
  { id: "pricing", label: "Pricing", href: "/admin/catalog/pricing" },
  { id: "media", label: "Media", href: "/admin/catalog/media" },
] as const;

export type CatalogPage = (typeof CATALOG_PAGES)[number]["id"];

export function catalogTabs(current: CatalogPage): SectionTab[] {
  return CATALOG_PAGES.map((page) => ({ label: page.label, href: page.href, current: page.id === current }));
}
