import type { FilterGroup } from "@/components/navigation";
import type { CatalogFacets, CatalogQuery } from "@/lib/catalog/types";

import { FilterDrawer } from "./FilterDrawer";
import { SearchField } from "./SearchField";
import { SortSelect } from "./SortSelect";
import styles from "./MarketplaceToolbar.module.css";

export interface MarketplaceToolbarProps {
  groups: readonly FilterGroup[];
  facets: CatalogFacets;
  query: CatalogQuery;
  pathname: string;
  total: number;
}

/**
 * Result toolbar: search, sort, the mobile filter trigger, and the count.
 *
 * A Server Component — only the three controls that write to the URL are
 * client, and each is isolated.
 */
export function MarketplaceToolbar({
  groups,
  facets,
  query,
  pathname,
  total,
}: MarketplaceToolbarProps) {
  return (
    <div>
      <div className={styles.toolbar}>
        {/* Keyed on the term so an externally cleared search resets the field. */}
        <SearchField
          key={query.q}
          query={query}
          pathname={pathname}
          className={styles.search}
        />

        <div className={styles.controls}>
          <FilterDrawer
            groups={groups}
            facets={facets}
            query={query}
            pathname={pathname}
            total={total}
          />
          <SortSelect query={query} pathname={pathname} className={styles.sort} />
        </div>
      </div>

      {/*
        Announced politely so filtering, searching or sorting reports the new
        count without stealing focus from the control that caused it.
      */}
      <p className={styles.count} aria-live="polite" aria-atomic="true">
        <span className={styles.countValue}>{total}</span>
        <span>{total === 1 ? "product" : "products"}</span>
        {query.q && (
          <span>
            matching <span className={styles.term}>&ldquo;{query.q}&rdquo;</span>
          </span>
        )}
      </p>
    </div>
  );
}
