import type { CategoryDefinition } from "@/content/catalog/types";

/**
 * The category tree as runtime data (Stage 20).
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Until Stage 20 the only category tree was the repository seed
 * (`content/catalog/taxonomy.ts`), and every label, filter, breadcrumb, browse
 * route and validation rule read it at build time. A category an administrator
 * created in Payload therefore had no label, no filter, no page, and made every
 * product filed under it technically invalid — adding a product in a new
 * category needed a code change.
 *
 * Now the catalog source supplies the tree: Payload's published categories for
 * the CMS catalog, the seed for the local one. Everything that needs a label, a
 * path or the browse roots asks a `CategoryIndex` built from that tree.
 *
 * Pure: no Payload, no Next, safe for client components that receive a tree.
 */

export interface CategoryNode {
  value: string;
  label: string;
  description?: string;
  children?: readonly CategoryNode[];
}

export interface CategoryIndex {
  /** The tree, in display order. Plain data: may be passed to client components. */
  readonly tree: readonly CategoryNode[];
  /** Top-level categories: the browse destinations. */
  readonly roots: readonly string[];
  has(value: string): boolean;
  /** The value plus its ancestors, root first — so a parent filter matches its leaves. */
  path(value: string): readonly string[];
  label(value: string): string | undefined;
  description(value: string): string | undefined;
}

export function categoryIndexFor(tree: readonly CategoryNode[]): CategoryIndex {
  const paths = new Map<string, readonly string[]>();
  const labels = new Map<string, string>();
  const descriptions = new Map<string, string>();

  const walk = (nodes: readonly CategoryNode[], trail: readonly string[]) => {
    for (const node of nodes) {
      const path = [...trail, node.value];
      paths.set(node.value, path);
      labels.set(node.value, node.label);
      if (node.description) descriptions.set(node.value, node.description);
      if (node.children) walk(node.children, path);
    }
  };
  walk(tree, []);

  return {
    tree,
    roots: tree.map((node) => node.value),
    has: (value) => paths.has(value),
    path: (value) => paths.get(value) ?? [value],
    label: (value) => labels.get(value),
    description: (value) => descriptions.get(value),
  };
}

/** A CategoryDefinition tree (the seed's shape) as nodes. */
export function nodesFromDefinitions(definitions: readonly CategoryDefinition[]): CategoryNode[] {
  return definitions.map((definition) => ({
    value: definition.value,
    label: definition.label,
    ...(definition.description ? { description: definition.description } : {}),
    ...(definition.children ? { children: nodesFromDefinitions(definition.children) } : {}),
  }));
}

export interface CategoryRecord {
  id: number | string;
  value: string;
  name: string;
  description?: string | null;
  parent?: number | string | { id: number | string } | null;
  isBrowse?: boolean | null;
  browseOrder?: number | null;
}

export const CATEGORY_VALUE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Builds the tree from published CMS category records.
 *
 * Fail closed: a record whose parent is not among the records (unpublished or
 * missing), a top-level record that is not a browse destination, a child marked
 * as one, or a cycle, is left out of the tree and reported. A product filed
 * under a category left out is then technically invalid and says why, rather
 * than rendering under a page that does not exist.
 */
export function categoryTreeFromRecords(records: readonly CategoryRecord[]): {
  tree: CategoryNode[];
  problems: string[];
} {
  const problems: string[] = [];
  const idOf = (parent: CategoryRecord["parent"]) =>
    parent === null || parent === undefined ? undefined : typeof parent === "object" ? parent.id : parent;
  const byId = new Map(records.map((record) => [String(record.id), record]));

  const order = (a: CategoryRecord, b: CategoryRecord) =>
    (a.browseOrder ?? 0) - (b.browseOrder ?? 0) || a.name.localeCompare(b.name);

  const build = (parentId: string | undefined, seen: ReadonlySet<string>): CategoryNode[] =>
    records
      .filter((record) => (idOf(record.parent) === undefined ? parentId === undefined : String(idOf(record.parent)) === parentId))
      .sort(order)
      .flatMap((record) => {
        const id = String(record.id);
        if (seen.has(id)) {
          problems.push(`Category "${record.value}" is part of a cycle.`);
          return [];
        }
        if (!CATEGORY_VALUE_PATTERN.test(record.value)) {
          problems.push(`Category "${record.value}" is not a valid identifier (lowercase letters, digits and hyphens).`);
          return [];
        }
        if (parentId === undefined && !record.isBrowse) {
          problems.push(`Top-level category "${record.value}" is not marked as a browse destination.`);
          return [];
        }
        if (parentId !== undefined && record.isBrowse) {
          problems.push(`Category "${record.value}" has a parent and cannot also be a browse destination.`);
          return [];
        }
        const children = build(id, new Set([...seen, id]));
        return [
          {
            value: record.value,
            label: record.name,
            ...(record.description ? { description: record.description } : {}),
            ...(children.length > 0 ? { children } : {}),
          },
        ];
      });

  const tree = build(undefined, new Set());
  for (const record of records) {
    const parent = idOf(record.parent);
    if (parent !== undefined && !byId.has(String(parent))) {
      problems.push(`Category "${record.value}" has an unpublished or missing parent, so it is not in the tree.`);
    }
  }
  return { tree, problems };
}
