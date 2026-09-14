import type { Metadata } from "next";

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
import { catalogSize, getBrowseCategories, queryCatalog } from "@/lib/catalog/query";
import styles from "../shop.module.css";

const DESCRIPTION =
  "Browse parts that are ready to make, or send a model of your own.";

/**
 * Filtered permutations are the same catalog in a different order, so they
 * point their canonical at /shop and stay out of the index.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const query = parseQuery(await searchParams);

  return {
    title: "Shop",
    description: DESCRIPTION,
    alternates: { canonical: "/shop" },
    robots: hasActiveFilters(query) ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      url: "/shop",
      title: "Shop — Reality 3D",
      description: DESCRIPTION,
    },
  };
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseQuery(await searchParams);
  const result = await queryCatalog(query);

  // Rail counts describe the whole catalog, so the rail reads the same however
  // the results are currently filtered.
  const railCounts = (await queryCatalog(EMPTY_QUERY)).facets.category;

  return (
    <div className={`bg-commerce ${styles.page}`}>
      <div className="u-container">
        <MarketplaceIntro
          crumbs={[{ label: "Shop" }]}
          eyebrow={`${await catalogSize()} parts in catalog`}
          title="Explore what's possible."
          description={DESCRIPTION}
        />

        <CategoryRail categories={await getBrowseCategories()} counts={railCounts} />

        <MarketplaceView query={query} result={result} pathname="/shop" />
      </div>
    </div>
  );
}
