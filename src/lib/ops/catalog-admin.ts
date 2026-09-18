import { computeLaunchStatus, type AdminLaunchStatus } from "@/lib/content/launch-admin";
import type { Category, Material, Media, PriceApproval, Product as PayloadProduct } from "@/payload-types";

import type { OperatorSession } from "./operator";
import { payloadInstance } from "./payload";

/**
 * Catalog administration for Reality 3D Admin (Stage 22.5).
 *
 * Reads the CMS collections an operator manages — products, categories,
 * materials, price approvals, media. Product create and edit are in
 * `product-admin.ts`. Payload stays the owner of all of it:
 *
 *   · reads go through Payload's local API, latest versions included, and are
 *     reachable only with an `OperatorSession`;
 *   · nothing here writes.
 *
 * Approval, price-approval records, publishing, uploads and category/material
 * definitions stay in Advanced CMS, where versions and the append-only price
 * ledger already live; the pages link to the exact document.
 */


const relationId = (value: unknown): number | null =>
  typeof value === "number" ? value : typeof value === "object" && value !== null && "id" in value ? Number((value as { id: unknown }).id) : null;

const relationName = (value: unknown): string | null =>
  typeof value === "object" && value !== null && "name" in value && typeof (value as { name: unknown }).name === "string"
    ? (value as { name: string }).name
    : null;

/* ------------------------------------------------------------------ *
 * Product workspace
 * ------------------------------------------------------------------ */

export interface ProductWorkspace {
  doc: PayloadProduct;
  status: AdminLaunchStatus;
  categoryName: string | null;
  browseCategoryName: string | null;
  published: boolean;
  /** The latest version is a draft ahead of what is published. */
  hasUnpublishedChanges: boolean;
  /** This product's price approval records, newest effective date first. */
  priceApprovals: { id: number; amount: number; effectiveFrom: string; reference: string; approvedBy: string }[];
}

