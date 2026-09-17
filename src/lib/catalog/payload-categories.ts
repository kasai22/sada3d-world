import type { Payload, PayloadRequest } from "payload";

import { nodesFromDefinitions, categoryTreeFromRecords, type CategoryNode } from "./category-tree";
import { CATALOG_CATEGORIES } from "@/content/catalog";

/**
 * The published CMS category tree (Stage 20). No Next.js imports, so the admin
 * hooks, the content CLIs and tests can all use it; the storefront wraps it in
 * its cache (`payload-source.ts`).
 */
export async function readCategoryTree(
  payload: Payload,
  req?: PayloadRequest,
): Promise<{ tree: CategoryNode[]; problems: string[] }> {
  const docs = await payload.find({
    collection: "categories",
    where: { _status: { equals: "published" } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    draft: false,
    ...(req ? { req } : {}),
  });

  // A CMS with no published categories has no mappable product either; the seed
  // tree is then the honest default (and what a stubbed Payload in a test sees).
  if (!docs?.docs?.length) return { tree: nodesFromDefinitions(CATALOG_CATEGORIES), problems: [] };

  return categoryTreeFromRecords(
    docs.docs.map((doc) => ({
      id: doc.id,
      value: doc.value,
      name: doc.name,
      description: doc.description,
      parent: doc.parent as number | null | undefined,
      isBrowse: doc.isBrowse,
      browseOrder: doc.browseOrder,
    })),
  );
}
