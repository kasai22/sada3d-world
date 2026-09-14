"use client";

import { useRouter } from "next/navigation";
import { useTransition, type CSSProperties } from "react";
import clsx from "clsx";

import { Icon } from "@/components/core";
// Direct, not through the navigation barrel: that barrel also exports the
// server-rendered Header and Footer, which have no place in a client bundle.
import { FilterTree, type FilterGroup } from "@/components/navigation/FilterTree";
import { OFFERED_COLORS } from "@/lib/catalog/taxonomy";
import {
  activeFilterCount,
  buildHref,
  clearFilters,
  toggleFacet,
  type FacetKey,
} from "@/lib/catalog/params";
import type { CatalogFacets, CatalogQuery } from "@/lib/catalog/types";
import styles from "./FilterPanel.module.css";

export interface FilterPanelProps {
  groups: readonly FilterGroup[];
  facets: CatalogFacets;
  query: CatalogQuery;
  /** Route the filters apply to — /shop, or a category route. */
  pathname: string;
  /** Off inside the drawer, which supplies its own title and reset. */
  showHeader?: boolean;
  className?: string;
}

/**
 * The filter controls.
 *
 * Selection is never held in React state: every change writes the URL and the
 * server re-renders the results. That keeps the visible state and the address
 * bar impossible to desynchronise, and makes any filtered view shareable.
 */
export function FilterPanel({
  groups,
  facets,
  query,
  pathname,
  showHeader = true,
  className,
}: FilterPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const active = activeFilterCount(query);

  function apply(next: CatalogQuery) {
    startTransition(() => {
      router.push(buildHref(pathname, next), { scroll: false });
    });
  }

  return (
    <div
      className={clsx(styles.panel, className)}
      aria-busy={pending || undefined}
    >
      {showHeader && (
        <div className={styles.head}>
          <h2 className={styles.title}>
            Filters
            {active > 0 && <span className={styles.count}> · {active}</span>}
          </h2>
          <button
            type="button"
            className={styles.reset}
            disabled={active === 0}
            onClick={() => apply(clearFilters(query))}
          >
            Reset
          </button>
        </div>
      )}

      <FilterTree
        groups={groups}
        selected={[
          ...query.category,
          ...query.material,
          ...query.technology,
          ...query.price,
          ...query.availability,
        ]}
        onToggle={(groupKey, value) =>
          apply(toggleFacet(query, groupKey as FacetKey, value))
        }
      />

      <fieldset className={styles.colorGroup}>
        <legend className={styles.colorLegend}>Colour</legend>
        <div className={styles.swatches}>
          {OFFERED_COLORS.map((color) => {
            const count = facets.color[color.value] ?? 0;
            const checked = query.color.includes(color.value);

            return (
              <label key={color.value} className={styles.swatchLabel}>
                <input
                  type="checkbox"
                  className={styles.swatchInput}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onChange={() => apply(toggleFacet(query, "color", color.value))}
                />
                <span
                  className={styles.swatch}
                  style={
                    {
                      "--swatch": color.hex,
                      // A tick on white needs to be dark to be visible.
                      "--swatch-mark":
                        color.value === "white" || color.value === "grey"
                          ? "var(--void)"
                          : "var(--white)",
                    } as CSSProperties
                  }
                >
                  {checked && <Icon name="check" size={14} />}
                </span>
                {/* The swatch is the control; the name and count carry the
                    meaning for anyone not seeing colour. */}
                <span className="u-visually-hidden">
                  {color.label}, {count} products
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
