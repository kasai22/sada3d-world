import Link from "next/link";

import { Tag } from "@/components/core";
import {
  activeFilters,
  buildHref,
  clearFilters,
  hasActiveFilters,
  removeFacet,
} from "@/lib/catalog/params";
import { facetLabel } from "@/lib/catalog/taxonomy";
import type { CatalogQuery } from "@/lib/catalog/types";
import styles from "./ActiveFilters.module.css";

export interface ActiveFiltersProps {
  query: CatalogQuery;
  pathname: string;
}

const FACET_TITLE: Record<string, string> = {
  category: "Category",
  material: "Material",
  technology: "Technology",
  color: "Colour",
  availability: "Availability",
  price: "Price",
};

/**
 * Removable chips for everything currently narrowing the results.
 *
 * Every chip is a plain link to the URL without that value, so the whole row
 * works with no client JavaScript and each removal is a real, shareable
 * address.
 */
export function ActiveFilters({ query, pathname }: ActiveFiltersProps) {
  if (!hasActiveFilters(query)) return null;

  const chips = activeFilters(query);

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Active</span>

      {query.q && (
        <Tag
          tone="accent"
          removeHref={buildHref(pathname, query, { q: "", page: 1 })}
          removeLabel={`Clear search ${query.q}`}
        >
          Search: {query.q}
        </Tag>
      )}

      {chips.map(({ facet, value }) => (
        <Tag
          key={`${facet}:${value}`}
          tone="accent"
          removeHref={buildHref(pathname, removeFacet(query, facet, value))}
          removeLabel={`Remove filter ${FACET_TITLE[facet]} ${facetLabel(facet, value)}`}
        >
          {FACET_TITLE[facet]}: {facetLabel(facet, value)}
        </Tag>
      ))}

      <Link href={buildHref(pathname, clearFilters(query))} className={styles.clear}>
        Clear all
      </Link>
    </div>
  );
}
