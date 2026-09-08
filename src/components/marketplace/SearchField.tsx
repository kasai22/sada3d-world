"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Input } from "@/components/forms";
import { buildHref } from "@/lib/catalog/params";
import type { CatalogQuery } from "@/lib/catalog/types";

export interface SearchFieldProps {
  query: CatalogQuery;
  pathname: string;
  className?: string;
}

/**
 * Catalog search.
 *
 * Submitting writes `q` into the URL and the server filters — filters and sort
 * are carried through untouched. There is no search backend in this phase; the
 * query-state architecture is what matters, and it will not change when one
 * arrives.
 */
export function SearchField({ query, pathname, className }: SearchFieldProps) {
  const router = useRouter();

  /*
   * Seeded from the URL. The caller keys this component on `query.q`, so a
   * cleared chip or a back navigation remounts it with the right value rather
   * than syncing state from props in an effect.
   */
  const [term, setTerm] = useState(query.q);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHref(pathname, query, { q: term.trim(), page: 1 }), {
      scroll: false,
    });
  }

  return (
    <form role="search" onSubmit={onSubmit} className={className}>
      <Input
        type="search"
        name="q"
        size="sm"
        icon="search"
        label="Search parts"
        placeholder="Search parts, materials, technology"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <button type="submit" className="u-visually-hidden">
        Search
      </button>
    </form>
  );
}
