import { unstable_cache } from "next/cache";
import { cache } from "react";

import { ROADMAP, capabilities, capabilityDefinition } from "@/content/catalog/capabilities";
import { missingLaunchLimitations } from "@/content/catalog/manufacturing";
import { catalogAssets } from "@/lib/catalog/catalog-assets";
import { readCategoryTree } from "@/lib/catalog/payload-categories";
import { launchStatusFromDoc, toPriceApprovalRecords, type AdminLaunchStatus } from "@/lib/content/launch-admin";
import { CONTENT_TAGS } from "@/lib/content/tags";
import type { LaunchStage } from "@/payload/workflow";
import type { Product as PayloadProduct } from "@/payload-types";

import type { OperatorSession } from "../operator";
import { CMS_HOME } from "../routes";
import { DATA_SOURCES } from "./sql";
import type { Traced } from "./types";

/**
 * Catalog health — what the catalog can sell, and what stops the rest.
 *
 * Reuses the launch-readiness system rather than restating it: every product is
 * judged by `launchStatusFromDoc`, the function behind the admin's Launch
 * status panel and `content:verify -- --require-launch`. This module only
 * counts the answers.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────
 *
 * Four reads, whatever the catalog size: every product (latest version), every
 * price approval, the category tree and the asset list. Then a pure pass. The
 * result is cached for a minute and dropped whenever catalog content is
 * published — the same tag the storefront's catalog uses.
 *
 * ── Private ──────────────────────────────────────────────────────────────
 *
 * Drafts, approval states and internal readiness. The cached read is reachable
 * only through `getCatalogHealth`, which requires an operator session.
 */

export type ApprovalStatus = PayloadProduct["approvalStatus"];
export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["draft", "proposed", "provisional", "approved", "archived"];
export const LAUNCH_STAGES: readonly LaunchStage[] = ["NOT READY", "READY FOR REVIEW", "APPROVED", "LAUNCH READY"];

export type PriceReadiness = "APPROVED" | "PROVISIONAL" | "QUOTE_ONLY" | "MISSING" | "UNKNOWN";
export type MediaReadiness = "APPROVED" | "PROPOSED" | "MISSING" | "UNKNOWN";
export type ManufacturingReadiness = "APPROVED" | "NOT_APPROVED" | "COMING_SOON" | "UNKNOWN";

export interface CatalogProductRow {
  id: number;
  productId: string;
  name: string;
  /** The SKU the business entered in the CMS, if any. */
  sku: string | null;
  stage: LaunchStage;
  approvalStatus: ApprovalStatus;
  published: boolean;
  priceReadiness: PriceReadiness;
  /** A figure is entered but no price approval matches it. */
  priceAwaitingApproval: boolean;
  media: MediaReadiness;
  manufacturing: ManufacturingReadiness;
  readiness: string;
  blockers: number;
  /** The product's workspace in Reality 3D Admin. */
  href: string;
  /** The same product in the Payload CMS (Advanced CMS). */
  cmsHref: string;
  /* Stage 22.5: the product list's columns. */
  categoryName: string | null;
  material: string | null;
  productClass: PayloadProduct["productClass"];
  price: number;
  priceStatus: PayloadProduct["priceStatus"];
  featured: boolean;
  updatedAt: string;
}

export interface CapabilityOverview {
  available: { kind: string; label: string }[];
  comingSoon: { kind: string; label: string; reference: string }[];
  /** Launch-required manufacturing limitations with no approved value. */
  missingLimitations: string[];
}

export interface CatalogHealth extends Traced {
  reachable: boolean;
  problem?: string;
  total: number;
  published: number;
  stages: Record<LaunchStage, number>;
  approval: Record<ApprovalStatus, number>;
  price: Record<PriceReadiness, number>;
  media: Record<MediaReadiness, number>;
  manufacturing: Record<ManufacturingReadiness, number>;
  pricesAwaitingApproval: number;
  /** Products declaring "In stock" — a claim no stock quantity backs. */
  declaredInStock: number;
  mediaLibrary: number;
  priceApprovals: number;
  products: CatalogProductRow[];
  capability: CapabilityOverview;
}

