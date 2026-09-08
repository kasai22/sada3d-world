"use client";

import { useEffect, useRef, useState } from "react";

import { Button, IconButton } from "@/components/core";
import type { FilterGroup } from "@/components/navigation";
import {
  activeFilterCount,
  buildHref,
  clearFilters,
} from "@/lib/catalog/params";
import type { CatalogFacets, CatalogQuery } from "@/lib/catalog/types";
import { useRouter } from "next/navigation";

import { FilterPanel } from "./FilterPanel";
import styles from "./FilterDrawer.module.css";

export interface FilterDrawerProps {
  groups: readonly FilterGroup[];
  facets: CatalogFacets;
  query: CatalogQuery;
  pathname: string;
  /** Result count, shown on the confirm button. */
  total: number;
}

/**
 * Mobile and tablet filter surface.
 *
 * Native <dialog>, so focus trapping, Escape and focus restoration come from
 * the platform. Changes apply immediately — the results behind update as you
 * go — so the confirm button only dismisses the sheet and reports the count.
 */
export function FilterDrawer({
  groups,
  facets,
  query,
  pathname,
  total,
}: FilterDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const active = activeFilterCount(query);
  const close = () => setOpen(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        iconLeft="filter"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Filters{active > 0 ? ` · ${active}` : ""}
      </Button>

      <dialog
        ref={dialogRef}
        className={styles.drawer}
        aria-label="Filters"
        onClose={close}
      >
        <div className={styles.inner}>
          <div className={styles.top}>
            <h2 className={styles.title}>Filters</h2>
            <IconButton icon="x" label="Close filters" onClick={close} />
          </div>

          <div className={styles.body}>
            <FilterPanel
              groups={groups}
              facets={facets}
              query={query}
              pathname={pathname}
              showHeader={false}
            />
          </div>

          <div className={styles.footer}>
            <Button
              variant="ghost"
              disabled={active === 0}
              onClick={() =>
                router.push(buildHref(pathname, clearFilters(query)), {
                  scroll: false,
                })
              }
            >
              Reset
            </Button>
            <Button onClick={close}>
              Show {total} {total === 1 ? "result" : "results"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
