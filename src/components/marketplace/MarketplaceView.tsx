import type { CatalogQuery, CatalogResult } from "@/lib/catalog/types";

import { ActiveFilters } from "./ActiveFilters";
import { FilterPanel } from "./FilterPanel";
import { MarketplaceEmptyState } from "./MarketplaceEmptyState";
import { MarketplacePagination } from "./MarketplacePagination";
import { MarketplaceToolbar } from "./MarketplaceToolbar";
import { ProductGrid } from "./ProductGrid";
import { buildFilterGroups } from "./filterGroups";
import styles from "./MarketplaceView.module.css";

export interface MarketplaceViewProps {
  query: CatalogQuery;
  result: CatalogResult;
  /** Route the filters write back to. */
  pathname: string;
  /** Off on a category route, where the path already fixes the category. */
  showCategoryFacet?: boolean;
}

/**
 * Sidebar plus results.
 *
 * Shared by /shop and /shop/[category] so both routes behave identically; only
 * the pathname the filters write to differs.
 */
export function MarketplaceView({
  query,
  result,
  pathname,
  showCategoryFacet = true,
}: MarketplaceViewProps) {
  const groups = buildFilterGroups(result.facets, {
    includeCategory: showCategoryFacet,
  });

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Filters">
        <FilterPanel
          groups={groups}
          facets={result.facets}
          query={query}
          pathname={pathname}
        />
      </aside>

      <div className={styles.results}>
        <MarketplaceToolbar
          groups={groups}
          facets={result.facets}
          query={query}
          pathname={pathname}
          total={result.total}
        />

        <ActiveFilters query={query} pathname={pathname} />

        <div className={styles.grid}>
          {result.items.length === 0 ? (
            <MarketplaceEmptyState query={query} pathname={pathname} />
          ) : (
            <ProductGrid products={result.items} priorityCount={4} />
          )}
        </div>

        <MarketplacePagination
          query={query}
          pathname={pathname}
          page={result.page}
          pageCount={result.pageCount}
        />
      </div>
    </div>
  );
}