export const productAdminHref = (id: number) => `${CMS_HOME}/collections/products/${id}`;
export const productWorkspaceHref = (id: number) => `/admin/products/${id}`;

const relationLabel = (value: unknown, key: "name" | "value"): string | null =>
  typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[key] === "string"
    ? ((value as Record<string, string>)[key] ?? null)
    : null;

const zeroes = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

function priceOf(status: AdminLaunchStatus): PriceReadiness {
  return (["APPROVED", "PROVISIONAL", "QUOTE_ONLY", "MISSING"] as const).find((value) => value === status.price) ?? "UNKNOWN";
}

function mediaOf(status: AdminLaunchStatus): MediaReadiness {
  return (["APPROVED", "PROPOSED", "MISSING"] as const).find((value) => value === status.media) ?? "UNKNOWN";
}

function manufacturingOf(status: AdminLaunchStatus): ManufacturingReadiness {
  if (status.manufacturing === "APPROVED") return "APPROVED";
  if (status.manufacturing.startsWith("COMING SOON")) return "COMING_SOON";
  if (status.manufacturing === "NOT_APPROVED") return "NOT_APPROVED";
  return "UNKNOWN";
}

export function capabilityOverview(): CapabilityOverview {
  const kinds = ["technology", "material", "finish", "colour"] as const;
  return {
    available: kinds.flatMap((kind) =>
      capabilities(kind)
        .filter((row) => row.status === "AVAILABLE")
        .map((row) => ({ kind, label: row.label })),
    ),
    comingSoon: ROADMAP.entries.map((entry) => ({
      kind: entry.kind,
      label: capabilityDefinition(entry.kind, entry.value)?.label ?? entry.value,
      reference: entry.reference,
    })),
    missingLimitations: missingLaunchLimitations(),
  };
}

export interface CatalogInput {
  products: readonly { doc: PayloadProduct; status: AdminLaunchStatus }[];
  mediaLibrary: number;
  priceApprovals: number;
  capability: CapabilityOverview;
  now: Date;
}

/** Counts the launch answers. Pure. */
export function summariseCatalog(input: CatalogInput): CatalogHealth {
  const stages = zeroes(LAUNCH_STAGES);
  const approval = zeroes(APPROVAL_STATUSES);
  const price = zeroes<PriceReadiness>(["APPROVED", "PROVISIONAL", "QUOTE_ONLY", "MISSING", "UNKNOWN"]);
  const media = zeroes<MediaReadiness>(["APPROVED", "PROPOSED", "MISSING", "UNKNOWN"]);
  const manufacturing = zeroes<ManufacturingReadiness>(["APPROVED", "NOT_APPROVED", "COMING_SOON", "UNKNOWN"]);

  const products: CatalogProductRow[] = input.products.map(({ doc, status }) => {
    const row: CatalogProductRow = {
      id: doc.id,
      productId: typeof doc.productId === "string" ? doc.productId : String(doc.id),
      name: doc.name,
      sku: typeof doc.sku === "string" && doc.sku.trim() ? doc.sku.trim() : null,
      stage: status.stage,
      approvalStatus: doc.approvalStatus,
      published: doc._status === "published",
      priceReadiness: priceOf(status),
      priceAwaitingApproval: doc.priceStatus === "provisional" && doc.price > 0,
      media: mediaOf(status),
      manufacturing: manufacturingOf(status),
      readiness: status.readiness,
      blockers: status.reasons.split("\n").filter((line) => line.trim()).length,
      href: productWorkspaceHref(doc.id),
      cmsHref: productAdminHref(doc.id),
      categoryName: relationLabel(doc.category, "name"),
      material: relationLabel(doc.material, "value"),
      productClass: doc.productClass,
      price: doc.price,
      priceStatus: doc.priceStatus,
      featured: Boolean(doc.featured),
      updatedAt: doc.updatedAt,
    };
    stages[row.stage] += 1;
    if (row.approvalStatus in approval) approval[row.approvalStatus] += 1;
    price[row.priceReadiness] += 1;
    media[row.media] += 1;
    manufacturing[row.manufacturing] += 1;
    return row;
  });

  const stageOrder = new Map(LAUNCH_STAGES.map((stage, index) => [stage, index]));
  products.sort(
    (a, b) =>
      (stageOrder.get(b.stage) ?? 0) - (stageOrder.get(a.stage) ?? 0) ||
      a.productId.localeCompare(b.productId, "en", { numeric: true }),
  );

  return {
    reachable: true,
    total: products.length,
    published: products.filter((row) => row.published).length,
    stages,
    approval,
    price,
    media,
    manufacturing,
    pricesAwaitingApproval: products.filter((row) => row.priceAwaitingApproval).length,
    declaredInStock: input.products.filter(({ doc }) => doc.availability === "in-stock").length,
    mediaLibrary: input.mediaLibrary,
    priceApprovals: input.priceApprovals,
    products,
    capability: input.capability,
    source: DATA_SOURCES.catalog,
    definition:
      "Every product's latest version, judged by the launch assessment behind the admin's Launch status panel. Capability comes from the business decision ledger and roadmap.",
    generatedAt: input.now.toISOString(),
  };
}

