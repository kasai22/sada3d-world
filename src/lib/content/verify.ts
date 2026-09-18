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
 * Catalog parity: canonical catalog = Payload.
 *
 * Since the content reset the expected side is the canonical catalog's
 * published subset (`PRODUCTS`, derived from `content/catalog`), and the actual
 * side is what Payload serves an anonymous visitor. Before the reset the two
 * sides were independently maintained catalogs and this reported 36 against 37
 * with 111 differences; now one is imported from the other, and any difference
 * is drift to be fixed at its source rather than tolerated.
 *
 * Nothing is excluded from the comparison to make it pass. The fields Payload
 * holds that the domain `Product` does not are listed in `CMS_ONLY_FIELDS` with
 * the reason each is not compared.
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
  /** Expected: the canonical catalog's published products. */
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
  for (const sort of ["newest", "price-asc", "price-desc"] as const) {
    queries.push({ ...EMPTY_QUERY, sort });
  }
  for (const term of ["gear", "spacer", "bracket", "pla"]) {
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
  "categoryLabel",
  "browseCategoryLabel",
  "material",
  "technology",
  "color",
  "price",
  "currency",
  "priceStatus",
  "approvalStatus",
  "featured",
  "recommended",
  "launch",
  "image",
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

/* ------------------------------------------------------------------ *
 * CMS-only fields
 * ------------------------------------------------------------------ */

/**
 * Payload product fields deliberately outside the product comparison, and why.
 *
 * Everything the storefront renders is compared. These are not rendered from
 * the product record, so there is nothing for them to disagree with:
 */
export const CMS_ONLY_FIELDS: Readonly<Record<string, string>> = {
  "seo.title / seo.description":
    "Written by the importer from the name and description; the product page builds its metadata from those fields directly, which are compared.",
  "seo.ogImage": "No product has social imagery; media is CMS-managed and not part of the canonical record.",
  gallery:
    "Additional views are CMS uploads with no storage adapter yet; no product has any. The primary image (upload or visual) is compared as `image`.",
  "approval.reference / approvedBy / approvedOn":
    "Compared through validation rather than field parity: validateEntryApprovals refuses an approved product without them on either side, and the canonical record is the reviewed copy.",
  "_status": "Compared by construction — the public read returns published documents only, and document counts are checked separately.",
};

/* ------------------------------------------------------------------ *
 * Categories and materials
 * ------------------------------------------------------------------ */

export interface ContentParity {
  expected: number;
  actual: number;
  differences: Difference[];
  ok: boolean;
}

export function compareRows(
  kind: string,
  expected: readonly Record<string, unknown>[],
  actual: readonly Record<string, unknown>[],
  fields: readonly string[],
): ContentParity {
  const differences: Difference[] = [];
  const byValue = new Map(actual.map((row) => [String(row.value), row]));
  const expectedValues = new Set(expected.map((row) => String(row.value)));

  for (const row of expected) {
    const stored = byValue.get(String(row.value));
    if (!stored) {
      differences.push({ subject: `${kind} ${String(row.value)}`, field: "(missing)", local: row.value, payload: undefined });
      continue;
    }
    for (const field of fields) {
      if (canonical(row[field]) !== canonical(stored[field])) {
        differences.push({ subject: `${kind} ${String(row.value)}`, field, local: row[field], payload: stored[field] });
      }
    }
  }

  for (const row of actual) {
    if (!expectedValues.has(String(row.value))) {
      differences.push({ subject: `${kind} ${String(row.value)}`, field: "(extra)", local: undefined, payload: row.value });
    }
  }

  return { expected: expected.length, actual: actual.length, differences, ok: differences.length === 0 };
}

export const CATEGORY_FIELDS = ["value", "name", "description", "parent", "isBrowse", "browseOrder"] as const;

export const MATERIAL_FIELDS = [
  "value", "name", "code", "description", "properties", "technologies", "applications",
  "bestFor", "avoidFor", "surface", "swatches", "seo",
] as const;

export function compareCategories(
  expected: readonly Record<string, unknown>[],
  actual: readonly Record<string, unknown>[],
): ContentParity {
  return compareRows("category", expected, actual, CATEGORY_FIELDS);
}

export function compareMaterials(
  expected: readonly Record<string, unknown>[],
  actual: readonly Record<string, unknown>[],
): ContentParity {
  return compareRows("material", expected, actual, MATERIAL_FIELDS);
}
