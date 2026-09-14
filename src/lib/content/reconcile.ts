/**
 * What happens to CMS content the canonical catalog no longer describes.
 *
 * Pure decisions, separated from the Payload calls in `import.ts` so the rules
 * that decide whether a record is deleted can be tested without a database.
 *
 * ── The two modes ────────────────────────────────────────────────────────
 *
 *   sync    `npm run content:import`. Stale content is **unpublished**, never
 *           deleted. Running it twice leaves the same published catalog and no
 *           stale product behind on the storefront, and nothing is lost.
 *
 *   reset   `npm run content:reset`, after a verified backup. Stale content is
 *           **deleted** — unless something still refers to it, in which case it
 *           is archived (unpublished) instead and the reference is reported.
 *
 * ── What counts as a reference ───────────────────────────────────────────
 *
 * For a product: a saved item or a cart line holding its id. Order items do
 * not hold a product id — they snapshot the name, specification and price at
 * ordering — so deleting a catalog record cannot alter a historical order.
 *
 * For a category or material: a product still in the CMS pointing at it
 * (including an archived one), or a child category. Deleting it would null a
 * required relationship on a record that has to survive.
 */

export type ReconcileMode = "sync" | "reset";

export type ContentCollection = "products" | "categories" | "materials";

export interface StaleDocument {
  collection: ContentCollection;
  /** The stable key: productId for products, value for the others. */
  key: string;
  /** Payload's own id. */
  id: number;
  status: "published" | "draft";
}

export type StaleAction = "delete" | "unpublish" | "none";

export interface StaleDecision extends StaleDocument {
  action: StaleAction;
  reason: string;
  referencedBy: readonly string[];
}

export function decideStale(
  doc: StaleDocument,
  mode: ReconcileMode,
  referencedBy: readonly string[],
): StaleDecision {
  const base = { ...doc, referencedBy };

  if (mode === "sync") {
    return doc.status === "published"
      ? { ...base, action: "unpublish", reason: "Not in the canonical catalog; unpublished (sync never deletes)." }
      : { ...base, action: "none", reason: "Not in the canonical catalog; already a draft." };
  }

  if (referencedBy.length > 0) {
    const refs = referencedBy.join(", ");
    return doc.status === "published"
      ? { ...base, action: "unpublish", reason: `Referenced by ${refs}; archived instead of deleted.` }
      : { ...base, action: "none", reason: `Referenced by ${refs}; already archived, kept.` };
  }

  return { ...base, action: "delete", reason: "Not in the canonical catalog and not referenced; deleted." };
}

/**
 * Order in which stale categories are processed: deepest first.
 *
 * A child is removed before its parent, so the parent's "has a child" reference
 * disappears in the same run and the parent can be removed too.
 */
export function deepestFirst<T extends { id: number; parent: number | null }>(
  categories: readonly T[],
  all: readonly { id: number; parent: number | null }[] = categories,
): T[] {
  const parentOf = new Map(all.map((category) => [category.id, category.parent]));

  const depth = (id: number): number => {
    let level = 0;
    const seen = new Set<number>();
    let current = parentOf.get(id) ?? null;
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      level += 1;
      current = parentOf.get(current) ?? null;
    }
    return level;
  };

  return [...categories].sort((a, b) => depth(b.id) - depth(a.id) || a.id - b.id);
}

/**
 * Stable comparison of a planned write against a stored document.
 *
 * Only the keys being written are compared. Array rows lose Payload's generated
 * `id`, and null and undefined are treated as absent, so an unchanged record
 * compares equal and is not re-saved — which is what makes a second import
 * report "unchanged" rather than minting a new version of every document.
 */
export function sameContent(stored: Record<string, unknown>, planned: Record<string, unknown>): boolean {
  return Object.keys(planned).every(
    (key) => canonical(normalize(stored[key])) === canonical(normalize(planned[key])),
  );
}

function normalize(value: unknown, inArray = false): unknown {
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, true));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !(inArray && key === "id"))
      .map(([key, inner]) => [key, normalize(inner)] as const)
      .filter(([, inner]) => inner !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  return value;
}

function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => `${key}:${canonical(inner)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
