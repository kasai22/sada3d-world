"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/forms";
import { SORT_OPTIONS, buildHref } from "@/lib/catalog/params";
import type { CatalogQuery, SortValue } from "@/lib/catalog/types";

export interface SortSelectProps {
  query: CatalogQuery;
  pathname: string;
  className?: string;
}

/** Sort control. Writes `sort` to the URL and returns to page 1. */
export function SortSelect({ query, pathname, className }: SortSelectProps) {
  const router = useRouter();

  return (
    <Select
      label="Sort"
      size="sm"
      value={query.sort}
      className={className}
      options={SORT_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
      onChange={(event) =>
        router.push(
          buildHref(pathname, query, {
            sort: event.target.value as SortValue,
            page: 1,
          }),
          { scroll: false },
        )
      }
    />
  );
}
