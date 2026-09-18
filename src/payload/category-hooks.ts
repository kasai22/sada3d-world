import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type PayloadRequest } from "payload";

import { CATEGORY_VALUE_PATTERN } from "../lib/catalog/category-tree";

/**
 * Category rules for the administrator-managed catalog (Stage 20).
 *
 * Categories are CMS data now: an administrator adds one and its products get a
 * page, a filter, a breadcrumb and a sitemap entry without a deployment. These
 * hooks keep that from breaking the storefront:
 *
 *   · the value is a URL segment: lowercase letters, digits, hyphens
 *   · a top-level category is a browse destination; a child is not
 *   · no category is its own ancestor
 *   · a category's value cannot change while products are filed under it
 *   · a category with products or sub-categories cannot be deleted, or
 *     unpublished while a published product still uses it — nothing is orphaned
 *
 * Alias-free: reachable from payload.config.ts, which the Payload CLI loads
 * without tsconfig paths.
 */

type CategoryData = { value?: string | null; parent?: unknown; isBrowse?: boolean | null; _status?: string | null };

const idOf = (value: unknown): number | string | undefined =>
  value === null || value === undefined ? undefined : typeof value === "object" ? (value as { id?: number | string }).id : (value as number | string);

async function productsUsing(req: PayloadRequest, id: number | string, publishedOnly: boolean): Promise<string[]> {
  const found = await req.payload.find({
    collection: "products",
    where: {
      and: [
        { or: [{ category: { equals: id } }, { browseCategory: { equals: id } }] },
        ...(publishedOnly ? [{ _status: { equals: "published" } }] : []),
      ],
    },
    depth: 0,
    limit: 20,
    overrideAccess: true,
    draft: !publishedOnly,
    req,
  });
  return found.docs.map((doc) => String(doc.productId ?? doc.id));
}

/** Pure: the rules that need no database. */
export function categoryShapeProblems(data: CategoryData): string[] {
  const problems: string[] = [];
  if (typeof data.value === "string" && !CATEGORY_VALUE_PATTERN.test(data.value)) {
    problems.push(`"${data.value}" is not a valid category identifier: use lowercase letters, digits and single hyphens (e.g. "fixtures-jigs").`);
  }
  const hasParent = idOf(data.parent) !== undefined;
  if (!hasParent && !data.isBrowse) {
    problems.push("A top-level category must be a browse destination (tick \"Top-level browse destination\"), or choose a parent.");
  }
  if (hasParent && data.isBrowse) {
    problems.push("A category with a parent cannot also be a top-level browse destination.");
  }
  return problems;
}

export const enforceCategoryRules: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  const merged = { ...(originalDoc ?? {}), ...data } as CategoryData & { id?: number | string };
  const problems = categoryShapeProblems(merged);

  // No cycles: walk the proposed parent's ancestors.
  const selfId = originalDoc?.id as number | string | undefined;
  let cursor = idOf(merged.parent);
  const seen = new Set<string>();
  while (cursor !== undefined && problems.length === 0) {
    if (selfId !== undefined && String(cursor) === String(selfId)) {
      problems.push("A category cannot be filed under itself or one of its own sub-categories.");
      break;
    }
    if (seen.has(String(cursor))) break;
    seen.add(String(cursor));
    const parent = await req.payload
      .findByID({ collection: "categories", id: cursor, depth: 0, overrideAccess: true, draft: true, req })
      .catch(() => null);
    cursor = idOf(parent?.parent);
  }

  if (operation === "update" && selfId !== undefined) {
    if (typeof data.value === "string" && originalDoc?.value && data.value !== originalDoc.value) {
      const used = await productsUsing(req, selfId, false);
      if (used.length > 0) {
        problems.push(`The identifier cannot change while products are filed under it (${used.join(", ")}): every link to them would break.`);
      }
    }
    if (data._status === "draft" && originalDoc?._status === "published") {
      const used = await productsUsing(req, selfId, true);
      if (used.length > 0) {
        problems.push(`Unpublishing would hide published products filed under this category (${used.join(", ")}). Move or unpublish them first.`);
      }
    }
  }

  if (problems.length > 0) throw new APIError(problems.join(" "), 400, null, true);
  return data;
};

export const preventOrphanedProducts: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const used = await productsUsing(req, id, false);
  const children = await req.payload.find({
    collection: "categories",
    where: { parent: { equals: id } },
    depth: 0,
    limit: 20,
    overrideAccess: true,
    draft: true,
    req,
  });
  const blockers = [
    ...(used.length > 0 ? [`products filed under it (${used.join(", ")})`] : []),
    ...(children.docs.length > 0 ? [`sub-categories (${children.docs.map((doc) => doc.value).join(", ")})`] : []),
  ];
  if (blockers.length > 0) {
    throw new APIError(`This category cannot be deleted while it has ${blockers.join(" and ")}. Reassign them first.`, 400, null, true);
  }
};
