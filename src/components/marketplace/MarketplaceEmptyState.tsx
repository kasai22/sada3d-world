import { Button } from "@/components/core";
import { buildHref, clearFilters } from "@/lib/catalog/params";
import type { CatalogQuery } from "@/lib/catalog/types";
import styles from "./MarketplaceStates.module.css";

export interface MarketplaceEmptyStateProps {
  query: CatalogQuery;
  pathname: string;
}

/** No results. Technical and calm — say what happened, offer the way out. */
export function MarketplaceEmptyState({
  query,
  pathname,
}: MarketplaceEmptyStateProps) {
  return (
    <div className={styles.state}>
      <p className={styles.code}>0 RESULTS</p>

      <h2 className={styles.title}>No parts match your filters.</h2>

      <p className={styles.body}>
        Adjust your filters or explore another category.
      </p>

      <div className={styles.actions}>
        <Button href={buildHref(pathname, clearFilters(query))}>
          Clear filters
        </Button>
        <Button href="/shop" variant="secondary">
          Explore all
        </Button>
      </div>
    </div>
  );
}