export async function getProductWorkspace(_operator: OperatorSession, id: number): Promise<ProductWorkspace | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const payload = await payloadInstance();

  let doc: PayloadProduct;
  try {
    doc = (await payload.findByID({
      collection: "products",
      id,
      draft: true,
      depth: 1,
      overrideAccess: true,
      context: { launchStatusNested: true },
    })) as PayloadProduct;
  } catch {
    return null;
  }

  const [status, published, approvals] = await Promise.all([
    computeLaunchStatus(payload, id),
    payload
      .find({
        collection: "products",
        where: { id: { equals: id } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
        draft: false,
      })
      .then((result) => result.docs[0] as PayloadProduct | undefined),
    payload.find({
      collection: "price-approvals",
      where: { product: { equals: id } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: "-effectiveFrom",
    }),
  ]);

  return {
    doc,
    status,
    categoryName: relationName(doc.category),
    browseCategoryName: relationName(doc.browseCategory),
    published: published?._status === "published",
    hasUnpublishedChanges: published?._status === "published" && doc._status !== "published",
    priceApprovals: (approvals.docs as PriceApproval[]).map((record) => ({
      id: record.id,
      amount: record.amount,
      effectiveFrom: String(record.effectiveFrom).slice(0, 10),
      reference: record.reference,
      approvedBy: record.approvedBy,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Categories, materials, price approvals, media
 * ------------------------------------------------------------------ */

export interface CategoryRow {
  id: number;
  name: string;
  value: string;
  parentName: string | null;
  isBrowse: boolean;
  browseOrder: number | null;
  source: string | null;
  published: boolean;
  products: number;
  updatedAt: string;
}

export interface MaterialRow {
  id: number;
  name: string;
  value: string;
  code: string | null;
  capabilityStatus: string | null;
  technologies: string[];
  properties: { strength: number; flexibility: number; heat: number };
  swatches: number;
  published: boolean;
  updatedAt: string;
}

export interface PriceApprovalRow {
  id: number;
  productId: number | null;
  productName: string | null;
  productCode: string | null;
  amount: number;
  effectiveFrom: string;
  reference: string;
  approvedBy: string;
  createdAt: string;
}

export interface MediaRow {
  id: number;
  alt: string;
  kind: string | null;
  credit: string | null;
  filename: string | null;
  mimeType: string | null;
  filesize: number | null;
  width: number | null;
  height: number | null;
  published: boolean;
  updatedAt: string;
}

export type Readout<T> = { ok: true; rows: T[] } | { ok: false; problem: string };

async function readout<T>(label: string, read: () => Promise<T[]>): Promise<Readout<T>> {
  try {
    return { ok: true, rows: await read() };
  } catch (error) {
    console.error(`[sada3d] ${label} could not be read`, error);
    return { ok: false, problem: `The CMS could not be read, so ${label} are unavailable. Reload the page; if it persists, check the database connection on the Settings page.` };
  }
}

export async function listCategories(_operator: OperatorSession): Promise<Readout<CategoryRow>> {
  return readout("categories", async () => {
    const payload = await payloadInstance();
    const [categories, products] = await Promise.all([
      payload.find({ collection: "categories", draft: true, depth: 1, pagination: false, overrideAccess: true, sort: "name" }),
      payload.find({
        collection: "products",
        draft: true,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        select: { category: true, browseCategory: true },
        context: { launchStatusNested: true },
      }),
    ]);
    const counts = new Map<number, number>();
    for (const product of products.docs as Pick<PayloadProduct, "category" | "browseCategory">[]) {
      for (const id of new Set([relationId(product.category), relationId(product.browseCategory)])) {
        if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return (categories.docs as Category[]).map((doc) => ({
      id: doc.id,
      name: doc.name,
      value: doc.value,
      parentName: relationName(doc.parent),
      isBrowse: Boolean(doc.isBrowse),
      browseOrder: doc.browseOrder ?? null,
      source: doc.source ?? null,
      published: doc._status === "published",
      products: counts.get(doc.id) ?? 0,
      updatedAt: doc.updatedAt,
    }));
  });
}

export async function listMaterials(_operator: OperatorSession): Promise<Readout<MaterialRow>> {
  return readout("materials", async () => {
    const payload = await payloadInstance();
    const result = await payload.find({ collection: "materials", draft: true, depth: 0, pagination: false, overrideAccess: true, sort: "name" });
    return (result.docs as Material[]).map((doc) => ({
      id: doc.id,
      name: doc.name,
      value: doc.value,
      code: doc.code ?? null,
      capabilityStatus: doc.capabilityStatus ?? null,
      technologies: [...(doc.technologies ?? [])],
      properties: doc.properties,
      swatches: Array.isArray((doc as { swatches?: unknown }).swatches) ? ((doc as { swatches: unknown[] }).swatches.length) : 0,
      published: doc._status === "published",
      updatedAt: doc.updatedAt,
    }));
  });
}

export async function listPriceApprovals(_operator: OperatorSession): Promise<Readout<PriceApprovalRow>> {
  return readout("price approvals", async () => {
    const payload = await payloadInstance();
    const result = await payload.find({
      collection: "price-approvals",
      depth: 1,
      pagination: false,
      overrideAccess: true,
      sort: "-effectiveFrom",
    });
    return (result.docs as PriceApproval[]).map((doc) => {
      const product = typeof doc.product === "object" && doc.product !== null ? doc.product : null;
      return {
        id: doc.id,
        productId: relationId(doc.product),
        productName: product?.name ?? null,
        productCode: typeof product?.productId === "string" ? product.productId : null,
        amount: doc.amount,
        effectiveFrom: String(doc.effectiveFrom).slice(0, 10),
        reference: doc.reference,
        approvedBy: doc.approvedBy,
        createdAt: doc.createdAt,
      };
    });
  });
}

export const MEDIA_LIMIT = 200;

export async function listMedia(_operator: OperatorSession): Promise<Readout<MediaRow> & { total?: number }> {
  try {
    const payload = await payloadInstance();
    const result = await payload.find({ collection: "media", draft: true, depth: 0, limit: MEDIA_LIMIT, overrideAccess: true, sort: "-updatedAt" });
    return {
      ok: true,
      total: result.totalDocs,
      rows: (result.docs as Media[]).map((doc) => ({
        id: doc.id,
        alt: doc.alt,
        kind: doc.kind ?? null,
        credit: doc.credit ?? null,
        filename: doc.filename ?? null,
        mimeType: doc.mimeType ?? null,
        filesize: doc.filesize ?? null,
        width: doc.width ?? null,
        height: doc.height ?? null,
        published: doc._status === "published",
        updatedAt: doc.updatedAt,
      })),
    };
  } catch (error) {
    console.error("[sada3d] media could not be read", error);
    return { ok: false, problem: "The CMS could not be read, so the media library is unavailable. Reload the page; if it persists, check the database connection on the Settings page." };
  }
}
