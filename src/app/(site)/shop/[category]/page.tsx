import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CategoryRail,
  MarketplaceIntro,
  MarketplaceView,
} from "@/components/marketplace";
import {
  EMPTY_QUERY,
  hasActiveFilters,
  parseQuery,
  type SearchParams,
} from "@/lib/catalog/params";
import { queryCatalog } from "@/lib/catalog/query";
import { BROWSE_CATEGORIES, categoryLabel } from "@/lib/catalog/taxonomy";
import styles from "../shop.module.css";

/** One short technical line per category. */
const DESCRIPTIONS: Record<string, string> = {
  mechanical: "Precision components, functional parts and custom assemblies.",
  automotive: "Interior fittings, exterior trim and replacement components.",
  industrial: "Jigs, fixtures, tooling and line-side spares.",
  components: "Brackets, housings, couplers, fasteners and mounts.",
  lifestyle: "Home objects, organisation and considered everyday pieces.",
  architecture: "Scale models, facade studies and presentation pieces.",
  prototyping: "Form studies and fit checks, before you commit to tooling.",
  "custom-products": "Your geometry, manufactured to your specification.",
};

/** The eight browse categories are known at build time. */
export function generateStaticParams() {
  return BROWSE_CATEGORIES.map((category) => ({ category }));
}

/**
 * Unknown categories 404 at the routing layer.
 *
 * Calling notFound() inside the component is not enough here: the shop segment
 * has a loading boundary, so the shell streams with a 200 before the component
 * runs and the status can no longer be changed. Rejecting the param up front
 * returns a real 404.
 */
export const dynamicParams = false;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { category } = await params;

  // Rejected here rather than in the component: the shop segment has a loading
  // boundary, so by the time the component runs the shell has streamed with a
  // 200 and the status can no longer be set.
  if (!BROWSE_CATEGORIES.includes(category)) notFound();

  const label = categoryLabel(category) ?? category;

  const query = parseQuery(await searchParams);
  const description = DESCRIPTIONS[category] ?? `${label} parts, made to order.`;

  return {
    title: label,
    description,
    alternates: { canonical: `/shop/${category}` },
    robots: hasActiveFilters(query) ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      url: `/shop/${category}`,
      title: `${label} — SADA 3D`,
      description,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { category } = await params;

  // Only real browse categories resolve; anything else is a 404 rather than an
  // empty results page.
  if (!BROWSE_CATEGORIES.includes(category)) notFound();

  const label = categoryLabel(category) ?? category;
  const pathname = `/shop/${category}`;

  // scopeCategory, not the category facet: the path constrains the results but
  // never appears as a removable chip, so what the sidebar shows and what the
  // URL says can never disagree.
  const query = { ...parseQuery(await searchParams), scopeCategory: category };
  const result = await queryCatalog(query);
  const railCounts = (await queryCatalog(EMPTY_QUERY)).facets.category;

  return (
    <div className={`bg-commerce ${styles.page}`}>
      <div className="u-container">
        <MarketplaceIntro
          crumbs={[{ label: "Shop", href: "/shop" }, { label }]}
          eyebrow={`${result.total} ${result.total === 1 ? "part" : "parts"}`}
          title={label}
          description={DESCRIPTIONS[category] ?? `${label} parts, made to order.`}
        />

        <CategoryRail active={category} counts={railCounts} />

        <MarketplaceView
          query={query}
          result={result}
          pathname={pathname}
          showCategoryFacet={false}
        />
      </div>
    </div>
  );
}