async function readCatalogHealth(): Promise<CatalogHealth> {
  const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("@payload-config")]);
  const payload = await getPayload({ config });
  const now = new Date();

  const [productResult, approvalResult, media, tree, assets] = await Promise.all([
    payload.find({
      collection: "products",
      draft: true,
      depth: 1,
      pagination: false,
      overrideAccess: true,
      context: { launchStatusNested: true },
    }),
    payload.find({ collection: "price-approvals", depth: 0, pagination: false, overrideAccess: true }),
    payload.count({ collection: "media", overrideAccess: true }),
    readCategoryTree(payload),
    catalogAssets(),
  ]);

  const byProduct = new Map<number, (typeof approvalResult.docs)[number][]>();
  for (const record of approvalResult.docs) {
    const id = typeof record.product === "object" && record.product !== null ? record.product.id : record.product;
    if (typeof id !== "number") continue;
    byProduct.set(id, [...(byProduct.get(id) ?? []), record]);
  }

  const validation = { categories: tree.tree, models: assets.models, mediaFiles: assets.mediaFiles };
  const docs = productResult.docs as PayloadProduct[];

  return summariseCatalog({
    products: docs.map((doc) => ({
      doc,
      status: launchStatusFromDoc(doc, toPriceApprovalRecords(byProduct.get(doc.id) ?? []), validation, now),
    })),
    mediaLibrary: media.totalDocs,
    priceApprovals: approvalResult.docs.length,
    capability: capabilityOverview(),
    now,
  });
}

export const CATALOG_HEALTH_TTL_SECONDS = 60;

const cachedCatalogHealth = unstable_cache(readCatalogHealth, ["sada3d-ops-catalog-health"], {
  tags: [CONTENT_TAGS.catalog],
  revalidate: CATALOG_HEALTH_TTL_SECONDS,
});

export function unreachableCatalog(problem: string, now: Date = new Date()): CatalogHealth {
  return {
    ...summariseCatalog({ products: [], mediaLibrary: 0, priceApprovals: 0, capability: capabilityOverview(), now }),
    reachable: false,
    problem,
  };
}

/** Once per request (React `cache`): the overview, the action centre and inventory all ask. */
const loadCatalogHealth = cache(async (): Promise<CatalogHealth> => {
  try {
    return await cachedCatalogHealth();
  } catch (error) {
    console.error("[sada3d] catalog health could not be read", error);
    return unreachableCatalog("The CMS catalog could not be read, so catalog health is unavailable.");
  }
});

/**
 * The catalog's health, for an operator. A CMS that cannot be read is reported
 * as such — never as an empty catalog.
 */
export async function getCatalogHealth(_operator: OperatorSession): Promise<CatalogHealth> {
  return loadCatalogHealth();
}
