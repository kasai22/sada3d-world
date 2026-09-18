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
import { getBrowseCategoryLinks, queryCatalog } from "@/lib/catalog/query";
import { categoryHref } from "@/lib/routes";
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

/** The categories with parts at build time. */
export async function generateStaticParams() {
  return (await getBrowseCategoryLinks()).map((link) => ({ category: link.value }));
}

/**
 * Stage 19.8: categories are not fixed at build time. An administrator can
 * publish the first product in a category after the build, so unknown params
 * render on request and are checked against the served catalog.
 *
 * The 404 is raised in generateMetadata, which resolves before any of the page
 * streams — and the shop segment has no loading boundary — so the response
 * status is a real 404, not a 200 shell with an error inside it.
 */
export const dynamicParams = true;

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
  const link = (await getBrowseCategoryLinks()).find((entry) => entry.value === category);
  if (!link) notFound();

  const label = link.label;

  const query = parseQuery(await searchParams);
  const description = link.description ?? DESCRIPTIONS[category] ?? `${label} parts, made to order.`;

  return {
    title: label,
    description,
    alternates: { canonical: categoryHref(category) },
    robots: hasActiveFilters(query) ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      url: categoryHref(category),
      title: `${label} — Reality 3D`,
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
  const categories = await getBrowseCategoryLinks();
  const link = categories.find((entry) => entry.value === category);
  if (!link) notFound();

  const label = link.label;
  const pathname = categoryHref(category);

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
          description={link.description ?? DESCRIPTIONS[category] ?? `${label} parts, made to order.`}
        />

        <CategoryRail active={category} categories={categories} counts={railCounts} />

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
