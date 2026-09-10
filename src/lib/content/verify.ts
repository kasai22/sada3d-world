import { runCatalogQuery } from "@/lib/catalog/engine";
import { PRODUCTS } from "@/lib/catalog/products";
import type { CatalogQuery, Product } from "@/lib/catalog/types";
import {
  AVAILABILITY,
  BROWSE_CATEGORIES,
  MATERIALS,
  PRICE_BRACKETS,
  TECHNOLOGIES,
} from "@/lib/catalog/taxonomy";

/**
 * Catalog parity.
 *
 * The gate the CMS has to pass before it replaces the local catalog. Phase 14's
 * rule is that the source is not switched until the two have been shown to
 * agree, and this is what shows it.
 *
 * ── What is compared ─────────────────────────────────────────────────────
 *
 * Not "roughly the same number of products". Every product is compared field by
 * field, and then the two are put through the *same* query engine over a spread
 * of real queries and their results compared — page contents, totals and facet
 * counts.
 *
 * The engine being shared means filtering and faceting cannot differ; what this
 * catches is the thing that can: a field that did not survive the round trip
 * through the CMS. A dropped `qualityOptions`, a `materials` list that lost its
 * default, a price that became a string.
 */

export interface Difference {
  subject: string;
  field: string;
  local: unknown;
  payload: unknown;
}

export interface ParityReport {
  localCount: number;
  payloadCount: number;
  missing: string[];
  extra: string[];
  differences: Difference[];
  queriesCompared: number;
  ok: boolean;
}

const EMPTY_QUERY: CatalogQuery = {
  category: [],
  material: [],
  technology: [],
  color: [],
  availability: [],
  price: [],
  q: "",
  sort: "relevance",
  page: 1,
};

/**
 * A spread of queries that between them exercise every facet, the search, the
 * sorts and paging.
 *
 * Generated from the taxonomy rather than hand-listed, so a facet value added
 * later is compared without anyone remembering to add it here.
 */
export function parityQueries(): CatalogQuery[] {
  const queries: CatalogQuery[] = [EMPTY_QUERY];

  for (const category of BROWSE_CATEGORIES) {
    queries.push({ ...EMPTY_QUERY, scopeCategory: category });
    queries.push({ ...EMPTY_QUERY, category: [category] });
  }
  for (const material of MATERIALS) {
    queries.push({ ...EMPTY_QUERY, material: [material.value] });
  }
  for (const technology of TECHNOLOGIES) {
    queries.push({ ...EMPTY_QUERY, technology: [technology.value] });
  }
  for (const availability of AVAILABILITY) {
    queries.push({ ...EMPTY_QUERY, availability: [availability.value] });
  }
  for (const bracket of PRICE_BRACKETS) {
    queries.push({ ...EMPTY_QUERY, price: [bracket.value] });
  }
  for (const sort of ["newest", "price-asc", "price-desc", "popularity"] as const) {
    queries.push({ ...EMPTY_QUERY, sort });
  }
  for (const term of ["gear", "bracket", "clip"]) {
    queries.push({ ...EMPTY_QUERY, q: term });
  }
  queries.push({ ...EMPTY_QUERY, page: 2 });
  queries.push({ ...EMPTY_QUERY, page: 3 });

  return queries;
}

/** Stable JSON, so field order cannot make two equal values look different. */
function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${canonical(v)}`).join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

const COMPARED: readonly (keyof Product)[] = [
  "id",
  "slug",
  "name",
  "summary",
  "category",
  "browseCategory",
  "material",
  "technology",
  "color",
  "price",
  "currency",
  "availability",
  "badge",
  "description",
  "applications",
  "materials",
  "colors",
  "qualityOptions",
  "specifications",
  "materialNotes",
  "model",
];

export function compareProducts(
  local: readonly Product[],
  payload: readonly Product[],
): Pick<ParityReport, "missing" | "extra" | "differences"> {
  const byId = new Map(payload.map((product) => [product.id, product]));
  const localIds = new Set(local.map((product) => product.id));

  const missing: string[] = [];
  const differences: Difference[] = [];

  for (const expected of local) {
    const actual = byId.get(expected.id);

    if (!actual) {
      missing.push(expected.id);
      continue;
    }

    for (const field of COMPARED) {
      const a = canonical(expected[field]);
      const b = canonical(actual[field]);
      if (a !== b) {
        differences.push({
          subject: expected.id,
          field: String(field),
          local: expected[field],
          payload: actual[field],
        });
      }
    }
  }

  const extra = payload
    .map((product) => product.id)
    .filter((id) => !localIds.has(id));

  return { missing, extra, differences };
}

/**
 * Runs both catalogs through the query engine and compares the results.
 *
 * Compares what a visitor would actually see: the page of products, the total
 * and every facet count. A field that differs in a way the product comparison
 * missed shows up here as a count that does not match.
 */
export function compareQueries(
  local: readonly Product[],
  payload: readonly Product[],
): Difference[] {
  const differences: Difference[] = [];

  for (const query of parityQueries()) {
    const a = runCatalogQuery(local, query);
    const b = runCatalogQuery(payload, query);

    const label = canonical(query);

    if (a.total !== b.total) {
      differences.push({ subject: label, field: "total", local: a.total, payload: b.total });
    }

    const aItems = a.items.map((product) => product.id);
    const bItems = b.items.map((product) => product.id);
    if (canonical(aItems) !== canonical(bItems)) {
      differences.push({ subject: label, field: "items", local: aItems, payload: bItems });
    }

    if (canonical(a.facets) !== canonical(b.facets)) {
      differences.push({
        subject: label,
        field: "facets",
        local: a.facets,
        payload: b.facets,
      });
    }
  }

  return differences;
}

export function buildParityReport(payload: readonly Product[]): ParityReport {
  const local = PRODUCTS;
  const { missing, extra, differences } = compareProducts(local, payload);
  const queryDifferences = compareQueries(local, payload);
  const all = [...differences, ...queryDifferences];

  return {
    localCount: local.length,
    payloadCount: payload.length,
    missing,
    extra,
    differences: all,
    queriesCompared: parityQueries().length,
    ok: missing.length === 0 && extra.length === 0 && all.length === 0,
  };
}
